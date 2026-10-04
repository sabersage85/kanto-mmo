import colyseus from 'colyseus';
import type { Client } from 'colyseus';
const { Room } = colyseus;
import {
  creatureInstanceToBattleState,
  getSpecies,
  reviveToFullInstance,
  type BattleCreatureState,
  type CreatureInstance,
  type MoveResult,
  type PvpSide,
} from '@kanto-mmo/shared';
import { BattleCreatureSchema, BattleLogEntrySchema } from '../schema/BattleState.js';
import { PvpBattleState } from '../schema/PvpBattleState.js';
import { validateToken } from '../auth/authService.js';
import { getPersistenceStore } from '../persistence/store.js';
import { getFirstAliveInstance, loadSession, recordBattleResult, updatePartyMember } from '../sessionCache.js';
import { PvpMatch } from '../pvp/pvpMatch.js';

interface PvpCreateOptions {
  challengerAccountId: string;
  opponentAccountId: string;
  challengerName: string;
  opponentName: string;
}

interface PvpJoinOptions {
  /** Session token issued by POST /auth/register or /auth/login. */
  sessionToken?: string;
}

interface AuthData {
  accountId: string;
}

const MAX_LOG_ENTRIES = 20;
const BATTLE_DISPOSE_DELAY_MS = 4000;
/** Both sides must join within this window or the room disposes itself. */
const JOIN_TIMEOUT_MS = 15_000;
/** A side that doesn't submit a move within this window forfeits. */
const TURN_TIMEOUT_MS = 30_000;
/** Grace window for a dropped PvP connection to resume before the side forfeits. */
const RECONNECT_WINDOW_SECONDS = 20;

/**
 * Two-human-controlled turn-based PvP battle room (Milestone 4). Created
 * server-side via `matchMaker.createRoom` once both players accept a
 * challenge in OverworldRoom; each side joins with the exact accountId
 * OverworldRoom specified, so a modified client cannot hijack someone
 * else's match or impersonate a side. Reuses the same turn-order/damage/
 * type-effectiveness engine as PvE BattleRoom via `@kanto-mmo/shared`'s
 * `resolvePvpTurn` (wrapped by the Colyseus-independent `PvpMatch`).
 *
 * Design choice (documented in README/ROADMAP): each side battles with a
 * single active creature — the first living party member, same pattern
 * BattleRoom already uses for PvE — not a full rotating party. No XP is
 * awarded for PvP; only each account's lifetime win/loss record changes.
 */
export class PvpBattleRoom extends Room<PvpBattleState> {
  maxClients = 2;

  private expected!: PvpCreateOptions;
  private accountIdsBySide: Partial<Record<PvpSide, string>> = {};
  private sessionIdsBySide: Partial<Record<PvpSide, string>> = {};
  private partyInstanceBySide: Partial<Record<PvpSide, CreatureInstance>> = {};
  private match!: PvpMatch;
  private joinTimeoutHandle?: ReturnType<typeof this.clock.setTimeout>;
  private turnTimeoutHandle?: ReturnType<typeof this.clock.setTimeout>;
  private finished = false;

  onCreate(options: PvpCreateOptions): void {
    this.expected = options;

    const state = new PvpBattleState();
    state.challengerName = options.challengerName;
    state.opponentName = options.opponentName;
    this.setState(state);

    this.onMessage('selectMove', (client, message: { moveId: number }) => {
      this.handleSelectMove(client, message?.moveId);
    });
    this.onMessage('forfeit', (client) => {
      this.handleForfeit(client);
    });

    this.joinTimeoutHandle = this.clock.setTimeout(() => {
      if (this.state.status === 'waiting') this.disconnect();
    }, JOIN_TIMEOUT_MS);
  }

  async onAuth(_client: Client, options: PvpJoinOptions): Promise<AuthData> {
    const accountId = options?.sessionToken ? await validateToken(options.sessionToken) : null;
    if (!accountId) {
      throw new Error('Invalid or expired session — please log in again.');
    }
    return { accountId };
  }

  async onJoin(client: Client, _options: PvpJoinOptions, auth?: AuthData): Promise<void> {
    if (!auth) {
      throw new Error('Invalid or expired session — please log in again.');
    }

    let side: PvpSide;
    if (auth.accountId === this.expected.challengerAccountId && !this.accountIdsBySide.challenger) {
      side = 'challenger';
    } else if (auth.accountId === this.expected.opponentAccountId && !this.accountIdsBySide.opponent) {
      side = 'opponent';
    } else {
      throw new Error('You are not a participant in this battle.');
    }

    const store = getPersistenceStore();
    await loadSession(store, auth.accountId, side === 'challenger' ? this.expected.challengerName : this.expected.opponentName, {
      mapId: 'route1',
      x: 0,
      y: 0,
      direction: 'down',
    });
    const partyInstance = getFirstAliveInstance(auth.accountId);
    if (!partyInstance) {
      throw new Error('No usable party member to battle with.');
    }

    this.accountIdsBySide[side] = auth.accountId;
    this.sessionIdsBySide[side] = client.sessionId;
    this.partyInstanceBySide[side] = partyInstance;

    const battleState = creatureInstanceToBattleState(partyInstance, getSpecies(partyInstance.speciesId));
    this.syncCreature(side === 'challenger' ? this.state.challenger : this.state.opponent, battleState);
    if (side === 'challenger') this.state.challengerSessionId = client.sessionId;
    else this.state.opponentSessionId = client.sessionId;

    if (this.accountIdsBySide.challenger && this.accountIdsBySide.opponent) {
      this.startMatch();
    }
  }

  private startMatch(): void {
    this.joinTimeoutHandle?.clear();

    const challengerBattle = creatureInstanceToBattleState(
      this.partyInstanceBySide.challenger!,
      getSpecies(this.partyInstanceBySide.challenger!.speciesId),
    );
    const opponentBattle = creatureInstanceToBattleState(
      this.partyInstanceBySide.opponent!,
      getSpecies(this.partyInstanceBySide.opponent!.speciesId),
    );
    this.match = new PvpMatch(challengerBattle, opponentBattle);

    this.state.status = 'ongoing';
    this.pushLog(`${this.state.challengerName} challenged ${this.state.opponentName} to battle!`);
    this.restartTurnTimer();
  }

  private restartTurnTimer(): void {
    this.turnTimeoutHandle?.clear();
    this.turnTimeoutHandle = this.clock.setTimeout(() => {
      this.handleTurnTimeout();
    }, TURN_TIMEOUT_MS);
  }

  private handleTurnTimeout(): void {
    if (this.state.status !== 'ongoing') return;
    const missing = this.match.missingSide();
    if (missing === null) return;
    // Arbitrary but documented tie-break: if somehow neither side acted in
    // time, the challenger forfeits.
    const forfeitingSide: PvpSide = missing === 'both' ? 'challenger' : missing;
    this.pushLog(`${this.nameFor(forfeitingSide)} ran out of time and forfeits the match!`);
    this.finishMatch(this.match.forfeit(forfeitingSide));
  }

  private handleSelectMove(client: Client, moveId: number): void {
    if (this.state.status !== 'ongoing' || !this.match) return;
    const side = this.sideForSession(client.sessionId);
    if (!side) return;

    if (!this.match.submitMove(side, moveId)) return;
    this.pushLog(`${this.nameFor(side)} chose a move.`);

    if (this.match.bothSubmitted) {
      const result = this.match.resolveTurn();
      if (result) this.applyTurnResult(result);
      if (this.match.status !== 'ongoing') {
        this.finishMatch(this.match.status);
      } else {
        this.restartTurnTimer();
      }
    }
  }

  private handleForfeit(client: Client): void {
    if (this.state.status !== 'ongoing' || !this.match) return;
    const side = this.sideForSession(client.sessionId);
    if (!side) return;

    this.pushLog(`${this.nameFor(side)} forfeited the match.`);
    this.finishMatch(this.match.forfeit(side));
  }

  async onLeave(client: Client, consented: boolean): Promise<void> {
    const side = this.sideForSession(client.sessionId);
    if (!side) return;

    if (this.state.status !== 'ongoing' || this.finished) return;

    if (!consented) {
      try {
        await this.allowReconnection(client, RECONNECT_WINDOW_SECONDS);
        return;
      } catch {
        // fell through — reconnection window expired, treat as a real leave.
      }
    }

    this.pushLog(`${this.nameFor(side)} disconnected and forfeits the match.`);
    this.finishMatch(this.match.forfeit(side));
  }

  private applyTurnResult(result: { order: [PvpSide, PvpSide]; results: Partial<Record<PvpSide, MoveResult>> }): void {
    for (const side of result.order) {
      const moveResult = result.results[side];
      if (!moveResult) continue;
      const attackerName = this.nameFor(side);
      const defenderSide: PvpSide = side === 'challenger' ? 'opponent' : 'challenger';
      this.pushLog(this.describeMove(attackerName, moveResult));
      this.syncCreature(
        defenderSide === 'challenger' ? this.state.challenger : this.state.opponent,
        side === 'challenger' ? this.match.opponent : this.match.challenger,
      );
    }
    // Also refresh the acting sides themselves (HP doesn't change on the
    // attacker, but keeping both schemas in lockstep with `match` state is
    // simpler than reasoning about which exact fields changed).
    this.syncCreature(this.state.challenger, this.match.challenger);
    this.syncCreature(this.state.opponent, this.match.opponent);
  }

  private describeMove(attackerName: string, result: MoveResult): string {
    if (!result.hit) return `${attackerName} attacked, but it missed!`;
    if (result.damage <= 0 && result.effectiveness === 0) return `${attackerName} attacked. It had no effect!`;
    if (result.damage <= 0) return `${attackerName} attacked.`;

    let suffix = '';
    if (result.effectiveness > 1) suffix = ' It was super effective!';
    else if (result.effectiveness > 0 && result.effectiveness < 1) suffix = ' It was not very effective...';
    if (result.isCritical) suffix += ' Critical hit!';
    return `${attackerName} attacked! It dealt ${result.damage} damage.${suffix}`;
  }

  private finishMatch(outcome: 'ongoing' | 'challenger_win' | 'opponent_win'): void {
    if (outcome === 'ongoing' || this.finished) return;
    this.finished = true;
    this.turnTimeoutHandle?.clear();
    this.state.status = outcome;

    const store = getPersistenceStore();
    const winnerSide: PvpSide = outcome === 'challenger_win' ? 'challenger' : 'opponent';
    const loserSide: PvpSide = winnerSide === 'challenger' ? 'opponent' : 'challenger';

    // Persist final HP back to each side's party. The winner reflects whatever damage it
    // took; the loser is auto-healed back to full (same "stumble back to safety" blackout
    // convention as PvE — healing items can't revive a fainted creature, so leaving a loser
    // at 0 HP would permanently soft-lock a player with only one party member).
    for (const side of ['challenger', 'opponent'] as PvpSide[]) {
      const accountId = this.accountIdsBySide[side];
      const partyInstance = this.partyInstanceBySide[side];
      if (!accountId || !partyInstance) continue;
      const finalHp = side === 'challenger' ? this.match.challenger.currentHp : this.match.opponent.currentHp;
      const persisted =
        side === winnerSide
          ? { ...partyInstance, currentHp: Math.max(0, finalHp) }
          : reviveToFullInstance(partyInstance, getSpecies(partyInstance.speciesId));
      updatePartyMember(accountId, persisted, store);
    }

    const winnerAccountId = this.accountIdsBySide[winnerSide];
    const loserAccountId = this.accountIdsBySide[loserSide];
    if (winnerAccountId) {
      const record = recordBattleResult(winnerAccountId, 'win', store);
      if (winnerSide === 'challenger') {
        this.state.challengerWins = record.wins;
        this.state.challengerLosses = record.losses;
      } else {
        this.state.opponentWins = record.wins;
        this.state.opponentLosses = record.losses;
      }
    }
    if (loserAccountId) {
      const record = recordBattleResult(loserAccountId, 'loss', store);
      if (loserSide === 'challenger') {
        this.state.challengerWins = record.wins;
        this.state.challengerLosses = record.losses;
      } else {
        this.state.opponentWins = record.wins;
        this.state.opponentLosses = record.losses;
      }
    }

    this.pushLog(`${this.nameFor(winnerSide)} wins the battle!`);
    this.clock.setTimeout(() => this.disconnect(), BATTLE_DISPOSE_DELAY_MS);
  }

  private syncCreature(schema: BattleCreatureSchema, battle: BattleCreatureState): void {
    schema.speciesId = battle.speciesId;
    schema.name = battle.name;
    schema.level = battle.level;
    schema.maxHp = battle.maxHp;
    schema.currentHp = battle.currentHp;
    schema.moveIds.clear();
    for (const moveId of battle.moveIds) schema.moveIds.push(moveId);
  }

  private pushLog(text: string): void {
    const entry = new BattleLogEntrySchema();
    entry.text = text;
    this.state.log.push(entry);
    while (this.state.log.length > MAX_LOG_ENTRIES) this.state.log.shift();
  }

  private sideForSession(sessionId: string): PvpSide | null {
    if (this.sessionIdsBySide.challenger === sessionId) return 'challenger';
    if (this.sessionIdsBySide.opponent === sessionId) return 'opponent';
    return null;
  }

  private nameFor(side: PvpSide): string {
    return side === 'challenger' ? this.state.challengerName : this.state.opponentName;
  }
}

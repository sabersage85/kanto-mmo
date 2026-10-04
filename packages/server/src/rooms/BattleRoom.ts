import colyseus from 'colyseus';
import type { Client } from 'colyseus';
const { Room } = colyseus;
import {
  applyBattleExpGain,
  applyHealToInstance,
  applyMove,
  attemptCatch,
  createBattleCreature,
  creatureInstanceToBattleState,
  getBattleOutcome,
  getItem,
  getMove,
  getSpecies,
  instanceFromCapturedWild,
  resolveTurnOrder,
  reviveToFullInstance,
  type BattleCreatureState,
  type CreatureInstance,
  type SpeciesDefinition,
} from '@kanto-mmo/shared';
import { BattleCreatureSchema, BattleLogEntrySchema, BattleState } from '../schema/BattleState.js';
import { validateToken } from '../auth/authService.js';
import { getPersistenceStore } from '../persistence/store.js';
import { consumePendingEncounter } from '../pendingEncounters.js';
import {
  addCreatureToPartyOrStorage,
  getFirstAliveInstance,
  loadSession,
  removeInventoryItem,
  updatePartyMember,
} from '../sessionCache.js';

interface BattleJoinOptions {
  /** Session token issued by POST /auth/register or /auth/login. */
  sessionToken?: string;
  /** Single-use token identifying which wild encounter OverworldRoom rolled for this player. */
  encounterToken?: string;
}

interface AuthData {
  accountId: string;
}

const MAX_LOG_ENTRIES = 20;
const BATTLE_DISPOSE_DELAY_MS = 4000;
/** Chance (0..1) that fleeing from a wild creature succeeds. */
const FLEE_SUCCESS_CHANCE = 0.75;

/**
 * One-player-vs-one-wild-creature PvE battle room. Always created fresh
 * per encounter (never matchmade/shared) and only accepts the exact
 * species/level that OverworldRoom rolled server-side for this player's
 * encounter token, so a modified client cannot choose an easier wild
 * creature.
 */
export class BattleRoom extends Room<BattleState> {
  maxClients = 1;

  private accountId = '';
  private playerSpecies!: SpeciesDefinition;
  private wildSpecies!: SpeciesDefinition;
  private playerBattle!: BattleCreatureState;
  private wildBattle!: BattleCreatureState;
  private partyInstance!: CreatureInstance;

  async onAuth(_client: Client, options: BattleJoinOptions): Promise<AuthData> {
    const accountId = options?.sessionToken ? await validateToken(options.sessionToken) : null;
    if (!accountId) {
      throw new Error('Invalid or expired session — please log in again.');
    }
    return { accountId };
  }

  onCreate(): void {
    // Battle state/log/message-handlers are set up in onJoin instead of
    // here: Colyseus only passes the onAuth() result into onJoin, and we
    // need the authenticated accountId before we can validate the
    // encounter token / look up the player's party.
  }

  async onJoin(_client: Client, options: BattleJoinOptions, auth?: AuthData): Promise<void> {
    if (!auth) {
      throw new Error('Invalid or expired session — please log in again.');
    }
    const accountId = auth.accountId;
    const encounterToken = options?.encounterToken;

    if (!encounterToken) {
      throw new Error('Missing encounter token.');
    }

    const pending = consumePendingEncounter(encounterToken, accountId);
    if (!pending) {
      throw new Error('This encounter has expired or was already used.');
    }

    // Loads from the live session cache if the player is already in the
    // overworld (the common case); falls back to the persistence store if
    // somehow not (shouldn't normally happen since OverworldRoom loads the
    // session on join, before any encounter can be rolled).
    await loadSession(getPersistenceStore(), accountId, 'Trainer', {
      mapId: 'hearthfield',
      x: 0,
      y: 0,
      direction: 'down',
    });
    const partyInstance = getFirstAliveInstance(accountId);
    if (!partyInstance) {
      throw new Error('No usable party member to battle with.');
    }

    this.accountId = accountId;
    this.partyInstance = partyInstance;
    this.playerSpecies = getSpecies(partyInstance.speciesId);
    this.wildSpecies = getSpecies(pending.speciesId);

    this.playerBattle = creatureInstanceToBattleState(partyInstance, this.playerSpecies);
    this.wildBattle = createBattleCreature(this.wildSpecies, pending.level);

    const state = new BattleState();
    this.syncCreature(state.player, this.playerBattle);
    this.syncCreature(state.wild, this.wildBattle);
    this.setState(state);

    this.pushLog(`A wild ${this.wildBattle.name} appeared!`);

    this.onMessage('selectMove', (_client, message: { moveId: number }) => {
      this.handlePlayerMove(message?.moveId);
    });
    this.onMessage('flee', () => {
      this.handleFlee();
    });
    this.onMessage('useItem', (client, message: { itemId: number }) => {
      this.handleUseItem(client, message?.itemId);
    });
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

  private handlePlayerMove(moveId: number): void {
    if (this.state.status !== 'ongoing') return;
    if (!this.playerBattle.moveIds.includes(moveId)) return;

    const wildMoveId =
      this.wildBattle.moveIds[Math.floor(Math.random() * this.wildBattle.moveIds.length)];
    const order = resolveTurnOrder(this.playerBattle.stats.speed, this.wildBattle.stats.speed);

    for (const side of order) {
      const attacker = side === 'player' ? this.playerBattle : this.wildBattle;
      const defender = side === 'player' ? this.wildBattle : this.playerBattle;
      // Skip a side's action if it already fainted earlier this turn.
      if (attacker.currentHp <= 0) continue;

      const usedMoveId = side === 'player' ? moveId : wildMoveId;
      const move = getMove(usedMoveId);
      const result = applyMove(attacker, defender, move);
      this.pushLog(this.describeMove(attacker.name, move.name, result));
      this.syncCreature(side === 'player' ? this.state.wild : this.state.player, defender);

      const outcome = getBattleOutcome(this.playerBattle, this.wildBattle);
      if (outcome) {
        this.finishBattle(outcome);
        return;
      }
    }
  }

  private describeMove(
    attackerName: string,
    moveName: string,
    result: { hit: boolean; damage: number; effectiveness: number; isCritical: boolean },
  ): string {
    if (!result.hit) return `${attackerName} used ${moveName}, but it missed!`;
    if (result.damage <= 0 && result.effectiveness === 0) {
      return `${attackerName} used ${moveName}. It had no effect!`;
    }
    if (result.damage <= 0) return `${attackerName} used ${moveName}.`;

    let suffix = '';
    if (result.effectiveness > 1) suffix = ' It was super effective!';
    else if (result.effectiveness > 0 && result.effectiveness < 1) suffix = ' It was not very effective...';
    if (result.isCritical) suffix += ' Critical hit!';
    return `${attackerName} used ${moveName}! It dealt ${result.damage} damage.${suffix}`;
  }

  private finishBattle(outcome: 'player_win' | 'wild_win'): void {
    this.state.status = outcome === 'player_win' ? 'won' : 'lost';
    const store = getPersistenceStore();

    if (outcome === 'player_win') {
      const expResult = applyBattleExpGain(
        this.partyInstance,
        this.wildSpecies,
        this.wildBattle.level,
        this.playerSpecies,
      );
      updatePartyMember(this.accountId, expResult.instance, store);
      this.state.expGained = expResult.expGained;
      this.state.leveledUp = expResult.leveledUp;
      this.state.newLevel = expResult.newLevel;
      this.pushLog(
        `${this.wildBattle.name} fainted! ${this.playerBattle.name} gained ${expResult.expGained} XP.` +
          (expResult.leveledUp ? ` ${this.playerBattle.name} grew to level ${expResult.newLevel}!` : ''),
      );
    } else {
      // Blackout convention: the player is sent back to safety already healed (Pokémon-Center
      // style auto-recovery) rather than left with a fainted party, since healing items
      // deliberately cannot revive a fainted creature and there would otherwise be no way to
      // battle again.
      updatePartyMember(this.accountId, reviveToFullInstance(this.partyInstance, this.playerSpecies), store);
      this.pushLog(`${this.playerBattle.name} fainted! You black out and stumble back to safety, fully healed.`);
    }

    this.clock.setTimeout(() => this.disconnect(), BATTLE_DISPOSE_DELAY_MS);
  }

  private handleFlee(): void {
    if (this.state.status !== 'ongoing') return;

    if (Math.random() < FLEE_SUCCESS_CHANCE) {
      this.state.status = 'fled';
      this.pushLog('Got away safely!');
      this.clock.setTimeout(() => this.disconnect(), BATTLE_DISPOSE_DELAY_MS / 2);
      return;
    }

    this.pushLog("Couldn't get away!");
    const wildMoveId =
      this.wildBattle.moveIds[Math.floor(Math.random() * this.wildBattle.moveIds.length)];
    const move = getMove(wildMoveId);
    const result = applyMove(this.wildBattle, this.playerBattle, move);
    this.pushLog(this.describeMove(this.wildBattle.name, move.name, result));
    this.syncCreature(this.state.player, this.playerBattle);

    const outcome = getBattleOutcome(this.playerBattle, this.wildBattle);
    if (outcome) this.finishBattle(outcome);
  }

  /** Uses a healing item on the player's battling creature, or a capture tool on the wild creature. */
  private handleUseItem(client: Client, itemId: number | undefined): void {
    if (this.state.status !== 'ongoing') return;
    if (!itemId) return;

    let item;
    try {
      item = getItem(itemId);
    } catch {
      client.send('itemUseError', { reason: 'Unknown item.' });
      return;
    }
    if (item.category === 'boost') {
      client.send('itemUseError', { reason: 'Stat-boost items can only be used outside of battle.' });
      return;
    }

    const store = getPersistenceStore();
    const removed = removeInventoryItem(this.accountId, itemId, 1, store);
    if (!removed) {
      client.send('itemUseError', { reason: "You don't have any of that item." });
      return;
    }

    if (item.effect.kind === 'heal') {
      this.useHealItem(item.name, item.effect.amount);
      return;
    }
    if (item.effect.kind === 'capture') {
      this.useCaptureItem(item.name, item.effect.catchPower);
    }
  }

  /** Heals the player's battling creature, then lets the wild creature still act (like a status-move turn). */
  private useHealItem(itemName: string, amount: number | 'full'): void {
    const healedInstance = applyHealToInstance(
      { ...this.partyInstance, currentHp: this.playerBattle.currentHp },
      this.playerSpecies,
      amount,
    );
    this.playerBattle = { ...this.playerBattle, currentHp: healedInstance.currentHp };
    this.syncCreature(this.state.player, this.playerBattle);
    this.pushLog(`You used ${itemName}! ${this.playerBattle.name} recovered HP.`);

    const wildMoveId = this.wildBattle.moveIds[Math.floor(Math.random() * this.wildBattle.moveIds.length)];
    const move = getMove(wildMoveId);
    const result = applyMove(this.wildBattle, this.playerBattle, move);
    this.pushLog(this.describeMove(this.wildBattle.name, move.name, result));
    this.syncCreature(this.state.player, this.playerBattle);

    const outcome = getBattleOutcome(this.playerBattle, this.wildBattle);
    if (outcome) this.finishBattle(outcome);
  }

  /** Rolls a catch attempt against the wild creature; the item is consumed either way. */
  private useCaptureItem(itemName: string, catchPower: number): void {
    const attempt = attemptCatch(
      { currentHp: this.wildBattle.currentHp, maxHp: this.wildBattle.maxHp },
      catchPower,
    );

    if (!attempt.success) {
      this.pushLog(`You threw a ${itemName}, but ${this.wildBattle.name} broke free!`);

      const wildMoveId = this.wildBattle.moveIds[Math.floor(Math.random() * this.wildBattle.moveIds.length)];
      const move = getMove(wildMoveId);
      const result = applyMove(this.wildBattle, this.playerBattle, move);
      this.pushLog(this.describeMove(this.wildBattle.name, move.name, result));
      this.syncCreature(this.state.player, this.playerBattle);

      const outcome = getBattleOutcome(this.playerBattle, this.wildBattle);
      if (outcome) this.finishBattle(outcome);
      return;
    }

    const caught = instanceFromCapturedWild(this.wildBattle, this.wildSpecies.growthRate);
    const destination = addCreatureToPartyOrStorage(this.accountId, caught, getPersistenceStore());

    this.state.status = 'caught';
    this.state.caughtWentToStorage = destination === 'storage';
    this.pushLog(
      `Gotcha! ${this.wildBattle.name} was caught!` +
        (destination === 'storage' ? ' Your party was full, so it was sent to storage.' : ''),
    );
    this.clock.setTimeout(() => this.disconnect(), BATTLE_DISPOSE_DELAY_MS);
  }
}

import colyseus from 'colyseus';
import type { Client } from 'colyseus';
const { Room } = colyseus;
import {
  applyBattleExpGain,
  applyHealToInstance,
  applyMove,
  createBattleCreature,
  creatureInstanceToBattleState,
  getItem,
  getMove,
  getSpecies,
  reviveToFullInstance,
  type BattleCreatureState,
  type CreatureInstance,
  type MoveResult,
  type SpeciesDefinition,
} from '@kanto-mmo/shared';
import { BattleCreatureSchema, BattleLogEntrySchema } from '../schema/BattleState.js';
import { TrainerBattleState } from '../schema/TrainerBattleState.js';
import { validateToken } from '../auth/authService.js';
import { getPersistenceStore } from '../persistence/store.js';
import { consumePendingTrainerBattle } from '../pendingTrainerBattles.js';
import { getTrainer } from '../data/trainers.js';
import { maybeAdvanceQuestOnBadge } from '../quest.js';
import {
  awardBadge,
  getFirstAliveInstance,
  hasBadge,
  loadSession,
  removeInventoryItem,
  updatePartyMember,
} from '../sessionCache.js';
import { TrainerBattleEngine } from '../trainer/trainerBattleEngine.js';

interface TrainerBattleJoinOptions {
  /** Session token issued by POST /auth/register or /auth/login. */
  sessionToken?: string;
  /** Single-use token identifying which trainer OverworldRoom determined the player walked up to. */
  trainerBattleToken?: string;
}

interface AuthData {
  accountId: string;
}

const MAX_LOG_ENTRIES = 20;
const BATTLE_DISPOSE_DELAY_MS = 4000;

/**
 * One-player-vs-one-NPC-trainer battle room (Milestone 6). Like
 * `BattleRoom`, it's created fresh per battle (never matchmade/shared) and
 * only accepts the exact trainer id that `OverworldRoom` determined the
 * player walked up to via a single-use token, so a modified client cannot
 * pick an easier trainer than the one gating its tile.
 *
 * Design (documented in README/ROADMAP): the player still battles with a
 * single active creature (the existing PvE/PvP convention), but the
 * trainer has a fixed multi-creature team that auto-advances to its next
 * living member on faint instead of ending the battle — see
 * `TrainerBattleEngine`. No flee/capture here (standard trainer-battle
 * convention); only move selection and heal-only item use. On a win, the
 * trainer's badge is awarded exactly once (idempotent — see
 * `sessionCache.awardBadge`), permanently opening that trainer's tile in
 * `OverworldRoom`.
 */
export class TrainerBattleRoom extends Room<TrainerBattleState> {
  maxClients = 1;

  private accountId = '';
  private playerSpecies!: SpeciesDefinition;
  private playerBattle!: BattleCreatureState;
  private partyInstance!: CreatureInstance;
  private engine!: TrainerBattleEngine;
  private badgeId = '';
  private badgeName = '';
  private defeatLine?: string;

  private totalExpGained = 0;
  private anyLeveledUp = false;
  private latestLevel = 0;

  async onAuth(_client: Client, options: TrainerBattleJoinOptions): Promise<AuthData> {
    const accountId = options?.sessionToken ? await validateToken(options.sessionToken) : null;
    if (!accountId) {
      throw new Error('Invalid or expired session — please log in again.');
    }
    return { accountId };
  }

  onCreate(): void {
    // Battle state/log/message-handlers are set up in onJoin, same reason
    // as BattleRoom: we need the authenticated accountId first.
  }

  async onJoin(_client: Client, options: TrainerBattleJoinOptions, auth?: AuthData): Promise<void> {
    if (!auth) {
      throw new Error('Invalid or expired session — please log in again.');
    }
    const accountId = auth.accountId;
    const token = options?.trainerBattleToken;
    if (!token) {
      throw new Error('Missing trainer battle token.');
    }

    const pending = consumePendingTrainerBattle(token, accountId);
    if (!pending) {
      throw new Error('This trainer battle has expired or was already used.');
    }

    const trainer = getTrainer(pending.trainerId);

    await loadSession(getPersistenceStore(), accountId, 'Trainer', {
      mapId: 'hearthfield',
      x: 0,
      y: 0,
      direction: 'down',
    });

    if (hasBadge(accountId, trainer.badgeId)) {
      throw new Error('You have already earned this badge.');
    }

    const partyInstance = getFirstAliveInstance(accountId);
    if (!partyInstance) {
      throw new Error('No usable party member to battle with.');
    }

    this.accountId = accountId;
    this.badgeId = trainer.badgeId;
    this.badgeName = trainer.badgeName;
    this.defeatLine = trainer.defeatLine;
    this.partyInstance = partyInstance;
    this.playerSpecies = getSpecies(partyInstance.speciesId);
    this.latestLevel = partyInstance.level;

    this.playerBattle = creatureInstanceToBattleState(partyInstance, this.playerSpecies);
    const trainerTeam = trainer.team.map((member) =>
      createBattleCreature(getSpecies(member.speciesId), member.level, { moveIds: member.moveIds }),
    );
    this.engine = new TrainerBattleEngine(this.playerBattle, trainerTeam);

    const state = new TrainerBattleState();
    state.trainerId = trainer.id;
    state.trainerName = trainer.name;
    state.trainerTeamSize = trainerTeam.length;
    state.trainerTeamRemaining = trainerTeam.length;
    this.syncCreature(state.player, this.playerBattle);
    this.syncCreature(state.trainer, this.engine.activeTrainerCreature);
    this.setState(state);

    this.pushLog(trainer.greeting ?? `${trainer.name} wants to battle!`);
    this.pushLog(`${trainer.name} sent out ${this.engine.activeTrainerCreature.name}!`);

    this.onMessage('selectMove', (_client, message: { moveId: number }) => {
      this.handlePlayerMove(message?.moveId);
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

    const faintedBeforeTurn = this.engine.activeTrainerCreature;
    const result = this.engine.resolveTurn(moveId);
    this.logTurnResult(result, faintedBeforeTurn.name);

    if (result.trainerCreatureFainted) {
      this.pushLog(`${faintedBeforeTurn.name} fainted!`);
      this.awardExpForFaintedTrainerCreature(faintedBeforeTurn.speciesId, faintedBeforeTurn.level);
    }

    if (result.status === 'player_win') {
      this.finishBattle('player_win');
      return;
    }
    if (result.status === 'trainer_win') {
      this.finishBattle('trainer_win');
      return;
    }

    if (result.trainerSentOutNext) {
      const next = this.engine.activeTrainerCreature;
      this.pushLog(`${this.state.trainerName} sent out ${next.name}!`);
      this.state.trainerTeamRemaining = this.engine.trainerTeamRemaining;
      this.syncCreature(this.state.trainer, next);
    } else {
      this.syncCreature(this.state.trainer, this.engine.activeTrainerCreature);
    }
    this.syncCreature(this.state.player, this.playerBattle);
  }

  private logTurnResult(result: ReturnType<TrainerBattleEngine['resolveTurn']>, trainerCreatureName: string): void {
    for (const side of result.order) {
      const moveResult = result.results[side];
      if (!moveResult) continue;
      const attackerName = side === 'player' ? this.playerBattle.name : trainerCreatureName;
      const moveId = side === 'player' ? result.playerMoveId : result.trainerMoveId;
      this.pushLog(this.describeMove(attackerName, moveId, moveResult));
    }
  }

  private describeMove(attackerName: string, moveId: number, result: MoveResult): string {
    const moveName = getMove(moveId).name;
    if (!result.hit) return `${attackerName} used ${moveName}, but it missed!`;
    if (result.damage <= 0 && result.effectiveness === 0) return `${attackerName} used ${moveName}. It had no effect!`;
    if (result.damage <= 0) return `${attackerName} used ${moveName}.`;

    let suffix = '';
    if (result.effectiveness > 1) suffix = ' It was super effective!';
    else if (result.effectiveness > 0 && result.effectiveness < 1) suffix = ' It was not very effective...';
    if (result.isCritical) suffix += ' Critical hit!';
    return `${attackerName} used ${moveName}! It dealt ${result.damage} damage.${suffix}`;
  }

  /** Mirrors BattleRoom's applyBattleExpGain usage: awards incremental XP for each trainer-team creature defeated. */
  private awardExpForFaintedTrainerCreature(faintedSpeciesId: number, faintedLevel: number): void {
    const faintedSpecies = getSpecies(faintedSpeciesId);
    const expResult = applyBattleExpGain(this.partyInstance, faintedSpecies, faintedLevel, this.playerSpecies);
    this.partyInstance = expResult.instance;
    this.totalExpGained += expResult.expGained;
    if (expResult.leveledUp) this.anyLeveledUp = true;
    this.latestLevel = expResult.newLevel;
    this.pushLog(`${this.playerBattle.name} gained ${expResult.expGained} XP.`);
    if (expResult.leveledUp) this.pushLog(`${this.playerBattle.name} grew to level ${expResult.newLevel}!`);
  }

  private finishBattle(outcome: 'player_win' | 'trainer_win'): void {
    this.state.status = outcome === 'player_win' ? 'won' : 'lost';
    const store = getPersistenceStore();

    if (outcome === 'player_win') {
      updatePartyMember(this.accountId, this.partyInstance, store);
      this.state.expGained = this.totalExpGained;
      this.state.leveledUp = this.anyLeveledUp;
      this.state.newLevel = this.latestLevel;

      const badges = awardBadge(this.accountId, this.badgeId, store);
      this.state.badgeAwarded = badges.includes(this.badgeId);
      this.state.badgeName = this.badgeName;
      this.pushLog(`You defeated ${this.state.trainerName}! You earned the ${this.badgeName}!`);
      if (this.defeatLine) this.pushLog(this.defeatLine);
      maybeAdvanceQuestOnBadge(this.accountId, this.badgeId, badges, store);
    } else {
      // Same blackout convention as BattleRoom: auto-heal back to full rather than leaving
      // the party fainted, since trainer battles have no flee and items can't revive.
      updatePartyMember(this.accountId, reviveToFullInstance(this.partyInstance, this.playerSpecies), store);
      this.pushLog(`${this.playerBattle.name} fainted! You black out and stumble back to safety, fully healed.`);
    }

    this.clock.setTimeout(() => this.disconnect(), BATTLE_DISPOSE_DELAY_MS);
  }

  /** Uses a healing item on the player's battling creature; the trainer still gets a free retaliation turn (no flee/capture here). */
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
    if (item.effect.kind !== 'heal') {
      client.send('itemUseError', { reason: 'Only healing items can be used in a trainer battle.' });
      return;
    }

    const store = getPersistenceStore();
    const removed = removeInventoryItem(this.accountId, itemId, 1, store);
    if (!removed) {
      client.send('itemUseError', { reason: "You don't have any of that item." });
      return;
    }

    const healedInstance = applyHealToInstance(
      { ...this.partyInstance, currentHp: this.playerBattle.currentHp },
      this.playerSpecies,
      item.effect.amount,
    );
    this.playerBattle.currentHp = healedInstance.currentHp;
    this.syncCreature(this.state.player, this.playerBattle);
    this.pushLog(`You used ${item.name}! ${this.playerBattle.name} recovered HP.`);

    const trainer = this.engine.activeTrainerCreature;
    const trainerMoveId = trainer.moveIds[Math.floor(Math.random() * trainer.moveIds.length)];
    const move = getMove(trainerMoveId);
    const result = applyMove(trainer, this.playerBattle, move);
    this.pushLog(this.describeMove(trainer.name, move.id, result));
    this.syncCreature(this.state.player, this.playerBattle);

    if (this.playerBattle.currentHp <= 0) {
      this.finishBattle('trainer_win');
    }
  }
}

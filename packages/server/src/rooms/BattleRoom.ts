import colyseus from 'colyseus';
const { Room } = colyseus;
import {
  applyBattleExpGain,
  applyMove,
  createBattleCreature,
  creatureInstanceToBattleState,
  getBattleOutcome,
  getMove,
  getSpecies,
  resolveTurnOrder,
  type BattleCreatureState,
  type CreatureInstance,
  type SpeciesDefinition,
} from '@kanto-mmo/shared';
import { BattleCreatureSchema, BattleLogEntrySchema, BattleState } from '../schema/BattleState.js';
import { consumePendingEncounter } from '../pendingEncounters.js';
import { getFirstAliveInstance, updatePartyMember } from '../playerRegistry.js';

interface BattleJoinOptions {
  playerId?: string;
  token?: string;
}

const MAX_LOG_ENTRIES = 20;
const BATTLE_DISPOSE_DELAY_MS = 4000;
/** Chance (0..1) that fleeing from a wild creature succeeds. */
const FLEE_SUCCESS_CHANCE = 0.75;

/**
 * One-player-vs-one-wild-creature PvE battle room. Always created fresh
 * per encounter (never matchmade/shared) and only accepts the exact
 * species/level that OverworldRoom rolled server-side for this player's
 * token, so a modified client cannot choose an easier wild creature.
 */
export class BattleRoom extends Room<BattleState> {
  maxClients = 1;

  private playerId = '';
  private playerSpecies!: SpeciesDefinition;
  private wildSpecies!: SpeciesDefinition;
  private playerBattle!: BattleCreatureState;
  private wildBattle!: BattleCreatureState;
  private partyInstance!: CreatureInstance;

  onCreate(options: BattleJoinOptions): void {
    const playerId = options.playerId;
    const token = options.token;

    if (!playerId || !token) {
      this.disconnect();
      return;
    }

    const pending = consumePendingEncounter(token, playerId);
    const partyInstance = pending ? getFirstAliveInstance(playerId) : undefined;
    if (!pending || !partyInstance) {
      // Invalid/forged/expired encounter token, or no usable party member.
      this.disconnect();
      return;
    }

    this.playerId = playerId;
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

    if (outcome === 'player_win') {
      const expResult = applyBattleExpGain(
        this.partyInstance,
        this.wildSpecies,
        this.wildBattle.level,
        this.playerSpecies,
      );
      updatePartyMember(this.playerId, expResult.instance);
      this.state.expGained = expResult.expGained;
      this.state.leveledUp = expResult.leveledUp;
      this.state.newLevel = expResult.newLevel;
      this.pushLog(
        `${this.wildBattle.name} fainted! ${this.playerBattle.name} gained ${expResult.expGained} XP.` +
          (expResult.leveledUp ? ` ${this.playerBattle.name} grew to level ${expResult.newLevel}!` : ''),
      );
    } else {
      updatePartyMember(this.playerId, { ...this.partyInstance, currentHp: 0 });
      this.pushLog(`${this.playerBattle.name} fainted! You black out and stumble back to safety...`);
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
}

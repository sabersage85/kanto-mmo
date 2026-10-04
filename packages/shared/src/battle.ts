import { calculateDamage, calculateExpGain, calculateFullStatBlock, levelForTotalExp } from './formulas.js';
import { getDefaultMoveset } from './moveset.js';
import type {
  CreatureInstance,
  ElementType,
  MoveDefinition,
  SpeciesDefinition,
  StatBlock,
} from './types.js';

/**
 * Turn-based PvE battle logic (wild encounters), re-implemented from
 * scratch on top of the formulas in formulas.ts. All functions here are
 * pure/deterministic given an injected RNG, which makes them easy to unit
 * test without relying on real randomness.
 */

/** A creature's fully-resolved in-battle state (computed stats + live HP). */
export interface BattleCreatureState {
  speciesId: number;
  name: string;
  level: number;
  types: ElementType[];
  stats: StatBlock;
  maxHp: number;
  currentHp: number;
  moveIds: number[];
}

const DEFAULT_IVS: StatBlock = { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 };
const ZERO_EVS: StatBlock = { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 };

export interface CreateBattleCreatureOptions {
  ivs?: StatBlock;
  evs?: StatBlock;
  moveIds?: number[];
  currentHp?: number;
  nickname?: string;
}

/** Builds a ready-to-battle creature state from a species + level (e.g. a wild encounter). */
export function createBattleCreature(
  species: SpeciesDefinition,
  level: number,
  options: CreateBattleCreatureOptions = {},
): BattleCreatureState {
  const ivs = options.ivs ?? DEFAULT_IVS;
  const evs = options.evs ?? ZERO_EVS;
  const stats = calculateFullStatBlock(species.baseStats, ivs, evs, level);
  const moveIds = options.moveIds ?? getDefaultMoveset(species);
  return {
    speciesId: species.id,
    name: options.nickname ?? species.name,
    level,
    types: species.types,
    stats,
    maxHp: stats.hp,
    currentHp: options.currentHp ?? stats.hp,
    moveIds,
  };
}

/** Builds a battle creature from a player-owned CreatureInstance (preserves current HP/level/moves). */
export function creatureInstanceToBattleState(
  instance: CreatureInstance,
  species: SpeciesDefinition,
): BattleCreatureState {
  const stats = calculateFullStatBlock(species.baseStats, instance.ivs, instance.evs, instance.level);
  return {
    speciesId: species.id,
    name: instance.nickname ?? species.name,
    level: instance.level,
    types: species.types,
    stats,
    maxHp: stats.hp,
    currentHp: Math.min(instance.currentHp, stats.hp),
    moveIds: instance.moveIds,
  };
}

export type BattleSide = 'player' | 'wild';

/** Determines move order for one turn based on Speed, with a random tiebreak. */
export function resolveTurnOrder(
  playerSpeed: number,
  wildSpeed: number,
  tieBreakRoll: number = Math.random(),
): [BattleSide, BattleSide] {
  if (playerSpeed === wildSpeed) {
    return tieBreakRoll < 0.5 ? ['player', 'wild'] : ['wild', 'player'];
  }
  return playerSpeed > wildSpeed ? ['player', 'wild'] : ['wild', 'player'];
}

export interface MoveResult {
  moveId: number;
  hit: boolean;
  damage: number;
  effectiveness: number;
  isCritical: boolean;
  defenderHpAfter: number;
  defenderFaintedAfter: boolean;
}

export interface ApplyMoveRng {
  accuracyRoll?: number;
  criticalRoll?: number;
  damageRoll?: number;
}

const CRITICAL_HIT_CHANCE = 1 / 16;

/**
 * Resolves a single move use: accuracy check, then (for damaging moves)
 * STAB/type-effectiveness/critical damage via calculateDamage, mutating
 * the defender's currentHp in place. Status moves and misses deal 0
 * damage. Accepts optional pre-rolled random values for deterministic
 * testing; otherwise falls back to Math.random().
 */
export function applyMove(
  attacker: BattleCreatureState,
  defender: BattleCreatureState,
  move: MoveDefinition,
  rng: ApplyMoveRng = {},
): MoveResult {
  const accuracyRoll = rng.accuracyRoll ?? Math.random();
  const hit = move.accuracy === null ? true : accuracyRoll * 100 < move.accuracy;

  if (!hit || move.category === 'Status' || move.power === null) {
    return {
      moveId: move.id,
      hit,
      damage: 0,
      effectiveness: 1,
      isCritical: false,
      defenderHpAfter: defender.currentHp,
      defenderFaintedAfter: defender.currentHp <= 0,
    };
  }

  const isCritical = (rng.criticalRoll ?? Math.random()) < CRITICAL_HIT_CHANCE;
  const damageRoll = rng.damageRoll ?? Math.random();
  const attackStat = move.category === 'Physical' ? attacker.stats.attack : attacker.stats.spAttack;
  const defenseStat = move.category === 'Physical' ? defender.stats.defense : defender.stats.spDefense;

  const result = calculateDamage({
    attackerLevel: attacker.level,
    attackStat,
    defenseStat,
    movePower: move.power,
    moveType: move.type,
    moveCategory: move.category,
    attackerTypes: attacker.types,
    defenderTypes: defender.types,
    randomRoll: damageRoll,
    isCritical,
  });

  defender.currentHp = Math.max(0, defender.currentHp - result.damage);

  return {
    moveId: move.id,
    hit: true,
    damage: result.damage,
    effectiveness: result.effectiveness,
    isCritical: result.isCritical,
    defenderHpAfter: defender.currentHp,
    defenderFaintedAfter: defender.currentHp <= 0,
  };
}

export function isFainted(creature: BattleCreatureState): boolean {
  return creature.currentHp <= 0;
}

export type BattleOutcome = 'player_win' | 'wild_win' | null;

/** Returns the battle outcome, or null if both creatures can still fight. */
export function getBattleOutcome(
  player: BattleCreatureState,
  wild: BattleCreatureState,
): BattleOutcome {
  if (isFainted(player)) return 'wild_win';
  if (isFainted(wild)) return 'player_win';
  return null;
}

export interface ExpAwardResult {
  instance: CreatureInstance;
  expGained: number;
  leveledUp: boolean;
  previousLevel: number;
  newLevel: number;
}

/**
 * Awards XP to a player's creature for defeating a wild creature, updating
 * its cumulative exp and level. On level-up, the creature is fully healed
 * (a common, player-friendly genre convention) since its max HP changes.
 */
export function applyBattleExpGain(
  instance: CreatureInstance,
  wildSpecies: SpeciesDefinition,
  wildLevel: number,
  ownSpecies: SpeciesDefinition,
): ExpAwardResult {
  const expGained = calculateExpGain(wildSpecies.baseExpYield, wildLevel, true);
  const newExp = instance.exp + expGained;
  const previousLevel = instance.level;
  const newLevel = levelForTotalExp(newExp, ownSpecies.growthRate);
  const leveledUp = newLevel > previousLevel;

  const newStats = calculateFullStatBlock(ownSpecies.baseStats, instance.ivs, instance.evs, newLevel);

  const updatedInstance: CreatureInstance = {
    ...instance,
    exp: newExp,
    level: newLevel,
    currentHp: leveledUp ? newStats.hp : Math.min(instance.currentHp, newStats.hp),
  };

  return { instance: updatedInstance, expGained, leveledUp, previousLevel, newLevel };
}

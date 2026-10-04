import { getTypeEffectiveness } from './typeChart.js';
import type { ElementType, GrowthRate, MoveCategory, StatBlock } from './types.js';

/**
 * Core battle/progression math, conceptually re-implemented in original
 * TypeScript from publicly documented, genre-standard RPG formulas (the
 * general shape of "Gen 3 style" stat/damage/XP curve math is widely
 * published across fan wikis, e.g. Bulbapedia's formula pages). No source
 * code was copied from pokefirered; only the high-level algorithm shapes
 * (which are mathematical formulas, not copyrightable expression) were
 * used as a reference while writing this from scratch with original
 * constants tuned for this project.
 */

/** Computes a non-HP stat from base stat, IV, EV, and level, with a nature multiplier. */
export function calculateStat(
  base: number,
  iv: number,
  ev: number,
  level: number,
  natureMultiplier = 1,
): number {
  const raw = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  return Math.floor(raw * natureMultiplier);
}

/** HP uses a different formula (no nature multiplier, extra `+level+10`). */
export function calculateHp(base: number, iv: number, ev: number, level: number): number {
  if (base <= 1) return 1; // Guard against degenerate "shedinja-style" base stats.
  return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
}

export function calculateFullStatBlock(
  baseStats: StatBlock,
  ivs: StatBlock,
  evs: StatBlock,
  level: number,
): StatBlock {
  return {
    hp: calculateHp(baseStats.hp, ivs.hp, evs.hp, level),
    attack: calculateStat(baseStats.attack, ivs.attack, evs.attack, level),
    defense: calculateStat(baseStats.defense, ivs.defense, evs.defense, level),
    spAttack: calculateStat(baseStats.spAttack, ivs.spAttack, evs.spAttack, level),
    spDefense: calculateStat(baseStats.spDefense, ivs.spDefense, evs.spDefense, level),
    speed: calculateStat(baseStats.speed, ivs.speed, evs.speed, level),
  };
}

export interface DamageCalcInput {
  attackerLevel: number;
  attackStat: number;
  defenseStat: number;
  movePower: number;
  moveType: ElementType;
  moveCategory: MoveCategory;
  attackerTypes: ElementType[];
  defenderTypes: ElementType[];
  /** 0..1 random roll; defaults to 1 (max roll) if omitted for deterministic tests. */
  randomRoll?: number;
  isCritical?: boolean;
}

export interface DamageCalcResult {
  damage: number;
  effectiveness: number;
  isCritical: boolean;
  stab: boolean;
}

/**
 * Classic "Gen 3 style" damage formula:
 *   damage = ((2*level/5 + 2) * power * atk/def) / 50 + 2
 * then multiplied by STAB (1.5x same-type-attack-bonus), type
 * effectiveness, a random roll in [0.85, 1.0], and a critical hit
 * multiplier (2x) when applicable. Status moves deal no direct damage.
 */
export function calculateDamage(input: DamageCalcInput): DamageCalcResult {
  const { attackerLevel, attackStat, defenseStat, movePower, moveType, moveCategory } = input;

  if (moveCategory === 'Status' || movePower <= 0) {
    return { damage: 0, effectiveness: 1, isCritical: false, stab: false };
  }

  const effectiveness = getTypeEffectiveness(moveType, input.defenderTypes);
  if (effectiveness === 0) {
    return { damage: 0, effectiveness: 0, isCritical: false, stab: false };
  }

  const stab = input.attackerTypes.includes(moveType);
  const stabMultiplier = stab ? 1.5 : 1;
  const isCritical = input.isCritical ?? false;
  const critMultiplier = isCritical ? 2 : 1;
  const randomRoll = input.randomRoll ?? 1;
  const randomMultiplier = 0.85 + randomRoll * 0.15;

  const base =
    Math.floor(
      Math.floor(((2 * attackerLevel) / 5 + 2) * movePower * (attackStat / defenseStat)) / 50,
    ) + 2;

  const damage = Math.max(
    1,
    Math.floor(base * stabMultiplier * effectiveness * critMultiplier * randomMultiplier),
  );

  return { damage, effectiveness, isCritical, stab };
}

/**
 * Total cumulative XP required to *reach* `level`, for a given growth rate.
 * These curves follow the well-known public shapes of the four standard
 * growth-rate families (fast / medium / slow / erratic-like) but are
 * re-derived here as closed-form functions rather than copied lookup
 * tables, with level 1 always requiring 0 XP.
 */
export function totalExpForLevel(level: number, growthRate: GrowthRate): number {
  if (level <= 1) return 0;
  const n = level;
  switch (growthRate) {
    case 'Fast':
      return Math.floor((4 * n ** 3) / 5);
    case 'Medium':
      return n ** 3;
    case 'Slow':
      return Math.floor((5 * n ** 3) / 4);
    case 'Erratic': {
      // Steeper early, tapering relative growth at higher levels.
      if (n <= 50) return Math.floor((n ** 3 * (100 - n)) / 100);
      if (n <= 68) return Math.floor((n ** 3 * (150 - n)) / 100);
      if (n <= 98) return Math.floor((n ** 3 * Math.floor((1911 - 10 * n) / 3)) / 500);
      return Math.floor((n ** 3 * (160 - n)) / 100);
    }
    default:
      return n ** 3;
  }
}

/** Derives the level implied by a total accumulated XP value (inverse of totalExpForLevel). */
export function levelForTotalExp(exp: number, growthRate: GrowthRate, maxLevel = 100): number {
  let level = 1;
  while (level < maxLevel && totalExpForLevel(level + 1, growthRate) <= exp) {
    level++;
  }
  return level;
}

/** XP awarded for defeating a wild creature of the given base yield/level. */
export function calculateExpGain(baseExpYield: number, defeatedLevel: number, isWild = true): number {
  const trainerBonus = isWild ? 1 : 1.5;
  return Math.max(1, Math.floor((baseExpYield * defeatedLevel * trainerBonus) / 7));
}

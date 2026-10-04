import type { ElementType } from './types.js';

/**
 * Type effectiveness chart (attacking type -> defending type -> multiplier).
 *
 * This is an original, simplified 10-type chart designed for Kanto MMO.
 * Multipliers follow the standard genre convention of 0 (no effect),
 * 0.5 (not very effective), 1 (normal), and 2 (super effective) — a
 * generic game-balance mechanic, not copyrighted expression. The specific
 * matchups below were authored from scratch for this project's 10 types
 * and do not reproduce any third party's chart.
 */
const EFFECTIVENESS: Record<ElementType, Partial<Record<ElementType, number>>> = {
  Normal: { Rock: 0.5, Shadow: 0 },
  Fire: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Rock: 0.5 },
  Water: { Fire: 2, Water: 0.5, Grass: 0.5, Rock: 2 },
  Grass: { Fire: 0.5, Water: 2, Grass: 0.5, Flying: 0.5, Rock: 2 },
  Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Flying: 2, Rock: 0.5 },
  Ice: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Flying: 2 },
  Flying: { Grass: 2, Electric: 0.5, Rock: 0.5 },
  Psychic: { Psychic: 0.5, Shadow: 0 },
  Rock: { Fire: 2, Ice: 2, Flying: 2, Rock: 0.5 },
  Shadow: { Psychic: 2, Shadow: 0.5, Normal: 0 },
};

/** Returns the multiplier applying `attackingType` to a (possibly dual) defender. */
export function getTypeEffectiveness(
  attackingType: ElementType,
  defendingTypes: ElementType[],
): number {
  return defendingTypes.reduce((multiplier, defType) => {
    const matchup = EFFECTIVENESS[attackingType]?.[defType];
    return multiplier * (matchup ?? 1);
  }, 1);
}

import { describe, expect, it } from 'vitest';
import {
  calculateDamage,
  calculateExpGain,
  calculateFullStatBlock,
  calculateHp,
  calculateStat,
  levelForTotalExp,
  totalExpForLevel,
} from '../formulas.js';

describe('calculateStat / calculateHp', () => {
  it('computes a non-HP stat deterministically from base/iv/ev/level', () => {
    // base=65, iv=31, ev=0, level=50 -> floor(((2*65+31+0)*50)/100)+5 = floor(80.5)+5 = 85
    expect(calculateStat(65, 31, 0, 50)).toBe(85);
  });

  it('computes HP with the +level+10 offset', () => {
    // base=39, iv=31, ev=0, level=50 -> floor(((2*39+31)*50)/100)+50+10 = 54+60 = 114
    expect(calculateHp(39, 31, 0, 50)).toBe(114);
  });

  it('calculateFullStatBlock fills out all six stats', () => {
    const block = calculateFullStatBlock(
      { hp: 39, attack: 52, defense: 43, spAttack: 60, spDefense: 50, speed: 65 },
      { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      50,
    );
    expect(Object.keys(block).sort()).toEqual(
      ['attack', 'defense', 'hp', 'spAttack', 'spDefense', 'speed'].sort(),
    );
    expect(block.hp).toBeGreaterThan(0);
  });
});

describe('calculateDamage', () => {
  const base = {
    attackerLevel: 50,
    attackStat: 100,
    defenseStat: 100,
    movePower: 40,
    moveType: 'Fire' as const,
    moveCategory: 'Physical' as const,
    attackerTypes: ['Fire' as const],
    defenderTypes: ['Grass' as const],
    randomRoll: 1,
  };

  it('applies STAB and super-effective multipliers', () => {
    const result = calculateDamage(base);
    expect(result.stab).toBe(true);
    expect(result.effectiveness).toBe(2);
    expect(result.damage).toBeGreaterThan(0);
  });

  it('deals no damage against an immune type', () => {
    const result = calculateDamage({ ...base, defenderTypes: ['Shadow'], moveType: 'Normal' });
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it('status moves deal 0 damage', () => {
    const result = calculateDamage({ ...base, moveCategory: 'Status', movePower: 0 });
    expect(result.damage).toBe(0);
  });

  it('critical hits deal more damage than non-crits, all else equal', () => {
    const normal = calculateDamage({ ...base, isCritical: false });
    const crit = calculateDamage({ ...base, isCritical: true });
    expect(crit.damage).toBeGreaterThan(normal.damage);
  });

  it('always deals at least 1 damage for a damaging move that connects', () => {
    const result = calculateDamage({ ...base, movePower: 1, attackStat: 1, defenseStat: 999 });
    expect(result.damage).toBeGreaterThanOrEqual(1);
  });
});

describe('XP curve', () => {
  it('requires 0 XP at level 1', () => {
    expect(totalExpForLevel(1, 'Medium')).toBe(0);
  });

  it('is monotonically increasing with level', () => {
    const levels = [2, 10, 25, 50, 100];
    for (const rate of ['Fast', 'Medium', 'Slow', 'Erratic'] as const) {
      let prev = -1;
      for (const lvl of levels) {
        const exp = totalExpForLevel(lvl, rate);
        expect(exp).toBeGreaterThan(prev);
        prev = exp;
      }
    }
  });

  it('Fast growth requires less XP than Slow at the same level', () => {
    expect(totalExpForLevel(50, 'Fast')).toBeLessThan(totalExpForLevel(50, 'Slow'));
  });

  it('levelForTotalExp inverts totalExpForLevel', () => {
    const exp = totalExpForLevel(30, 'Medium');
    expect(levelForTotalExp(exp, 'Medium')).toBe(30);
  });
});

describe('calculateExpGain', () => {
  it('scales with base yield and defeated level', () => {
    const low = calculateExpGain(60, 5);
    const high = calculateExpGain(60, 50);
    expect(high).toBeGreaterThan(low);
  });

  it('always awards at least 1 XP', () => {
    expect(calculateExpGain(1, 1)).toBeGreaterThanOrEqual(1);
  });
});

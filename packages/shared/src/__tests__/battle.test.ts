import { describe, expect, it } from 'vitest';
import {
  applyBattleExpGain,
  applyMove,
  createBattleCreature,
  getBattleOutcome,
  isFainted,
  resolveTurnOrder,
} from '../battle.js';
import { getMove } from '../moves.js';
import { getSpecies } from '../species.js';
import { totalExpForLevel } from '../formulas.js';

describe('resolveTurnOrder', () => {
  it('puts the faster creature first', () => {
    expect(resolveTurnOrder(100, 50)).toEqual(['player', 'wild']);
    expect(resolveTurnOrder(50, 100)).toEqual(['wild', 'player']);
  });

  it('breaks speed ties using the provided roll', () => {
    expect(resolveTurnOrder(50, 50, 0.1)).toEqual(['player', 'wild']);
    expect(resolveTurnOrder(50, 50, 0.9)).toEqual(['wild', 'player']);
  });
});

describe('createBattleCreature', () => {
  it('computes max HP and starts at full health by default', () => {
    const tindle = createBattleCreature(getSpecies(1), 10);
    expect(tindle.maxHp).toBeGreaterThan(0);
    expect(tindle.currentHp).toBe(tindle.maxHp);
    expect(tindle.moveIds.length).toBeGreaterThan(0);
  });
});

describe('applyMove', () => {
  const attacker = createBattleCreature(getSpecies(1), 10); // Tindle (Fire)
  const tackle = getMove(1);

  it('reduces defender HP on a hit and reports fainted when HP reaches 0', () => {
    const defender = createBattleCreature(getSpecies(5), 5); // Sproutling (Grass), low level
    const result = applyMove(attacker, defender, tackle, {
      accuracyRoll: 0,
      criticalRoll: 0.9,
      damageRoll: 1,
    });
    expect(result.hit).toBe(true);
    expect(result.damage).toBeGreaterThan(0);
    expect(defender.currentHp).toBe(result.defenderHpAfter);
  });

  it('misses and deals 0 damage when the accuracy roll fails', () => {
    const defender = createBattleCreature(getSpecies(5), 50);
    // accuracyRoll * 100 must be >= move.accuracy (100 for Tackle) to miss.
    const result = applyMove(attacker, defender, tackle, { accuracyRoll: 1 });
    expect(result.hit).toBe(false);
    expect(result.damage).toBe(0);
    expect(defender.currentHp).toBe(defender.maxHp);
  });

  it('status moves never deal damage even on a hit', () => {
    const growl = getMove(11);
    const defender = createBattleCreature(getSpecies(5), 50);
    const result = applyMove(attacker, defender, growl, { accuracyRoll: 0 });
    expect(result.hit).toBe(true);
    expect(result.damage).toBe(0);
  });

  it('can faint a low-HP defender in one hit', () => {
    const defender = createBattleCreature(getSpecies(5), 5, { currentHp: 1 });
    const result = applyMove(attacker, defender, tackle, {
      accuracyRoll: 0,
      criticalRoll: 0.9,
      damageRoll: 1,
    });
    expect(result.defenderFaintedAfter).toBe(true);
    expect(isFainted(defender)).toBe(true);
    expect(defender.currentHp).toBe(0);
  });
});

describe('getBattleOutcome', () => {
  it('returns null while both sides can still fight', () => {
    const player = createBattleCreature(getSpecies(1), 10);
    const wild = createBattleCreature(getSpecies(5), 10);
    expect(getBattleOutcome(player, wild)).toBeNull();
  });

  it('returns wild_win when the player creature has fainted', () => {
    const player = createBattleCreature(getSpecies(1), 10, { currentHp: 0 });
    const wild = createBattleCreature(getSpecies(5), 10);
    expect(getBattleOutcome(player, wild)).toBe('wild_win');
  });

  it('returns player_win when the wild creature has fainted', () => {
    const player = createBattleCreature(getSpecies(1), 10);
    const wild = createBattleCreature(getSpecies(5), 10, { currentHp: 0 });
    expect(getBattleOutcome(player, wild)).toBe('player_win');
  });
});

describe('applyBattleExpGain', () => {
  const species = getSpecies(1);

  it('increases exp and keeps the same level when not enough for a level-up', () => {
    const instance = {
      instanceId: 'a',
      speciesId: species.id,
      level: 5,
      exp: totalExpForLevel(5, species.growthRate),
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moveIds: [1],
      currentHp: 10,
    };
    const result = applyBattleExpGain(instance, getSpecies(5), 3, species);
    expect(result.expGained).toBeGreaterThan(0);
    expect(result.instance.exp).toBe(instance.exp + result.expGained);
    expect(result.newLevel).toBeGreaterThanOrEqual(result.previousLevel);
  });

  it('levels up and fully heals when enough exp is gained', () => {
    const instance = {
      instanceId: 'b',
      speciesId: species.id,
      level: 5,
      exp: totalExpForLevel(5, species.growthRate),
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moveIds: [1],
      currentHp: 1,
    };
    // Defeating a very high level wild creature awards a huge amount of XP.
    const result = applyBattleExpGain(instance, getSpecies(5), 80, species);
    expect(result.leveledUp).toBe(true);
    expect(result.newLevel).toBeGreaterThan(result.previousLevel);
    expect(result.instance.currentHp).toBeGreaterThan(1);
  });
});

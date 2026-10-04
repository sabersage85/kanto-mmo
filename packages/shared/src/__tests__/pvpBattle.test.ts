import { describe, expect, it } from 'vitest';
import { createBattleCreature, getPvpOutcome, resolvePvpTurn, resolvePvpTurnOrder } from '../battle.js';
import { getMove } from '../moves.js';
import { getSpecies } from '../species.js';

describe('resolvePvpTurnOrder', () => {
  it('puts the faster side first', () => {
    expect(resolvePvpTurnOrder(100, 50)).toEqual(['challenger', 'opponent']);
    expect(resolvePvpTurnOrder(50, 100)).toEqual(['opponent', 'challenger']);
  });

  it('breaks speed ties using the provided roll', () => {
    expect(resolvePvpTurnOrder(50, 50, 0.1)).toEqual(['challenger', 'opponent']);
    expect(resolvePvpTurnOrder(50, 50, 0.9)).toEqual(['opponent', 'challenger']);
  });
});

describe('getPvpOutcome', () => {
  it('returns null while both sides can still fight', () => {
    const challenger = createBattleCreature(getSpecies(1), 10);
    const opponent = createBattleCreature(getSpecies(5), 10);
    expect(getPvpOutcome(challenger, opponent)).toBeNull();
  });

  it('returns opponent_win when the challenger has fainted', () => {
    const challenger = createBattleCreature(getSpecies(1), 10, { currentHp: 0 });
    const opponent = createBattleCreature(getSpecies(5), 10);
    expect(getPvpOutcome(challenger, opponent)).toBe('opponent_win');
  });

  it('returns challenger_win when the opponent has fainted', () => {
    const challenger = createBattleCreature(getSpecies(1), 10);
    const opponent = createBattleCreature(getSpecies(5), 10, { currentHp: 0 });
    expect(getPvpOutcome(challenger, opponent)).toBe('challenger_win');
  });
});

describe('resolvePvpTurn', () => {
  const tackle = getMove(1);

  it('applies both moves in speed order and reports no outcome while both remain standing', () => {
    const challenger = createBattleCreature(getSpecies(1), 10); // faster, Tindle
    const opponent = createBattleCreature(getSpecies(5), 10); // same level so base Speed decides order

    const result = resolvePvpTurn(challenger, opponent, tackle, tackle, {
      challenger: { accuracyRoll: 0, criticalRoll: 0.9, damageRoll: 1 },
      opponent: { accuracyRoll: 0, criticalRoll: 0.9, damageRoll: 1 },
    });

    expect(result.order[0]).toBe('challenger');
    expect(result.results.challenger?.hit).toBe(true);
    expect(result.results.opponent?.hit).toBe(true);
    expect(opponent.currentHp).toBeLessThan(opponent.maxHp);
    expect(challenger.currentHp).toBeLessThan(challenger.maxHp);
    expect(result.outcome).toBeNull();
  });

  it('skips the slower side\u2019s move if the faster side\u2019s move already knocked it out', () => {
    const challenger = createBattleCreature(getSpecies(1), 50); // faster and high level
    const opponent = createBattleCreature(getSpecies(5), 5, { currentHp: 1 }); // low level, 1 HP

    const result = resolvePvpTurn(challenger, opponent, tackle, tackle, {
      challenger: { accuracyRoll: 0, criticalRoll: 0.9, damageRoll: 1 },
    });

    expect(result.order[0]).toBe('challenger');
    expect(result.results.challenger?.defenderFaintedAfter).toBe(true);
    expect(result.results.opponent).toBeUndefined();
    expect(result.outcome).toBe('challenger_win');
    // Challenger took no damage since the opponent's move never ran.
    expect(challenger.currentHp).toBe(challenger.maxHp);
  });

  it('declares opponent_win when the opponent is faster and knocks out the challenger first', () => {
    const challenger = createBattleCreature(getSpecies(1), 5, { currentHp: 1 });
    const opponent = createBattleCreature(getSpecies(5), 50);

    const result = resolvePvpTurn(challenger, opponent, tackle, tackle, {
      opponent: { accuracyRoll: 0, criticalRoll: 0.9, damageRoll: 1 },
    });

    expect(result.order[0]).toBe('opponent');
    expect(result.outcome).toBe('opponent_win');
  });
});

import { createBattleCreature, getSpecies } from '@kanto-mmo/shared';
import { describe, expect, it } from 'vitest';
import { PvpMatch } from '../pvp/pvpMatch.js';

function makeMatch(levelA = 10, levelB = 10) {
  const challenger = createBattleCreature(getSpecies(1), levelA); // Tindle, Tackle (id 1) in default moveset
  const opponent = createBattleCreature(getSpecies(5), levelB); // Sproutling
  return new PvpMatch(challenger, opponent);
}

describe('PvpMatch', () => {
  it('does not resolve until both sides submit a move', () => {
    const match = makeMatch();
    expect(match.submitMove('challenger', 1)).toBe(true);
    expect(match.bothSubmitted).toBe(false);
    expect(match.resolveTurn()).toBeNull();
    expect(match.missingSide()).toBe('opponent');
  });

  it('rejects a move not in that side\u2019s moveset', () => {
    const match = makeMatch();
    expect(match.submitMove('challenger', 99999)).toBe(false);
  });

  it('rejects a second submission from the same side in the same turn', () => {
    const match = makeMatch();
    expect(match.submitMove('challenger', 1)).toBe(true);
    expect(match.submitMove('challenger', 1)).toBe(false);
  });

  it('resolves the turn once both sides have submitted and clears pending moves for the next turn', () => {
    const match = makeMatch();
    match.submitMove('challenger', 1);
    match.submitMove('opponent', 1);
    expect(match.bothSubmitted).toBe(true);

    const result = match.resolveTurn();
    expect(result).not.toBeNull();
    expect(match.missingSide()).toBe('both');
    expect(match.status).toBe('ongoing');
  });

  it('ends the match (challenger_win) once the opponent faints', () => {
    const match = makeMatch(50, 2); // big level gap so the opponent faints quickly
    for (let i = 0; i < 20 && match.status === 'ongoing'; i++) {
      match.submitMove('challenger', 1);
      match.submitMove('opponent', 1);
      match.resolveTurn();
    }
    expect(match.status).toBe('challenger_win');
  });

  it('rejects further submissions once the match is over', () => {
    const match = makeMatch(50, 2);
    for (let i = 0; i < 20 && match.status === 'ongoing'; i++) {
      match.submitMove('challenger', 1);
      match.submitMove('opponent', 1);
      match.resolveTurn();
    }
    expect(match.submitMove('challenger', 1)).toBe(false);
  });

  it('forfeit ends the match in favor of the other side', () => {
    const match = makeMatch();
    expect(match.forfeit('challenger')).toBe('opponent_win');
    expect(match.status).toBe('opponent_win');
  });

  it('forfeit is idempotent once the match already has an outcome', () => {
    const match = makeMatch();
    expect(match.forfeit('opponent')).toBe('challenger_win');
    // Status is already decided; a later forfeit call doesn't flip it.
    expect(match.forfeit('challenger')).toBe('challenger_win');
  });

  it('missingSide reports "both" when neither side has submitted', () => {
    const match = makeMatch();
    expect(match.missingSide()).toBe('both');
  });

  it('missingSide reports the single side still missing a submission', () => {
    const match = makeMatch();
    match.submitMove('opponent', 1);
    expect(match.missingSide()).toBe('challenger');
  });
});

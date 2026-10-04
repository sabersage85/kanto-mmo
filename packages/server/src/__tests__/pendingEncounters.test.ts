import { describe, expect, it } from 'vitest';
import { createPendingEncounter, consumePendingEncounter } from '../pendingEncounters.js';

describe('pendingEncounters', () => {
  it('round-trips a valid token for the owning player', () => {
    const token = createPendingEncounter('player-1', 5, 4);
    const result = consumePendingEncounter(token, 'player-1');
    expect(result).toEqual({ speciesId: 5, level: 4 });
  });

  it('is single-use: the same token cannot be consumed twice', () => {
    const token = createPendingEncounter('player-1', 5, 4);
    expect(consumePendingEncounter(token, 'player-1')).not.toBeNull();
    expect(consumePendingEncounter(token, 'player-1')).toBeNull();
  });

  it('rejects a token consumed by a different playerId (anti-spoofing)', () => {
    const token = createPendingEncounter('player-1', 5, 4);
    expect(consumePendingEncounter(token, 'someone-else')).toBeNull();
  });

  it('rejects an unknown token', () => {
    expect(consumePendingEncounter('not-a-real-token', 'player-1')).toBeNull();
  });
});

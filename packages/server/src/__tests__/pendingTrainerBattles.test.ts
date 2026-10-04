import { describe, expect, it } from 'vitest';
import { createPendingTrainerBattle, consumePendingTrainerBattle } from '../pendingTrainerBattles.js';

describe('pendingTrainerBattles', () => {
  it('round-trips a valid token for the owning player', () => {
    const token = createPendingTrainerBattle('player-1', 'stonewarden');
    const result = consumePendingTrainerBattle(token, 'player-1');
    expect(result).toEqual({ trainerId: 'stonewarden' });
  });

  it('is single-use: the same token cannot be consumed twice', () => {
    const token = createPendingTrainerBattle('player-1', 'stonewarden');
    expect(consumePendingTrainerBattle(token, 'player-1')).not.toBeNull();
    expect(consumePendingTrainerBattle(token, 'player-1')).toBeNull();
  });

  it('rejects a token consumed by a different playerId (anti-spoofing: cannot steal an easier trainer)', () => {
    const token = createPendingTrainerBattle('player-1', 'stonewarden');
    expect(consumePendingTrainerBattle(token, 'someone-else')).toBeNull();
  });

  it('rejects an unknown token', () => {
    expect(consumePendingTrainerBattle('not-a-real-token', 'player-1')).toBeNull();
  });
});

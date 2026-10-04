import { describe, expect, it } from 'vitest';
import { getOrCreatePlayer, getParty, getFirstAliveInstance, updatePartyMember } from '../playerRegistry.js';

describe('playerRegistry', () => {
  it('creates a starter party of exactly one creature on first registration', () => {
    const record = getOrCreatePlayer('new-player-1', 'Ash');
    expect(record.party).toHaveLength(1);
    expect(record.party[0].level).toBeGreaterThan(0);
    expect(record.party[0].currentHp).toBeGreaterThan(0);
  });

  it('is idempotent: re-registering the same playerId does not create a second party', () => {
    getOrCreatePlayer('new-player-2', 'Misty');
    getOrCreatePlayer('new-player-2', 'Misty');
    expect(getParty('new-player-2')).toHaveLength(1);
  });

  it('returns the first creature with HP remaining', () => {
    getOrCreatePlayer('new-player-3', 'Brock');
    const alive = getFirstAliveInstance('new-player-3');
    expect(alive).toBeDefined();
    expect(alive?.currentHp).toBeGreaterThan(0);
  });

  it('returns undefined when the whole party has fainted', () => {
    const record = getOrCreatePlayer('new-player-4', 'Gary');
    updatePartyMember('new-player-4', { ...record.party[0], currentHp: 0 });
    expect(getFirstAliveInstance('new-player-4')).toBeUndefined();
  });

  it('updatePartyMember persists HP/level/exp changes back onto the party', () => {
    const record = getOrCreatePlayer('new-player-5', 'Lance');
    const updated = { ...record.party[0], level: 10, exp: 999 };
    updatePartyMember('new-player-5', updated);
    expect(getParty('new-player-5')[0].level).toBe(10);
    expect(getParty('new-player-5')[0].exp).toBe(999);
  });
});

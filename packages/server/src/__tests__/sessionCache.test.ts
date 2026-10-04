import { afterEach, describe, expect, it } from 'vitest';
import { InMemoryPersistenceStore } from '../persistence/memoryStore.js';
import { createStarterParty } from '../starterParty.js';
import {
  clearAllSessions,
  evictSession,
  flushSession,
  getFirstAliveInstance,
  getParty,
  getSession,
  loadSession,
  recordBattleResult,
  updatePartyMember,
  updatePosition,
} from '../sessionCache.js';

const SPAWN = { mapId: 'route1', x: 0, y: 0, direction: 'down' as const };

afterEach(() => {
  clearAllSessions();
});

describe('sessionCache', () => {
  it('creates a brand-new session (with a starter party) for a first-time account', async () => {
    const store = new InMemoryPersistenceStore();
    const session = await loadSession(store, 'account-1', 'Ash', SPAWN);

    expect(session.name).toBe('Ash');
    expect(session.party.length).toBeGreaterThan(0);
    expect(getSession('account-1')).toEqual(session);

    const persisted = await store.loadPlayer('account-1');
    expect(persisted?.party).toEqual(session.party);
  });

  it('serves subsequent loads from the in-memory cache without creating a second starter party', async () => {
    const store = new InMemoryPersistenceStore();
    const first = await loadSession(store, 'account-1', 'Ash', SPAWN);
    const second = await loadSession(store, 'account-1', 'Ash', SPAWN);

    expect(second).toBe(first);
  });

  it('loads an already-persisted player instead of re-creating a starter party', async () => {
    const store = new InMemoryPersistenceStore();
    await store.ensureStarterPlayer('account-1', 'Ash', SPAWN, createStarterParty());
    await store.savePosition('account-1', 'route2', 9, 9, 'up');

    const session = await loadSession(store, 'account-1', 'Ash', SPAWN);
    expect(session.mapId).toBe('route2');
    expect(session.x).toBe(9);
    expect(session.y).toBe(9);
    expect(session.direction).toBe('up');
  });

  it('getFirstAliveInstance returns the first party member with HP remaining, or undefined if none', async () => {
    const store = new InMemoryPersistenceStore();
    await loadSession(store, 'account-1', 'Ash', SPAWN);

    const alive = getFirstAliveInstance('account-1');
    expect(alive).toBeDefined();
    expect(alive?.currentHp).toBeGreaterThan(0);

    const party = getParty('account-1');
    for (const creature of party) creature.currentHp = 0;
    updatePartyMember('account-1', party[0], store);

    expect(getFirstAliveInstance('account-1')).toBeUndefined();
  });

  it('getFirstAliveInstance returns undefined for an unknown account', () => {
    expect(getFirstAliveInstance('never-loaded')).toBeUndefined();
  });

  it('updatePartyMember mutates the cache and write-throughs to the store', async () => {
    const store = new InMemoryPersistenceStore();
    await loadSession(store, 'account-1', 'Ash', SPAWN);
    const party = getParty('account-1');
    const updated = { ...party[0], currentHp: 1 };

    updatePartyMember('account-1', updated, store);
    expect(getParty('account-1')[0].currentHp).toBe(1);

    await flushSession('account-1', store);
    const persisted = await store.loadPlayer('account-1');
    expect(persisted?.party[0].currentHp).toBe(1);
  });

  it('updatePosition mutates the cache and write-throughs to the store', async () => {
    const store = new InMemoryPersistenceStore();
    const session = await loadSession(store, 'account-1', 'Ash', SPAWN);
    updatePosition('account-1', 'route2', 3, 4, 'left', store);

    expect(session.mapId).toBe('route2');
    expect(session.x).toBe(3);
    expect(session.y).toBe(4);
    expect(session.direction).toBe('left');

    await flushSession('account-1', store);
    const persisted = await store.loadPlayer('account-1');
    expect(persisted).toMatchObject({ mapId: 'route2', x: 3, y: 4, direction: 'left' });
  });

  it('is a no-op for position/party updates on an account that was never loaded', () => {
    const store = new InMemoryPersistenceStore();
    expect(() => updatePosition('never-loaded', 'route1', 0, 0, 'down', store)).not.toThrow();
    expect(() => updatePartyMember('never-loaded', getParty('never-loaded')[0], store)).not.toThrow();
  });

  it('evictSession removes the cached record so a subsequent loadSession re-reads from the store', async () => {
    const store = new InMemoryPersistenceStore();
    await loadSession(store, 'account-1', 'Ash', SPAWN);
    evictSession('account-1');

    expect(getSession('account-1')).toBeUndefined();
  });

  it('recordBattleResult updates the cache and write-throughs to the store', async () => {
    const store = new InMemoryPersistenceStore();
    await loadSession(store, 'account-1', 'Ash', SPAWN);

    expect(recordBattleResult('account-1', 'win', store)).toEqual({ wins: 1, losses: 0 });
    expect(recordBattleResult('account-1', 'loss', store)).toEqual({ wins: 1, losses: 1 });
    expect(getSession('account-1')).toMatchObject({ wins: 1, losses: 1 });

    const persisted = await store.loadPlayer('account-1');
    expect(persisted).toMatchObject({ wins: 1, losses: 1 });
  });

  it('recordBattleResult is a no-op for an account that was never loaded', () => {
    const store = new InMemoryPersistenceStore();
    expect(recordBattleResult('never-loaded', 'win', store)).toEqual({ wins: 0, losses: 0 });
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { InMemoryPersistenceStore } from '../persistence/memoryStore.js';
import { createStarterParty } from '../starterParty.js';
import {
  addCreatureToPartyOrStorage,
  addCurrency,
  addInventoryItem,
  clearAllSessions,
  evictSession,
  flushSession,
  getCurrency,
  getFirstAliveInstance,
  getInventory,
  getParty,
  getSession,
  getStorage,
  loadSession,
  PARTY_CAP,
  recordBattleResult,
  removeInventoryItem,
  spendCurrency,
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
    await store.ensureStarterPlayer('account-1', 'Ash', SPAWN, createStarterParty(), [], 0);
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

  it('starts a new session with the starter inventory and currency', async () => {
    const store = new InMemoryPersistenceStore();
    const session = await loadSession(store, 'account-1', 'Ash', SPAWN);

    expect(session.currency).toBeGreaterThan(0);
    expect(session.inventory.length).toBeGreaterThan(0);
    expect(session.storage).toEqual([]);
  });

  it('addInventoryItem/removeInventoryItem mutate the cache and write-through to the store', async () => {
    const store = new InMemoryPersistenceStore();
    await loadSession(store, 'account-1', 'Ash', SPAWN);
    const before = getInventory('account-1').find((slot) => slot.itemId === 99)?.quantity ?? 0;

    addInventoryItem('account-1', 99, 2, store);
    expect(getInventory('account-1').find((slot) => slot.itemId === 99)?.quantity).toBe(before + 2);

    expect(removeInventoryItem('account-1', 99, 1, store)).toBe(true);
    expect(getInventory('account-1').find((slot) => slot.itemId === 99)?.quantity).toBe(before + 1);

    expect(removeInventoryItem('account-1', 99, 100, store)).toBe(false);

    await flushSession('account-1', store);
    const persisted = await store.loadPlayer('account-1');
    expect(persisted?.inventory.find((slot) => slot.itemId === 99)?.quantity).toBe(before + 1);
  });

  it('spendCurrency fails when unaffordable and succeeds + persists otherwise', async () => {
    const store = new InMemoryPersistenceStore();
    const session = await loadSession(store, 'account-1', 'Ash', SPAWN);
    const starting = session.currency;

    expect(spendCurrency('account-1', starting + 1000, store)).toBe(false);
    expect(getCurrency('account-1')).toBe(starting);

    expect(spendCurrency('account-1', 50, store)).toBe(true);
    expect(getCurrency('account-1')).toBe(starting - 50);

    expect(addCurrency('account-1', 10, store)).toBe(starting - 40);

    await flushSession('account-1', store);
    const persisted = await store.loadPlayer('account-1');
    expect(persisted?.currency).toBe(starting - 40);
  });

  it('addCreatureToPartyOrStorage adds to the party while there is room, then overflows to storage', async () => {
    const store = new InMemoryPersistenceStore();
    await loadSession(store, 'account-1', 'Ash', SPAWN);
    const template = getParty('account-1')[0];

    // Fill the party up to the cap.
    while (getParty('account-1').length < PARTY_CAP) {
      const destination = addCreatureToPartyOrStorage(
        'account-1',
        { ...template, instanceId: `extra-${getParty('account-1').length}` },
        store,
      );
      expect(destination).toBe('party');
    }

    const overflowDestination = addCreatureToPartyOrStorage(
      'account-1',
      { ...template, instanceId: 'overflow-1' },
      store,
    );
    expect(overflowDestination).toBe('storage');
    expect(getParty('account-1')).toHaveLength(PARTY_CAP);
    expect(getStorage('account-1')).toHaveLength(1);

    await flushSession('account-1', store);
    const persisted = await store.loadPlayer('account-1');
    expect(persisted?.party).toHaveLength(PARTY_CAP);
    expect(persisted?.storage).toHaveLength(1);
  });

  it('inventory/currency/storage helpers are no-ops for an account that was never loaded', () => {
    const store = new InMemoryPersistenceStore();
    expect(addInventoryItem('never-loaded', 1, 1, store)).toEqual([]);
    expect(removeInventoryItem('never-loaded', 1, 1, store)).toBe(false);
    expect(spendCurrency('never-loaded', 1, store)).toBe(false);
    expect(addCurrency('never-loaded', 1, store)).toBe(0);
    expect(getInventory('never-loaded')).toEqual([]);
    expect(getCurrency('never-loaded')).toBe(0);
    expect(getStorage('never-loaded')).toEqual([]);
  });
});

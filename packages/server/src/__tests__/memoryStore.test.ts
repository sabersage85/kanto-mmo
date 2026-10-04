import { describe, expect, it } from 'vitest';
import { InMemoryPersistenceStore } from '../persistence/memoryStore.js';

describe('InMemoryPersistenceStore', () => {
  it('round-trips account creation and lookup by email/id', async () => {
    const store = new InMemoryPersistenceStore();
    const account = await store.createAccount('trainer@example.com', 'hash123');

    expect(await store.findAccountByEmail('trainer@example.com')).toEqual(account);
    expect(await store.findAccountById(account.id)).toEqual(account);
    expect(await store.findAccountByEmail('nobody@example.com')).toBeNull();
    expect(await store.findAccountById('not-a-real-id')).toBeNull();
  });

  it('round-trips session creation, validity, and deletion', async () => {
    const store = new InMemoryPersistenceStore();
    const account = await store.createAccount('trainer@example.com', 'hash123');

    const future = new Date(Date.now() + 60_000);
    await store.createSession(account.id, 'token-abc', future);

    const session = await store.findValidSession('token-abc');
    expect(session).toEqual({ token: 'token-abc', accountId: account.id, expiresAt: future });

    await store.deleteSession('token-abc');
    expect(await store.findValidSession('token-abc')).toBeNull();
  });

  it('treats an expired session as invalid and evicts it', async () => {
    const store = new InMemoryPersistenceStore();
    const account = await store.createAccount('trainer@example.com', 'hash123');
    const past = new Date(Date.now() - 1000);
    await store.createSession(account.id, 'expired-token', past);

    expect(await store.findValidSession('expired-token')).toBeNull();
  });

  it('ensureStarterPlayer creates a player once and is idempotent afterwards', async () => {
    const store = new InMemoryPersistenceStore();
    const account = await store.createAccount('trainer@example.com', 'hash123');
    const spawn = { mapId: 'route1', x: 2, y: 3, direction: 'down' as const };
    const starterParty = [
      {
        instanceId: 'party-1',
        speciesId: 1,
        level: 5,
        exp: 0,
        ivs: { hp: 1, attack: 1, defense: 1, spAttack: 1, spDefense: 1, speed: 1 },
        evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
        moveIds: [1],
        currentHp: 20,
      },
    ];

    const created = await store.ensureStarterPlayer(account.id, 'Trainer', spawn, starterParty);
    expect(created.name).toBe('Trainer');
    expect(created.party).toEqual(starterParty);

    const differentParty = [...starterParty];
    const second = await store.ensureStarterPlayer(account.id, 'OtherName', spawn, differentParty);
    expect(second).toEqual(created);
  });

  it('round-trips position and party saves through loadPlayer', async () => {
    const store = new InMemoryPersistenceStore();
    const account = await store.createAccount('trainer@example.com', 'hash123');
    const spawn = { mapId: 'route1', x: 0, y: 0, direction: 'down' as const };
    const party = [
      {
        instanceId: 'party-1',
        speciesId: 1,
        level: 5,
        exp: 0,
        ivs: { hp: 1, attack: 1, defense: 1, spAttack: 1, spDefense: 1, speed: 1 },
        evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
        moveIds: [1],
        currentHp: 20,
      },
    ];
    await store.ensureStarterPlayer(account.id, 'Trainer', spawn, party);

    await store.savePosition(account.id, 'route2', 5, 6, 'up');
    const afterMove = await store.loadPlayer(account.id);
    expect(afterMove).toMatchObject({ mapId: 'route2', x: 5, y: 6, direction: 'up' });

    const updatedParty = [{ ...party[0], currentHp: 10 }];
    await store.saveParty(account.id, updatedParty);
    const afterParty = await store.loadPlayer(account.id);
    expect(afterParty?.party[0].currentHp).toBe(10);
  });

  it('loadPlayer returns null for an account with no player record', async () => {
    const store = new InMemoryPersistenceStore();
    expect(await store.loadPlayer('unknown-account')).toBeNull();
  });

  it('recordBattleResult increments wins/losses independently and is a no-op for an unknown account', async () => {
    const store = new InMemoryPersistenceStore();
    const account = await store.createAccount('trainer@example.com', 'hash123');
    const spawn = { mapId: 'route1', x: 0, y: 0, direction: 'down' as const };
    await store.ensureStarterPlayer(account.id, 'Trainer', spawn, []);

    expect(await store.recordBattleResult(account.id, 'win')).toEqual({ wins: 1, losses: 0 });
    expect(await store.recordBattleResult(account.id, 'win')).toEqual({ wins: 2, losses: 0 });
    expect(await store.recordBattleResult(account.id, 'loss')).toEqual({ wins: 2, losses: 1 });

    expect(await store.recordBattleResult('unknown-account', 'win')).toEqual({ wins: 0, losses: 0 });
  });
});

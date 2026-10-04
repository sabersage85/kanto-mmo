import type { CreatureInstance, Direction, InventorySlot, TradeOffer } from '@kanto-mmo/shared';
import { addItemToInventory, executeTrade, PARTY_CAP, removeItemFromInventory } from '@kanto-mmo/shared';
import type { PersistenceStore } from './persistence/types.js';
import { createStarterInventory, createStarterParty, STARTER_CURRENCY } from './starterParty.js';

/** Maximum party size; a caught creature beyond this overflows into `storage` instead. Re-exported from shared (Milestone 5) so server and shared trade logic share one source of truth. */
export { PARTY_CAP };

export interface SessionRecord {
  accountId: string;
  name: string;
  mapId: string;
  x: number;
  y: number;
  direction: Direction;
  party: CreatureInstance[];
  wins: number;
  losses: number;
  storage: CreatureInstance[];
  inventory: InventorySlot[];
  currency: number;
}

/**
 * Live, in-memory cache of currently-active players' party + position,
 * backed by a {@link PersistenceStore} for durability. Replaces the
 * Milestone 2 `playerRegistry.ts` (which never persisted anything): reads
 * are served from this cache for speed, and every mutation is written
 * through to the store so a server restart, disconnect, or re-login never
 * loses progress.
 */
const cache = new Map<string, SessionRecord>();

/** Loads (from cache, then the store, creating a starter player if brand new) a session for this account. */
export async function loadSession(
  store: PersistenceStore,
  accountId: string,
  fallbackName: string,
  spawn: { mapId: string; x: number; y: number; direction: Direction },
): Promise<SessionRecord> {
  const cached = cache.get(accountId);
  if (cached) return cached;

  const persisted = await store.loadPlayer(accountId);
  const record: SessionRecord = persisted
    ? { ...persisted, accountId }
    : {
        accountId,
        name: fallbackName,
        mapId: spawn.mapId,
        x: spawn.x,
        y: spawn.y,
        direction: spawn.direction,
        party: (
          await store.ensureStarterPlayer(
            accountId,
            fallbackName,
            spawn,
            createStarterParty(),
            createStarterInventory(),
            STARTER_CURRENCY,
          )
        ).party,
        wins: 0,
        losses: 0,
        storage: [],
        inventory: createStarterInventory(),
        currency: STARTER_CURRENCY,
      };

  cache.set(accountId, record);
  return record;
}

export function getSession(accountId: string): SessionRecord | undefined {
  return cache.get(accountId);
}

export function getParty(accountId: string): CreatureInstance[] {
  return cache.get(accountId)?.party ?? [];
}

/** Returns the first party member with HP remaining (no switching UI yet, so just the first one). */
export function getFirstAliveInstance(accountId: string): CreatureInstance | undefined {
  return getParty(accountId).find((creature) => creature.currentHp > 0);
}

/** Updates one party member in-memory and writes the whole party through to the store. */
export function updatePartyMember(accountId: string, updated: CreatureInstance, store: PersistenceStore): void {
  const record = cache.get(accountId);
  if (!record) return;
  const index = record.party.findIndex((c) => c.instanceId === updated.instanceId);
  if (index >= 0) record.party[index] = updated;

  void store.saveParty(accountId, record.party).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[sessionCache] failed to persist party for ${accountId}:`, err);
  });
}

/** Updates position in-memory and write-through persists it (fire-and-forget; not latency-sensitive to await per step). */
export function updatePosition(
  accountId: string,
  mapId: string,
  x: number,
  y: number,
  direction: Direction,
  store: PersistenceStore,
): void {
  const record = cache.get(accountId);
  if (!record) return;
  record.mapId = mapId;
  record.x = x;
  record.y = y;
  record.direction = direction;

  void store.savePosition(accountId, mapId, x, y, direction).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[sessionCache] failed to persist position for ${accountId}:`, err);
  });
}

/** Updates the in-memory win/loss tally optimistically, then write-through persists it (Milestone 4 PvP). */
export function recordBattleResult(
  accountId: string,
  result: 'win' | 'loss',
  store: PersistenceStore,
): { wins: number; losses: number } {
  const record = cache.get(accountId);
  if (!record) return { wins: 0, losses: 0 };
  if (result === 'win') record.wins += 1;
  else record.losses += 1;

  void store.recordBattleResult(accountId, result).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[sessionCache] failed to persist battle result for ${accountId}:`, err);
  });

  return { wins: record.wins, losses: record.losses };
}

/** Awaited, synchronous flush of the cached record to the store — used when a player fully disconnects. */
export async function flushSession(accountId: string, store: PersistenceStore): Promise<void> {
  const record = cache.get(accountId);
  if (!record) return;
  await Promise.all([
    store.savePosition(accountId, record.mapId, record.x, record.y, record.direction),
    store.saveParty(accountId, record.party),
    store.saveStorage(accountId, record.storage),
    store.saveInventory(accountId, record.inventory),
    store.saveCurrency(accountId, record.currency),
  ]);
}

/** Drops a session from the live cache (call after flushing). Exported mainly for tests. */
export function evictSession(accountId: string): void {
  cache.delete(accountId);
}

/** Test-only helper to ensure isolation between test cases. */
export function clearAllSessions(): void {
  cache.clear();
}

export function getInventory(accountId: string): InventorySlot[] {
  return cache.get(accountId)?.inventory ?? [];
}

export function getCurrency(accountId: string): number {
  return cache.get(accountId)?.currency ?? 0;
}

export function getStorage(accountId: string): CreatureInstance[] {
  return cache.get(accountId)?.storage ?? [];
}

/** Adds `quantity` of an item to the cached inventory and write-throughs to the store. */
export function addInventoryItem(
  accountId: string,
  itemId: number,
  quantity: number,
  store: PersistenceStore,
): InventorySlot[] {
  const record = cache.get(accountId);
  if (!record) return [];
  record.inventory = addItemToInventory(record.inventory, itemId, quantity);

  void store.saveInventory(accountId, record.inventory).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[sessionCache] failed to persist inventory for ${accountId}:`, err);
  });

  return record.inventory;
}

/** Removes `quantity` of an item from the cached inventory; returns false (no-op) if there isn't enough. */
export function removeInventoryItem(
  accountId: string,
  itemId: number,
  quantity: number,
  store: PersistenceStore,
): boolean {
  const record = cache.get(accountId);
  if (!record) return false;

  const result = removeItemFromInventory(record.inventory, itemId, quantity);
  if (!result.success) return false;
  record.inventory = result.items;

  void store.saveInventory(accountId, record.inventory).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[sessionCache] failed to persist inventory for ${accountId}:`, err);
  });

  return true;
}

/** Deducts `amount` currency if affordable; returns false (no-op) otherwise. */
export function spendCurrency(accountId: string, amount: number, store: PersistenceStore): boolean {
  const record = cache.get(accountId);
  if (!record || record.currency < amount) return false;
  record.currency -= amount;

  void store.saveCurrency(accountId, record.currency).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[sessionCache] failed to persist currency for ${accountId}:`, err);
  });

  return true;
}

/** Adds `amount` currency (e.g. a future reward mechanic) and write-throughs to the store. */
export function addCurrency(accountId: string, amount: number, store: PersistenceStore): number {
  const record = cache.get(accountId);
  if (!record) return 0;
  record.currency += amount;

  void store.saveCurrency(accountId, record.currency).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[sessionCache] failed to persist currency for ${accountId}:`, err);
  });

  return record.currency;
}

/**
 * Adds a newly-caught creature to the party if there's room (cap
 * `PARTY_CAP`), otherwise to overflow storage. Write-throughs whichever
 * list changed.
 */
export function addCreatureToPartyOrStorage(
  accountId: string,
  creature: CreatureInstance,
  store: PersistenceStore,
): 'party' | 'storage' {
  const record = cache.get(accountId);
  if (!record) return 'storage';

  if (record.party.length < PARTY_CAP) {
    record.party = [...record.party, creature];
    void store.saveParty(accountId, record.party).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error(`[sessionCache] failed to persist party for ${accountId}:`, err);
    });
    return 'party';
  }

  record.storage = [...record.storage, creature];
  void store.saveStorage(accountId, record.storage).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[sessionCache] failed to persist storage for ${accountId}:`, err);
  });
  return 'storage';
}

export type TradeExecutionOutcome =
  | { success: true }
  | { success: false; reason: string };

/**
 * Re-validates both sides' *live* cached state and, if still valid, applies
 * the atomic swap computed by `@kanto-mmo/shared`'s `executeTrade` to both
 * cached records and write-throughs the changed lists (party/storage/
 * inventory) for each account. Only mutates the cache on success — a
 * rejected trade (stale offer, item spent elsewhere since confirming,
 * etc.) leaves both cached records completely untouched, same guarantee
 * `executeTrade` provides at the pure-function level (Milestone 5).
 */
export function executeTradeBetween(
  accountIdA: string,
  offerA: TradeOffer,
  accountIdB: string,
  offerB: TradeOffer,
  store: PersistenceStore,
): TradeExecutionOutcome {
  const recordA = cache.get(accountIdA);
  const recordB = cache.get(accountIdB);
  if (!recordA || !recordB) {
    return { success: false, reason: 'One or both trainers are no longer online.' };
  }

  const result = executeTrade(
    { inventory: recordA.inventory, party: recordA.party, storage: recordA.storage },
    offerA,
    { inventory: recordB.inventory, party: recordB.party, storage: recordB.storage },
    offerB,
  );
  if (!result.success) return result;

  recordA.inventory = result.sideA.inventory;
  recordA.party = result.sideA.party;
  recordA.storage = result.sideA.storage;
  recordB.inventory = result.sideB.inventory;
  recordB.party = result.sideB.party;
  recordB.storage = result.sideB.storage;

  void Promise.all([
    store.saveInventory(accountIdA, recordA.inventory),
    store.saveParty(accountIdA, recordA.party),
    store.saveStorage(accountIdA, recordA.storage),
    store.saveInventory(accountIdB, recordB.inventory),
    store.saveParty(accountIdB, recordB.party),
    store.saveStorage(accountIdB, recordB.storage),
  ]).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[sessionCache] failed to persist trade between ${accountIdA} and ${accountIdB}:`, err);
  });

  return { success: true };
}

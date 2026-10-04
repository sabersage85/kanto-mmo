import type { CreatureInstance, Direction } from '@kanto-mmo/shared';
import type { PersistenceStore } from './persistence/types.js';
import { createStarterParty } from './starterParty.js';

export interface SessionRecord {
  accountId: string;
  name: string;
  mapId: string;
  x: number;
  y: number;
  direction: Direction;
  party: CreatureInstance[];
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
        party: (await store.ensureStarterPlayer(accountId, fallbackName, spawn, createStarterParty())).party,
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

/** Awaited, synchronous flush of the cached record to the store — used when a player fully disconnects. */
export async function flushSession(accountId: string, store: PersistenceStore): Promise<void> {
  const record = cache.get(accountId);
  if (!record) return;
  await Promise.all([
    store.savePosition(accountId, record.mapId, record.x, record.y, record.direction),
    store.saveParty(accountId, record.party),
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

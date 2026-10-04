import { DrizzlePostgresStore } from './drizzlePostgresStore.js';
import { InMemoryPersistenceStore } from './memoryStore.js';
import type { PersistenceStore } from './types.js';

let store: PersistenceStore | null = null;

/**
 * Lazily creates (on first call) and returns the process-wide persistence
 * store singleton. Uses a real Postgres-backed store when `DATABASE_URL` is
 * set, otherwise falls back to a pure in-memory store so the server is
 * still runnable without Docker/Postgres installed (handy for a quick
 * local try, though party/account data won't survive a restart in that
 * mode — see README's "Database setup" section).
 */
export function getPersistenceStore(): PersistenceStore {
  if (!store) store = createDefaultPersistenceStore();
  return store;
}

/** Overrides the singleton — used by tests that want a fresh isolated store. */
export function setPersistenceStore(custom: PersistenceStore): void {
  store = custom;
}

function createDefaultPersistenceStore(): PersistenceStore {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // eslint-disable-next-line no-console
    console.warn(
      '[persistence] DATABASE_URL not set - using an in-memory store. Account/party data will NOT survive a server restart. See README "Database setup" to run with Postgres.',
    );
    return new InMemoryPersistenceStore();
  }

  // eslint-disable-next-line no-console
  console.log('[persistence] DATABASE_URL set - using Postgres-backed persistence.');
  return new DrizzlePostgresStore(url);
}

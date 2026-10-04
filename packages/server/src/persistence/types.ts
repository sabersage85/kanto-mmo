import type { CreatureInstance, Direction } from '@kanto-mmo/shared';

/** A registered account (email + password hash). Never expose `passwordHash` to clients. */
export interface AccountRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

/** A single active login session token for an account. */
export interface SessionRecord {
  token: string;
  accountId: string;
  expiresAt: Date;
}

/** The durable, per-account overworld player state: identity, position, and party. */
export interface PersistedPlayer {
  accountId: string;
  name: string;
  mapId: string;
  x: number;
  y: number;
  direction: Direction;
  party: CreatureInstance[];
}

/**
 * Storage abstraction for everything Milestone 3 needs to persist. Keeping
 * this as a narrow interface (rather than importing a DB client directly
 * into auth/session code) means:
 *  - production wiring can swap in a real Postgres-backed implementation,
 *  - unit tests can use a plain in-memory implementation with the exact
 *    same contract, with zero mocking and no live database required.
 */
export interface PersistenceStore {
  createAccount(email: string, passwordHash: string): Promise<AccountRecord>;
  findAccountByEmail(email: string): Promise<AccountRecord | null>;
  findAccountById(accountId: string): Promise<AccountRecord | null>;

  createSession(accountId: string, token: string, expiresAt: Date): Promise<void>;
  findValidSession(token: string): Promise<SessionRecord | null>;
  deleteSession(token: string): Promise<void>;

  /**
   * Creates the player row (spawn position + a starter creature party) for
   * a brand-new account. Must be a no-op (returning the existing record)
   * if the account already has a player — callers should prefer
   * `loadPlayer` and only call this once, right after registration.
   */
  ensureStarterPlayer(
    accountId: string,
    name: string,
    spawn: { mapId: string; x: number; y: number; direction: Direction },
    starterParty: CreatureInstance[],
  ): Promise<PersistedPlayer>;

  loadPlayer(accountId: string): Promise<PersistedPlayer | null>;
  savePosition(accountId: string, mapId: string, x: number, y: number, direction: Direction): Promise<void>;
  saveParty(accountId: string, party: CreatureInstance[]): Promise<void>;
}

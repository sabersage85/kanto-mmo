import type { CreatureInstance, Direction, InventorySlot } from '@kanto-mmo/shared';

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

/** The durable, per-account overworld player state: identity, position, party, inventory, currency, and storage. */
export interface PersistedPlayer {
  accountId: string;
  name: string;
  mapId: string;
  x: number;
  y: number;
  direction: Direction;
  party: CreatureInstance[];
  wins: number;
  losses: number;
  /** Overflow creatures caught while the party (cap of 6) was full (Milestone 2). */
  storage: CreatureInstance[];
  inventory: InventorySlot[];
  currency: number;
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
    starterInventory: InventorySlot[],
    starterCurrency: number,
  ): Promise<PersistedPlayer>;

  loadPlayer(accountId: string): Promise<PersistedPlayer | null>;
  savePosition(accountId: string, mapId: string, x: number, y: number, direction: Direction): Promise<void>;
  saveParty(accountId: string, party: CreatureInstance[]): Promise<void>;

  /** Atomically increments the account's win or loss counter (Milestone 4 PvP) and returns the updated tally. */
  recordBattleResult(accountId: string, result: 'win' | 'loss'): Promise<{ wins: number; losses: number }>;

  /** Overwrites overflow creature storage (Milestone 2 — a full party overflows here on catch). */
  saveStorage(accountId: string, storage: CreatureInstance[]): Promise<void>;
  /** Overwrites the full stacked inventory (Milestone 2). */
  saveInventory(accountId: string, inventory: InventorySlot[]): Promise<void>;
  /** Overwrites the account's currency balance (Milestone 2). */
  saveCurrency(accountId: string, currency: number): Promise<void>;
}

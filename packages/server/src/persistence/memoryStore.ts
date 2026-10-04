import { randomUUID } from 'node:crypto';
import type { CreatureInstance, Direction, InventorySlot } from '@kanto-mmo/shared';
import type { AccountRecord, PersistedPlayer, PersistenceStore, SessionRecord } from './types.js';

/**
 * Pure in-memory implementation of {@link PersistenceStore}. State does
 * NOT survive a process restart. Used as:
 *  - the backing store for all unit tests (no live Postgres required), and
 *  - an automatic local-dev fallback when `DATABASE_URL` is not set, so the
 *    server is still runnable (with the same account/session/party flow)
 *    without having Docker/Postgres installed.
 */
export class InMemoryPersistenceStore implements PersistenceStore {
  private accountsById = new Map<string, AccountRecord>();
  private accountIdsByEmail = new Map<string, string>();
  private sessions = new Map<string, SessionRecord>();
  private players = new Map<string, PersistedPlayer>();

  async createAccount(email: string, passwordHash: string): Promise<AccountRecord> {
    const account: AccountRecord = { id: randomUUID(), email, passwordHash, createdAt: new Date() };
    this.accountsById.set(account.id, account);
    this.accountIdsByEmail.set(email, account.id);
    return account;
  }

  async findAccountByEmail(email: string): Promise<AccountRecord | null> {
    const id = this.accountIdsByEmail.get(email);
    return id ? (this.accountsById.get(id) ?? null) : null;
  }

  async findAccountById(accountId: string): Promise<AccountRecord | null> {
    return this.accountsById.get(accountId) ?? null;
  }

  async createSession(accountId: string, token: string, expiresAt: Date): Promise<void> {
    this.sessions.set(token, { token, accountId, expiresAt });
  }

  async findValidSession(token: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(token);
    if (!session) return null;
    if (session.expiresAt.getTime() < Date.now()) {
      this.sessions.delete(token);
      return null;
    }
    return session;
  }

  async deleteSession(token: string): Promise<void> {
    this.sessions.delete(token);
  }

  async ensureStarterPlayer(
    accountId: string,
    name: string,
    spawn: { mapId: string; x: number; y: number; direction: Direction },
    starterParty: CreatureInstance[],
    starterInventory: InventorySlot[],
    starterCurrency: number,
  ): Promise<PersistedPlayer> {
    const existing = this.players.get(accountId);
    if (existing) return existing;

    const player: PersistedPlayer = {
      accountId,
      name,
      mapId: spawn.mapId,
      x: spawn.x,
      y: spawn.y,
      direction: spawn.direction,
      party: starterParty,
      wins: 0,
      losses: 0,
      storage: [],
      inventory: starterInventory,
      currency: starterCurrency,
    };
    this.players.set(accountId, player);
    return player;
  }

  async loadPlayer(accountId: string): Promise<PersistedPlayer | null> {
    return this.players.get(accountId) ?? null;
  }

  async savePosition(accountId: string, mapId: string, x: number, y: number, direction: Direction): Promise<void> {
    const player = this.players.get(accountId);
    if (!player) return;
    player.mapId = mapId;
    player.x = x;
    player.y = y;
    player.direction = direction;
  }

  async saveParty(accountId: string, party: CreatureInstance[]): Promise<void> {
    const player = this.players.get(accountId);
    if (!player) return;
    player.party = party;
  }

  async recordBattleResult(accountId: string, result: 'win' | 'loss'): Promise<{ wins: number; losses: number }> {
    const player = this.players.get(accountId);
    if (!player) return { wins: 0, losses: 0 };
    if (result === 'win') player.wins += 1;
    else player.losses += 1;
    return { wins: player.wins, losses: player.losses };
  }

  async saveStorage(accountId: string, storage: CreatureInstance[]): Promise<void> {
    const player = this.players.get(accountId);
    if (!player) return;
    player.storage = storage;
  }

  async saveInventory(accountId: string, inventory: InventorySlot[]): Promise<void> {
    const player = this.players.get(accountId);
    if (!player) return;
    player.inventory = inventory;
  }

  async saveCurrency(accountId: string, currency: number): Promise<void> {
    const player = this.players.get(accountId);
    if (!player) return;
    player.currency = currency;
  }
}

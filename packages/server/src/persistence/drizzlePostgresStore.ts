import { eq, sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { CreatureInstance, Direction, InventorySlot, StatBlock } from '@kanto-mmo/shared';
import { accounts, defeatedTrainers, inventoryItems, partyMembers, players, sessions, storageMembers } from '../db/schema.js';
import type { AccountRecord, PersistedPlayer, PersistenceStore, SessionRecord } from './types.js';

/** Postgres-backed implementation of {@link PersistenceStore}, via Drizzle ORM + postgres.js. */
export class DrizzlePostgresStore implements PersistenceStore {
  private readonly db: PostgresJsDatabase;
  private readonly sql: ReturnType<typeof postgres>;

  constructor(connectionString: string) {
    this.sql = postgres(connectionString, { max: 10 });
    this.db = drizzle(this.sql);
  }

  /** Closes the underlying connection pool. Mainly useful for tests. */
  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  async createAccount(email: string, passwordHash: string): Promise<AccountRecord> {
    const [row] = await this.db.insert(accounts).values({ email, passwordHash }).returning();
    return { id: row.id, email: row.email, passwordHash: row.passwordHash, createdAt: row.createdAt };
  }

  async findAccountByEmail(email: string): Promise<AccountRecord | null> {
    const [row] = await this.db.select().from(accounts).where(eq(accounts.email, email)).limit(1);
    return row ? { id: row.id, email: row.email, passwordHash: row.passwordHash, createdAt: row.createdAt } : null;
  }

  async findAccountById(accountId: string): Promise<AccountRecord | null> {
    const [row] = await this.db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    return row ? { id: row.id, email: row.email, passwordHash: row.passwordHash, createdAt: row.createdAt } : null;
  }

  async createSession(accountId: string, token: string, expiresAt: Date): Promise<void> {
    await this.db.insert(sessions).values({ token, accountId, expiresAt });
  }

  async findValidSession(token: string): Promise<SessionRecord | null> {
    const [row] = await this.db.select().from(sessions).where(eq(sessions.token, token)).limit(1);
    if (!row) return null;
    if (row.expiresAt.getTime() < Date.now()) {
      await this.deleteSession(token);
      return null;
    }
    return { token: row.token, accountId: row.accountId, expiresAt: row.expiresAt };
  }

  async deleteSession(token: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.token, token));
  }

  async ensureStarterPlayer(
    accountId: string,
    name: string,
    spawn: { mapId: string; x: number; y: number; direction: Direction },
    starterParty: CreatureInstance[],
    starterInventory: InventorySlot[],
    starterCurrency: number,
  ): Promise<PersistedPlayer> {
    const existing = await this.loadPlayer(accountId);
    if (existing) return existing;

    await this.db.insert(players).values({
      accountId,
      name,
      mapId: spawn.mapId,
      x: spawn.x,
      y: spawn.y,
      direction: spawn.direction,
      currency: starterCurrency,
    });
    await this.insertParty(accountId, starterParty);
    await this.insertInventory(accountId, starterInventory);

    return {
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
      badges: [],
    };
  }

  async loadPlayer(accountId: string): Promise<PersistedPlayer | null> {
    const [playerRow] = await this.db.select().from(players).where(eq(players.accountId, accountId)).limit(1);
    if (!playerRow) return null;

    const partyRows = await this.db
      .select()
      .from(partyMembers)
      .where(eq(partyMembers.accountId, accountId))
      .orderBy(partyMembers.slot);

    const storageRows = await this.db
      .select()
      .from(storageMembers)
      .where(eq(storageMembers.accountId, accountId))
      .orderBy(storageMembers.slot);

    const inventoryRows = await this.db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.accountId, accountId));

    const badgeRows = await this.db
      .select({ trainerBadgeId: defeatedTrainers.trainerBadgeId })
      .from(defeatedTrainers)
      .where(eq(defeatedTrainers.accountId, accountId));

    const party: CreatureInstance[] = partyRows.map(rowToCreatureInstance);
    const storage: CreatureInstance[] = storageRows.map(rowToCreatureInstance);
    const inventory: InventorySlot[] = inventoryRows.map((row) => ({ itemId: row.itemId, quantity: row.quantity }));
    const badges: string[] = badgeRows.map((row) => row.trainerBadgeId);

    return {
      accountId,
      name: playerRow.name,
      mapId: playerRow.mapId,
      x: playerRow.x,
      y: playerRow.y,
      direction: playerRow.direction as Direction,
      party,
      wins: playerRow.wins,
      losses: playerRow.losses,
      storage,
      inventory,
      currency: playerRow.currency,
      badges,
    };
  }

  async savePosition(accountId: string, mapId: string, x: number, y: number, direction: Direction): Promise<void> {
    await this.db
      .update(players)
      .set({ mapId, x, y, direction, updatedAt: new Date() })
      .where(eq(players.accountId, accountId));
  }

  async saveParty(accountId: string, party: CreatureInstance[]): Promise<void> {
    await this.db.delete(partyMembers).where(eq(partyMembers.accountId, accountId));
    await this.insertParty(accountId, party);
  }

  async recordBattleResult(accountId: string, result: 'win' | 'loss'): Promise<{ wins: number; losses: number }> {
    const [row] =
      result === 'win'
        ? await this.db
            .update(players)
            .set({ wins: sql`${players.wins} + 1`, updatedAt: new Date() })
            .where(eq(players.accountId, accountId))
            .returning({ wins: players.wins, losses: players.losses })
        : await this.db
            .update(players)
            .set({ losses: sql`${players.losses} + 1`, updatedAt: new Date() })
            .where(eq(players.accountId, accountId))
            .returning({ wins: players.wins, losses: players.losses });
    return row ?? { wins: 0, losses: 0 };
  }

  async saveStorage(accountId: string, storage: CreatureInstance[]): Promise<void> {
    await this.db.delete(storageMembers).where(eq(storageMembers.accountId, accountId));
    if (storage.length === 0) return;
    await this.db.insert(storageMembers).values(
      storage.map((creature, slot) => ({
        accountId,
        slot,
        instanceId: creature.instanceId,
        speciesId: creature.speciesId,
        nickname: creature.nickname ?? null,
        level: creature.level,
        exp: creature.exp,
        ivs: creature.ivs,
        evs: creature.evs,
        moveIds: creature.moveIds,
        currentHp: creature.currentHp,
      })),
    );
  }

  async saveInventory(accountId: string, inventory: InventorySlot[]): Promise<void> {
    await this.db.delete(inventoryItems).where(eq(inventoryItems.accountId, accountId));
    await this.insertInventory(accountId, inventory);
  }

  async saveCurrency(accountId: string, currency: number): Promise<void> {
    await this.db.update(players).set({ currency, updatedAt: new Date() }).where(eq(players.accountId, accountId));
  }

  async awardBadge(accountId: string, badgeId: string): Promise<string[]> {
    await this.db
      .insert(defeatedTrainers)
      .values({ accountId, trainerBadgeId: badgeId })
      .onConflictDoNothing();

    const rows = await this.db
      .select({ trainerBadgeId: defeatedTrainers.trainerBadgeId })
      .from(defeatedTrainers)
      .where(eq(defeatedTrainers.accountId, accountId));
    return rows.map((row) => row.trainerBadgeId);
  }

  private async insertInventory(accountId: string, inventory: InventorySlot[]): Promise<void> {
    if (inventory.length === 0) return;
    await this.db.insert(inventoryItems).values(
      inventory.map((slot) => ({ accountId, itemId: slot.itemId, quantity: slot.quantity })),
    );
  }

  private async insertParty(accountId: string, party: CreatureInstance[]): Promise<void> {
    if (party.length === 0) return;
    await this.db.insert(partyMembers).values(
      party.map((creature, slot) => ({
        accountId,
        slot,
        instanceId: creature.instanceId,
        speciesId: creature.speciesId,
        nickname: creature.nickname ?? null,
        level: creature.level,
        exp: creature.exp,
        ivs: creature.ivs,
        evs: creature.evs,
        moveIds: creature.moveIds,
        currentHp: creature.currentHp,
      })),
    );
  }
}

function rowToCreatureInstance(row: {
  instanceId: string;
  speciesId: number;
  nickname: string | null;
  level: number;
  exp: number;
  ivs: unknown;
  evs: unknown;
  moveIds: unknown;
  currentHp: number;
}): CreatureInstance {
  return {
    instanceId: row.instanceId,
    speciesId: row.speciesId,
    nickname: row.nickname ?? undefined,
    level: row.level,
    exp: row.exp,
    ivs: row.ivs as StatBlock,
    evs: row.evs as StatBlock,
    moveIds: row.moveIds as number[],
    currentHp: row.currentHp,
  };
}

import { eq, sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { CreatureInstance, Direction, StatBlock } from '@kanto-mmo/shared';
import { accounts, partyMembers, players, sessions } from '../db/schema.js';
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
    });
    await this.insertParty(accountId, starterParty);

    return { accountId, name, mapId: spawn.mapId, x: spawn.x, y: spawn.y, direction: spawn.direction, party: starterParty, wins: 0, losses: 0 };
  }

  async loadPlayer(accountId: string): Promise<PersistedPlayer | null> {
    const [playerRow] = await this.db.select().from(players).where(eq(players.accountId, accountId)).limit(1);
    if (!playerRow) return null;

    const partyRows = await this.db
      .select()
      .from(partyMembers)
      .where(eq(partyMembers.accountId, accountId))
      .orderBy(partyMembers.slot);

    const party: CreatureInstance[] = partyRows.map((row) => ({
      instanceId: row.instanceId,
      speciesId: row.speciesId,
      nickname: row.nickname ?? undefined,
      level: row.level,
      exp: row.exp,
      ivs: row.ivs as StatBlock,
      evs: row.evs as StatBlock,
      moveIds: row.moveIds as number[],
      currentHp: row.currentHp,
    }));

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

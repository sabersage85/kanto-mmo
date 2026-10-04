import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * Drizzle ORM schema for Postgres-backed persistence (Milestone 3).
 * Run `npm run db:generate -w packages/server` after editing this file to
 * produce a SQL migration under `packages/server/drizzle/`, then
 * `npm run db:migrate -w packages/server` to apply it.
 */

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  token: text('token').primaryKey(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const players = pgTable('players', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  mapId: text('map_id').notNull(),
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  direction: text('direction').notNull(),
  /** Lifetime PvP record (Milestone 4). Wild/PvE battles do not affect these. */
  wins: integer('wins').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  /** In-game currency (Milestone 2), spent at the shop tile. */
  currency: integer('currency').notNull().default(300),
  /** Murk Crew questline stage (Milestone 7): 0=not started, 1=path cleared, 2=lure returned, 3=complete. */
  questStage: integer('quest_stage').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One creature in a player's party. `ivs`/`evs`/`moveIds` are stored as JSON (see CreatureInstance in shared). */
export const partyMembers = pgTable('party_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  slot: integer('slot').notNull(),
  instanceId: text('instance_id').notNull(),
  speciesId: integer('species_id').notNull(),
  nickname: text('nickname'),
  level: integer('level').notNull(),
  exp: integer('exp').notNull(),
  ivs: jsonb('ivs').notNull(),
  evs: jsonb('evs').notNull(),
  moveIds: jsonb('move_ids').notNull(),
  currentHp: integer('current_hp').notNull(),
});

/**
 * Overflow creature storage (Milestone 2): once a party is full (cap of 6),
 * a newly-caught creature lands here instead. Same shape as
 * `partyMembers` — kept as a separate table (rather than a status flag) so
 * party-vs-storage queries/writes stay simple and independent.
 */
export const storageMembers = pgTable('storage_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  slot: integer('slot').notNull(),
  instanceId: text('instance_id').notNull(),
  speciesId: integer('species_id').notNull(),
  nickname: text('nickname'),
  level: integer('level').notNull(),
  exp: integer('exp').notNull(),
  ivs: jsonb('ivs').notNull(),
  evs: jsonb('evs').notNull(),
  moveIds: jsonb('move_ids').notNull(),
  currentHp: integer('current_hp').notNull(),
});

/** One stacked inventory slot (Milestone 2). `quantity` is always > 0 (a depleted slot is deleted, not zeroed). */
export const inventoryItems = pgTable('inventory_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  itemId: integer('item_id').notNull(),
  quantity: integer('quantity').notNull(),
});

/**
 * One earned badge (Milestone 6): a row exists iff `accountId` has
 * defeated the trainer identified by `trainerBadgeId`. A trainer is never
 * re-awarded once its row exists — see `DrizzlePostgresStore.awardBadge`.
 */
export const defeatedTrainers = pgTable(
  'defeated_trainers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    trainerBadgeId: text('trainer_badge_id').notNull(),
    defeatedAt: timestamp('defeated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    accountBadgeUnique: uniqueIndex('defeated_trainers_account_badge_unique').on(
      table.accountId,
      table.trainerBadgeId,
    ),
  }),
);

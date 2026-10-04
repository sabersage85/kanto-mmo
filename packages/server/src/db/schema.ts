import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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

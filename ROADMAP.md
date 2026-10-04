# Roadmap

This document tracks planned milestones after the initial scaffold +
first-playable multiplayer overworld slice. Order is roughly sequential but
may shift as design needs evolve. Each milestone should land with its own
tests where the logic is testable in isolation (anything in `shared`
especially).

## Milestone 0 — Foundation (done, this session)

- Monorepo scaffold (npm workspaces, TypeScript, ESLint/Prettier).
- `shared` package: core types, original species/move data, damage calc,
  type effectiveness, XP curve, all unit tested.
- `server`: Colyseus `OverworldRoom` with one grid-based JSON test map,
  authoritative movement validation, real-time state broadcast.
- `client`: Phaser + Vite app rendering colored-rect tiles/players, connects
  to the server, local movement via arrow keys/WASD synced over the wire.
- README + this roadmap.

## Milestone 1 — Wild Encounters & Turn-Based PvE Battles (done, this session)

- Step-based random encounter table on `grass` tiles (`rollEncounter` in
  `shared`), with a weighted wild species/level pool defined server-side
  per map (`packages/server/src/data/encounters.ts`).
- A dedicated `BattleRoom` (one player vs one wild creature): speed-based
  turn order, move selection, damage application via `shared`'s
  `calculateDamage`/`applyMove`, fainting, win/loss detection, and XP award
  (with level-up + full heal) via `applyBattleExpGain`.
- Encounters are rolled authoritatively in `OverworldRoom` and handed to the
  client via a single-use, player-bound token (`pendingEncounters.ts`) so a
  modified client can't choose its own (easier) wild opponent.
- Minimal in-memory player "party" (`playerRegistry.ts`): every player gets
  a level-5 starter creature on first join. Not yet persisted to a
  database — that's Milestone 3.
- Battle UI in the client (`BattleScene`): HP bars, move-selection buttons,
  a scrolling battle log, and a flee option; transitions to/from the
  overworld scene on encounter start/battle end.
- Unit tests (vitest) for turn order, move/damage application, faint/win/
  loss detection, and XP gain/level-up (`packages/shared`), plus the
  server-side encounter-token and party-registry logic
  (`packages/server`).
- **Deferred to a later milestone:** a capture/catch mechanic (so players
  can add wild creatures to their party) — not in this slice's scope; wild
  battles currently only award XP.

## Milestone 2 — Inventory & Items

- Player inventory data model in `shared` (items, stacking, usage effects).
- Basic item effects: healing, catching tools, stat boosts.
- Server-authoritative inventory mutations (no client-trusted item counts).
- Simple shop or item-pickup-on-map mechanic to acquire items.

## Milestone 3 — Persistence, Accounts & Auth (done, this session)

- **Database**: PostgreSQL via [Drizzle ORM](https://orm.drizzle.team/) +
  the `postgres` (postgres.js) driver — chosen over Prisma specifically to
  avoid Prisma's native query-engine binary download step, and over
  MongoDB since the data (accounts/sessions/party members) is cleanly
  relational. See the README's "Database choice & rationale" section for
  the full writeup.
- **Accounts**: email/password registration and login
  (`packages/server/src/auth/authService.ts`), passwords hashed with
  Node's built-in `scrypt` (`auth/password.ts`, no extra native
  dependency), opaque random session tokens with a 7-day TTL
  (`auth/tokens.ts`).
- **Persistence**: a `PersistenceStore` interface
  (`persistence/types.ts`) with two implementations — `DrizzlePostgresStore`
  for production and `InMemoryPersistenceStore` for tests / a zero-setup
  local-dev fallback (auto-selected when `DATABASE_URL` is unset). Stores
  account identity, party (creatures/levels/XP/moves/current HP), and last
  known position/map.
- **Session cache** (`sessionCache.ts`, replacing Milestone 1's
  `playerRegistry.ts`): a live in-memory cache fronting the persistence
  store, write-through on every position/party change so gameplay stays
  fast while nothing is ever lost.
- **Reconnect flow**: both `OverworldRoom` and `BattleRoom` authenticate
  joins via `onAuth` + a session token (instead of a client-supplied
  player id); `OverworldRoom` grants a 30-second Colyseus
  `allowReconnection` grace window on an ungraceful disconnect so a
  network blip / tab reload resumes the same room seat, and a full
  re-login always resumes from the durably-saved position/party either
  way.
- **Client**: a DOM-based login/register overlay (`ui/authOverlay.ts`)
  gates game startup; the session token is cached in `localStorage` so a
  page reload skips straight back into the overworld until the token
  expires.
- Unit tests (vitest) for the in-memory persistence store, the auth
  service (register/login/token validation, including duplicate-email and
  expired-token cases), and the session cache (load/create, party/position
  write-through, flush) — all run against `InMemoryPersistenceStore`, no
  live database required in CI.
- **Deferred to a later milestone:** inventory persistence (there's no
  inventory system yet — that's Milestone 2 above); OAuth login.

## Milestone 4 — PvP Battles

- Matchmaking or direct-challenge flow between two online players.
- Reuse the turn-based battle engine from Milestone 1, adapted for two
  human-controlled sides instead of PvE AI.
- Basic ranking/record tracking (wins/losses), stored via Milestone 3's
  persistence layer.

## Milestone 5 — Trading

- A trade-request UI/flow between two players in the same room or via a
  global "trade post".
- Server-authoritative trade transaction (atomic swap, no item/creature
  duplication exploits).

## Milestone 6 — Gyms / Progression Structure

- Original equivalent of "gym leaders": NPC trainers with themed teams
  gating progression between map regions.
- Badge/progression tracking per player, persisted.
- Scaling difficulty curve tied to the XP/level formulas already in
  `shared`.

## Milestone 7 — Larger World & Content Breadth

- Multiple interconnected maps with warps/transitions (cross-map movement,
  currently out of scope — Milestone 0 is single-map only).
- Expand the original species roster well beyond the initial 12 placeholder
  creatures, with evolution chains.
- Expand the move list, add status effects/abilities design.
- Towns/NPCs, quest or dialogue system.

## Ongoing / Cross-Cutting Concerns

- **Anti-cheat / server authority**: keep all game-affecting logic
  (movement validation, battle resolution, trades, inventory) server-side;
  never trust client-reported state.
- **Scalability**: interest management (only sync nearby players/entities),
  potentially multiple server processes per map/region as player count
  grows.
- **Art & audio**: this project only ships placeholder shapes/colors for
  now. Swapping in final, fully original or properly licensed art and audio
  is a standing task that can happen incrementally per-feature without
  blocking milestones above, since the schemas are designed to be
  visual-asset-agnostic.

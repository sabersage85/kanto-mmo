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
  battles currently only award XP. (Implemented in Milestone 2 below.)

## Milestone 2 — Inventory & Items (done, this session)

> Implemented out of listed order, ahead of Milestone 5 (Trading), since
> trading items depends on an inventory existing first.

- **Item data model** (`shared/src/items.ts`): 7 original items across
  three categories — `heal` (Herb Wrap: restores 20 HP; Vitality Draught:
  full heal), `capture` (Rusty Snare: catchPower 0.1; Reinforced Snare:
  catchPower 0.35), and `boost` (Power Root/Guard Root/Focus Root: +40 EV
  to attack/defense/speed respectively). Each has a price for the shop
  below. `InventorySlot` (itemId + quantity) is the stacking unit; pure
  helpers `addItemToInventory`/`removeItemFromInventory` in
  `shared/src/inventory.ts` handle stacking/splitting with no mutation of
  the input array.
- **Catch mechanic** (`attemptCatch` in `shared/src/inventory.ts`):
  `chance = 1 - hpRatio * (1 - catchPower)`, clamped to `[0, 1]`, where
  `hpRatio = currentHp / maxHp`. This gives the two required boundary
  behaviors for free: at full HP the chance equals the tool's raw
  `catchPower` (e.g. 10% for the weak Rusty Snare), and at 0 HP the chance
  is always 100% regardless of tool. The roll happens server-side in
  `BattleRoom`; the item is consumed whether or not the catch succeeds
  (standard genre convention, also closes a "spam-cancel to avoid cost"
  exploit). On success the wild creature is added to the player's party if
  it has room, otherwise to an overflow `storage` list (party cap: 6).
- **Acquisition mechanic — shop tile (chosen over random pickups)**: a new
  `shop` tile type on the test map (`route1.json`) sends the full item
  catalog to the client when stepped on; the client shows a buy overlay
  that deducts currency and adds the item server-side. Chosen over passive
  pickups because it's simpler to make fully server-authoritative (no
  "has this tile already been looted" state to track and persist) and
  gives a natural hook for a later in-game economy. New players start with
  300 currency and a small starter inventory (3 Herb Wrap, 2 Rusty Snare).
- **Server-authoritative mutations**: all inventory/currency changes
  (`sessionCache.ts`: `addInventoryItem`, `removeInventoryItem`,
  `spendCurrency`, `addCurrency`, `addCreatureToPartyOrStorage`) happen
  only in response to room-side logic, never trust client-sent quantities,
  and persist via the Milestone 3 write-through pattern (new `currency`
  column on `players`, new `inventory_items` and `storage_members` tables,
  migration `drizzle/0002_same_bloodaxe.sql`).
- **Item use is split by room context**: `OverworldRoom.useItem` handles
  heal/boost on a chosen party creature (rejects capture items — "only
  during a wild battle"); `BattleRoom.useItem` handles heal (on the
  currently-battling creature) or capture-roll on the wild creature
  (rejects boost items — "only outside of battle"). This keeps permanent
  EV changes and in-battle consumables cleanly separated.
- **Client**: an inventory panel overlay (`ui/inventoryPanel.ts`, toggled
  with the `I` key) lists items/quantities with a target-creature picker
  and Use button for heal/boost items; a shop overlay (`ui/shopOverlay.ts`)
  appears automatically on the shop tile with Buy buttons and a live
  currency readout; `BattleScene` gained an "Items" button opening an
  inline capture/heal menu built from the same inventory snapshot.
- Unit tests (vitest): 20 new tests in `shared` covering inventory add/
  remove/stacking, heal/stat-boost application, and the catch-rate formula
  edge cases (guaranteed catch at 0 HP regardless of tool; low-but-nonzero
  chance at full HP with the weak tool; higher chance with the strong
  tool) — plus new server-side round-trip tests for inventory/currency/
  storage persistence and party-cap overflow in `memoryStore.test.ts` and
  `sessionCache.test.ts` (117 total tests across `shared` + `server`, all
  passing).
- Manually verified end-to-end with a scripted Colyseus client: register →
  walk to the shop tile → buy items → heal a party creature outside of
  battle → trigger a wild encounter → attempt a catch at full HP with a
  weak tool (failed, as expected) → attack once → attempt a catch at the
  resulting lower HP (succeeded, creature added to party) → re-login and
  confirm inventory, currency, and the newly-caught party member all
  persisted.

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

## Milestone 4 — PvP Battles (done, this session)

- **Direct-challenge flow**: any online player can click another player's
  rectangle in the shared overworld to send a `challengeRequest`; the
  target sees an accept/decline overlay (`ui/challengeOverlay.ts`) that
  auto-declines after 20s if ignored. Handshake state (pending/accepted/
  declined/expired, one outstanding challenge per player in either
  direction) lives in a pure, Colyseus-independent state machine
  (`pvp/challengeManager.ts`) so it's fully unit-testable without a room.
- **Design choice — single active creature, not full party**: each side
  battles with its first living party member (same "first alive" pattern
  `BattleRoom` already uses for PvE), not a rotating full-party battle.
  This reuses the existing single-creature `BattleCreatureState` plumbing
  and avoids switch-mid-battle UI/logic that would meaningfully grow this
  milestone's scope; a full-party PvP mode remains a reasonable future
  enhancement once there's a reason to add in-battle switching generally
  (e.g. for status effects/abilities in Milestone 7).
- **Design choice — no XP for PvP wins**: PvP only updates each account's
  lifetime win/loss record; XP/leveling remains a PvE-only reward via
  Milestone 1's `applyBattleExpGain`, so PvP can't be used to grind levels
  faster than wild battles.
- **Battle engine reuse**: `shared/battle.ts` gained `resolvePvpTurnOrder`,
  `getPvpOutcome`, and `resolvePvpTurn` — these call the exact same
  `calculateDamage`/type-effectiveness/turn-order functions Milestone 1
  built, just resolving two submitted moves instead of one submitted move
  + one AI move.
- **`PvpBattleRoom`**: a new two-human Colyseus room (max 2 clients),
  created server-side via `matchMaker.createRoom` once both players accept
  a challenge in `OverworldRoom` (so a modified client can't fabricate its
  own match or pick its opponent's identity). Each side has a 30-second
  per-turn timeout (forfeit-on-timeout) and a 20-second reconnect grace
  window on an ungraceful disconnect, shorter than the overworld's 30s so
  PvP matches don't stall as long waiting for a dropped player.
- **Persistence**: `wins`/`losses` columns added to the `players` table
  (migration `drizzle/0001_broken_mesmero.sql`), a new
  `recordBattleResult()` on `PersistenceStore` (implemented for both
  `InMemoryPersistenceStore` and `DrizzlePostgresStore` via an atomic SQL
  increment), and a `sessionCache.recordBattleResult()` write-through
  wrapper so the record updates instantly in the live session and is
  durably saved. Final HP also persists back to the party on battle end,
  consistent with the PvE loss convention (the loser's creature can end
  fainted).
- **Client**: `PvpBattleScene` (mirrors `BattleScene`'s placeholder-art HP
  bars/move buttons/log) labels panels with each player's real name instead
  of "wild encounter", disables a player's own move buttons with a
  "waiting for opponent..." indicator after they submit until the next
  turn resolves, and shows the final win/loss record on battle end. The
  overworld scene shows the local player's own live win/loss record in a
  corner HUD line.
- Unit tests (vitest): 8 new shared tests (PvP turn order, outcome
  detection, full turn resolution incl. mid-turn faint skip), 7 new
  `ChallengeManager` tests, and 10 new `PvpMatch` tests (move validation,
  turn resolution, forfeit, idempotency) — 43 shared + 48 server tests
  total, all passing.
- Manually verified end-to-end with two scripted Colyseus clients: register
  both accounts → join overworld → challenge → accept → battle resolves to
  a win/loss → win/loss record updates on both sides → re-login confirms
  the record persisted.

## Milestone 5 — Trading (done, this session)

- **Trade-request flow** mirrors Milestone 4's PvP challenge handshake
  exactly: shift+click another player's rectangle in the overworld to send
  a `tradeRequest` (plain click still sends a PvP `challengeRequest` — kept
  as two distinct gestures so there's no ambiguity about which flow a click
  starts). The target sees an accept/decline overlay
  (`ui/tradeRequestOverlay.ts`) that auto-declines after 20s if ignored.
  Handshake state (pending/accepted/declined/expired, one outstanding
  request per player) lives in `trade/tradeManager.ts`, a pure
  Colyseus-independent state machine directly modeled on
  `pvp/challengeManager.ts`.
- **Negotiation UI** (`ui/tradePanel.ts`): once accepted, both sides see a
  two-column panel (their offer / my offer) with quantity inputs for each
  inventory item and checkboxes for each party/storage creature. Changing
  either side's offer resets **both** sides' confirmation (standard
  "no surprise last-second swap" pattern) — implemented server-side in
  `TradeManager.updateOffer`, not trusted to the client. Only once both
  sides click Confirm does the trade execute.
  - **Mixed items + creatures trades are supported in a single offer** —
    this was scoped a bit wider than the literal "items and/or creatures"
    requirement by just reusing one unified `TradeOffer` shape
    (`{ items, creatureInstanceIds }`) for both, rather than separate
    item-trade/creature-trade flows.
- **Atomic swap, no duplication risk**: `shared/trade.ts`'s `executeTrade`
  is a pure function that re-validates **both** sides' current ownership
  immediately before building any new state, and never mutates its inputs
  — it only returns brand-new post-trade state objects, and only on full
  success. There is no decrement-one-side-then-crash window because
  nothing is written until both sides have already been validated and the
  new state fully computed. This was directly unit tested by snapshotting
  both sides' state as JSON before a deliberately-failing trade (e.g. an
  offered creature no longer owned) and asserting byte-for-byte equality
  afterward, both in `shared` (`trade.test.ts`) and at the live
  session-cache layer (`sessionCache.test.ts`).
- **Design choice — "must keep ≥1 creature" safety rule**: `validateTradeOffer`
  rejects any offer that would leave the offering side with zero total
  creatures (party + storage combined), since there's no release/creature-
  creation mechanic yet and an empty-handed account would be stuck. This
  wasn't explicitly requested but follows naturally from "don't let trades
  produce broken state."
- **Design choice — failed execution keeps the negotiation open**: if both
  sides confirm but the re-validation at execution time fails (e.g. one
  side spent an offered item in the brief window before confirming), the
  trade is **not** aborted — `OverworldRoom.failTrade` resets both sides'
  confirmations (offers are left intact) and notifies both of the reason,
  so they can simply adjust the offer and retry rather than redoing the
  entire request/accept handshake.
- **Persistence**: no new migration was needed — Milestone 3's
  `PersistenceStore` already exposed `saveParty`/`saveStorage`/
  `saveInventory`, which is everything a trade touches.
  `sessionCache.executeTradeBetween()` re-validates both sides' *live*
  cached state via `executeTrade`, mutates the cache only on success, and
  write-throughs all six changed arrays (inventory/party/storage × 2
  accounts).
- Unit tests (vitest): 14 new `shared` tests (offer validation incl. every
  ownership/quantity/≥1-creature edge case, item swap, creature swap,
  party-cap overflow to storage, failed-trade-leaves-state-untouched,
  mixed bidirectional items+creatures trade) and 15 new server
  `TradeManager` tests (handshake incl. self-trade/conflict/TTL-expiry/
  disconnect-cancellation, offer-update visibility, confirm-reset-on-
  change, both-confirmed-required, `resetConfirmations`/`endTrade`/
  `cancelInvolving`) plus 3 new `sessionCache` round-trip tests — 77 shared
  + 72 server tests total, all passing.
- Manually verified end-to-end with two scripted Colyseus clients: register
  both accounts → join overworld → send a trade request → accept → each
  side offers an item → both confirm → swap executes and both sides'
  inventories update correctly → disconnect and reconnect both → confirm
  the swapped items persisted on the correct account.

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

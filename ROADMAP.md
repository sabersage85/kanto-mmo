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

## Milestone 1 — Wild Encounters & Turn-Based PvE Battles

- Random encounter table per map tile-type (e.g. tall grass has a chance to
  trigger a battle on step).
- A `BattleRoom` (or sub-state within `OverworldRoom`) implementing a
  turn-based battle loop: move selection, speed-based turn order, damage
  application via `shared`'s `calculateDamage`, fainting, and victory/XP
  award via `calculateExpGain`.
- Minimal battle UI in the client (HP bars, move buttons) — still placeholder
  rectangles/shapes for creatures.
- Capture mechanic (a simple, original catch-rate formula) so players can
  start building a party.

## Milestone 2 — Inventory & Items

- Player inventory data model in `shared` (items, stacking, usage effects).
- Basic item effects: healing, catching tools, stat boosts.
- Server-authoritative inventory mutations (no client-trusted item counts).
- Simple shop or item-pickup-on-map mechanic to acquire items.

## Milestone 3 — Persistence, Accounts & Auth

- Pick a database (likely PostgreSQL via an ORM, or MongoDB) for durable
  player accounts, parties, inventories, and world state.
- Authentication (email/password or OAuth) with session tokens handed to
  the Colyseus client on join.
- Reconnect flow: a disconnected player's state is preserved and restored.

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

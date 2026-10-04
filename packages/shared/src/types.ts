/**
 * Core type definitions shared between the Kanto MMO client and server.
 *
 * NOTE ON ORIGINALITY: All creature names, move names, and specific data
 * values in this file (and in species.ts / moves.ts) are wholly original
 * and were created for this project. The *shapes* of these data structures
 * (e.g. a species having base stats + types + a growth rate, a move having
 * power/accuracy/pp/type/effect) follow common, long-established genre
 * conventions for monster-collecting RPGs and are not copyrightable
 * expression. No copyrighted assets, names, or data values were copied.
 */

/** Elemental affinities used for type-effectiveness calculations. */
export type ElementType =
  | 'Normal'
  | 'Fire'
  | 'Water'
  | 'Grass'
  | 'Electric'
  | 'Ice'
  | 'Flying'
  | 'Psychic'
  | 'Rock'
  | 'Shadow';

export const ELEMENT_TYPES: ElementType[] = [
  'Normal',
  'Fire',
  'Water',
  'Grass',
  'Electric',
  'Ice',
  'Flying',
  'Psychic',
  'Rock',
  'Shadow',
];

/** One of the six core battle stats. */
export interface StatBlock {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}

/** Growth rate curves control how much total XP is needed to reach a level. */
export type GrowthRate = 'Fast' | 'Medium' | 'Slow' | 'Erratic';

/** Static definition of a creature species (the "dex entry" data). */
export interface SpeciesDefinition {
  id: number;
  name: string;
  types: [ElementType] | [ElementType, ElementType];
  baseStats: StatBlock;
  growthRate: GrowthRate;
  /** Base XP yield used when defeating a wild creature of this species. */
  baseExpYield: number;
  description: string;
}

export type MoveCategory = 'Physical' | 'Special' | 'Status';

/** Static definition of a battle move. */
export interface MoveDefinition {
  id: number;
  name: string;
  type: ElementType;
  category: MoveCategory;
  power: number | null;
  accuracy: number | null;
  pp: number;
  description: string;
}

/** An individual creature owned by a player, with its own level/IVs/moves. */
export interface CreatureInstance {
  instanceId: string;
  speciesId: number;
  nickname?: string;
  level: number;
  exp: number;
  ivs: StatBlock;
  evs: StatBlock;
  moveIds: number[];
  currentHp: number;
}

export interface PlayerState {
  id: string;
  name: string;
  mapId: string;
  x: number;
  y: number;
  direction: Direction;
  party: CreatureInstance[];
}

/** Lifetime PvP win/loss tally for a player, persisted via Milestone 3's store. */
export interface BattleRecord {
  wins: number;
  losses: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/** A single tile in a map's ground layer. */
export interface MapTile {
  /** Tile type key, used to pick a placeholder color/texture client-side. */
  type: string;
  /** Whether a player can walk onto this tile. */
  walkable: boolean;
}

/** Simple grid-based map definition, loaded from JSON on the server. */
export interface MapDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize: number;
  /** Row-major grid of tiles, tiles[y][x]. */
  tiles: MapTile[][];
  /** Spawn point for players entering this map fresh. */
  spawn: { x: number; y: number };
}

export interface MoveInput {
  dx: number;
  dy: number;
}

/** Broad grouping used for inventory UI and for gating where an item can be used. */
export type ItemCategory = 'healing' | 'capture' | 'boost';

/** What using one of an item actually does, server-side. */
export type ItemEffect =
  | { kind: 'heal'; amount: number | 'full' }
  | { kind: 'capture'; catchPower: number }
  | { kind: 'statBoost'; stat: keyof StatBlock; amount: number };

/** Static definition of an item (Milestone 2). All names/values are original. */
export interface ItemDefinition {
  id: number;
  name: string;
  category: ItemCategory;
  description: string;
  /** In-game currency cost at the shop. */
  price: number;
  effect: ItemEffect;
}

/** One stacked slot in a player's inventory. */
export interface InventorySlot {
  itemId: number;
  quantity: number;
}

/** One creature in an NPC trainer's fixed team (Milestone 6). Movesets default via `getDefaultMoveset`. */
export interface TrainerTeamMember {
  speciesId: number;
  level: number;
  moveIds?: number[];
}

/**
 * Static definition of an NPC "gym leader"-equivalent trainer (Milestone 6).
 * All names/teams are original. A trainer occupies a single fixed overworld
 * tile that doubles as its own gate: that tile is impassable (triggers a
 * mandatory battle) until the owning account has earned `badgeId`, after
 * which it behaves as an ordinary walkable tile for that account.
 */
export interface TrainerDefinition {
  id: string;
  name: string;
  /** Dominant elemental theme of this trainer's team (used for the client's placeholder NPC color). */
  themeType: ElementType;
  badgeId: string;
  badgeName: string;
  position: { x: number; y: number };
  team: TrainerTeamMember[];
}

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

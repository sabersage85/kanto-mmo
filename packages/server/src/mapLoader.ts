import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { MapDefinition, MapTile, NpcDefinition, WarpDefinition } from '@kanto-mmo/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface RawMapFile {
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize: number;
  spawn: { x: number; y: number };
  legend: Record<string, string>;
  rows: string[];
  warps?: WarpDefinition[];
  npcs?: NpcDefinition[];
}

const UNWALKABLE_TYPES = new Set(['tree', 'water']);

/** Loads a simple JSON-defined grid map (ASCII rows + a character legend) into a MapDefinition. */
export function loadMap(mapId: string): MapDefinition {
  const path = join(__dirname, 'data', `${mapId}.json`);
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as RawMapFile;

  const tiles: MapTile[][] = raw.rows.map((row) =>
    row.split('').map((char) => {
      const type = raw.legend[char] ?? 'grass';
      return { type, walkable: !UNWALKABLE_TYPES.has(type) };
    }),
  );

  return {
    id: raw.id,
    name: raw.name,
    width: raw.width,
    height: raw.height,
    tileSize: raw.tileSize,
    tiles,
    spawn: raw.spawn,
    warps: raw.warps ?? [],
    npcs: raw.npcs ?? [],
  };
}

/** Finds the warp definition (if any) whose trigger tile matches the given coordinates. */
export function findWarpAt(map: MapDefinition, x: number, y: number): WarpDefinition | undefined {
  return map.warps?.find((w) => w.x === x && w.y === y);
}

/** Finds the NPC definition (if any) standing on the given coordinates. */
export function findNpcAt(map: MapDefinition, x: number, y: number): NpcDefinition | undefined {
  return map.npcs?.find((n) => n.position.x === x && n.position.y === y);
}


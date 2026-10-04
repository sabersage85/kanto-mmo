import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { MapDefinition, MapTile } from '@kanto-mmo/shared';

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
  };
}

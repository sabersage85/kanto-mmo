import type { MapDefinition, MapTile } from './types.js';

/** Builds a rectangular map filled with a single tile type, all walkable. */
export function createEmptyMap(
  id: string,
  name: string,
  width: number,
  height: number,
  tileSize = 32,
  fillType = 'grass',
): MapDefinition {
  const tiles: MapTile[][] = [];
  for (let y = 0; y < height; y++) {
    const row: MapTile[] = [];
    for (let x = 0; x < width; x++) {
      row.push({ type: fillType, walkable: true });
    }
    tiles.push(row);
  }
  return {
    id,
    name,
    width,
    height,
    tileSize,
    tiles,
    spawn: { x: Math.floor(width / 2), y: Math.floor(height / 2) },
  };
}

export function isWalkable(map: MapDefinition, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  return map.tiles[y][x].walkable;
}

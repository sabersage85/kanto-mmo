import { describe, expect, it } from 'vitest';
import { findNpcAt, findWarpAt, loadMap } from '../mapLoader.js';

const MAP_IDS = ['hearthfield', 'fernway', 'stonehollow', 'tidemoor', 'cinderfell'];

describe('mapLoader', () => {
  it.each(MAP_IDS)('loads %s with a full tile grid, warps array, and npcs array', (mapId) => {
    const map = loadMap(mapId);
    expect(map.id).toBe(mapId);
    expect(map.tiles.length).toBe(map.height);
    for (const row of map.tiles) {
      expect(row.length).toBe(map.width);
    }
    expect(Array.isArray(map.warps)).toBe(true);
    expect(Array.isArray(map.npcs)).toBe(true);
  });

  it('every warp on every map points at a target tile that exists within bounds on the destination map', () => {
    const maps = new Map(MAP_IDS.map((id) => [id, loadMap(id)]));
    for (const map of maps.values()) {
      for (const warp of map.warps ?? []) {
        const target = maps.get(warp.targetMapId);
        expect(target, `warp from ${map.id} references unknown map ${warp.targetMapId}`).toBeDefined();
        expect(warp.targetX).toBeGreaterThanOrEqual(0);
        expect(warp.targetX).toBeLessThan(target!.width);
        expect(warp.targetY).toBeGreaterThanOrEqual(0);
        expect(warp.targetY).toBeLessThan(target!.height);
      }
    }
  });

  it('warps between adjacent maps are reciprocal (stepping through and back returns near the origin)', () => {
    const hearthfield = loadMap('hearthfield');
    const fernway = loadMap('fernway');

    const toFernway = hearthfield.warps?.find((w) => w.targetMapId === 'fernway');
    const toHearthfield = fernway.warps?.find((w) => w.targetMapId === 'hearthfield');

    expect(toFernway).toBeDefined();
    expect(toHearthfield).toBeDefined();
    // The destination of one warp should be on the same row as the other
    // warp's own tile, confirming the two maps line up along the seam.
    expect(toFernway!.targetY).toBe(toHearthfield!.y);
    expect(toHearthfield!.targetY).toBe(toFernway!.y);
  });

  it('NPC tiles are walkable terrain underneath (so blocking is purely from NPC presence, not map tile type)', () => {
    for (const mapId of MAP_IDS) {
      const map = loadMap(mapId);
      for (const npc of map.npcs ?? []) {
        const tile = map.tiles[npc.position.y]?.[npc.position.x];
        expect(tile?.walkable, `${mapId} NPC ${npc.id} sits on an unwalkable tile`).toBe(true);
      }
    }
  });

  it('findWarpAt / findNpcAt resolve the exact trigger tile and nothing else', () => {
    const fernway = loadMap('fernway');
    const warp = findWarpAt(fernway, 14, 5);
    expect(warp?.targetMapId).toBe('stonehollow');
    expect(findWarpAt(fernway, 14, 4)).toBeUndefined();

    const hearthfield = loadMap('hearthfield');
    const npc = hearthfield.npcs?.[0];
    expect(npc).toBeDefined();
    expect(findNpcAt(hearthfield, npc!.position.x, npc!.position.y)?.id).toBe(npc!.id);
    expect(findNpcAt(hearthfield, npc!.position.x + 5, npc!.position.y + 5)).toBeUndefined();
  });
});

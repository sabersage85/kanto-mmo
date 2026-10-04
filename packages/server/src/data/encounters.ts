import type { EncounterTable } from '@kanto-mmo/shared';

/**
 * Per-map wild encounter tables, keyed by mapId, for each map's `grass`
 * tiles. Species ids reference the original creature roster in
 * packages/shared/src/species.ts. Only `fernway` (the forest route) rolls
 * wild encounters in Milestone 7 — the town maps are encounter-free.
 */
export const ENCOUNTER_TABLES: Record<string, EncounterTable> = {
  fernway: {
    tileType: 'grass',
    chancePerStep: 0.12,
    entries: [
      { speciesId: 5, weight: 3, minLevel: 3, maxLevel: 6 }, // Sproutling
      { speciesId: 7, weight: 3, minLevel: 3, maxLevel: 6 }, // Voltpup
      { speciesId: 3, weight: 2, minLevel: 3, maxLevel: 6 }, // Pondrake
      { speciesId: 14, weight: 2, minLevel: 3, maxLevel: 6 }, // Mossling
      { speciesId: 15, weight: 2, minLevel: 3, maxLevel: 6 }, // Sparkit
      { speciesId: 13, weight: 1, minLevel: 4, maxLevel: 7 }, // Pebblit
      { speciesId: 11, weight: 1, minLevel: 4, maxLevel: 7 }, // Duskit
      { speciesId: 16, weight: 2, minLevel: 3, maxLevel: 7 }, // Thistlehop
      { speciesId: 17, weight: 1, minLevel: 4, maxLevel: 7 }, // Driftmoth
      { speciesId: 22, weight: 1, minLevel: 4, maxLevel: 7 }, // Glimmerwing
    ],
  },
};

export function encounterTableForMap(mapId: string): EncounterTable | undefined {
  return ENCOUNTER_TABLES[mapId];
}


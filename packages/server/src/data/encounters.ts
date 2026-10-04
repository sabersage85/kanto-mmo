import type { EncounterTable } from '@kanto-mmo/shared';

/**
 * Wild encounter table for the `route1` test map's `grass` tiles. Species
 * ids reference the original creature roster in packages/shared/src/species.ts.
 */
export const ROUTE1_ENCOUNTERS: EncounterTable = {
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
  ],
};

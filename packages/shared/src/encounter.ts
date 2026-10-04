/**
 * Wild encounter tables: per-map-tile-type encounter chance and a weighted
 * pool of possible species/level ranges. Pure/testable; actual per-map
 * table data lives server-side (it's game content/config, not core logic).
 */
export interface EncounterEntry {
  speciesId: number;
  weight: number;
  minLevel: number;
  maxLevel: number;
}

export interface EncounterTable {
  tileType: string;
  /** Probability (0..1) that stepping onto a matching tile triggers an encounter. */
  chancePerStep: number;
  entries: EncounterEntry[];
}

export interface EncounterRoll {
  speciesId: number;
  level: number;
}

/**
 * Rolls whether a step onto a tile governed by `table` triggers an
 * encounter, and if so, which species/level. Accepts an injectable rng
 * (defaulting to Math.random) for deterministic unit testing.
 */
export function rollEncounter(table: EncounterTable, rng: () => number = Math.random): EncounterRoll | null {
  if (table.entries.length === 0) return null;
  if (rng() >= table.chancePerStep) return null;

  const totalWeight = table.entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return null;

  let roll = rng() * totalWeight;
  for (const entry of table.entries) {
    if (roll < entry.weight) {
      const span = entry.maxLevel - entry.minLevel + 1;
      const level = entry.minLevel + Math.floor(rng() * span);
      return { speciesId: entry.speciesId, level };
    }
    roll -= entry.weight;
  }

  // Floating point edge case: fall back to the last entry.
  const last = table.entries[table.entries.length - 1];
  return { speciesId: last.speciesId, level: last.minLevel };
}

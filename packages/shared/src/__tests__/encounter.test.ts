import { describe, expect, it } from 'vitest';
import { rollEncounter, type EncounterTable } from '../encounter.js';

const table: EncounterTable = {
  tileType: 'grass',
  chancePerStep: 0.5,
  entries: [
    { speciesId: 5, weight: 1, minLevel: 3, maxLevel: 3 },
    { speciesId: 7, weight: 1, minLevel: 10, maxLevel: 10 },
  ],
};

describe('rollEncounter', () => {
  it('never triggers when the step roll exceeds chancePerStep', () => {
    const rng = (): number => 0.99; // always "fails" the chancePerStep check
    expect(rollEncounter(table, rng)).toBeNull();
  });

  it('triggers and picks a species/level when the roll succeeds', () => {
    let call = 0;
    const values = [0.0, 0.0, 0.0]; // pass chance check, then pick first entry, min level
    const rng = (): number => values[call++] ?? 0;
    const result = rollEncounter(table, rng);
    expect(result).not.toBeNull();
    expect(result?.speciesId).toBe(5);
    expect(result?.level).toBe(3);
  });

  it('returns null for an empty entry list', () => {
    const empty: EncounterTable = { tileType: 'grass', chancePerStep: 1, entries: [] };
    expect(rollEncounter(empty, () => 0)).toBeNull();
  });

  it('level is always within [minLevel, maxLevel] for the chosen entry', () => {
    for (let i = 0; i < 50; i++) {
      const result = rollEncounter(table, Math.random);
      if (result) {
        const entry = table.entries.find((e) => e.speciesId === result.speciesId)!;
        expect(result.level).toBeGreaterThanOrEqual(entry.minLevel);
        expect(result.level).toBeLessThanOrEqual(entry.maxLevel);
      }
    }
  });
});

import type { TrainerDefinition } from '@kanto-mmo/shared';

/**
 * Milestone 6 "gym leader"-equivalent NPC trainers for the `route1` test
 * map. All names, badge names, and teams below are original creations;
 * species ids reference the original creature roster in
 * packages/shared/src/species.ts.
 *
 * Scoping choice (documented in README/ROADMAP): rather than building
 * separate gated regions, this vertical slice places three themed trainers
 * directly on the existing single test map, spread across its three main
 * areas (the top grass ring, and the left/right path corridors flanking
 * the lake). Each trainer's own tile acts as its gate — see
 * OverworldRoom's `findTrainerAt`/`handleMove` for the mechanics.
 *
 * Difficulty scaling: wild encounters on this map roll levels 3-7
 * (see data/encounters.ts) and every new account starts with a single
 * level-5 starter. Each trainer's two-creature team (levels 9 and 11) is a
 * deliberate, meaningful step up from both, without being punishingly far
 * out of reach for a slice this small.
 */
export const TRAINERS: TrainerDefinition[] = [
  {
    id: 'stonewarden',
    name: 'Garrick the Stonewarden',
    themeType: 'Rock',
    badgeId: 'stonewake-badge',
    badgeName: 'Stonewake Badge',
    position: { x: 7, y: 1 },
    team: [
      { speciesId: 13, level: 9 }, // Pebblit
      { speciesId: 10, level: 11 }, // Boulderm
    ],
  },
  {
    id: 'tideglass',
    name: 'Lira the Tideglass',
    themeType: 'Water',
    badgeId: 'tidemark-badge',
    badgeName: 'Tidemark Badge',
    position: { x: 3, y: 5 },
    team: [
      { speciesId: 3, level: 9 }, // Pondrake
      { speciesId: 4, level: 11 }, // Tidalune
    ],
  },
  {
    id: 'cinderguard',
    name: 'Kellan the Cinderguard',
    themeType: 'Fire',
    badgeId: 'cinderpeak-badge',
    badgeName: 'Cinderpeak Badge',
    position: { x: 11, y: 5 },
    team: [
      { speciesId: 1, level: 9 }, // Tindle
      { speciesId: 2, level: 11 }, // Pyrebrand
    ],
  },
];

export function getTrainer(id: string): TrainerDefinition {
  const trainer = TRAINERS.find((t) => t.id === id);
  if (!trainer) {
    throw new Error(`Unknown trainer id: ${id}`);
  }
  return trainer;
}

export function findTrainerAt(x: number, y: number): TrainerDefinition | undefined {
  return TRAINERS.find((t) => t.position.x === x && t.position.y === y);
}

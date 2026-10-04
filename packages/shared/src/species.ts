import type { SpeciesDefinition } from './types.js';

/**
 * Placeholder species roster for the Kanto MMO vertical slice.
 *
 * All names below (Emberwick, Pondrake, etc.) are wholly original and were
 * invented for this project. Base stats are original design values, not
 * copied from any existing game's dex data. This list intentionally stays
 * small (15 species) so it's easy to swap in fully licensed/custom art and
 * lore later without restructuring the data schema.
 */
export const SPECIES: SpeciesDefinition[] = [
  {
    id: 1,
    name: 'Tindle',
    types: ['Fire'],
    baseStats: { hp: 39, attack: 52, defense: 43, spAttack: 60, spDefense: 50, speed: 65 },
    growthRate: 'Medium',
    baseExpYield: 62,
    description: 'A small ember-tailed critter that flares up brighter when excited.',
  },
  {
    id: 2,
    name: 'Pyrebrand',
    types: ['Fire'],
    baseStats: { hp: 58, attack: 74, defense: 60, spAttack: 80, spDefense: 65, speed: 80 },
    growthRate: 'Medium',
    baseExpYield: 142,
    description: 'Evolved form of Tindle; its mane burns hot enough to warp the air.',
  },
  {
    id: 3,
    name: 'Pondrake',
    types: ['Water'],
    baseStats: { hp: 44, attack: 48, defense: 50, spAttack: 55, spDefense: 56, speed: 42 },
    growthRate: 'Medium',
    baseExpYield: 63,
    description: 'Paddles through shallow ponds using the fin on its back as a rudder.',
  },
  {
    id: 4,
    name: 'Tidalune',
    types: ['Water', 'Psychic'],
    baseStats: { hp: 66, attack: 62, defense: 68, spAttack: 85, spDefense: 82, speed: 60 },
    growthRate: 'Slow',
    baseExpYield: 158,
    description: 'Said to sense tides and moonrise before either happens.',
  },
  {
    id: 5,
    name: 'Sproutling',
    types: ['Grass'],
    baseStats: { hp: 45, attack: 49, defense: 49, spAttack: 65, spDefense: 65, speed: 45 },
    growthRate: 'Medium',
    baseExpYield: 64,
    description: 'A bulb-backed creature that photosynthesizes to recover stamina.',
  },
  {
    id: 6,
    name: 'Thornbloom',
    types: ['Grass'],
    baseStats: { hp: 70, attack: 73, defense: 69, spAttack: 95, spDefense: 90, speed: 58 },
    growthRate: 'Medium',
    baseExpYield: 160,
    description: 'Its flower blooms fully only once it has protected its territory.',
  },
  {
    id: 7,
    name: 'Voltpup',
    types: ['Electric'],
    baseStats: { hp: 40, attack: 55, defense: 40, spAttack: 50, spDefense: 45, speed: 90 },
    growthRate: 'Fast',
    baseExpYield: 61,
    description: 'Static crackles along its fur whenever it gets excited to run.',
  },
  {
    id: 8,
    name: 'Glacibit',
    types: ['Ice'],
    baseStats: { hp: 50, attack: 50, defense: 70, spAttack: 60, spDefense: 70, speed: 30 },
    growthRate: 'Slow',
    baseExpYield: 70,
    description: 'Curls into a ball of packed frost when threatened.',
  },
  {
    id: 9,
    name: 'Skyfin',
    types: ['Flying', 'Normal'],
    baseStats: { hp: 52, attack: 48, defense: 45, spAttack: 42, spDefense: 48, speed: 85 },
    growthRate: 'Fast',
    baseExpYield: 66,
    description: 'Glides on thermals for hours without flapping once.',
  },
  {
    id: 10,
    name: 'Boulderm',
    types: ['Rock'],
    baseStats: { hp: 60, attack: 75, defense: 95, spAttack: 35, spDefense: 55, speed: 25 },
    growthRate: 'Slow',
    baseExpYield: 78,
    description: 'Mistaken for an ordinary rock until it starts walking.',
  },
  {
    id: 11,
    name: 'Duskit',
    types: ['Shadow'],
    baseStats: { hp: 48, attack: 55, defense: 45, spAttack: 65, spDefense: 55, speed: 60 },
    growthRate: 'Erratic',
    baseExpYield: 72,
    description: 'Only visible clearly at dusk; by day it is little more than a shade.',
  },
  {
    id: 12,
    name: 'Mindrift',
    types: ['Psychic'],
    baseStats: { hp: 50, attack: 40, defense: 48, spAttack: 85, spDefense: 75, speed: 55 },
    growthRate: 'Erratic',
    baseExpYield: 74,
    description: 'Hums a faint tone that only sensitive creatures can hear.',
  },
  {
    id: 13,
    name: 'Pebblit',
    types: ['Rock'],
    baseStats: { hp: 42, attack: 55, defense: 65, spAttack: 30, spDefense: 40, speed: 35 },
    growthRate: 'Medium',
    baseExpYield: 58,
    description: 'A fist-sized stone creature that rolls downhill when startled.',
  },
  {
    id: 14,
    name: 'Mossling',
    types: ['Grass'],
    baseStats: { hp: 48, attack: 45, defense: 48, spAttack: 58, spDefense: 58, speed: 40 },
    growthRate: 'Medium',
    baseExpYield: 60,
    description: 'Moss grows thicker on its back the longer it stays in one spot.',
  },
  {
    id: 15,
    name: 'Sparkit',
    types: ['Electric'],
    baseStats: { hp: 38, attack: 48, defense: 35, spAttack: 55, spDefense: 40, speed: 70 },
    growthRate: 'Fast',
    baseExpYield: 59,
    description: 'Tiny arcs of electricity leap between its whiskers when startled.',
  },
];

/**
 * Milestone 7 additions: a modest roster expansion (8 more originals, ids
 * 16-23) for route/forest variety and to give the rival and Murk Crew
 * grunts their own distinct teams, rather than reusing the exact same
 * wild-encounter species. No evolution chains are added for these (kept
 * as a deliberately low-lift choice, documented in ROADMAP.md) — only
 * Tindle/Pyrebrand and Pondrake/Tidalune (both pre-existing) demonstrate
 * that concept for this slice.
 */
SPECIES.push(
  {
    id: 16,
    name: 'Thistlehop',
    types: ['Grass'],
    baseStats: { hp: 46, attack: 58, defense: 44, spAttack: 42, spDefense: 44, speed: 68 },
    growthRate: 'Fast',
    baseExpYield: 65,
    description: 'Bounces through bramble thickets on a single coiled stem-leg.',
  },
  {
    id: 17,
    name: 'Driftmoth',
    types: ['Flying', 'Psychic'],
    baseStats: { hp: 48, attack: 40, defense: 42, spAttack: 72, spDefense: 60, speed: 62 },
    growthRate: 'Erratic',
    baseExpYield: 76,
    description: 'Its dust-soft wingbeats are said to carry half-formed thoughts between sleepers.',
  },
  {
    id: 18,
    name: 'Cindertail',
    types: ['Fire'],
    baseStats: { hp: 50, attack: 62, defense: 46, spAttack: 55, spDefense: 48, speed: 72 },
    growthRate: 'Medium',
    baseExpYield: 68,
    description: 'A forest fox-shaped creature whose tail-flame brightens when it is confident.',
  },
  {
    id: 19,
    name: 'Murkling',
    types: ['Shadow'],
    baseStats: { hp: 52, attack: 60, defense: 48, spAttack: 50, spDefense: 50, speed: 58 },
    growthRate: 'Medium',
    baseExpYield: 70,
    description: 'Favored by poachers for how easily it slips between shadows unseen — a trait it resents being used for.',
  },
  {
    id: 20,
    name: 'Shellnap',
    types: ['Water', 'Rock'],
    baseStats: { hp: 56, attack: 58, defense: 78, spAttack: 35, spDefense: 58, speed: 30 },
    growthRate: 'Slow',
    baseExpYield: 80,
    description: 'Wedges itself between river stones and refuses to budge once settled.',
  },
  {
    id: 21,
    name: 'Gloomhare',
    types: ['Shadow', 'Normal'],
    baseStats: { hp: 54, attack: 64, defense: 50, spAttack: 48, spDefense: 50, speed: 75 },
    growthRate: 'Medium',
    baseExpYield: 82,
    description: 'A nocturnal forest hare whose ears fade from view entirely after dusk.',
  },
  {
    id: 22,
    name: 'Glimmerwing',
    types: ['Electric', 'Flying'],
    baseStats: { hp: 44, attack: 46, defense: 40, spAttack: 68, spDefense: 50, speed: 80 },
    growthRate: 'Fast',
    baseExpYield: 74,
    description: 'Flickers like a firefly when it flies, leaving faint static trails in humid air.',
  },
  {
    id: 23,
    name: 'Frostpine',
    types: ['Ice', 'Grass'],
    baseStats: { hp: 58, attack: 55, defense: 62, spAttack: 64, spDefense: 66, speed: 38 },
    growthRate: 'Slow',
    baseExpYield: 84,
    description: 'Needle-like fronds stay frosted year-round even in the warmest forest clearings.',
  },
);

export function getSpecies(id: number): SpeciesDefinition {
  const species = SPECIES.find((s) => s.id === id);
  if (!species) {
    throw new Error(`Unknown species id: ${id}`);
  }
  return species;
}

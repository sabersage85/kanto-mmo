import type { SpeciesDefinition } from './types.js';

/**
 * Placeholder species roster for the Kanto MMO vertical slice.
 *
 * All names below (Emberwick, Pondrake, etc.) are wholly original and were
 * invented for this project. Base stats are original design values, not
 * copied from any existing game's dex data. This list intentionally stays
 * small (12 species) so it's easy to swap in fully licensed/custom art and
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
];

export function getSpecies(id: number): SpeciesDefinition {
  const species = SPECIES.find((s) => s.id === id);
  if (!species) {
    throw new Error(`Unknown species id: ${id}`);
  }
  return species;
}

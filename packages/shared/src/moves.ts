import type { MoveDefinition } from './types.js';

/**
 * Placeholder move list for the Kanto MMO vertical slice. Names, flavor
 * text, and exact power/accuracy/pp values are original creations for this
 * project; only the generic data *shape* (type/category/power/accuracy/pp)
 * follows common genre convention.
 */
export const MOVES: MoveDefinition[] = [
  {
    id: 1,
    name: 'Tackle',
    type: 'Normal',
    category: 'Physical',
    power: 40,
    accuracy: 100,
    pp: 35,
    description: 'A basic full-body charge at the target.',
  },
  {
    id: 2,
    name: 'Ember Flick',
    type: 'Fire',
    category: 'Special',
    power: 45,
    accuracy: 100,
    pp: 25,
    description: 'Flicks a small spark of flame at the target.',
  },
  {
    id: 3,
    name: 'Water Jet',
    type: 'Water',
    category: 'Special',
    power: 45,
    accuracy: 100,
    pp: 25,
    description: 'Shoots a thin, fast jet of water.',
  },
  {
    id: 4,
    name: 'Vine Snap',
    type: 'Grass',
    category: 'Physical',
    power: 45,
    accuracy: 100,
    pp: 25,
    description: 'Whips a vine at the target with a sharp snap.',
  },
  {
    id: 5,
    name: 'Static Shock',
    type: 'Electric',
    category: 'Special',
    power: 40,
    accuracy: 100,
    pp: 30,
    description: 'Delivers a jolt of static electricity.',
  },
  {
    id: 6,
    name: 'Frost Bite',
    type: 'Ice',
    category: 'Physical',
    power: 45,
    accuracy: 95,
    pp: 20,
    description: 'Bites down with ice-cold fangs.',
  },
  {
    id: 7,
    name: 'Gust',
    type: 'Flying',
    category: 'Special',
    power: 40,
    accuracy: 100,
    pp: 35,
    description: 'Kicks up a strong gust of wind toward the target.',
  },
  {
    id: 8,
    name: 'Rock Throw',
    type: 'Rock',
    category: 'Physical',
    power: 50,
    accuracy: 90,
    pp: 15,
    description: 'Hurls a chunk of rock at the target.',
  },
  {
    id: 9,
    name: 'Shadow Nip',
    type: 'Shadow',
    category: 'Physical',
    power: 40,
    accuracy: 100,
    pp: 25,
    description: 'Bites with a sliver of condensed shadow.',
  },
  {
    id: 10,
    name: 'Mind Pulse',
    type: 'Psychic',
    category: 'Special',
    power: 55,
    accuracy: 100,
    pp: 15,
    description: 'Sends a pulse of psychic energy through the target.',
  },
  {
    id: 11,
    name: 'Growl',
    type: 'Normal',
    category: 'Status',
    power: null,
    accuracy: 100,
    pp: 40,
    description: 'Growls intimidatingly, lowering the target\u2019s Attack.',
  },
  {
    id: 12,
    name: 'Guard Up',
    type: 'Normal',
    category: 'Status',
    power: null,
    accuracy: null,
    pp: 30,
    description: 'Raises the user\u2019s Defense by focusing its stance.',
  },
];

export function getMove(id: number): MoveDefinition {
  const move = MOVES.find((m) => m.id === id);
  if (!move) {
    throw new Error(`Unknown move id: ${id}`);
  }
  return move;
}

import type { ItemDefinition } from './types.js';

/**
 * Original item data (Milestone 2). Names, descriptions, and values are
 * wholly original — no copyrighted item names/data were used. Seven items
 * covering the three required categories: healing, capture, and a
 * permanent stat boost.
 */
export const ITEMS: ItemDefinition[] = [
  {
    id: 1,
    name: 'Herb Wrap',
    category: 'healing',
    description: 'A folded bundle of medicinal herbs. Restores 20 HP to a creature.',
    price: 50,
    effect: { kind: 'heal', amount: 20 },
  },
  {
    id: 2,
    name: 'Vitality Draught',
    category: 'healing',
    description: 'A potent tonic that fully restores a creature\'s HP.',
    price: 150,
    effect: { kind: 'heal', amount: 'full' },
  },
  {
    id: 3,
    name: 'Rusty Snare',
    category: 'capture',
    description: 'A basic trapping tool. Has a modest chance to catch a weakened wild creature.',
    price: 60,
    effect: { kind: 'capture', catchPower: 0.1 },
  },
  {
    id: 4,
    name: 'Reinforced Snare',
    category: 'capture',
    description: 'A sturdier trapping tool with a much better catch chance than a Rusty Snare.',
    price: 200,
    effect: { kind: 'capture', catchPower: 0.35 },
  },
  {
    id: 5,
    name: 'Power Root',
    category: 'boost',
    description: 'Chewed slowly over time, it permanently sharpens a creature\'s Attack.',
    price: 120,
    effect: { kind: 'statBoost', stat: 'attack', amount: 40 },
  },
  {
    id: 6,
    name: 'Guard Root',
    category: 'boost',
    description: 'Chewed slowly over time, it permanently toughens a creature\'s Defense.',
    price: 120,
    effect: { kind: 'statBoost', stat: 'defense', amount: 40 },
  },
  {
    id: 7,
    name: 'Focus Root',
    category: 'boost',
    description: 'Chewed slowly over time, it permanently quickens a creature\'s Speed.',
    price: 120,
    effect: { kind: 'statBoost', stat: 'speed', amount: 40 },
  },
];

export function getItem(id: number): ItemDefinition {
  const item = ITEMS.find((i) => i.id === id);
  if (!item) throw new Error(`Unknown item id: ${id}`);
  return item;
}

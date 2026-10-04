import {
  calculateFullStatBlock,
  getDefaultMoveset,
  getSpecies,
  totalExpForLevel,
  type CreatureInstance,
  type InventorySlot,
  type StatBlock,
} from '@kanto-mmo/shared';

const STARTER_SPECIES_ID = 1; // Tindle
const STARTER_LEVEL = 5;
const DEFAULT_IVS: StatBlock = { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 };
const ZERO_EVS: StatBlock = { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 };

/** Starting currency (Milestone 2) given to every brand-new account, enough to buy a couple of items right away. */
export const STARTER_CURRENCY = 300;

/** Builds the single starter creature a brand-new account's party begins with. */
export function createStarterParty(): CreatureInstance[] {
  const species = getSpecies(STARTER_SPECIES_ID);
  const stats = calculateFullStatBlock(species.baseStats, DEFAULT_IVS, ZERO_EVS, STARTER_LEVEL);
  return [
    {
      instanceId: `starter-${Math.random().toString(36).slice(2, 10)}`,
      speciesId: species.id,
      level: STARTER_LEVEL,
      exp: totalExpForLevel(STARTER_LEVEL, species.growthRate),
      ivs: { ...DEFAULT_IVS },
      evs: { ...ZERO_EVS },
      moveIds: getDefaultMoveset(species),
      currentHp: stats.hp,
    },
  ];
}

/** Starting inventory (Milestone 2): a couple of healing items and a basic catching tool, so a new player can try every item category right away. */
export function createStarterInventory(): InventorySlot[] {
  return [
    { itemId: 1, quantity: 3 }, // Herb Wrap
    { itemId: 3, quantity: 2 }, // Rusty Snare
  ];
}

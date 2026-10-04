import {
  calculateFullStatBlock,
  getDefaultMoveset,
  getSpecies,
  totalExpForLevel,
  type CreatureInstance,
  type StatBlock,
} from '@kanto-mmo/shared';

const STARTER_SPECIES_ID = 1; // Tindle
const STARTER_LEVEL = 5;
const DEFAULT_IVS: StatBlock = { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 };
const ZERO_EVS: StatBlock = { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 };

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

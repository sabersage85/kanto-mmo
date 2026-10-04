import {
  calculateFullStatBlock,
  getDefaultMoveset,
  getSpecies,
  totalExpForLevel,
  type CreatureInstance,
  type StatBlock,
} from '@kanto-mmo/shared';

interface PlayerRecord {
  playerId: string;
  name: string;
  party: CreatureInstance[];
}

/**
 * In-memory registry of player parties, keyed by a client-generated
 * `playerId` (persisted in browser localStorage, see packages/client).
 * This is a stand-in for the real accounts/database persistence layer
 * planned in ROADMAP.md Milestone 3 — party data here does NOT survive a
 * server restart. It exists so Milestone 2 (battles) has something to
 * battle with and to award XP to.
 */
const players = new Map<string, PlayerRecord>();

const STARTER_SPECIES_ID = 1; // Tindle
const STARTER_LEVEL = 5;
const DEFAULT_IVS: StatBlock = { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 };
const ZERO_EVS: StatBlock = { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 };

function createStarterInstance(): CreatureInstance {
  const species = getSpecies(STARTER_SPECIES_ID);
  const stats = calculateFullStatBlock(species.baseStats, DEFAULT_IVS, ZERO_EVS, STARTER_LEVEL);
  return {
    instanceId: `starter-${Math.random().toString(36).slice(2, 10)}`,
    speciesId: species.id,
    level: STARTER_LEVEL,
    exp: totalExpForLevel(STARTER_LEVEL, species.growthRate),
    ivs: { ...DEFAULT_IVS },
    evs: { ...ZERO_EVS },
    moveIds: getDefaultMoveset(species),
    currentHp: stats.hp,
  };
}

/** Ensures a player record (with a starter creature) exists, and returns it. */
export function getOrCreatePlayer(playerId: string, name: string): PlayerRecord {
  let record = players.get(playerId);
  if (!record) {
    record = { playerId, name, party: [createStarterInstance()] };
    players.set(playerId, record);
  } else {
    record.name = name;
  }
  return record;
}

export function getParty(playerId: string): CreatureInstance[] {
  return players.get(playerId)?.party ?? [];
}

/** Returns the first party member with HP remaining (no switching UI yet, so just the first one). */
export function getFirstAliveInstance(playerId: string): CreatureInstance | undefined {
  return getParty(playerId).find((creature) => creature.currentHp > 0);
}

export function updatePartyMember(playerId: string, updated: CreatureInstance): void {
  const record = players.get(playerId);
  if (!record) return;
  const index = record.party.findIndex((c) => c.instanceId === updated.instanceId);
  if (index >= 0) record.party[index] = updated;
}

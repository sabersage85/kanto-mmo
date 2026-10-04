import { randomUUID } from 'node:crypto';

interface PendingEncounter {
  playerId: string;
  speciesId: number;
  level: number;
  createdAt: number;
}

const PENDING_TTL_MS = 60_000;

/**
 * Short-lived, single-use tokens linking a server-rolled wild encounter
 * (species/level, decided authoritatively in OverworldRoom) to the
 * BattleRoom the client subsequently creates. This stops a modified
 * client from spawning a BattleRoom with a self-chosen (easier) wild
 * creature: BattleRoom.onCreate only trusts species/level it looked up
 * here, never values sent directly by the client.
 */
const pendingEncounters = new Map<string, PendingEncounter>();

export function createPendingEncounter(playerId: string, speciesId: number, level: number): string {
  const token = randomUUID();
  pendingEncounters.set(token, { playerId, speciesId, level, createdAt: Date.now() });
  return token;
}

export function consumePendingEncounter(
  token: string,
  playerId: string,
): { speciesId: number; level: number } | null {
  const entry = pendingEncounters.get(token);
  if (!entry) return null;
  pendingEncounters.delete(token);
  if (entry.playerId !== playerId) return null;
  if (Date.now() - entry.createdAt > PENDING_TTL_MS) return null;
  return { speciesId: entry.speciesId, level: entry.level };
}

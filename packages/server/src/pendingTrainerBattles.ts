import { randomUUID } from 'node:crypto';

interface PendingTrainerBattle {
  playerId: string;
  trainerId: string;
  createdAt: number;
}

const PENDING_TTL_MS = 60_000;

/**
 * Short-lived, single-use tokens linking a server-decided trainer battle
 * (which trainer, authoritatively picked in OverworldRoom from the
 * player's tile position) to the TrainerBattleRoom the client
 * subsequently creates. Mirrors `pendingEncounters.ts`'s design for the
 * same reason: a modified client must never be able to spawn a
 * TrainerBattleRoom for a trainer it hasn't actually walked up to.
 */
const pendingTrainerBattles = new Map<string, PendingTrainerBattle>();

export function createPendingTrainerBattle(playerId: string, trainerId: string): string {
  const token = randomUUID();
  pendingTrainerBattles.set(token, { playerId, trainerId, createdAt: Date.now() });
  return token;
}

export function consumePendingTrainerBattle(token: string, playerId: string): { trainerId: string } | null {
  const entry = pendingTrainerBattles.get(token);
  if (!entry) return null;
  pendingTrainerBattles.delete(token);
  if (entry.playerId !== playerId) return null;
  if (Date.now() - entry.createdAt > PENDING_TTL_MS) return null;
  return { trainerId: entry.trainerId };
}

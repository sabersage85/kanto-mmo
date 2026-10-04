import { Client, Room } from 'colyseus.js';

const SERVER_WS_URL = import.meta.env.VITE_SERVER_WS_URL ?? 'ws://localhost:2567';
const SERVER_HTTP_URL = import.meta.env.VITE_SERVER_HTTP_URL ?? 'http://localhost:2567';
const PLAYER_ID_STORAGE_KEY = 'kanto-mmo-player-id';

export const colyseusClient = new Client(SERVER_WS_URL);

/**
 * Stable per-browser player id, used (without real accounts/auth yet) to
 * look up the same in-memory party across the overworld and battle rooms.
 * See packages/server/src/playerRegistry.ts for the server-side half.
 */
export function getOrCreatePlayerId(): string {
  let id = localStorage.getItem(PLAYER_ID_STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PLAYER_ID_STORAGE_KEY, id);
  }
  return id;
}

export async function joinOverworld(playerName: string): Promise<Room> {
  return colyseusClient.joinOrCreate('overworld', { name: playerName, playerId: getOrCreatePlayerId() });
}

/** Creates a fresh, private 1-player battle room for a server-issued encounter token. */
export async function createBattle(token: string): Promise<Room> {
  return colyseusClient.create('battle', { playerId: getOrCreatePlayerId(), token });
}

export async function fetchMap(mapId: string): Promise<unknown> {
  const res = await fetch(`${SERVER_HTTP_URL}/maps/${mapId}`);
  if (!res.ok) throw new Error(`Failed to load map "${mapId}": ${res.status}`);
  return res.json();
}


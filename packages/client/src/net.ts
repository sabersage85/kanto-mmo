import { Client, Room } from 'colyseus.js';

const SERVER_WS_URL = import.meta.env.VITE_SERVER_WS_URL ?? 'ws://localhost:2567';
const SERVER_HTTP_URL = import.meta.env.VITE_SERVER_HTTP_URL ?? 'http://localhost:2567';

export const colyseusClient = new Client(SERVER_WS_URL);

export async function joinOverworld(playerName: string): Promise<Room> {
  return colyseusClient.joinOrCreate('overworld', { name: playerName });
}

export async function fetchMap(mapId: string): Promise<unknown> {
  const res = await fetch(`${SERVER_HTTP_URL}/maps/${mapId}`);
  if (!res.ok) throw new Error(`Failed to load map "${mapId}": ${res.status}`);
  return res.json();
}

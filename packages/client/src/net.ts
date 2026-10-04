import { Client, Room } from 'colyseus.js';

const SERVER_WS_URL = import.meta.env.VITE_SERVER_WS_URL ?? 'ws://localhost:2567';
const SERVER_HTTP_URL = import.meta.env.VITE_SERVER_HTTP_URL ?? 'http://localhost:2567';
const SESSION_STORAGE_KEY = 'kanto-mmo-session';

export const colyseusClient = new Client(SERVER_WS_URL);

/** Session token + display name cached in localStorage so a page reload doesn't force a re-login. */
export interface StoredSession {
  token: string;
  name: string;
  /** ISO timestamp; checked client-side purely to skip an obviously-expired token, not for security. */
  expiresAt: string;
}

interface AuthSuccessResponse {
  token: string;
  expiresAt: string;
  name: string;
}

interface AuthErrorResponse {
  error: string;
}

export function getStoredSession(): StoredSession | null {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as StoredSession;
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      clearStoredSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function clearStoredSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

function storeSession(response: AuthSuccessResponse): StoredSession {
  const session: StoredSession = { token: response.token, name: response.name, expiresAt: response.expiresAt };
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

async function postAuth(path: string, body: unknown): Promise<AuthSuccessResponse> {
  const res = await fetch(`${SERVER_HTTP_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as AuthSuccessResponse | AuthErrorResponse;
  if (!res.ok) throw new Error('error' in data ? data.error : 'Authentication failed.');
  return data as AuthSuccessResponse;
}

export async function register(email: string, password: string, name?: string): Promise<StoredSession> {
  const result = await postAuth('/auth/register', { email, password, name });
  return storeSession(result);
}

export async function login(email: string, password: string): Promise<StoredSession> {
  const result = await postAuth('/auth/login', { email, password });
  return storeSession(result);
}

/** Joins (or, on first connection, creates) the overworld room for the given map, authenticated by session token. */
export async function joinOverworld(sessionToken: string, mapId: string): Promise<Room> {
  return colyseusClient.joinOrCreate('overworld', { token: sessionToken, mapId });
}

/** Resolves which map the player should join first (their last known position, or the starting town for new accounts). */
export async function fetchInitialMapId(sessionToken: string): Promise<string> {
  const res = await fetch(`${SERVER_HTTP_URL}/players/me/map`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  if (!res.ok) throw new Error('Failed to resolve starting map.');
  const data = (await res.json()) as { mapId: string };
  return data.mapId;
}

/** Creates a fresh, private 1-player battle room for a server-issued single-use encounter token. */
export async function createBattle(sessionToken: string, encounterToken: string): Promise<Room> {
  return colyseusClient.create('battle', { sessionToken, encounterToken });
}

/** Creates a fresh, private 1-player trainer-battle room for a server-issued single-use trainer-battle token (Milestone 6). */
export async function createTrainerBattle(sessionToken: string, trainerBattleToken: string): Promise<Room> {
  return colyseusClient.create('trainerBattle', { sessionToken, trainerBattleToken });
}

/** Joins a server-created PvP battle room by id (Milestone 4 — both sides join the same room the server made). */
export async function joinPvpBattle(sessionToken: string, roomId: string): Promise<Room> {
  return colyseusClient.joinById(roomId, { sessionToken });
}

export async function fetchMap(mapId: string): Promise<unknown> {
  const res = await fetch(`${SERVER_HTTP_URL}/maps/${mapId}`);
  if (!res.ok) throw new Error(`Failed to load map "${mapId}": ${res.status}`);
  return res.json();
}

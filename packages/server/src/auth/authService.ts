import type { Direction } from '@kanto-mmo/shared';
import { loadMap } from '../mapLoader.js';
import { getPersistenceStore } from '../persistence/store.js';
import type { PersistenceStore } from '../persistence/types.js';
import { createStarterParty } from '../starterParty.js';
import { hashPassword, verifyPassword } from './password.js';
import { generateSessionToken, SESSION_TTL_MS } from './tokens.js';

export class AuthError extends Error {}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 16;
const DEFAULT_MAP_ID = 'route1';

export interface AuthResult {
  token: string;
  expiresAt: Date;
  name: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function sanitizeName(name: string | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed.slice(0, MAX_NAME_LENGTH) : 'Trainer';
}

function defaultSpawn(): { mapId: string; x: number; y: number; direction: Direction } {
  const map = loadMap(DEFAULT_MAP_ID);
  return { mapId: map.id, x: map.spawn.x, y: map.spawn.y, direction: 'down' };
}

async function issueSession(store: PersistenceStore, accountId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await store.createSession(accountId, token, expiresAt);
  return { token, expiresAt };
}

/**
 * Builds the register/login/validateToken operations against a given
 * {@link PersistenceStore}. Exposed as a factory (rather than only a
 * singleton) so tests can inject an isolated `InMemoryPersistenceStore`
 * with no shared state and no live database.
 */
export function createAuthService(store: PersistenceStore) {
  async function register(email: string, password: string, name?: string): Promise<AuthResult> {
    const normalizedEmail = normalizeEmail(email);
    if (!EMAIL_RE.test(normalizedEmail)) throw new AuthError('Please enter a valid email address.');
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new AuthError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }

    const existing = await store.findAccountByEmail(normalizedEmail);
    if (existing) throw new AuthError('An account with that email already exists.');

    const passwordHash = hashPassword(password);
    const account = await store.createAccount(normalizedEmail, passwordHash);
    const trainerName = sanitizeName(name);
    await store.ensureStarterPlayer(account.id, trainerName, defaultSpawn(), createStarterParty());

    const { token, expiresAt } = await issueSession(store, account.id);
    return { token, expiresAt, name: trainerName };
  }

  async function login(email: string, password: string): Promise<AuthResult> {
    const normalizedEmail = normalizeEmail(email);
    const account = await store.findAccountByEmail(normalizedEmail);
    if (!account || !verifyPassword(password, account.passwordHash)) {
      throw new AuthError('Invalid email or password.');
    }

    const player = await store.loadPlayer(account.id);
    const { token, expiresAt } = await issueSession(store, account.id);
    return { token, expiresAt, name: player?.name ?? 'Trainer' };
  }

  /** Returns the account id the token belongs to, or `null` if invalid/expired. */
  async function validateToken(token: string): Promise<string | null> {
    const session = await store.findValidSession(token);
    return session?.accountId ?? null;
  }

  return { register, login, validateToken };
}

// Process-wide singleton wired to the default persistence store, used by
// the HTTP routes and Colyseus rooms. Built lazily so it always reflects
// whichever store `getPersistenceStore()` resolves to (memory or Postgres).
let defaultService: ReturnType<typeof createAuthService> | null = null;
function getDefaultService(): ReturnType<typeof createAuthService> {
  if (!defaultService) defaultService = createAuthService(getPersistenceStore());
  return defaultService;
}

export function register(email: string, password: string, name?: string): Promise<AuthResult> {
  return getDefaultService().register(email, password, name);
}

export function login(email: string, password: string): Promise<AuthResult> {
  return getDefaultService().login(email, password);
}

export function validateToken(token: string): Promise<string | null> {
  return getDefaultService().validateToken(token);
}

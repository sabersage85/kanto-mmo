import { randomBytes } from 'node:crypto';

/** How long an issued session token remains valid without the player logging in again. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

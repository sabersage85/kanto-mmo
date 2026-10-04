import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing via Node's built-in `scrypt` (no extra native
 * dependency like `bcrypt`, which needs a compiled addon — `scrypt` ships
 * in Node's standard library and is still a deliberately slow, salted KDF
 * suitable for password storage).
 *
 * Stored format: `scrypt:<saltHex>:<hashHex>` so the salt travels with the
 * hash and the scheme is versioned/identifiable if it's ever changed.
 */
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const hash = scryptSync(password, salt, KEY_LENGTH);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

  const [, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, salt, expected.length);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

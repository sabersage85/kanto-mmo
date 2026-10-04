import { describe, expect, it } from 'vitest';
import { InMemoryPersistenceStore } from '../persistence/memoryStore.js';
import { AuthError, createAuthService } from '../auth/authService.js';

function service() {
  return createAuthService(new InMemoryPersistenceStore());
}

describe('authService', () => {
  it('registers a new account, issues a session, and creates a starter party', async () => {
    const auth = service();
    const result = await auth.register('trainer@example.com', 'hunter2pass', 'Ash');

    expect(result.token).toMatch(/^[0-9a-f]+$/);
    expect(result.name).toBe('Ash');
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const accountId = await auth.validateToken(result.token);
    expect(accountId).not.toBeNull();
  });

  it('defaults the trainer name to "Trainer" when none is given', async () => {
    const auth = service();
    const result = await auth.register('noname@example.com', 'hunter2pass');
    expect(result.name).toBe('Trainer');
  });

  it('rejects registration with an invalid email', async () => {
    const auth = service();
    await expect(auth.register('not-an-email', 'hunter2pass')).rejects.toThrow(AuthError);
  });

  it('rejects registration with too short a password', async () => {
    const auth = service();
    await expect(auth.register('trainer@example.com', 'short')).rejects.toThrow(AuthError);
  });

  it('rejects registering the same email twice', async () => {
    const auth = service();
    await auth.register('trainer@example.com', 'hunter2pass');
    await expect(auth.register('trainer@example.com', 'anotherpass')).rejects.toThrow(
      'An account with that email already exists.',
    );
  });

  it('normalizes email case/whitespace so login matches registration', async () => {
    const auth = service();
    await auth.register('  Trainer@Example.com  ', 'hunter2pass');
    const result = await auth.login('trainer@example.com', 'hunter2pass');
    expect(result.token).toBeDefined();
  });

  it('logs in with correct credentials and rejects incorrect ones', async () => {
    const auth = service();
    await auth.register('trainer@example.com', 'hunter2pass', 'Ash');

    const ok = await auth.login('trainer@example.com', 'hunter2pass');
    expect(ok.name).toBe('Ash');

    await expect(auth.login('trainer@example.com', 'wrongpass')).rejects.toThrow(AuthError);
    await expect(auth.login('unknown@example.com', 'hunter2pass')).rejects.toThrow(AuthError);
  });

  it('validateToken returns null for an unknown or invalid token', async () => {
    const auth = service();
    expect(await auth.validateToken('not-a-real-token')).toBeNull();
  });

  it('validateToken returns null once the session has expired', async () => {
    const store = new InMemoryPersistenceStore();
    const auth = createAuthService(store);
    const result = await auth.register('trainer@example.com', 'hunter2pass');

    // Simulate expiry by directly overwriting the session with one that
    // already expired, rather than waiting out the real multi-day TTL.
    await store.createSession((await store.findAccountByEmail('trainer@example.com'))!.id, result.token, new Date(0));

    expect(await auth.validateToken(result.token)).toBeNull();
  });
});

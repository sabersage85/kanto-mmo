import { describe, expect, it } from 'vitest';
import { ChallengeManager } from '../pvp/challengeManager.js';

describe('ChallengeManager', () => {
  it('records a valid challenge and lets the target respond', () => {
    const manager = new ChallengeManager();
    expect(manager.challenge('a', 'b')).toEqual({ ok: true });
    expect(manager.getPendingFor('b')?.fromSessionId).toBe('a');

    const response = manager.respond('b', true);
    expect(response).toEqual({ fromSessionId: 'a', toSessionId: 'b', accepted: true });
    // Consumed: responding again finds nothing.
    expect(manager.respond('b', true)).toBeNull();
  });

  it('rejects self-challenges', () => {
    const manager = new ChallengeManager();
    const result = manager.challenge('a', 'a');
    expect(result.ok).toBe(false);
  });

  it('rejects a second challenge to the same target while one is pending', () => {
    const manager = new ChallengeManager();
    expect(manager.challenge('a', 'c').ok).toBe(true);
    expect(manager.challenge('b', 'c').ok).toBe(false);
  });

  it('rejects a challenger who already has an outgoing challenge pending', () => {
    const manager = new ChallengeManager();
    expect(manager.challenge('a', 'b').ok).toBe(true);
    expect(manager.challenge('a', 'c').ok).toBe(false);
  });

  it('expires a challenge after its TTL', () => {
    const manager = new ChallengeManager(1_000);
    expect(manager.challenge('a', 'b', 0).ok).toBe(true);
    expect(manager.getPendingFor('b', 500)).not.toBeNull();
    expect(manager.getPendingFor('b', 1_500)).toBeNull();
    // Expiry frees up the target for a new challenge.
    expect(manager.challenge('c', 'b', 1_500).ok).toBe(true);
  });

  it('cancels challenges involving a disconnecting session, in either direction', () => {
    const manager = new ChallengeManager();
    manager.challenge('a', 'b');
    manager.cancelInvolving('a');
    expect(manager.getPendingFor('b')).toBeNull();

    manager.challenge('x', 'y');
    manager.cancelInvolving('y');
    expect(manager.getPendingFor('y')).toBeNull();
  });

  it('returns null when responding to a session with no pending challenge', () => {
    const manager = new ChallengeManager();
    expect(manager.respond('nobody', true)).toBeNull();
  });
});

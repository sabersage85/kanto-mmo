/**
 * Pure, Colyseus-independent state machine for the direct-challenge
 * handshake (Milestone 4 PvP): one player challenges another; the target
 * must accept or decline before expiry. Parameterized entirely by plain
 * session-id strings (and an injectable `now`) so it can be unit tested
 * without spinning up a real room/server.
 */
export interface PendingChallenge {
  fromSessionId: string;
  toSessionId: string;
  createdAt: number;
}

export type ChallengeRequestResult = { ok: true } | { ok: false; reason: string };

export interface ChallengeResponse {
  fromSessionId: string;
  toSessionId: string;
  accepted: boolean;
}

const CHALLENGE_TTL_MS = 20_000;

export class ChallengeManager {
  /** At most one incoming challenge per target session at a time. */
  private pending = new Map<string, PendingChallenge>();

  constructor(private readonly ttlMs: number = CHALLENGE_TTL_MS) {}

  /** Records a new challenge request, rejecting self-challenges and conflicting in-flight challenges. */
  challenge(fromSessionId: string, toSessionId: string, now: number = Date.now()): ChallengeRequestResult {
    this.pruneExpired(now);

    if (fromSessionId === toSessionId) {
      return { ok: false, reason: 'You cannot challenge yourself.' };
    }
    if (this.pending.has(toSessionId)) {
      return { ok: false, reason: 'That trainer already has a pending challenge.' };
    }
    for (const existing of this.pending.values()) {
      if (existing.fromSessionId === fromSessionId) {
        return { ok: false, reason: 'You already have a challenge pending.' };
      }
    }

    this.pending.set(toSessionId, { fromSessionId, toSessionId, createdAt: now });
    return { ok: true };
  }

  /** Resolves (accept or decline) the challenge currently pending against `toSessionId`, if any (and not expired). */
  respond(toSessionId: string, accept: boolean, now: number = Date.now()): ChallengeResponse | null {
    this.pruneExpired(now);
    const existing = this.pending.get(toSessionId);
    if (!existing) return null;

    this.pending.delete(toSessionId);
    return { fromSessionId: existing.fromSessionId, toSessionId, accepted: accept };
  }

  /** Returns the pending challenge targeting this session, if one exists and hasn't expired. */
  getPendingFor(toSessionId: string, now: number = Date.now()): PendingChallenge | null {
    this.pruneExpired(now);
    return this.pending.get(toSessionId) ?? null;
  }

  /** Drops any pending challenge to/from this session — call on disconnect. */
  cancelInvolving(sessionId: string): void {
    for (const [to, challenge] of this.pending) {
      if (to === sessionId || challenge.fromSessionId === sessionId) {
        this.pending.delete(to);
      }
    }
  }

  private pruneExpired(now: number): void {
    for (const [to, challenge] of this.pending) {
      if (now - challenge.createdAt > this.ttlMs) {
        this.pending.delete(to);
      }
    }
  }
}

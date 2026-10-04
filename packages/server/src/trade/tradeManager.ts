import { randomUUID } from 'node:crypto';
import type { TradeOffer } from '@kanto-mmo/shared';

/**
 * Pure, Colyseus-independent state machine for the Milestone 5 trade
 * handshake + negotiation. Mirrors `ChallengeManager`'s request/respond
 * shape (Milestone 4 PvP) for the initial handshake, then extends it with
 * an `ActiveTrade` negotiation phase: both sides can update their offer
 * (which resets both confirmations) until both confirm, at which point the
 * caller executes the atomic swap and ends the trade.
 */
export interface PendingTradeRequest {
  fromSessionId: string;
  toSessionId: string;
  createdAt: number;
}

export type TradeRequestResult = { ok: true } | { ok: false; reason: string };

export interface ActiveTrade {
  id: string;
  sideA: string;
  sideB: string;
  offerA: TradeOffer;
  offerB: TradeOffer;
  confirmedA: boolean;
  confirmedB: boolean;
}

export interface TradeResponse {
  fromSessionId: string;
  toSessionId: string;
  accepted: boolean;
  trade?: ActiveTrade;
}

const TRADE_REQUEST_TTL_MS = 20_000;

function emptyOffer(): TradeOffer {
  return { items: [], creatureInstanceIds: [] };
}

export class TradeManager {
  /** At most one incoming trade request per target session at a time. */
  private pending = new Map<string, PendingTradeRequest>();
  private trades = new Map<string, ActiveTrade>();
  private sessionToTrade = new Map<string, string>();

  constructor(private readonly ttlMs: number = TRADE_REQUEST_TTL_MS) {}

  /** Records a new trade request, rejecting self-trades, a busy target, or a conflicting in-flight request. */
  request(fromSessionId: string, toSessionId: string, now: number = Date.now()): TradeRequestResult {
    this.pruneExpired(now);

    if (fromSessionId === toSessionId) {
      return { ok: false, reason: 'You cannot trade with yourself.' };
    }
    if (this.sessionToTrade.has(fromSessionId) || this.sessionToTrade.has(toSessionId)) {
      return { ok: false, reason: 'One of you is already trading.' };
    }
    if (this.pending.has(toSessionId)) {
      return { ok: false, reason: 'That trainer already has a pending trade request.' };
    }
    for (const existing of this.pending.values()) {
      if (existing.fromSessionId === fromSessionId) {
        return { ok: false, reason: 'You already have a trade request pending.' };
      }
    }

    this.pending.set(toSessionId, { fromSessionId, toSessionId, createdAt: now });
    return { ok: true };
  }

  /** Resolves (accept or decline) the request pending against `toSessionId`; accepting creates an empty-offer `ActiveTrade`. */
  respond(toSessionId: string, accept: boolean, now: number = Date.now()): TradeResponse | null {
    this.pruneExpired(now);
    const existing = this.pending.get(toSessionId);
    if (!existing) return null;
    this.pending.delete(toSessionId);

    if (!accept) {
      return { fromSessionId: existing.fromSessionId, toSessionId, accepted: false };
    }

    const trade: ActiveTrade = {
      id: randomUUID(),
      sideA: existing.fromSessionId,
      sideB: toSessionId,
      offerA: emptyOffer(),
      offerB: emptyOffer(),
      confirmedA: false,
      confirmedB: false,
    };
    this.trades.set(trade.id, trade);
    this.sessionToTrade.set(trade.sideA, trade.id);
    this.sessionToTrade.set(trade.sideB, trade.id);
    return { fromSessionId: existing.fromSessionId, toSessionId, accepted: true, trade };
  }

  /** Returns the pending request targeting this session, if one exists and hasn't expired. */
  getPendingFor(toSessionId: string, now: number = Date.now()): PendingTradeRequest | null {
    this.pruneExpired(now);
    return this.pending.get(toSessionId) ?? null;
  }

  getActiveTradeFor(sessionId: string): ActiveTrade | undefined {
    const id = this.sessionToTrade.get(sessionId);
    return id ? this.trades.get(id) : undefined;
  }

  /** Replaces one side's offer and resets both confirmations — any change invalidates a prior "both confirmed" lock. */
  updateOffer(sessionId: string, offer: TradeOffer): ActiveTrade | null {
    const trade = this.getActiveTradeFor(sessionId);
    if (!trade) return null;
    if (trade.sideA === sessionId) trade.offerA = offer;
    else trade.offerB = offer;
    trade.confirmedA = false;
    trade.confirmedB = false;
    return trade;
  }

  /** Marks one side confirmed (idempotent). Caller checks `isBothConfirmed` to know whether to execute the swap. */
  confirm(sessionId: string): ActiveTrade | null {
    const trade = this.getActiveTradeFor(sessionId);
    if (!trade) return null;
    if (trade.sideA === sessionId) trade.confirmedA = true;
    else trade.confirmedB = true;
    return trade;
  }

  isBothConfirmed(trade: ActiveTrade): boolean {
    return trade.confirmedA && trade.confirmedB;
  }

  /** Clears both confirmations without touching offers — used after a failed execution attempt so both can retry/adjust. */
  resetConfirmations(tradeId: string): void {
    const trade = this.trades.get(tradeId);
    if (!trade) return;
    trade.confirmedA = false;
    trade.confirmedB = false;
  }

  /** Ends (completes or cancels) a trade and frees both sessions to request/accept new trades. */
  endTrade(tradeId: string): void {
    const trade = this.trades.get(tradeId);
    if (!trade) return;
    this.trades.delete(tradeId);
    this.sessionToTrade.delete(trade.sideA);
    this.sessionToTrade.delete(trade.sideB);
  }

  /** Drops any pending request or active trade involving this session — call on disconnect. Returns the ended trade, if any. */
  cancelInvolving(sessionId: string): ActiveTrade | undefined {
    for (const [to, req] of this.pending) {
      if (to === sessionId || req.fromSessionId === sessionId) this.pending.delete(to);
    }
    const trade = this.getActiveTradeFor(sessionId);
    if (trade) this.endTrade(trade.id);
    return trade;
  }

  private pruneExpired(now: number): void {
    for (const [to, req] of this.pending) {
      if (now - req.createdAt > this.ttlMs) this.pending.delete(to);
    }
  }
}

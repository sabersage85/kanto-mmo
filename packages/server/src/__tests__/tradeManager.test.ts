import { describe, expect, it } from 'vitest';
import { TradeManager } from '../trade/tradeManager.js';

describe('TradeManager handshake', () => {
  it('records a valid request and lets the target respond, creating an active trade on accept', () => {
    const manager = new TradeManager();
    expect(manager.request('a', 'b')).toEqual({ ok: true });
    expect(manager.getPendingFor('b')?.fromSessionId).toBe('a');

    const response = manager.respond('b', true);
    expect(response?.accepted).toBe(true);
    expect(response?.trade).toBeDefined();
    expect(response?.trade?.sideA).toBe('a');
    expect(response?.trade?.sideB).toBe('b');
    expect(response?.trade?.confirmedA).toBe(false);
    expect(response?.trade?.confirmedB).toBe(false);

    // Consumed: responding again finds nothing.
    expect(manager.respond('b', true)).toBeNull();
  });

  it('declining does not create an active trade', () => {
    const manager = new TradeManager();
    manager.request('a', 'b');
    const response = manager.respond('b', false);
    expect(response).toEqual({ fromSessionId: 'a', toSessionId: 'b', accepted: false });
    expect(manager.getActiveTradeFor('a')).toBeUndefined();
    expect(manager.getActiveTradeFor('b')).toBeUndefined();
  });

  it('rejects self-trades', () => {
    const manager = new TradeManager();
    expect(manager.request('a', 'a').ok).toBe(false);
  });

  it('rejects a second request to the same target while one is pending', () => {
    const manager = new TradeManager();
    expect(manager.request('a', 'c').ok).toBe(true);
    expect(manager.request('b', 'c').ok).toBe(false);
  });

  it('rejects a requester who already has an outgoing request pending', () => {
    const manager = new TradeManager();
    expect(manager.request('a', 'b').ok).toBe(true);
    expect(manager.request('a', 'c').ok).toBe(false);
  });

  it('rejects a request involving a session already in an active trade', () => {
    const manager = new TradeManager();
    manager.request('a', 'b');
    manager.respond('b', true);
    expect(manager.request('a', 'c').ok).toBe(false);
    expect(manager.request('c', 'b').ok).toBe(false);
  });

  it('expires a request after its TTL', () => {
    const manager = new TradeManager(1_000);
    expect(manager.request('a', 'b', 0).ok).toBe(true);
    expect(manager.getPendingFor('b', 500)).not.toBeNull();
    expect(manager.getPendingFor('b', 1_500)).toBeNull();
    expect(manager.request('c', 'b', 1_500).ok).toBe(true);
  });

  it('cancels pending requests involving a disconnecting session, in either direction', () => {
    const manager = new TradeManager();
    manager.request('a', 'b');
    manager.cancelInvolving('a');
    expect(manager.getPendingFor('b')).toBeNull();

    manager.request('x', 'y');
    manager.cancelInvolving('y');
    expect(manager.getPendingFor('y')).toBeNull();
  });

  it('returns null when responding to a session with no pending request', () => {
    const manager = new TradeManager();
    expect(manager.respond('nobody', true)).toBeNull();
  });
});

describe('TradeManager negotiation', () => {
  function startTrade(manager: TradeManager): string {
    manager.request('a', 'b');
    const response = manager.respond('b', true);
    return response!.trade!.id;
  }

  it('updates an offer and lets both sides read the latest state', () => {
    const manager = new TradeManager();
    startTrade(manager);

    const offer = { items: [{ itemId: 1, quantity: 2 }], creatureInstanceIds: ['x'] };
    const trade = manager.updateOffer('a', offer);
    expect(trade?.offerA).toEqual(offer);
    expect(manager.getActiveTradeFor('b')?.offerA).toEqual(offer);
  });

  it('resets both confirmations whenever either side changes their offer', () => {
    const manager = new TradeManager();
    startTrade(manager);

    manager.confirm('a');
    manager.confirm('b');
    let trade = manager.getActiveTradeFor('a')!;
    expect(manager.isBothConfirmed(trade)).toBe(true);

    // Side B tweaks their offer after both had confirmed.
    manager.updateOffer('b', { items: [], creatureInstanceIds: ['y'] });
    trade = manager.getActiveTradeFor('a')!;
    expect(trade.confirmedA).toBe(false);
    expect(trade.confirmedB).toBe(false);
    expect(manager.isBothConfirmed(trade)).toBe(false);
  });

  it('only executes once both sides have confirmed', () => {
    const manager = new TradeManager();
    startTrade(manager);

    manager.confirm('a');
    let trade = manager.getActiveTradeFor('a')!;
    expect(manager.isBothConfirmed(trade)).toBe(false);

    manager.confirm('b');
    trade = manager.getActiveTradeFor('a')!;
    expect(manager.isBothConfirmed(trade)).toBe(true);
  });

  it('resetConfirmations clears both flags without touching offers', () => {
    const manager = new TradeManager();
    const tradeId = startTrade(manager);
    const offer = { items: [{ itemId: 5, quantity: 1 }], creatureInstanceIds: [] };
    manager.updateOffer('a', offer);
    manager.confirm('a');
    manager.confirm('b');

    manager.resetConfirmations(tradeId);
    const trade = manager.getActiveTradeFor('a')!;
    expect(trade.confirmedA).toBe(false);
    expect(trade.confirmedB).toBe(false);
    expect(trade.offerA).toEqual(offer);
  });

  it('endTrade frees both sessions to start new trades', () => {
    const manager = new TradeManager();
    const tradeId = startTrade(manager);
    manager.endTrade(tradeId);
    expect(manager.getActiveTradeFor('a')).toBeUndefined();
    expect(manager.getActiveTradeFor('b')).toBeUndefined();
    expect(manager.request('a', 'c').ok).toBe(true);
  });

  it('cancelInvolving ends an active trade and returns it', () => {
    const manager = new TradeManager();
    const tradeId = startTrade(manager);
    const cancelled = manager.cancelInvolving('a');
    expect(cancelled?.id).toBe(tradeId);
    expect(manager.getActiveTradeFor('b')).toBeUndefined();
  });
});

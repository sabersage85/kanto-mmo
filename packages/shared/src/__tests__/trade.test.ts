import { describe, expect, it } from 'vitest';
import {
  executeTrade,
  PARTY_CAP,
  validateTradeOffer,
  type TradeInventoryState,
  type TradeOffer,
} from '../trade.js';
import type { CreatureInstance } from '../types.js';

function makeCreature(instanceId: string): CreatureInstance {
  return {
    instanceId,
    speciesId: 1,
    level: 5,
    exp: 100,
    ivs: { hp: 10, attack: 10, defense: 10, spAttack: 10, spDefense: 10, speed: 10 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    moveIds: [1],
    currentHp: 20,
  };
}

function emptyOffer(): TradeOffer {
  return { items: [], creatureInstanceIds: [] };
}

describe('validateTradeOffer', () => {
  it('accepts an offer of items the side actually owns enough of', () => {
    const state: TradeInventoryState = {
      inventory: [{ itemId: 1, quantity: 3 }],
      party: [makeCreature('a'), makeCreature('b')],
      storage: [],
    };
    const result = validateTradeOffer(state, { items: [{ itemId: 1, quantity: 2 }], creatureInstanceIds: [] });
    expect(result.ok).toBe(true);
  });

  it('rejects offering more of an item than owned', () => {
    const state: TradeInventoryState = {
      inventory: [{ itemId: 1, quantity: 1 }],
      party: [makeCreature('a')],
      storage: [],
    };
    const result = validateTradeOffer(state, { items: [{ itemId: 1, quantity: 2 }], creatureInstanceIds: [] });
    expect(result.ok).toBe(false);
  });

  it('rejects offering an item not owned at all', () => {
    const state: TradeInventoryState = { inventory: [], party: [makeCreature('a')], storage: [] };
    const result = validateTradeOffer(state, { items: [{ itemId: 99, quantity: 1 }], creatureInstanceIds: [] });
    expect(result.ok).toBe(false);
  });

  it('rejects offering a creature not owned (wrong instance id)', () => {
    const state: TradeInventoryState = { inventory: [], party: [makeCreature('a'), makeCreature('b')], storage: [] };
    const result = validateTradeOffer(state, { items: [], creatureInstanceIds: ['not-owned'] });
    expect(result.ok).toBe(false);
  });

  it('accepts a creature owned in storage (not just party)', () => {
    const state: TradeInventoryState = { inventory: [], party: [makeCreature('a')], storage: [makeCreature('b')] };
    const result = validateTradeOffer(state, { items: [], creatureInstanceIds: ['b'] });
    expect(result.ok).toBe(true);
  });

  it('rejects offering away every creature the player owns', () => {
    const state: TradeInventoryState = { inventory: [], party: [makeCreature('a')], storage: [] };
    const result = validateTradeOffer(state, { items: [], creatureInstanceIds: ['a'] });
    expect(result.ok).toBe(false);
  });

  it('allows offering all-but-one creature', () => {
    const state: TradeInventoryState = {
      inventory: [],
      party: [makeCreature('a'), makeCreature('b'), makeCreature('c')],
      storage: [],
    };
    const result = validateTradeOffer(state, { items: [], creatureInstanceIds: ['a', 'b'] });
    expect(result.ok).toBe(true);
  });

  it('accepts an empty offer', () => {
    const state: TradeInventoryState = { inventory: [], party: [makeCreature('a')], storage: [] };
    expect(validateTradeOffer(state, emptyOffer()).ok).toBe(true);
  });
});

describe('executeTrade', () => {
  it('swaps items between both sides', () => {
    const sideA: TradeInventoryState = { inventory: [{ itemId: 1, quantity: 5 }], party: [makeCreature('a')], storage: [] };
    const sideB: TradeInventoryState = { inventory: [{ itemId: 2, quantity: 5 }], party: [makeCreature('b')], storage: [] };

    const offerA: TradeOffer = { items: [{ itemId: 1, quantity: 2 }], creatureInstanceIds: [] };
    const offerB: TradeOffer = { items: [{ itemId: 2, quantity: 3 }], creatureInstanceIds: [] };

    const result = executeTrade(sideA, offerA, sideB, offerB);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.sideA.inventory).toEqual([
      { itemId: 1, quantity: 3 },
      { itemId: 2, quantity: 3 },
    ]);
    expect(result.sideB.inventory).toEqual([
      { itemId: 2, quantity: 2 },
      { itemId: 1, quantity: 2 },
    ]);
  });

  it('swaps creatures between both sides', () => {
    const sideA: TradeInventoryState = { inventory: [], party: [makeCreature('a1'), makeCreature('a2')], storage: [] };
    const sideB: TradeInventoryState = { inventory: [], party: [makeCreature('b1'), makeCreature('b2')], storage: [] };

    const offerA: TradeOffer = { items: [], creatureInstanceIds: ['a1'] };
    const offerB: TradeOffer = { items: [], creatureInstanceIds: ['b1'] };

    const result = executeTrade(sideA, offerA, sideB, offerB);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.sideA.party.map((c) => c.instanceId)).toEqual(['a2', 'b1']);
    expect(result.sideB.party.map((c) => c.instanceId)).toEqual(['b2', 'a1']);
  });

  it('overflows a received creature into storage once the party is at PARTY_CAP', () => {
    const fullParty = Array.from({ length: PARTY_CAP }, (_, i) => makeCreature(`a${i}`));
    const sideA: TradeInventoryState = { inventory: [], party: fullParty, storage: [] };
    const sideB: TradeInventoryState = { inventory: [], party: [makeCreature('b1'), makeCreature('b2')], storage: [] };

    const offerA: TradeOffer = { items: [], creatureInstanceIds: [] };
    const offerB: TradeOffer = { items: [], creatureInstanceIds: ['b1'] };

    const result = executeTrade(sideA, offerA, sideB, offerB);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.sideA.party).toHaveLength(PARTY_CAP);
    expect(result.sideA.storage.map((c) => c.instanceId)).toEqual(['b1']);
  });

  it('fails and leaves both sides completely unmutated when one side cannot deliver its offer', () => {
    const sideA: TradeInventoryState = {
      inventory: [{ itemId: 1, quantity: 1 }],
      party: [makeCreature('a1')],
      storage: [],
    };
    const sideB: TradeInventoryState = { inventory: [], party: [makeCreature('b1')], storage: [] };

    // Side A claims to offer 5 of an item it only has 1 of — simulates a
    // stale/invalid offer (e.g. spent elsewhere between confirm clicks).
    const offerA: TradeOffer = { items: [{ itemId: 1, quantity: 5 }], creatureInstanceIds: [] };
    const offerB: TradeOffer = { items: [], creatureInstanceIds: ['b1'] };

    const snapshotA = JSON.parse(JSON.stringify(sideA));
    const snapshotB = JSON.parse(JSON.stringify(sideB));

    const result = executeTrade(sideA, offerA, sideB, offerB);
    expect(result.success).toBe(false);

    // Original inputs must be byte-for-byte unchanged — no partial
    // decrement/increment occurred anywhere (anti-duplication guarantee).
    expect(sideA).toEqual(snapshotA);
    expect(sideB).toEqual(snapshotB);
  });

  it('fails when a side tries to offer a creature it does not own', () => {
    const sideA: TradeInventoryState = { inventory: [], party: [makeCreature('a1')], storage: [] };
    const sideB: TradeInventoryState = { inventory: [], party: [makeCreature('b1')], storage: [] };

    const offerA: TradeOffer = { items: [], creatureInstanceIds: ['does-not-exist'] };
    const offerB: TradeOffer = emptyOffer();

    const result = executeTrade(sideA, offerA, sideB, offerB);
    expect(result.success).toBe(false);
  });

  it('handles a mixed items+creatures trade in both directions', () => {
    const sideA: TradeInventoryState = {
      inventory: [{ itemId: 1, quantity: 2 }],
      party: [makeCreature('a1'), makeCreature('a2')],
      storage: [],
    };
    const sideB: TradeInventoryState = {
      inventory: [{ itemId: 2, quantity: 1 }],
      party: [makeCreature('b1')],
      storage: [makeCreature('b2')],
    };

    const offerA: TradeOffer = { items: [{ itemId: 1, quantity: 1 }], creatureInstanceIds: ['a1'] };
    const offerB: TradeOffer = { items: [{ itemId: 2, quantity: 1 }], creatureInstanceIds: ['b2'] };

    const result = executeTrade(sideA, offerA, sideB, offerB);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.sideA.inventory).toEqual([
      { itemId: 1, quantity: 1 },
      { itemId: 2, quantity: 1 },
    ]);
    expect(result.sideA.party.map((c) => c.instanceId)).toContain('b2');
    expect(result.sideB.party.map((c) => c.instanceId)).toContain('a1');
    expect(result.sideB.inventory).toEqual([{ itemId: 1, quantity: 1 }]);
  });
});

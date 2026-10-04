import type { CreatureInstance, InventorySlot } from './types.js';
import { addItemToInventory, removeItemFromInventory } from './inventory.js';

/** Maximum party size; a creature received beyond this overflows into `storage` instead (mirrors Milestone 2's catch overflow). */
export const PARTY_CAP = 6;

/** What one side of a trade is offering: stacked items (by id/quantity) and/or whole creatures (by instance id). */
export interface TradeOffer {
  items: InventorySlot[];
  creatureInstanceIds: string[];
}

/** One side's current owned state, as relevant to a trade (a snapshot — never mutated in place). */
export interface TradeInventoryState {
  inventory: InventorySlot[];
  party: CreatureInstance[];
  storage: CreatureInstance[];
}

export type TradeValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * Checks that `offer` is something `state` can actually deliver right now:
 * enough of each stacked item, and each offered creature actually owned
 * (in party or storage). Also guards against offering away every creature
 * the player owns, since there's no release/create-creature mechanic yet
 * and a player with zero creatures couldn't battle afterward (an
 * author's-judgment safety rule beyond the base trade spec).
 */
export function validateTradeOffer(state: TradeInventoryState, offer: TradeOffer): TradeValidationResult {
  for (const slot of offer.items) {
    const owned = state.inventory.find((s) => s.itemId === slot.itemId)?.quantity ?? 0;
    if (slot.quantity <= 0 || owned < slot.quantity) {
      return { ok: false, reason: `Not enough of item #${slot.itemId} to offer.` };
    }
  }

  const ownedCreatureIds = new Set([...state.party, ...state.storage].map((c) => c.instanceId));
  for (const instanceId of offer.creatureInstanceIds) {
    if (!ownedCreatureIds.has(instanceId)) {
      return { ok: false, reason: `Creature ${instanceId} is not owned.` };
    }
  }

  const uniqueOffered = new Set(offer.creatureInstanceIds);
  if (uniqueOffered.size > 0 && uniqueOffered.size >= ownedCreatureIds.size) {
    return { ok: false, reason: 'You must keep at least one creature after trading.' };
  }

  return { ok: true };
}

export type TradeExecutionResult =
  | { success: true; sideA: TradeInventoryState; sideB: TradeInventoryState }
  | { success: false; reason: string };

/**
 * Pure, server-authoritative atomic trade swap (Milestone 5). Re-validates
 * both sides' current ownership against their *live* state immediately
 * before computing the swap (callers should pass the freshest state they
 * have, right before applying the result) and never mutates either input
 * object — it only ever reads from `sideA`/`sideB` and builds brand-new
 * state objects for the result. That means a validation failure leaves the
 * original inputs completely untouched (nothing partially decremented on
 * one side with nothing incremented on the other), which is what gives
 * this "atomicity" without needing an explicit rollback/transaction step.
 */
export function executeTrade(
  sideA: TradeInventoryState,
  offerA: TradeOffer,
  sideB: TradeInventoryState,
  offerB: TradeOffer,
): TradeExecutionResult {
  const validA = validateTradeOffer(sideA, offerA);
  if (!validA.ok) return { success: false, reason: `Side A: ${validA.reason}` };
  const validB = validateTradeOffer(sideB, offerB);
  if (!validB.ok) return { success: false, reason: `Side B: ${validB.reason}` };

  // Remove offered items/creatures from each side first (purely computed —
  // `sideA`/`sideB` are read-only inputs, so nothing here touches them).
  const removedFromA = removeOffer(sideA, offerA);
  const removedFromB = removeOffer(sideB, offerB);
  if (!removedFromA || !removedFromB) {
    // Should be unreachable given the validation above, but guards against
    // any future desync between validateTradeOffer and removeOffer.
    return { success: false, reason: 'Trade failed validation during execution.' };
  }

  const creaturesFromA = extractCreatures(sideA, offerA.creatureInstanceIds);
  const creaturesFromB = extractCreatures(sideB, offerB.creatureInstanceIds);

  const finalA = receiveOffer(
    { ...removedFromA, inventory: addItems(removedFromA.inventory, offerB.items) },
    creaturesFromB,
  );
  const finalB = receiveOffer(
    { ...removedFromB, inventory: addItems(removedFromB.inventory, offerA.items) },
    creaturesFromA,
  );

  return { success: true, sideA: finalA, sideB: finalB };
}

/** Subtracts every offered item and removes every offered creature (from party or storage) from a snapshot. */
function removeOffer(state: TradeInventoryState, offer: TradeOffer): TradeInventoryState | null {
  let items = state.inventory;
  for (const slot of offer.items) {
    const result = removeItemFromInventory(items, slot.itemId, slot.quantity);
    if (!result.success) return null;
    items = result.items;
  }

  const offeredIds = new Set(offer.creatureInstanceIds);
  const party = state.party.filter((c) => !offeredIds.has(c.instanceId));
  const storage = state.storage.filter((c) => !offeredIds.has(c.instanceId));
  return { inventory: items, party, storage };
}

function extractCreatures(state: TradeInventoryState, instanceIds: string[]): CreatureInstance[] {
  const byId = new Map([...state.party, ...state.storage].map((c) => [c.instanceId, c] as const));
  return instanceIds.map((id) => byId.get(id)).filter((c): c is CreatureInstance => Boolean(c));
}

function addItems(items: InventorySlot[], toAdd: InventorySlot[]): InventorySlot[] {
  let result = items;
  for (const slot of toAdd) {
    result = addItemToInventory(result, slot.itemId, slot.quantity);
  }
  return result;
}

/** Adds received creatures to party (up to `PARTY_CAP`) then overflow storage, same rule as the Milestone 2 catch mechanic. */
function receiveOffer(state: TradeInventoryState, creatures: CreatureInstance[]): TradeInventoryState {
  let party = state.party;
  let storage = state.storage;
  for (const creature of creatures) {
    if (party.length < PARTY_CAP) party = [...party, creature];
    else storage = [...storage, creature];
  }
  return { inventory: state.inventory, party, storage };
}

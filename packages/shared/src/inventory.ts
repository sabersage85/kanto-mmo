import { calculateFullStatBlock } from './formulas.js';
import type { CreatureInstance, InventorySlot, SpeciesDefinition, StatBlock } from './types.js';

/**
 * Inventory/item mutation and effect-application logic (Milestone 2). Pure
 * functions, same convention as formulas.ts/battle.ts: no Colyseus/DB
 * dependency, so the server wraps these with persistence and they're
 * directly unit-testable here.
 */

/** Adds `quantity` of an item to a stacked slot list, creating a new slot if needed. Returns a new array. */
export function addItemToInventory(items: InventorySlot[], itemId: number, quantity: number): InventorySlot[] {
  if (quantity <= 0) return items;
  const next = items.map((slot) => ({ ...slot }));
  const existing = next.find((slot) => slot.itemId === itemId);
  if (existing) existing.quantity += quantity;
  else next.push({ itemId, quantity });
  return next;
}

export interface RemoveItemResult {
  items: InventorySlot[];
  success: boolean;
}

/** Removes `quantity` of an item; fails (`success: false`, array unchanged) if there isn't enough. */
export function removeItemFromInventory(items: InventorySlot[], itemId: number, quantity: number): RemoveItemResult {
  if (quantity <= 0) return { items, success: true };
  const index = items.findIndex((slot) => slot.itemId === itemId);
  if (index < 0 || items[index].quantity < quantity) return { items, success: false };

  const next = items.map((slot) => ({ ...slot }));
  next[index].quantity -= quantity;
  if (next[index].quantity <= 0) next.splice(index, 1);
  return { items: next, success: true };
}

export function getItemQuantity(items: InventorySlot[], itemId: number): number {
  return items.find((slot) => slot.itemId === itemId)?.quantity ?? 0;
}

/** Applies a flat or 'full' heal amount to a creature, clamped to its (recomputed) max HP. Never revives a fainted creature. */
export function applyHealToInstance(
  instance: CreatureInstance,
  species: SpeciesDefinition,
  amount: number | 'full',
): CreatureInstance {
  if (instance.currentHp <= 0) return instance;
  const stats = calculateFullStatBlock(species.baseStats, instance.ivs, instance.evs, instance.level);
  const healed = amount === 'full' ? stats.hp : Math.min(stats.hp, instance.currentHp + amount);
  return { ...instance, currentHp: healed };
}

/**
 * Fully heals a creature regardless of its current HP, including from 0 (fainted). Unlike
 * `applyHealToInstance`, this is not an item effect — it models the "blackout" convention where
 * losing a battle sends the player back to safety already healed (a Pokémon-Center-style
 * automatic recovery), rather than leaving them with no usable party member and no way to
 * revive one, since healing items deliberately cannot revive a fainted creature.
 */
export function reviveToFullInstance(instance: CreatureInstance, species: SpeciesDefinition): CreatureInstance {
  const stats = calculateFullStatBlock(species.baseStats, instance.ivs, instance.evs, instance.level);
  return { ...instance, currentHp: stats.hp };
}

/** Per-stat EV cap for boost items (matches the genre-standard 252 per-stat convention). */
export const MAX_EV_PER_STAT = 252;

export interface StatBoostResult {
  instance: CreatureInstance;
  /** Actual EV amount applied, which may be less than requested if the cap was hit. */
  appliedAmount: number;
}

/** Permanently raises one EV stat on a creature (capped at `MAX_EV_PER_STAT`), e.g. from a boost-item use. */
export function applyStatBoostToInstance(
  instance: CreatureInstance,
  stat: keyof StatBlock,
  amount: number,
): StatBoostResult {
  const current = instance.evs[stat];
  const capped = Math.min(MAX_EV_PER_STAT, current + amount);
  const appliedAmount = capped - current;
  const evs: StatBlock = { ...instance.evs, [stat]: capped };
  return { instance: { ...instance, evs }, appliedAmount };
}

export interface CatchRateInput {
  currentHp: number;
  maxHp: number;
  /** 0..1 tool strength; 1 means the tool alone guarantees a catch regardless of HP. */
  catchPower: number;
}

/**
 * Catch-rate formula (original design — not derived from any copyrighted
 * source): `chance = 1 - hpRatio * (1 - catchPower)`.
 *
 * This has two convenient boundary properties: at full HP the chance
 * equals the tool's raw `catchPower` (so a weak tool still has a low,
 * non-zero chance even against an undamaged wild creature), and as HP
 * approaches 0 the chance approaches 1 regardless of tool strength (a
 * nearly-defeated creature is trivial to catch with any tool).
 */
export function calculateCatchChance({ currentHp, maxHp, catchPower }: CatchRateInput): number {
  const hpRatio = maxHp > 0 ? clamp(currentHp / maxHp, 0, 1) : 0;
  const power = clamp(catchPower, 0, 1);
  return clamp(1 - hpRatio * (1 - power), 0, 1);
}

export interface CatchAttemptResult {
  success: boolean;
  chance: number;
}

/** Rolls a catch attempt against a wild creature's current/max HP using the given tool's catch power. */
export function attemptCatch(
  wild: { currentHp: number; maxHp: number },
  catchPower: number,
  roll: number = Math.random(),
): CatchAttemptResult {
  const chance = calculateCatchChance({ currentHp: wild.currentHp, maxHp: wild.maxHp, catchPower });
  return { success: roll < chance, chance };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

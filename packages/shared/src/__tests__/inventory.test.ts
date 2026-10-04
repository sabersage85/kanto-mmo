import { describe, expect, it } from 'vitest';
import {
  addItemToInventory,
  applyHealToInstance,
  applyStatBoostToInstance,
  attemptCatch,
  calculateCatchChance,
  getItemQuantity,
  MAX_EV_PER_STAT,
  removeItemFromInventory,
  reviveToFullInstance,
} from '../inventory.js';
import { getItem, ITEMS } from '../items.js';
import type { CreatureInstance, SpeciesDefinition } from '../types.js';

const SPECIES: SpeciesDefinition = {
  id: 1,
  name: 'Testmon',
  types: ['Normal'],
  baseStats: { hp: 60, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 50 },
  growthRate: 'Medium',
  baseExpYield: 60,
  description: 'A test creature.',
};

function makeInstance(overrides: Partial<CreatureInstance> = {}): CreatureInstance {
  return {
    instanceId: 'test-1',
    speciesId: SPECIES.id,
    level: 10,
    exp: 1000,
    ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    moveIds: [1],
    currentHp: 10,
    ...overrides,
  };
}

describe('items data', () => {
  it('has between 6 and 10 items covering healing/capture/boost', () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(6);
    expect(ITEMS.length).toBeLessThanOrEqual(10);
    expect(ITEMS.some((i) => i.category === 'healing')).toBe(true);
    expect(ITEMS.some((i) => i.category === 'capture')).toBe(true);
    expect(ITEMS.some((i) => i.category === 'boost')).toBe(true);
  });

  it('getItem returns a known item and throws for an unknown id', () => {
    expect(getItem(1).name).toBeTruthy();
    expect(() => getItem(9999)).toThrow();
  });
});

describe('addItemToInventory / removeItemFromInventory', () => {
  it('adds a new stacked slot and increments an existing one', () => {
    let items = addItemToInventory([], 1, 2);
    expect(items).toEqual([{ itemId: 1, quantity: 2 }]);
    items = addItemToInventory(items, 1, 3);
    expect(items).toEqual([{ itemId: 1, quantity: 5 }]);
  });

  it('does not mutate the original array', () => {
    const original = [{ itemId: 1, quantity: 1 }];
    const next = addItemToInventory(original, 1, 1);
    expect(original[0].quantity).toBe(1);
    expect(next[0].quantity).toBe(2);
  });

  it('removes quantity and drops an emptied slot', () => {
    const items = [{ itemId: 1, quantity: 2 }];
    const result = removeItemFromInventory(items, 1, 2);
    expect(result.success).toBe(true);
    expect(result.items).toEqual([]);
  });

  it('partially removes without dropping the slot', () => {
    const items = [{ itemId: 1, quantity: 5 }];
    const result = removeItemFromInventory(items, 1, 2);
    expect(result.success).toBe(true);
    expect(result.items).toEqual([{ itemId: 1, quantity: 3 }]);
  });

  it('fails (unchanged) when removing more than available', () => {
    const items = [{ itemId: 1, quantity: 1 }];
    const result = removeItemFromInventory(items, 1, 2);
    expect(result.success).toBe(false);
    expect(result.items).toBe(items);
  });

  it('fails when removing an item not present at all', () => {
    const result = removeItemFromInventory([], 1, 1);
    expect(result.success).toBe(false);
  });

  it('getItemQuantity returns 0 for an absent item', () => {
    expect(getItemQuantity([], 42)).toBe(0);
    expect(getItemQuantity([{ itemId: 42, quantity: 7 }], 42)).toBe(7);
  });
});

describe('applyHealToInstance', () => {
  it('restores a flat amount, capped at max HP', () => {
    const instance = makeInstance({ currentHp: 10 });
    const healed = applyHealToInstance(instance, SPECIES, 20);
    expect(healed.currentHp).toBeGreaterThan(10);
    expect(healed.currentHp).toBeLessThanOrEqual(healed.currentHp);
  });

  it("'full' restores to exactly max HP", () => {
    const instance = makeInstance({ currentHp: 1 });
    const healed = applyHealToInstance(instance, SPECIES, 'full');
    const healedAgain = applyHealToInstance(healed, SPECIES, 'full');
    expect(healedAgain.currentHp).toBe(healed.currentHp); // already at max, no-op
  });

  it('never revives a fainted creature', () => {
    const instance = makeInstance({ currentHp: 0 });
    const healed = applyHealToInstance(instance, SPECIES, 'full');
    expect(healed.currentHp).toBe(0);
  });
});

describe('reviveToFullInstance', () => {
  it('fully heals a fainted creature (unlike item-based healing)', () => {
    const instance = makeInstance({ currentHp: 0 });
    const revived = reviveToFullInstance(instance, SPECIES);
    expect(revived.currentHp).toBeGreaterThan(0);
    // Matches what a 'full' item heal would produce for a non-fainted creature.
    const fullHealed = applyHealToInstance({ ...instance, currentHp: 1 }, SPECIES, 'full');
    expect(revived.currentHp).toBe(fullHealed.currentHp);
  });

  it('is a no-op (still full) when the creature is already at max HP', () => {
    const instance = makeInstance({ currentHp: 10_000 });
    const revived = reviveToFullInstance(instance, SPECIES);
    expect(revived.currentHp).toBeLessThan(10_000);
  });
});

describe('applyStatBoostToInstance', () => {
  it('raises the target EV stat by the requested amount', () => {
    const instance = makeInstance();
    const result = applyStatBoostToInstance(instance, 'attack', 40);
    expect(result.instance.evs.attack).toBe(40);
    expect(result.appliedAmount).toBe(40);
    expect(result.instance.evs.defense).toBe(0); // other stats untouched
  });

  it('caps at MAX_EV_PER_STAT and reports the reduced applied amount', () => {
    const instance = makeInstance({ evs: { hp: 0, attack: 230, defense: 0, spAttack: 0, spDefense: 0, speed: 0 } });
    const result = applyStatBoostToInstance(instance, 'attack', 40);
    expect(result.instance.evs.attack).toBe(MAX_EV_PER_STAT);
    expect(result.appliedAmount).toBe(MAX_EV_PER_STAT - 230);
  });

  it('applies nothing once already at the cap', () => {
    const instance = makeInstance({
      evs: { hp: 0, attack: MAX_EV_PER_STAT, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    });
    const result = applyStatBoostToInstance(instance, 'attack', 40);
    expect(result.appliedAmount).toBe(0);
  });
});

describe('calculateCatchChance / attemptCatch', () => {
  it('guarantees a catch at 0 HP regardless of tool power', () => {
    expect(calculateCatchChance({ currentHp: 0, maxHp: 100, catchPower: 0.1 })).toBe(1);
    expect(calculateCatchChance({ currentHp: 0, maxHp: 100, catchPower: 0.35 })).toBe(1);
  });

  it('is low (near the tool\'s raw catchPower) at full HP with a weak tool', () => {
    const chance = calculateCatchChance({ currentHp: 100, maxHp: 100, catchPower: 0.1 });
    expect(chance).toBeCloseTo(0.1, 5);
    expect(chance).toBeLessThan(0.15);
  });

  it('is higher at full HP with a stronger tool, but still less than at low HP', () => {
    const strong = calculateCatchChance({ currentHp: 100, maxHp: 100, catchPower: 0.35 });
    const weak = calculateCatchChance({ currentHp: 100, maxHp: 100, catchPower: 0.1 });
    expect(strong).toBeGreaterThan(weak);

    const strongLowHp = calculateCatchChance({ currentHp: 1, maxHp: 100, catchPower: 0.35 });
    expect(strongLowHp).toBeGreaterThan(strong);
  });

  it('clamps out-of-range inputs', () => {
    expect(calculateCatchChance({ currentHp: -5, maxHp: 100, catchPower: 2 })).toBe(1);
    expect(calculateCatchChance({ currentHp: 100, maxHp: 0, catchPower: 0.1 })).toBe(1);
  });

  it('attemptCatch succeeds iff the roll is below the computed chance', () => {
    const wild = { currentHp: 0, maxHp: 100 };
    expect(attemptCatch(wild, 0.1, 0.999).success).toBe(true); // guaranteed at 0 HP
    const fullHpWild = { currentHp: 100, maxHp: 100 };
    expect(attemptCatch(fullHpWild, 0.1, 0.5).success).toBe(false);
    expect(attemptCatch(fullHpWild, 0.1, 0.01).success).toBe(true);
  });
});

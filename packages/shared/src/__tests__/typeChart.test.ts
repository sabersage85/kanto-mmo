import { describe, expect, it } from 'vitest';
import { getTypeEffectiveness } from '../typeChart.js';

describe('getTypeEffectiveness', () => {
  it('returns 2x for a super-effective single-type matchup', () => {
    expect(getTypeEffectiveness('Water', ['Fire'])).toBe(2);
  });

  it('returns 0.5x for a not-very-effective matchup', () => {
    expect(getTypeEffectiveness('Fire', ['Water'])).toBe(0.5);
  });

  it('returns 1x for a neutral matchup', () => {
    expect(getTypeEffectiveness('Normal', ['Water'])).toBe(1);
  });

  it('multiplies effectiveness across dual types', () => {
    // Water is 2x vs Rock and 2x vs Fire -> 4x vs a Fire/Rock dual type.
    expect(getTypeEffectiveness('Water', ['Fire', 'Rock'])).toBe(4);
  });

  it('returns 0 for an immunity', () => {
    expect(getTypeEffectiveness('Normal', ['Shadow'])).toBe(0);
  });
});

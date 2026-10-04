import type { ElementType } from './types.js';
import type { SpeciesDefinition } from './types.js';

/** Default "signature" move id for each elemental type, used to build starter movesets. */
const TYPE_SIGNATURE_MOVE_ID: Record<ElementType, number> = {
  Normal: 1, // Tackle
  Fire: 2, // Ember Flick
  Water: 3, // Water Jet
  Grass: 4, // Vine Snap
  Electric: 5, // Static Shock
  Ice: 6, // Frost Bite
  Flying: 7, // Gust
  Rock: 8, // Rock Throw
  Shadow: 9, // Shadow Nip
  Psychic: 10, // Mind Pulse
};

const TACKLE_MOVE_ID = 1;
const GROWL_MOVE_ID = 11;

/**
 * Builds a simple default moveset (up to 4 moves) for a species: one
 * signature damaging move per type it has, backfilled with Tackle and
 * Growl so every creature always has at least two usable moves.
 */
export function getDefaultMoveset(species: SpeciesDefinition): number[] {
  const moveIds: number[] = [];
  for (const type of species.types) {
    const moveId = TYPE_SIGNATURE_MOVE_ID[type];
    if (!moveIds.includes(moveId)) moveIds.push(moveId);
  }
  if (!moveIds.includes(TACKLE_MOVE_ID) && moveIds.length < 4) {
    moveIds.push(TACKLE_MOVE_ID);
  }
  if (!moveIds.includes(GROWL_MOVE_ID) && moveIds.length < 4) {
    moveIds.push(GROWL_MOVE_ID);
  }
  return moveIds.slice(0, 4);
}

import { MapSchema, Schema, type } from '@colyseus/schema';

/** Networked representation of a single connected player. */
export class PlayerSchema extends Schema {
  @type('string') id = '';
  @type('string') name = 'Trainer';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('string') direction: 'up' | 'down' | 'left' | 'right' = 'down';
  @type('number') wins = 0;
  @type('number') losses = 0;
  /** Count of NPC trainer badges earned so far (Milestone 6). */
  @type('number') badgeCount = 0;
}

/** Root networked state for an OverworldRoom. */
export class OverworldState extends Schema {
  @type('string') mapId = 'hearthfield';
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
}

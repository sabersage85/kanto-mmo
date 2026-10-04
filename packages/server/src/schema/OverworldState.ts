import { MapSchema, Schema, type } from '@colyseus/schema';

/** Networked representation of a single connected player. */
export class PlayerSchema extends Schema {
  @type('string') id = '';
  @type('string') name = 'Trainer';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('string') direction: 'up' | 'down' | 'left' | 'right' = 'down';
}

/** Root networked state for an OverworldRoom. */
export class OverworldState extends Schema {
  @type('string') mapId = 'route1';
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
}

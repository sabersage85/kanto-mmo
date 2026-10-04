import colyseus from 'colyseus';
import type { Client } from 'colyseus';
const { Room } = colyseus;
import type { MapDefinition, MoveInput } from '@kanto-mmo/shared';
import { isWalkable, rollEncounter } from '@kanto-mmo/shared';
import { OverworldState, PlayerSchema } from '../schema/OverworldState.js';
import { loadMap } from '../mapLoader.js';
import { ROUTE1_ENCOUNTERS } from '../data/encounters.js';
import { getOrCreatePlayer } from '../playerRegistry.js';
import { createPendingEncounter } from '../pendingEncounters.js';

interface JoinOptions {
  name?: string;
  /** Client-generated id (persisted in localStorage) identifying this player across rooms/sessions. */
  playerId?: string;
}

/** A single shared-world room tracking every connected player's position on one map. */
export class OverworldRoom extends Room<OverworldState> {
  maxClients = 64;
  private map!: MapDefinition;
  private playerIds = new Map<string, string>();
  /** Sessions currently off in a BattleRoom; movement/encounters are suppressed for them. */
  private inBattle = new Set<string>();

  onCreate(): void {
    this.map = loadMap('route1');

    const state = new OverworldState();
    state.mapId = this.map.id;
    this.setState(state);

    this.onMessage('move', (client, message: MoveInput) => {
      this.handleMove(client, message);
    });

    this.onMessage('battleEnded', (client) => {
      this.inBattle.delete(client.sessionId);
    });
  }

  onJoin(client: Client, options: JoinOptions): void {
    const player = new PlayerSchema();
    player.id = client.sessionId;
    player.name = options?.name?.slice(0, 16) || `Trainer${client.sessionId.slice(0, 4)}`;
    player.x = this.map.spawn.x;
    player.y = this.map.spawn.y;
    player.direction = 'down';
    this.state.players.set(client.sessionId, player);

    const playerId = options?.playerId || client.sessionId;
    this.playerIds.set(client.sessionId, playerId);
    getOrCreatePlayer(playerId, player.name);
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.playerIds.delete(client.sessionId);
    this.inBattle.delete(client.sessionId);
  }

  /** Validates and applies a single-tile movement request from a client. */
  private handleMove(client: Client, input: MoveInput): void {
    if (this.inBattle.has(client.sessionId)) return;

    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    // Only cardinal, single-tile steps are accepted from clients; anything
    // else is ignored so a modified client can't teleport or diagonal-skip.
    const dx = Math.sign(input.dx);
    const dy = Math.sign(input.dy);
    if (dx !== 0 && dy !== 0) return;
    if (dx === 0 && dy === 0) return;

    if (dx === 1) player.direction = 'right';
    else if (dx === -1) player.direction = 'left';
    else if (dy === 1) player.direction = 'down';
    else if (dy === -1) player.direction = 'up';

    const nextX = player.x + dx;
    const nextY = player.y + dy;

    if (!isWalkable(this.map, nextX, nextY)) return;

    player.x = nextX;
    player.y = nextY;

    this.maybeTriggerEncounter(client, nextX, nextY);
  }

  /** Rolls a wild encounter if the player just stepped onto a tile type covered by an encounter table. */
  private maybeTriggerEncounter(client: Client, x: number, y: number): void {
    const tile = this.map.tiles[y]?.[x];
    if (!tile || tile.type !== ROUTE1_ENCOUNTERS.tileType) return;

    const roll = rollEncounter(ROUTE1_ENCOUNTERS);
    if (!roll) return;

    const playerId = this.playerIds.get(client.sessionId);
    if (!playerId) return;

    this.inBattle.add(client.sessionId);
    const token = createPendingEncounter(playerId, roll.speciesId, roll.level);
    client.send('encounterStart', { token, speciesId: roll.speciesId, level: roll.level });
  }
}


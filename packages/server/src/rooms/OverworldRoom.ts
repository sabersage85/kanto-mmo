import colyseus from 'colyseus';
import type { Client } from 'colyseus';
const { Room } = colyseus;
import type { MapDefinition, MoveInput } from '@kanto-mmo/shared';
import { isWalkable, rollEncounter } from '@kanto-mmo/shared';
import { OverworldState, PlayerSchema } from '../schema/OverworldState.js';
import { loadMap } from '../mapLoader.js';
import { ROUTE1_ENCOUNTERS } from '../data/encounters.js';
import { validateToken } from '../auth/authService.js';
import { getPersistenceStore } from '../persistence/store.js';
import { createPendingEncounter } from '../pendingEncounters.js';
import { flushSession, getSession, loadSession, updatePosition } from '../sessionCache.js';

interface JoinOptions {
  /** Session token issued by POST /auth/register or /auth/login. */
  token?: string;
}

interface AuthData {
  accountId: string;
}

/** A single shared-world room tracking every connected player's position on one map. */
export class OverworldRoom extends Room<OverworldState> {
  maxClients = 64;
  private map!: MapDefinition;
  private accountIds = new Map<string, string>();
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

  async onAuth(_client: Client, options: JoinOptions): Promise<AuthData> {
    const accountId = options?.token ? await validateToken(options.token) : null;
    if (!accountId) {
      throw new Error('Invalid or expired session — please log in again.');
    }
    return { accountId };
  }

  async onJoin(client: Client, _options: JoinOptions, auth?: AuthData): Promise<void> {
    if (!auth) {
      throw new Error('Invalid or expired session — please log in again.');
    }
    const store = getPersistenceStore();
    const session = await loadSession(store, auth.accountId, `Trainer${client.sessionId.slice(0, 4)}`, {
      mapId: this.map.id,
      x: this.map.spawn.x,
      y: this.map.spawn.y,
      direction: 'down',
    });

    const player = new PlayerSchema();
    player.id = client.sessionId;
    player.name = session.name;
    player.x = session.x;
    player.y = session.y;
    player.direction = session.direction;
    this.state.players.set(client.sessionId, player);

    this.accountIds.set(client.sessionId, auth.accountId);
  }

  async onLeave(client: Client, consented: boolean): Promise<void> {
    const accountId = this.accountIds.get(client.sessionId);

    if (!consented) {
      try {
        // Grace window for a dropped connection / accidental tab reload to
        // resume the SAME room seat without losing state or appearing to
        // other players as a rejoin. Only on timeout/failure do we treat
        // this as a real departure (flush + remove below).
        await this.allowReconnection(client, 30);
        return;
      } catch {
        // fell through — reconnection window expired, handle as a real leave.
      }
    }

    this.state.players.delete(client.sessionId);
    this.accountIds.delete(client.sessionId);
    this.inBattle.delete(client.sessionId);

    if (accountId) {
      await flushSession(accountId, getPersistenceStore());
    }
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

    const accountId = this.accountIds.get(client.sessionId);
    if (accountId && getSession(accountId)) {
      updatePosition(accountId, this.map.id, nextX, nextY, player.direction, getPersistenceStore());
    }

    this.maybeTriggerEncounter(client, nextX, nextY);
  }

  /** Rolls a wild encounter if the player just stepped onto a tile type covered by an encounter table. */
  private maybeTriggerEncounter(client: Client, x: number, y: number): void {
    const tile = this.map.tiles[y]?.[x];
    if (!tile || tile.type !== ROUTE1_ENCOUNTERS.tileType) return;

    const roll = rollEncounter(ROUTE1_ENCOUNTERS);
    if (!roll) return;

    const accountId = this.accountIds.get(client.sessionId);
    if (!accountId) return;

    this.inBattle.add(client.sessionId);
    const token = createPendingEncounter(accountId, roll.speciesId, roll.level);
    client.send('encounterStart', { token, speciesId: roll.speciesId, level: roll.level });
  }
}

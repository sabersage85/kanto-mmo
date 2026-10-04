import colyseus from 'colyseus';
import type { Client } from 'colyseus';
const { Room, matchMaker } = colyseus;
import type { InventorySlot, MapDefinition, MoveInput, TradeOffer } from '@kanto-mmo/shared';
import {
  applyHealToInstance,
  applyStatBoostToInstance,
  getItem,
  getQuestStageInfo,
  getSpecies,
  isWalkable,
  ITEMS,
  removeItemFromInventory,
  rollEncounter,
} from '@kanto-mmo/shared';
import { OverworldState, PlayerSchema } from '../schema/OverworldState.js';
import { findNpcAt, findWarpAt, loadMap } from '../mapLoader.js';
import { encounterTableForMap } from '../data/encounters.js';
import { findTrainerAt, trainersForMap, TRAINERS } from '../data/trainers.js';
import { interactWithNpc } from '../quest.js';
import { validateToken } from '../auth/authService.js';
import { getPersistenceStore } from '../persistence/store.js';
import { createPendingEncounter } from '../pendingEncounters.js';
import { createPendingTrainerBattle } from '../pendingTrainerBattles.js';
import {
  addInventoryItem,
  executeTradeBetween,
  flushSession,
  getBadges,
  getCurrency,
  getInventory,
  getQuestStage,
  getSession,
  hasBadge,
  loadSession,
  spendCurrency,
  updatePosition,
} from '../sessionCache.js';
import { ChallengeManager } from '../pvp/challengeManager.js';
import type { ActiveTrade } from '../trade/tradeManager.js';
import { TradeManager } from '../trade/tradeManager.js';

const DEFAULT_MAP_ID = 'hearthfield';

interface JoinOptions {
  /** Session token issued by POST /auth/register or /auth/login. */
  token?: string;
  /** Which map's room instance to join/create (Milestone 7). Defaults to the starting town. */
  mapId?: string;
}

interface AuthData {
  accountId: string;
}

/** A single shared-world room tracking every connected player's position on one map (one room instance per `mapId`, Milestone 7). */
export class OverworldRoom extends Room<OverworldState> {
  maxClients = 64;
  private map!: MapDefinition;
  private accountIds = new Map<string, string>();
  /** Sessions currently off in a BattleRoom (PvE or PvP); movement/encounters are suppressed for them. */
  private inBattle = new Set<string>();
  private challenges = new ChallengeManager();
  private trades = new TradeManager();

  onCreate(options: { mapId?: string }): void {
    this.map = loadMap(options?.mapId ?? DEFAULT_MAP_ID);

    const state = new OverworldState();
    state.mapId = this.map.id;
    this.setState(state);

    this.onMessage('move', (client, message: MoveInput) => {
      this.handleMove(client, message);
    });

    this.onMessage('battleEnded', (client) => {
      this.inBattle.delete(client.sessionId);
      const accountId = this.accountIds.get(client.sessionId);
      const player = this.state.players.get(client.sessionId);
      if (accountId && player) {
        const session = getSession(accountId);
        if (session) {
          player.wins = session.wins;
          player.losses = session.losses;
        }
      }
    });

    this.onMessage('trainerBattleEnded', (client) => {
      this.inBattle.delete(client.sessionId);
      const accountId = this.accountIds.get(client.sessionId);
      const player = this.state.players.get(client.sessionId);
      if (accountId && player) {
        const session = getSession(accountId);
        if (session) {
          player.badgeCount = this.countGymBadges(session.badges);
          client.send('trainersInfo', this.buildTrainersInfo(session.badges));
          client.send('questUpdate', this.buildQuestUpdate(accountId));
        }
      }
    });

    this.onMessage('interactNpc', (client, message: { npcId: string }) => {
      this.handleInteractNpc(client, message?.npcId);
    });

    this.onMessage('challengeRequest', (client, message: { targetSessionId: string }) => {
      this.handleChallengeRequest(client, message?.targetSessionId);
    });

    this.onMessage('challengeRespond', (client, message: { accept: boolean }) => {
      void this.handleChallengeRespond(client, Boolean(message?.accept));
    });

    this.onMessage('useItem', (client, message: { itemId: number; instanceId: string }) => {
      this.handleUseItem(client, message?.itemId, message?.instanceId);
    });

    this.onMessage('shopBuy', (client, message: { itemId: number; quantity?: number }) => {
      this.handleShopBuy(client, message?.itemId, message?.quantity ?? 1);
    });

    this.onMessage('tradeRequest', (client, message: { targetSessionId: string }) => {
      this.handleTradeRequest(client, message?.targetSessionId);
    });

    this.onMessage('tradeRespond', (client, message: { accept: boolean }) => {
      this.handleTradeRespond(client, Boolean(message?.accept));
    });

    this.onMessage(
      'tradeOfferUpdate',
      (client, message: { items?: InventorySlot[]; creatureInstanceIds?: string[] }) => {
        this.handleTradeOfferUpdate(client, message);
      },
    );

    this.onMessage('tradeConfirm', (client) => {
      this.handleTradeConfirm(client);
    });

    this.onMessage('tradeCancel', (client) => {
      this.handleTradeCancel(client);
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
    player.wins = session.wins;
    player.losses = session.losses;
    player.badgeCount = this.countGymBadges(session.badges);
    this.state.players.set(client.sessionId, player);

    this.accountIds.set(client.sessionId, auth.accountId);

    client.send('inventoryUpdate', {
      inventory: session.inventory,
      currency: session.currency,
      party: session.party,
      storage: session.storage,
    });

    client.send('trainersInfo', this.buildTrainersInfo(session.badges));
    client.send('npcsInfo', { npcs: this.map.npcs ?? [] });
    client.send('warpsInfo', { warps: this.map.warps ?? [] });
    client.send('questUpdate', this.buildQuestUpdate(auth.accountId));
  }

  /** Builds the `trainersInfo` payload (THIS map's trainers only + per-account defeated status) sent on join and after each trainer battle. */
  private buildTrainersInfo(badges: string[]): { trainers: Array<Record<string, unknown>> } {
    return {
      trainers: trainersForMap(this.map.id).map((trainer) => ({
        id: trainer.id,
        name: trainer.name,
        themeType: trainer.themeType,
        kind: trainer.kind,
        position: trainer.position,
        badgeName: trainer.badgeName,
        defeated: badges.includes(trainer.badgeId),
      })),
    };
  }

  /** Only `kind: 'gym'` wins count toward the client's badge counter — rival/grunt wins use the same badge-tracking mechanism but are narrative, not progression gates. */
  private countGymBadges(badges: string[]): number {
    return TRAINERS.filter((t) => t.kind === 'gym' && badges.includes(t.badgeId)).length;
  }

  /** Builds the `questUpdate` payload (current Murk Crew stage + display info) sent on join and whenever it might have changed. */
  private buildQuestUpdate(accountId: string): { stage: number; title: string; description: string } {
    const stage = getQuestStage(accountId);
    const info = getQuestStageInfo(stage);
    return { stage, title: info.title, description: info.description };
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
    this.challenges.cancelInvolving(client.sessionId);

    const cancelledTrade = this.trades.cancelInvolving(client.sessionId);
    if (cancelledTrade) {
      const otherSessionId = cancelledTrade.sideA === client.sessionId ? cancelledTrade.sideB : cancelledTrade.sideA;
      this.inBattle.delete(otherSessionId);
      this.clients.getById(otherSessionId)?.send('tradeCancelled', {});
    }

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

    const accountId = this.accountIds.get(client.sessionId);

    // Trainer-gate check (Milestone 6, now map-scoped since Milestone 7):
    // a trainer's own tile acts as its gate — stepping onto it either
    // triggers the mandatory battle (badge not yet earned, move rejected)
    // or behaves as ordinary terrain (badge already earned, falls through
    // to the normal walkability check below, since every trainer stands
    // on an otherwise-walkable tile).
    const trainer = findTrainerAt(this.map.id, nextX, nextY);
    if (trainer && accountId && !hasBadge(accountId, trainer.badgeId)) {
      this.triggerTrainerBattle(client, trainer.id, trainer.greeting);
      return;
    }

    // NPC tiles (Milestone 7) are permanent, always-blocking fixtures: a
    // bump never moves the player onto them, it just triggers dialogue.
    const npc = findNpcAt(this.map, nextX, nextY);
    if (npc && accountId) {
      const result = interactWithNpc(npc.id, npc.name, accountId, getBadges(accountId), getPersistenceStore());
      client.send('npcDialogue', { npcId: npc.id, name: result.name, lines: result.lines });
      if (result.questAdvanced) client.send('questUpdate', this.buildQuestUpdate(accountId));
      return;
    }

    // Warp tiles (Milestone 7): stepping onto one moves the player to a
    // different map's OverworldRoom instead of completing the move here.
    const warp = findWarpAt(this.map, nextX, nextY);
    if (warp && accountId) {
      updatePosition(accountId, warp.targetMapId, warp.targetX, warp.targetY, player.direction, getPersistenceStore());
      client.send('warp', { mapId: warp.targetMapId, x: warp.targetX, y: warp.targetY, direction: player.direction });
      return;
    }

    if (!isWalkable(this.map, nextX, nextY)) return;

    player.x = nextX;
    player.y = nextY;

    if (accountId && getSession(accountId)) {
      updatePosition(accountId, this.map.id, nextX, nextY, player.direction, getPersistenceStore());
    }

    this.maybeTriggerEncounter(client, nextX, nextY);
    this.maybeTriggerShop(client, nextX, nextY);
  }

  /** Starts a mandatory NPC trainer battle when the player's move would step onto that trainer's (not-yet-defeated) tile. */
  private triggerTrainerBattle(client: Client, trainerId: string, greeting?: string): void {
    const accountId = this.accountIds.get(client.sessionId);
    if (!accountId) return;

    this.inBattle.add(client.sessionId);
    const token = createPendingTrainerBattle(accountId, trainerId);
    client.send('trainerBattleStart', { token, trainerId, greeting });
  }

  /** Called from the client's explicit "interact" key in addition to the automatic bump-trigger in `handleMove`. */
  private handleInteractNpc(client: Client, npcId: string | undefined): void {
    if (!npcId) return;
    const accountId = this.accountIds.get(client.sessionId);
    if (!accountId) return;
    const npc = (this.map.npcs ?? []).find((n) => n.id === npcId);
    if (!npc) return;

    const result = interactWithNpc(npc.id, npc.name, accountId, getBadges(accountId), getPersistenceStore());
    client.send('npcDialogue', { npcId: npc.id, name: result.name, lines: result.lines });
    if (result.questAdvanced) client.send('questUpdate', this.buildQuestUpdate(accountId));
  }

  /** Rolls a wild encounter if the player just stepped onto a tile type covered by this map's encounter table. */
  private maybeTriggerEncounter(client: Client, x: number, y: number): void {
    const table = encounterTableForMap(this.map.id);
    if (!table) return;
    const tile = this.map.tiles[y]?.[x];
    if (!tile || tile.type !== table.tileType) return;

    const roll = rollEncounter(table);
    if (!roll) return;

    const accountId = this.accountIds.get(client.sessionId);
    if (!accountId) return;

    this.inBattle.add(client.sessionId);
    const token = createPendingEncounter(accountId, roll.speciesId, roll.level);
    client.send('encounterStart', { token, speciesId: roll.speciesId, level: roll.level });
  }

  /** Notifies the client it can open the shop UI when it steps onto a 'shop' tile. */
  private maybeTriggerShop(client: Client, x: number, y: number): void {
    const tile = this.map.tiles[y]?.[x];
    if (!tile || tile.type !== 'shop') return;
    client.send('shopAvailable', { catalog: ITEMS });
  }

  /** Uses a healing or stat-boost item on a party creature from the overworld menu. Capture items are battle-only. */
  private handleUseItem(client: Client, itemId: number | undefined, instanceId: string | undefined): void {
    if (this.inBattle.has(client.sessionId)) return;
    if (!itemId || !instanceId) return;

    const accountId = this.accountIds.get(client.sessionId);
    if (!accountId) return;
    const session = getSession(accountId);
    if (!session) return;

    let item;
    try {
      item = getItem(itemId);
    } catch {
      client.send('itemUseError', { reason: 'Unknown item.' });
      return;
    }
    if (item.category === 'capture') {
      client.send('itemUseError', { reason: 'Capture tools can only be used during a wild battle.' });
      return;
    }

    const partyIndex = session.party.findIndex((c) => c.instanceId === instanceId);
    if (partyIndex < 0) {
      client.send('itemUseError', { reason: 'That creature is not in your party.' });
      return;
    }

    const store = getPersistenceStore();
    const removed = removeItemFromInventory(getInventory(accountId), itemId, 1);
    if (!removed.success) {
      client.send('itemUseError', { reason: "You don't have any of that item." });
      return;
    }

    const creature = session.party[partyIndex];
    const species = getSpecies(creature.speciesId);
    let updated = creature;
    if (item.effect.kind === 'heal') {
      updated = applyHealToInstance(creature, species, item.effect.amount);
    } else if (item.effect.kind === 'statBoost') {
      updated = applyStatBoostToInstance(creature, item.effect.stat, item.effect.amount).instance;
    }

    session.party = session.party.map((c, i) => (i === partyIndex ? updated : c));
    void store.saveParty(accountId, session.party).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error(`[OverworldRoom] failed to persist party after item use for ${accountId}:`, err);
    });

    session.inventory = removed.items;
    void store.saveInventory(accountId, session.inventory).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error(`[OverworldRoom] failed to persist inventory for ${accountId}:`, err);
    });

    client.send('itemUseResult', { instanceId, creature: updated, inventory: session.inventory, party: session.party });
  }

  /** Buys `quantity` of a shop item, deducting currency and adding it to the player's inventory. */
  private handleShopBuy(client: Client, itemId: number | undefined, quantity: number): void {
    if (!itemId || quantity <= 0) return;
    const accountId = this.accountIds.get(client.sessionId);
    if (!accountId) return;

    let item;
    try {
      item = getItem(itemId);
    } catch {
      client.send('shopError', { reason: 'Unknown item.' });
      return;
    }

    const store = getPersistenceStore();
    const totalCost = item.price * quantity;
    if (!spendCurrency(accountId, totalCost, store)) {
      client.send('shopError', { reason: 'Not enough currency.' });
      return;
    }

    const inventory = addInventoryItem(accountId, itemId, quantity, store);
    client.send('shopBuyResult', { itemId, quantity, inventory, currency: getCurrency(accountId) });
  }

  /** A player requests to challenge another connected player to a PvP battle. */
  private handleChallengeRequest(client: Client, targetSessionId: string | undefined): void {
    if (!targetSessionId) return;
    if (this.inBattle.has(client.sessionId)) {
      client.send('challengeError', { reason: 'You are already in a battle.' });
      return;
    }
    const target = this.state.players.get(targetSessionId);
    if (!target || !this.state.players.has(client.sessionId)) {
      client.send('challengeError', { reason: 'That trainer is no longer online.' });
      return;
    }
    if (this.inBattle.has(targetSessionId)) {
      client.send('challengeError', { reason: 'That trainer is already in a battle.' });
      return;
    }

    const result = this.challenges.challenge(client.sessionId, targetSessionId);
    if (!result.ok) {
      client.send('challengeError', { reason: result.reason });
      return;
    }

    const challenger = this.state.players.get(client.sessionId);
    const targetClient = this.clients.getById(targetSessionId);
    targetClient?.send('challengeIncoming', {
      fromSessionId: client.sessionId,
      fromName: challenger?.name ?? 'A trainer',
    });
  }

  /** The challenged player accepts or declines a pending incoming challenge. */
  private async handleChallengeRespond(client: Client, accept: boolean): Promise<void> {
    const response = this.challenges.respond(client.sessionId, accept);
    if (!response) {
      client.send('challengeError', { reason: 'That challenge has expired.' });
      return;
    }

    const challengerClient = this.clients.getById(response.fromSessionId);
    if (!accept) {
      challengerClient?.send('challengeDeclined', { bySessionId: client.sessionId });
      return;
    }

    if (!challengerClient) {
      client.send('challengeError', { reason: 'That trainer disconnected before you accepted.' });
      return;
    }
    if (this.inBattle.has(response.fromSessionId) || this.inBattle.has(client.sessionId)) {
      client.send('challengeError', { reason: 'One of you is already in a battle.' });
      challengerClient.send('challengeError', { reason: 'One of you is already in a battle.' });
      return;
    }

    await this.startPvpMatch(challengerClient, client);
  }

  /** Creates a dedicated PvpBattleRoom for an accepted challenge and notifies both clients how to join it. */
  private async startPvpMatch(challengerClient: Client, opponentClient: Client): Promise<void> {
    const challengerAccountId = this.accountIds.get(challengerClient.sessionId);
    const opponentAccountId = this.accountIds.get(opponentClient.sessionId);
    const challengerPlayer = this.state.players.get(challengerClient.sessionId);
    const opponentPlayer = this.state.players.get(opponentClient.sessionId);

    if (!challengerAccountId || !opponentAccountId || !challengerPlayer || !opponentPlayer) {
      challengerClient.send('challengeError', { reason: 'Failed to start the battle. Please try again.' });
      opponentClient.send('challengeError', { reason: 'Failed to start the battle. Please try again.' });
      return;
    }

    try {
      const listing = await matchMaker.createRoom('pvpBattle', {
        challengerAccountId,
        opponentAccountId,
        challengerName: challengerPlayer.name,
        opponentName: opponentPlayer.name,
      });

      this.inBattle.add(challengerClient.sessionId);
      this.inBattle.add(opponentClient.sessionId);
      challengerClient.send('pvpBattleStart', { roomId: listing.roomId, opponentName: opponentPlayer.name });
      opponentClient.send('pvpBattleStart', { roomId: listing.roomId, opponentName: challengerPlayer.name });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[OverworldRoom] failed to create pvpBattle room:', err);
      challengerClient.send('challengeError', { reason: 'Failed to start the battle. Please try again.' });
      opponentClient.send('challengeError', { reason: 'Failed to start the battle. Please try again.' });
    }
  }

  /** A player requests to trade with another connected player (Milestone 5). */
  private handleTradeRequest(client: Client, targetSessionId: string | undefined): void {
    if (!targetSessionId) return;
    if (this.inBattle.has(client.sessionId)) {
      client.send('tradeError', { reason: 'You are already busy.' });
      return;
    }
    const target = this.state.players.get(targetSessionId);
    if (!target || !this.state.players.has(client.sessionId)) {
      client.send('tradeError', { reason: 'That trainer is no longer online.' });
      return;
    }
    if (this.inBattle.has(targetSessionId)) {
      client.send('tradeError', { reason: 'That trainer is busy.' });
      return;
    }

    const result = this.trades.request(client.sessionId, targetSessionId);
    if (!result.ok) {
      client.send('tradeError', { reason: result.reason });
      return;
    }

    const requester = this.state.players.get(client.sessionId);
    const targetClient = this.clients.getById(targetSessionId);
    targetClient?.send('tradeIncoming', {
      fromSessionId: client.sessionId,
      fromName: requester?.name ?? 'A trainer',
    });
  }

  /** The requested player accepts or declines a pending incoming trade request. */
  private handleTradeRespond(client: Client, accept: boolean): void {
    const response = this.trades.respond(client.sessionId, accept);
    if (!response) {
      client.send('tradeError', { reason: 'That trade request has expired.' });
      return;
    }

    const requesterClient = this.clients.getById(response.fromSessionId);
    if (!accept) {
      requesterClient?.send('tradeDeclined', { bySessionId: client.sessionId });
      return;
    }

    if (!requesterClient || !response.trade) {
      client.send('tradeError', { reason: 'That trainer disconnected before you accepted.' });
      return;
    }
    if (this.inBattle.has(response.fromSessionId) || this.inBattle.has(client.sessionId)) {
      client.send('tradeError', { reason: 'One of you is already busy.' });
      requesterClient.send('tradeError', { reason: 'One of you is already busy.' });
      this.trades.endTrade(response.trade.id);
      return;
    }

    this.inBattle.add(response.fromSessionId);
    this.inBattle.add(client.sessionId);

    const requesterName = this.state.players.get(response.fromSessionId)?.name ?? 'A trainer';
    const accepterName = this.state.players.get(client.sessionId)?.name ?? 'A trainer';

    requesterClient.send('tradeStarted', {
      tradeId: response.trade.id,
      opponentName: accepterName,
      isSideA: true,
    });
    client.send('tradeStarted', {
      tradeId: response.trade.id,
      opponentName: requesterName,
      isSideA: false,
    });
  }

  /** Updates the sending side's trade offer; any change resets both sides' confirmations. */
  private handleTradeOfferUpdate(
    client: Client,
    message: { items?: InventorySlot[]; creatureInstanceIds?: string[] },
  ): void {
    const offer: TradeOffer = {
      items: Array.isArray(message?.items) ? message.items : [],
      creatureInstanceIds: Array.isArray(message?.creatureInstanceIds) ? message.creatureInstanceIds : [],
    };
    const trade = this.trades.updateOffer(client.sessionId, offer);
    if (!trade) return;
    this.broadcastTradeState(trade);
  }

  /** Marks the sending side confirmed; executes the atomic swap once both sides have confirmed. */
  private handleTradeConfirm(client: Client): void {
    const trade = this.trades.confirm(client.sessionId);
    if (!trade) return;
    this.broadcastTradeState(trade);
    if (!this.trades.isBothConfirmed(trade)) return;

    const clientA = this.clients.getById(trade.sideA);
    const clientB = this.clients.getById(trade.sideB);
    const accountA = this.accountIds.get(trade.sideA);
    const accountB = this.accountIds.get(trade.sideB);

    if (!accountA || !accountB) {
      this.failTrade(trade, clientA, clientB, 'Trade failed — one of you disconnected.');
      return;
    }

    const store = getPersistenceStore();
    const result = executeTradeBetween(accountA, trade.offerA, accountB, trade.offerB, store);
    if (!result.success) {
      this.failTrade(trade, clientA, clientB, result.reason);
      return;
    }

    this.inBattle.delete(trade.sideA);
    this.inBattle.delete(trade.sideB);
    this.trades.endTrade(trade.id);

    const sessionA = getSession(accountA);
    const sessionB = getSession(accountB);
    clientA?.send('tradeResult', {
      success: true,
      inventory: sessionA?.inventory ?? [],
      party: sessionA?.party ?? [],
      storage: sessionA?.storage ?? [],
    });
    clientB?.send('tradeResult', {
      success: true,
      inventory: sessionB?.inventory ?? [],
      party: sessionB?.party ?? [],
      storage: sessionB?.storage ?? [],
    });
  }

  /** Resets confirmations (so both sides can adjust and retry) and notifies both of why the swap didn't execute. */
  private failTrade(trade: ActiveTrade, clientA: Client | undefined, clientB: Client | undefined, reason: string): void {
    this.trades.resetConfirmations(trade.id);
    this.broadcastTradeState(trade);
    clientA?.send('tradeError', { reason });
    clientB?.send('tradeError', { reason });
  }

  /** Either side cancels an in-progress trade negotiation. */
  private handleTradeCancel(client: Client): void {
    const trade = this.trades.getActiveTradeFor(client.sessionId);
    if (!trade) return;
    this.trades.endTrade(trade.id);
    this.inBattle.delete(trade.sideA);
    this.inBattle.delete(trade.sideB);
    const otherSessionId = trade.sideA === client.sessionId ? trade.sideB : trade.sideA;
    this.clients.getById(otherSessionId)?.send('tradeCancelled', {});
    client.send('tradeCancelled', {});
  }

  private broadcastTradeState(trade: ActiveTrade): void {
    const accountA = this.accountIds.get(trade.sideA);
    const accountB = this.accountIds.get(trade.sideB);
    const payload = {
      tradeId: trade.id,
      offerA: trade.offerA,
      offerB: trade.offerB,
      offerACreatures: accountA ? this.resolveOfferedCreatures(accountA, trade.offerA) : [],
      offerBCreatures: accountB ? this.resolveOfferedCreatures(accountB, trade.offerB) : [],
      confirmedA: trade.confirmedA,
      confirmedB: trade.confirmedB,
    };
    this.clients.getById(trade.sideA)?.send('tradeUpdate', payload);
    this.clients.getById(trade.sideB)?.send('tradeUpdate', payload);
  }

  /** Resolves offered creature instance ids into full `CreatureInstance` objects (from party or storage) for client display. */
  private resolveOfferedCreatures(accountId: string, offer: TradeOffer) {
    const session = getSession(accountId);
    if (!session) return [];
    const byId = new Map([...session.party, ...session.storage].map((c) => [c.instanceId, c] as const));
    return offer.creatureInstanceIds.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  }
}

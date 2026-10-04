import Phaser from 'phaser';
import type { CreatureInstance, InventorySlot, ItemDefinition, MapDefinition, MoveInput, TradeOffer } from '@kanto-mmo/shared';
import type { Room } from 'colyseus.js';
import { clearStoredSession, fetchMap, joinOverworld } from '../net.js';
import { hideChallengeOverlay, showChallengeOverlay } from '../ui/challengeOverlay.js';
import {
  hideInventoryPanel,
  isInventoryPanelOpen,
  showInventoryPanel,
  updateInventoryPanel,
} from '../ui/inventoryPanel.js';
import { hideShopOverlay, showShopOverlay, updateShopCurrency } from '../ui/shopOverlay.js';
import { hideTradeRequestOverlay, showTradeRequestOverlay } from '../ui/tradeRequestOverlay.js';
import { hideTradePanel, showTradePanel, showTradeResultBanner, updateTradePanelState } from '../ui/tradePanel.js';
import { hideDialogue, showDialogue } from '../ui/dialogueBox.js';
import { hideQuestLog, isQuestLogOpen, showQuestLog, updateQuestLog } from '../ui/questLog.js';

/** Placeholder colors standing in for real tile art (no copied assets). */
const TILE_COLORS: Record<string, number> = {
  grass: 0x3fae4f,
  tree: 0x1f6e2d,
  water: 0x2a6fd6,
  path: 0xc8a765,
  shop: 0xb04fd6,
};

const LOCAL_PLAYER_COLOR = 0x4fa8ff;
const REMOTE_PLAYER_COLOR = 0xff8a3d;
const MOVE_REPEAT_MS = 160;

/**
 * Minimal structural shape of the networked PlayerSchema we care about
 * client-side; avoids a hard dependency from @kanto-mmo/client on the
 * server package just to get a type.
 */
interface NetworkedPlayer {
  x: number;
  y: number;
  name: string;
  wins: number;
  losses: number;
  badgeCount: number;
  onChange(callback: () => void): void;
}

interface PlayerVisual {
  rect: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

interface EncounterStartMessage {
  token: string;
  speciesId: number;
  level: number;
}

interface ChallengeIncomingMessage {
  fromSessionId: string;
  fromName: string;
}

interface ChallengeErrorMessage {
  reason: string;
}

interface InventoryUpdateMessage {
  inventory: InventorySlot[];
  currency: number;
  party: CreatureInstance[];
  storage?: CreatureInstance[];
}

interface ShopAvailableMessage {
  catalog: ItemDefinition[];
}

interface ShopBuyResultMessage {
  itemId: number;
  quantity: number;
  inventory: InventorySlot[];
  currency: number;
}

interface ItemUseResultMessage {
  instanceId: string;
  creature: CreatureInstance;
  inventory: InventorySlot[];
  party: CreatureInstance[];
}

interface ItemUseErrorMessage {
  reason: string;
}

interface ShopErrorMessage {
  reason: string;
}

interface TradeIncomingMessage {
  fromSessionId: string;
  fromName: string;
}

interface TradeErrorMessage {
  reason: string;
}

interface TradeStartedMessage {
  tradeId: string;
  opponentName: string;
  isSideA: boolean;
}

interface TradeUpdateMessage {
  tradeId: string;
  offerA: TradeOffer;
  offerB: TradeOffer;
  offerACreatures: CreatureInstance[];
  offerBCreatures: CreatureInstance[];
  confirmedA: boolean;
  confirmedB: boolean;
}

interface TradeResultMessage {
  success: boolean;
  inventory: InventorySlot[];
  party: CreatureInstance[];
  storage: CreatureInstance[];
}

interface PvpBattleStartMessage {
  roomId: string;
  opponentName: string;
}

interface TrainerInfo {
  id: string;
  name: string;
  themeType: string;
  kind: 'gym' | 'rival' | 'grunt';
  position: { x: number; y: number };
  badgeName: string;
  defeated: boolean;
}

interface TrainersInfoMessage {
  trainers: TrainerInfo[];
}

interface TrainerBattleStartMessage {
  token: string;
  trainerId: string;
  greeting?: string;
}

interface NpcInfo {
  id: string;
  name: string;
  kind: 'flavor' | 'quest';
  position: { x: number; y: number };
}

interface NpcsInfoMessage {
  npcs: NpcInfo[];
}

interface NpcDialogueMessage {
  npcId: string;
  name: string;
  lines: string[];
}

interface QuestUpdateMessage {
  stage: number;
  title: string;
  description: string;
}

interface WarpMessage {
  mapId: string;
  x: number;
  y: number;
  direction: string;
}

/** Distinct placeholder shape colors per trainer theme type (no copied assets). */
const TRAINER_THEME_COLORS: Record<string, number> = {
  Rock: 0x8a7a5c,
  Water: 0x2a9fd6,
  Fire: 0xe0552b,
};
/** Rival/grunt trainers (Milestone 7) are colored by their narrative role rather than battle theme type. */
const TRAINER_KIND_COLORS: Partial<Record<TrainerInfo['kind'], number>> = {
  rival: 0x2ecc71,
  grunt: 0x4a3a5a,
};
const TRAINER_DEFEATED_COLOR = 0x555555;
const NPC_FLAVOR_COLOR = 0x999999;
const NPC_QUEST_COLOR = 0xffd166;

/** Data passed back in when resuming this scene after a battle ends, or in on first boot from main.ts. */
interface OverworldResumeData {
  room?: Room;
  map?: MapDefinition;
  /** Present on first boot (from main.ts) and when resuming after a battle; absent only if something went wrong. */
  sessionToken?: string;
  name?: string;
  /** First-boot only: which map's room to join (resolved via `/players/me/map`). */
  mapId?: string;
  /** Set when transitioning via a warp (a brand-new room/map, as opposed to resuming the same room after a battle) so trainer/NPC caches get cleared instead of carried over from the previous map. */
  isNewMap?: boolean;
}

export class OverworldScene extends Phaser.Scene {
  private map!: MapDefinition;
  private room!: Room;
  private resumeData: OverworldResumeData = {};
  private sessionToken = '';
  private playerVisuals = new Map<string, PlayerVisual>();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private lastMoveAt = 0;
  private recordText!: Phaser.GameObjects.Text;
  /**
   * Colyseus state-collection listeners (onAdd/onRemove/onMessage) must
   * only ever be attached once per Room instance, even though this scene's
   * create() re-runs every time we return here from a battle.
   */
  private listenersAttached = false;
  /** Client-side cache of the player's inventory/currency/party, kept in sync via server messages. */
  private inventory: InventorySlot[] = [];
  private currency = 0;
  private party: CreatureInstance[] = [];
  private storage: CreatureInstance[] = [];
  private inventoryKey!: Phaser.Input.Keyboard.Key;
  private questKey!: Phaser.Input.Keyboard.Key;
  /** Tracks which side of the active trade we are, so incoming `tradeUpdate` broadcasts can be mapped to "mine"/"theirs". */
  private activeTradeIsSideA = false;
  private trainerVisuals = new Map<string, PlayerVisual>();
  private trainerInfoById = new Map<string, TrainerInfo>();
  private npcVisuals = new Map<string, PlayerVisual>();
  private npcInfoById = new Map<string, NpcInfo>();
  private badgeText!: Phaser.GameObjects.Text;


  constructor() {
    super('overworld');
  }

  init(data: OverworldResumeData): void {
    this.resumeData = data ?? {};
  }

  async create(): Promise<void> {
    this.playerVisuals = new Map();
    this.trainerVisuals = new Map();
    this.npcVisuals = new Map();
    this.sessionToken = this.resumeData.sessionToken ?? this.sessionToken;

    // A brand-new room (first boot, or just warped to a different map's
    // OverworldRoom instance) means the previous map's trainer/NPC caches
    // are stale and must be cleared — they get freshly repopulated by the
    // new room's `trainersInfo`/`npcsInfo` messages below. Resuming the
    // *same* room after a battle (no `isNewMap` flag) keeps them as-is,
    // since the server won't resend them on a mere scene restart.
    if (!this.resumeData.room || this.resumeData.isNewMap) {
      this.trainerInfoById.clear();
      this.npcInfoById.clear();
    }

    if (this.resumeData.room && this.resumeData.map) {
      this.room = this.resumeData.room;
      this.map = this.resumeData.map;
    } else {
      const statusText = this.add.text(16, 16, 'Connecting to server...', {
        color: '#ffffff',
        fontFamily: 'monospace',
      });

      if (!this.sessionToken) {
        this.handleAuthFailure('No session found — please log in again.');
        return;
      }

      const mapId = this.resumeData.mapId ?? 'hearthfield';
      this.map = (await fetchMap(mapId)) as MapDefinition;
      try {
        this.room = await joinOverworld(this.sessionToken, mapId);
      } catch (err) {
        this.handleAuthFailure(err instanceof Error ? err.message : 'Failed to connect.');
        return;
      }
      statusText.setText(`Connected as ${this.resumeData.name ?? 'Trainer'}`);
    }

    this.drawMap();

    this.recordText = this.add.text(16, 36, '', {
      color: '#ffe066',
      fontFamily: 'monospace',
      fontSize: '12px',
    });

    this.badgeText = this.add.text(16, 50, '', {
      color: '#b388ff',
      fontFamily: 'monospace',
      fontSize: '12px',
    });

    // (Re)create trainer/NPC visuals every time this scene is (re)created,
    // mirroring player visuals, since this.trainerInfoById/npcInfoById
    // already hold the latest snapshot across a battle round-trip (cleared
    // above only on an actual map change).
    this.trainerInfoById.forEach((trainer) => this.registerTrainerVisual(trainer));
    this.npcInfoById.forEach((npc) => this.registerNpcVisual(npc));

    // (Re)create a visual for every player already known to the room,
    // since Phaser destroys this scene's game objects whenever we leave
    // for a battle and recreates them when we return.
    this.room.state.players.forEach((player: NetworkedPlayer, sessionId: string) => {
      this.registerPlayerVisual(sessionId, player);
    });

    if (!this.listenersAttached) {
      this.listenersAttached = true;

      this.room.state.players.onAdd((player: NetworkedPlayer, sessionId: string) => {
        if (this.playerVisuals.has(sessionId)) return;
        this.registerPlayerVisual(sessionId, player);
      });

      this.room.state.players.onRemove((_player: NetworkedPlayer, sessionId: string) => {
        const v = this.playerVisuals.get(sessionId);
        if (v) {
          v.rect.destroy();
          v.label.destroy();
        }
        this.playerVisuals.delete(sessionId);
      });

      this.room.onMessage('encounterStart', (message: EncounterStartMessage) => {
        hideInventoryPanel();
        hideShopOverlay();
        hideTradePanel();
        hideDialogue();
        this.scene.start('battle', {
          encounterToken: message.token,
          sessionToken: this.sessionToken,
          overworldRoom: this.room,
          map: this.map,
          inventory: this.inventory,
        });
      });

      this.room.onMessage('challengeIncoming', (message: ChallengeIncomingMessage) => {
        showChallengeOverlay(message.fromName, (accept) => {
          this.room.send('challengeRespond', { accept });
        });
      });

      this.room.onMessage('challengeDeclined', () => {
        this.showTransientMessage('Challenge declined.');
      });

      this.room.onMessage('challengeError', (message: ChallengeErrorMessage) => {
        this.showTransientMessage(message.reason);
      });

      this.room.onMessage('pvpBattleStart', (message: PvpBattleStartMessage) => {
        hideChallengeOverlay();
        hideDialogue();
        this.scene.start('pvpBattle', {
          roomId: message.roomId,
          opponentName: message.opponentName,
          sessionToken: this.sessionToken,
          overworldRoom: this.room,
          map: this.map,
        });
      });

      this.room.onMessage('trainersInfo', (message: TrainersInfoMessage) => {
        for (const trainer of message.trainers) {
          this.trainerInfoById.set(trainer.id, trainer);
          this.registerTrainerVisual(trainer);
        }
      });

      this.room.onMessage('npcsInfo', (message: NpcsInfoMessage) => {
        for (const npc of message.npcs) {
          this.npcInfoById.set(npc.id, npc);
          this.registerNpcVisual(npc);
        }
      });

      this.room.onMessage('npcDialogue', (message: NpcDialogueMessage) => {
        showDialogue(message.name, message.lines);
      });

      this.room.onMessage('questUpdate', (message: QuestUpdateMessage) => {
        updateQuestLog(message.stage, message.title, message.description);
      });

      this.room.onMessage('warp', (message: WarpMessage) => {
        void this.handleWarp(message);
      });

      this.room.onMessage('trainerBattleStart', (message: TrainerBattleStartMessage) => {
        hideInventoryPanel();
        hideShopOverlay();
        hideTradePanel();
        hideDialogue();
        if (message.greeting) this.showTransientMessage(message.greeting);
        this.scene.start('trainerBattle', {
          trainerBattleToken: message.token,
          sessionToken: this.sessionToken,
          overworldRoom: this.room,
          map: this.map,
          inventory: this.inventory,
        });
      });

      this.room.onMessage('inventoryUpdate', (message: InventoryUpdateMessage) => {
        this.inventory = message.inventory;
        this.currency = message.currency;
        this.party = message.party;
        this.storage = message.storage ?? this.storage;
        updateInventoryPanel({ inventory: this.inventory, currency: this.currency, party: this.party });
      });

      this.room.onMessage('shopAvailable', (message: ShopAvailableMessage) => {
        showShopOverlay(message.catalog, this.currency, (itemId) => {
          this.room.send('shopBuy', { itemId, quantity: 1 });
        });
      });

      this.room.onMessage('shopBuyResult', (message: ShopBuyResultMessage) => {
        this.inventory = message.inventory;
        this.currency = message.currency;
        updateShopCurrency(this.currency);
        updateInventoryPanel({ inventory: this.inventory, currency: this.currency });
        this.showTransientMessage(`Bought ${message.quantity}x item.`);
      });

      this.room.onMessage('shopError', (message: ShopErrorMessage) => {
        this.showTransientMessage(message.reason);
      });

      this.room.onMessage('itemUseResult', (message: ItemUseResultMessage) => {
        this.inventory = message.inventory;
        this.party = message.party;
        updateInventoryPanel({ inventory: this.inventory, party: this.party });
        this.showTransientMessage('Item used.');
      });

      this.room.onMessage('itemUseError', (message: ItemUseErrorMessage) => {
        this.showTransientMessage(message.reason);
      });

      this.room.onMessage('tradeIncoming', (message: TradeIncomingMessage) => {
        showTradeRequestOverlay(message.fromName, (accept) => {
          this.room.send('tradeRespond', { accept });
        });
      });

      this.room.onMessage('tradeDeclined', () => {
        this.showTransientMessage('Trade declined.');
      });

      this.room.onMessage('tradeError', (message: TradeErrorMessage) => {
        this.showTransientMessage(message.reason);
      });

      this.room.onMessage('tradeStarted', (message: TradeStartedMessage) => {
        hideTradeRequestOverlay();
        this.activeTradeIsSideA = message.isSideA;
        showTradePanel(
          { opponentName: message.opponentName, inventory: this.inventory, party: this.party, storage: this.storage },
          {
            onOfferChange: (offer) => this.room.send('tradeOfferUpdate', offer),
            onConfirm: () => this.room.send('tradeConfirm'),
            onCancel: () => this.room.send('tradeCancel'),
          },
        );
      });

      this.room.onMessage('tradeUpdate', (message: TradeUpdateMessage) => {
        const mine = this.activeTradeIsSideA
          ? { offer: message.offerA, confirmed: message.confirmedA }
          : { offer: message.offerB, confirmed: message.confirmedB };
        const theirs = this.activeTradeIsSideA
          ? { offer: message.offerB, creatures: message.offerBCreatures, confirmed: message.confirmedB }
          : { offer: message.offerA, creatures: message.offerACreatures, confirmed: message.confirmedA };
        updateTradePanelState({
          myOffer: mine.offer,
          myConfirmed: mine.confirmed,
          theirOffer: theirs.offer,
          theirOfferCreatures: theirs.creatures,
          theirConfirmed: theirs.confirmed,
        });
      });

      this.room.onMessage('tradeResult', (message: TradeResultMessage) => {
        this.inventory = message.inventory;
        this.party = message.party;
        this.storage = message.storage;
        updateInventoryPanel({ inventory: this.inventory, party: this.party });
        showTradeResultBanner(message.success ? 'Trade complete!' : 'Trade failed.', hideTradePanel);
      });

      this.room.onMessage('tradeCancelled', () => {
        showTradeResultBanner('Trade cancelled.', hideTradePanel);
      });
    }

    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.cursors = keyboard.createCursorKeys();
      this.wasd = {
        up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
      this.inventoryKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I);
      this.inventoryKey.on('down', () => this.toggleInventoryPanel());
      this.questKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
      this.questKey.on('down', () => this.toggleQuestLog());
    }

    this.add.text(16, 332, '[I] Inventory · [Q] Quest Log', { color: '#888888', fontFamily: 'monospace', fontSize: '11px' });
    this.add.text(16, 346, 'Click: challenge · Shift+Click: trade', {
      color: '#888888',
      fontFamily: 'monospace',
      fontSize: '11px',
    });
  }

  private toggleInventoryPanel(): void {
    if (isInventoryPanelOpen()) {
      hideInventoryPanel();
      return;
    }
    showInventoryPanel(
      { inventory: this.inventory, party: this.party, currency: this.currency },
      (itemId, instanceId) => {
        this.room.send('useItem', { itemId, instanceId });
      },
    );
  }

  private toggleQuestLog(): void {
    if (isQuestLogOpen()) {
      hideQuestLog();
      return;
    }
    showQuestLog();
  }

  /**
   * Resolves and switches into the destination map's OverworldRoom after
   * a server-driven warp. Joins the new room before leaving the old one
   * so a failed join doesn't strand the player with no room at all.
   */
  private async handleWarp(message: WarpMessage): Promise<void> {
    hideDialogue();
    const previousRoom = this.room;
    try {
      const newMap = (await fetchMap(message.mapId)) as MapDefinition;
      const newRoom = await joinOverworld(this.sessionToken, message.mapId);
      previousRoom.leave();
      this.listenersAttached = false;
      this.scene.start('overworld', {
        room: newRoom,
        map: newMap,
        sessionToken: this.sessionToken,
        name: this.resumeData.name,
        isNewMap: true,
      });
    } catch {
      this.showTransientMessage('Failed to travel to the new area.');
    }
  }

  update(time: number): void {
    if (!this.room || time - this.lastMoveAt < MOVE_REPEAT_MS) return;

    const input = this.readMovementInput();
    if (input.dx === 0 && input.dy === 0) return;

    this.lastMoveAt = time;
    this.room.send('move', input);
  }

  /**
   * Invalid/expired session token (e.g. an old cached session after a
   * server restart with a fresh in-memory store, or a token that outlived
   * its TTL). Clears the stale session and reloads the page, which brings
   * the login/register overlay in main.ts back up.
   */
  private handleAuthFailure(reason: string): void {
    clearStoredSession();
    this.add.text(16, 16, `${reason}\nReloading...`, { color: '#ff6b6b', fontFamily: 'monospace' });
    this.time.delayedCall(1200, () => window.location.reload());
  }

  private readMovementInput(): MoveInput {
    let dx = 0;
    let dy = 0;
    if (this.cursors?.left.isDown || this.wasd?.left.isDown) dx = -1;
    else if (this.cursors?.right.isDown || this.wasd?.right.isDown) dx = 1;
    else if (this.cursors?.up.isDown || this.wasd?.up.isDown) dy = -1;
    else if (this.cursors?.down.isDown || this.wasd?.down.isDown) dy = 1;
    return { dx, dy };
  }

  private drawMap(): void {
    const { tiles, tileSize } = this.map;
    for (let y = 0; y < tiles.length; y++) {
      for (let x = 0; x < tiles[y].length; x++) {
        const color = TILE_COLORS[tiles[y][x].type] ?? 0x333333;
        this.add
          .rectangle(x * tileSize + tileSize / 2, y * tileSize + tileSize / 2, tileSize - 1, tileSize - 1, color)
          .setOrigin(0.5);
      }
    }
    this.cameras.main.setBounds(0, 0, this.map.width * tileSize, this.map.height * tileSize);
  }

  private tileToWorld(tx: number, ty: number): { x: number; y: number } {
    const { tileSize } = this.map;
    return { x: tx * tileSize + tileSize / 2, y: ty * tileSize + tileSize / 2 };
  }

  private registerPlayerVisual(sessionId: string, player: NetworkedPlayer): void {
    const isLocal = sessionId === this.room.sessionId;
    const visual = this.createPlayerVisual(player.x, player.y, player.name, isLocal);
    this.playerVisuals.set(sessionId, visual);

    player.onChange(() => {
      const v = this.playerVisuals.get(sessionId);
      if (!v) return;
      const { x, y } = this.tileToWorld(player.x, player.y);
      v.rect.setPosition(x, y);
      v.label.setPosition(x, y - 24);
      if (isLocal) {
        this.recordText.setText(`Record: ${player.wins}W / ${player.losses}L`);
        this.badgeText.setText(`Badges: ${player.badgeCount}`);
      }
    });

    if (isLocal) {
      this.cameras.main.startFollow(visual.rect, true);
      this.recordText.setText(`Record: ${player.wins}W / ${player.losses}L`);
      this.badgeText.setText(`Badges: ${player.badgeCount}`);
    } else {
      // Click a remote player to send them a PvP challenge (Milestone 4).
      visual.rect.setInteractive({ useHandCursor: true });
      visual.rect.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        const event = pointer.event as MouseEvent | undefined;
        if (event?.shiftKey) {
          this.room.send('tradeRequest', { targetSessionId: sessionId });
        } else {
          this.room.send('challengeRequest', { targetSessionId: sessionId });
        }
      });
    }
  }

  /** Draws/refreshes one NPC trainer's placeholder shape (diamond, themed/kind color) and label; grays out once defeated. */
  private registerTrainerVisual(trainer: TrainerInfo): void {
    const existing = this.trainerVisuals.get(trainer.id);
    if (existing) {
      existing.rect.destroy();
      existing.label.destroy();
    }

    const { tileSize } = this.map;
    const { x, y } = this.tileToWorld(trainer.position.x, trainer.position.y);
    const color = trainer.defeated
      ? TRAINER_DEFEATED_COLOR
      : TRAINER_KIND_COLORS[trainer.kind] ?? TRAINER_THEME_COLORS[trainer.themeType] ?? 0xffffff;
    const rect = this.add
      .rectangle(x, y, tileSize * 0.8, tileSize * 0.8, color)
      .setAngle(45)
      .setStrokeStyle(2, 0x000000);
    const label = this.add
      .text(x, y - 26, trainer.defeated ? `${trainer.name} (defeated)` : trainer.name, {
        color: '#ffffff',
        fontSize: '10px',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    this.trainerVisuals.set(trainer.id, { rect, label });
  }

  /** Draws/refreshes one flavor/quest NPC's placeholder shape (small square, gold if quest-bearing) and label. */
  private registerNpcVisual(npc: NpcInfo): void {
    const existing = this.npcVisuals.get(npc.id);
    if (existing) {
      existing.rect.destroy();
      existing.label.destroy();
    }

    const { tileSize } = this.map;
    const { x, y } = this.tileToWorld(npc.position.x, npc.position.y);
    const color = npc.kind === 'quest' ? NPC_QUEST_COLOR : NPC_FLAVOR_COLOR;
    const rect = this.add.rectangle(x, y, tileSize * 0.6, tileSize * 0.6, color).setStrokeStyle(2, 0x000000);
    const label = this.add
      .text(x, y - 22, npc.name, { color: '#ffffff', fontSize: '9px', fontFamily: 'monospace' })
      .setOrigin(0.5);

    this.npcVisuals.set(npc.id, { rect, label });
  }

  /** Brief on-screen notice for challenge errors/declines — auto-clears after a couple seconds. */
  private showTransientMessage(text: string): void {
    const notice = this.add.text(16, 56, text, {
      color: '#ff8a3d',
      fontFamily: 'monospace',
      fontSize: '12px',
    });
    this.time.delayedCall(2500, () => notice.destroy());
  }

  private createPlayerVisual(
    tx: number,
    ty: number,
    name: string,
    isLocal: boolean,
  ): PlayerVisual {
    const { tileSize } = this.map;
    const { x, y } = this.tileToWorld(tx, ty);
    const rect = this.add
      .rectangle(x, y, tileSize * 0.7, tileSize * 0.7, isLocal ? LOCAL_PLAYER_COLOR : REMOTE_PLAYER_COLOR)
      .setStrokeStyle(2, 0x000000);
    const label = this.add
      .text(x, y - 24, name, { color: '#ffffff', fontSize: '12px', fontFamily: 'monospace' })
      .setOrigin(0.5);

    return { rect, label };
  }
}

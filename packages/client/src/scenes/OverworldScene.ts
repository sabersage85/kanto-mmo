import Phaser from 'phaser';
import type { MapDefinition, MoveInput } from '@kanto-mmo/shared';
import type { Room } from 'colyseus.js';
import { fetchMap, joinOverworld } from '../net.js';

/** Placeholder colors standing in for real tile art (no copied assets). */
const TILE_COLORS: Record<string, number> = {
  grass: 0x3fae4f,
  tree: 0x1f6e2d,
  water: 0x2a6fd6,
  path: 0xc8a765,
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
  onChange(callback: () => void): void;
}

interface PlayerVisual {
  rect: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

export class OverworldScene extends Phaser.Scene {
  private map!: MapDefinition;
  private room!: Room;
  private playerVisuals = new Map<string, PlayerVisual>();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private lastMoveAt = 0;

  constructor() {
    super('overworld');
  }

  async create(): Promise<void> {
    const statusText = this.add.text(16, 16, 'Connecting to server...', {
      color: '#ffffff',
      fontFamily: 'monospace',
    });

    this.map = (await fetchMap('route1')) as MapDefinition;
    this.drawMap();

    const name = `Trainer${Math.floor(Math.random() * 10000)}`;
    this.room = await joinOverworld(name);
    statusText.setText(`Connected as ${name}`);

    this.room.state.players.onAdd((player: NetworkedPlayer, sessionId: string) => {
      const isLocal = sessionId === this.room.sessionId;
      const visual = this.createPlayerVisual(player.x, player.y, player.name, isLocal);
      this.playerVisuals.set(sessionId, visual);

      player.onChange(() => {
        const v = this.playerVisuals.get(sessionId);
        if (!v) return;
        const { x, y } = this.tileToWorld(player.x, player.y);
        v.rect.setPosition(x, y);
        v.label.setPosition(x, y - 24);
      });
    });

    this.room.state.players.onRemove((_player: NetworkedPlayer, sessionId: string) => {
      const v = this.playerVisuals.get(sessionId);
      if (v) {
        v.rect.destroy();
        v.label.destroy();
      }
      this.playerVisuals.delete(sessionId);
    });

    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.cursors = keyboard.createCursorKeys();
      this.wasd = {
        up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
    }
  }

  update(time: number): void {
    if (!this.room || time - this.lastMoveAt < MOVE_REPEAT_MS) return;

    const input = this.readMovementInput();
    if (input.dx === 0 && input.dy === 0) return;

    this.lastMoveAt = time;
    this.room.send('move', input);
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

    if (isLocal) {
      this.cameras.main.startFollow(rect, true);
    }

    return { rect, label };
  }
}

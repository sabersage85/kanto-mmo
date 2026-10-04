import Phaser from 'phaser';
import type { Room } from 'colyseus.js';
import { getMove, type MapDefinition } from '@kanto-mmo/shared';
import { createBattle } from '../net.js';

/** Structural shape of the networked BattleState we care about client-side. */
interface NetworkedBattleCreature {
  speciesId: number;
  name: string;
  level: number;
  maxHp: number;
  currentHp: number;
  moveIds: number[];
}

interface NetworkedBattleLogEntry {
  text: string;
}

type BattleStatus = 'ongoing' | 'won' | 'lost' | 'fled';

interface NetworkedBattleState {
  player: NetworkedBattleCreature;
  wild: NetworkedBattleCreature;
  status: BattleStatus;
  log: NetworkedBattleLogEntry[];
  expGained: number;
  leveledUp: boolean;
  newLevel: number;
}

export interface BattleSceneData {
  encounterToken: string;
  sessionToken: string;
  overworldRoom: Room;
  map: MapDefinition;
}

const PLAYER_BAR_COLOR = 0x4fa8ff;
const WILD_BAR_COLOR = 0xff6b6b;
const HP_BAR_WIDTH = 160;
const HP_BAR_HEIGHT = 14;
const LOG_LINES_SHOWN = 6;
const RESULT_DELAY_MS = 2500;

/** Simple, placeholder-art turn-based PvE battle scene (colored rects/text, no copied assets). */
export class BattleScene extends Phaser.Scene {
  private sceneData!: BattleSceneData;
  private room!: Room;

  private wildNameText!: Phaser.GameObjects.Text;
  private wildHpBar!: Phaser.GameObjects.Rectangle;
  private wildHpText!: Phaser.GameObjects.Text;

  private playerNameText!: Phaser.GameObjects.Text;
  private playerHpBar!: Phaser.GameObjects.Rectangle;
  private playerHpText!: Phaser.GameObjects.Text;

  private logText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;
  private moveButtons: Phaser.GameObjects.Text[] = [];
  private fleeButton!: Phaser.GameObjects.Text;
  private ended = false;

  constructor() {
    super('battle');
  }

  init(data: BattleSceneData): void {
    this.sceneData = data;
    this.ended = false;
    this.moveButtons = [];
  }

  async create(): Promise<void> {
    this.cameras.main.setBackgroundColor('#101418');

    this.add.text(16, 8, 'Wild encounter!', { color: '#ffffff', fontFamily: 'monospace', fontSize: '14px' });

    // Wild creature panel.
    this.wildNameText = this.add.text(290, 36, '', { color: '#ffffff', fontFamily: 'monospace', fontSize: '14px' });
    this.add.rectangle(290 + HP_BAR_WIDTH / 2, 60, HP_BAR_WIDTH, HP_BAR_HEIGHT, 0x333333).setOrigin(0.5);
    this.wildHpBar = this.add
      .rectangle(290 + 2, 60, HP_BAR_WIDTH - 4, HP_BAR_HEIGHT - 4, WILD_BAR_COLOR)
      .setOrigin(0, 0.5);
    this.wildHpText = this.add.text(290, 70, '', { color: '#ffffff', fontFamily: 'monospace', fontSize: '11px' });

    // Player creature panel.
    this.playerNameText = this.add.text(20, 150, '', {
      color: '#ffffff',
      fontFamily: 'monospace',
      fontSize: '14px',
    });
    this.add.rectangle(20 + HP_BAR_WIDTH / 2, 174, HP_BAR_WIDTH, HP_BAR_HEIGHT, 0x333333).setOrigin(0.5);
    this.playerHpBar = this.add
      .rectangle(20 + 2, 174, HP_BAR_WIDTH - 4, HP_BAR_HEIGHT - 4, PLAYER_BAR_COLOR)
      .setOrigin(0, 0.5);
    this.playerHpText = this.add.text(20, 184, '', { color: '#ffffff', fontFamily: 'monospace', fontSize: '11px' });

    // Battle log.
    this.logText = this.add.text(16, 208, '', {
      color: '#dddddd',
      fontFamily: 'monospace',
      fontSize: '11px',
      wordWrap: { width: 448 },
    });

    this.resultText = this.add
      .text(240, 176, '', { color: '#ffe066', fontFamily: 'monospace', fontSize: '16px', align: 'center' })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(10);

    this.fleeButton = this.makeButton(420, 320, 'Flee', () => this.room.send('flee'));

    this.room = await createBattle(this.sceneData.sessionToken, this.sceneData.encounterToken);
    this.room.onStateChange((state: NetworkedBattleState) => this.renderState(state));
  }

  private renderState(state: NetworkedBattleState): void {
    this.wildNameText.setText(`${state.wild.name}  Lv.${state.wild.level}`);
    this.setHpBar(this.wildHpBar, state.wild.currentHp, state.wild.maxHp);
    this.wildHpText.setText(`HP ${Math.max(0, state.wild.currentHp)}/${state.wild.maxHp}`);

    this.playerNameText.setText(`${state.player.name}  Lv.${state.player.level}`);
    this.setHpBar(this.playerHpBar, state.player.currentHp, state.player.maxHp);
    this.playerHpText.setText(`HP ${Math.max(0, state.player.currentHp)}/${state.player.maxHp}`);

    const lines = state.log.map((entry) => entry.text).slice(-LOG_LINES_SHOWN);
    this.logText.setText(lines.join('\n'));

    this.renderMoveButtons(state);

    if (state.status !== 'ongoing' && !this.ended) {
      this.ended = true;
      this.showResult(state);
    }
  }

  private setHpBar(bar: Phaser.GameObjects.Rectangle, current: number, max: number): void {
    const ratio = max > 0 ? Phaser.Math.Clamp(current / max, 0, 1) : 0;
    bar.width = (HP_BAR_WIDTH - 4) * ratio;
  }

  private renderMoveButtons(state: NetworkedBattleState): void {
    if (this.moveButtons.length > 0) return; // Moveset doesn't change mid-battle; build buttons once.

    const startX = 150;
    const startY = 258;
    state.player.moveIds.forEach((moveId, index) => {
      const move = getMove(moveId);
      const x = startX + (index % 2) * 150;
      const y = startY + Math.floor(index / 2) * 34;
      const button = this.makeButton(x, y, move.name, () => {
        if (state.status !== 'ongoing') return;
        this.room.send('selectMove', { moveId });
      });
      this.moveButtons.push(button);
    });
  }

  private makeButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const button = this.add
      .text(x, y, label, {
        color: '#ffffff',
        backgroundColor: '#2d2f36',
        fontFamily: 'monospace',
        fontSize: '13px',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    button.on('pointerdown', onClick);
    return button;
  }

  private showResult(state: NetworkedBattleState): void {
    let message = '';
    if (state.status === 'won') {
      message = `You won! +${state.expGained} XP`;
      if (state.leveledUp) message += `\nLevel up! Now Lv.${state.newLevel}`;
    } else if (state.status === 'lost') {
      message = 'You blacked out...';
    } else if (state.status === 'fled') {
      message = 'Got away safely!';
    }

    this.resultText.setText(message).setVisible(true);
    for (const button of this.moveButtons) button.disableInteractive();
    this.fleeButton.disableInteractive();

    this.sceneData.overworldRoom.send('battleEnded');
    this.time.delayedCall(RESULT_DELAY_MS, () => {
      this.scene.start('overworld', {
        room: this.sceneData.overworldRoom,
        map: this.sceneData.map,
        sessionToken: this.sceneData.sessionToken,
      });
    });
  }
}

import Phaser from 'phaser';
import type { Room } from 'colyseus.js';
import { getItem, getMove, type InventorySlot, type MapDefinition } from '@kanto-mmo/shared';
import { createTrainerBattle } from '../net.js';

/** Structural shape of the networked TrainerBattleState we care about client-side. */
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

type TrainerBattleStatus = 'ongoing' | 'won' | 'lost';

interface NetworkedTrainerBattleState {
  player: NetworkedBattleCreature;
  trainer: NetworkedBattleCreature;
  trainerId: string;
  trainerName: string;
  trainerTeamSize: number;
  trainerTeamRemaining: number;
  status: TrainerBattleStatus;
  log: NetworkedBattleLogEntry[];
  expGained: number;
  leveledUp: boolean;
  newLevel: number;
  badgeAwarded: boolean;
  badgeName: string;
}

export interface TrainerBattleSceneData {
  trainerBattleToken: string;
  sessionToken: string;
  overworldRoom: Room;
  map: MapDefinition;
  /** Snapshot of the player's inventory taken when the battle started, for the heal-only item menu. */
  inventory?: InventorySlot[];
}

interface ItemUseErrorMessage {
  reason: string;
}

const PLAYER_BAR_COLOR = 0x4fa8ff;
const TRAINER_BAR_COLOR = 0xd64fd6;
const HP_BAR_WIDTH = 160;
const HP_BAR_HEIGHT = 14;
const LOG_LINES_SHOWN = 6;
const RESULT_DELAY_MS = 2800;

/** Simple, placeholder-art turn-based NPC-trainer battle scene (Milestone 6) — mirrors BattleScene's layout. */
export class TrainerBattleScene extends Phaser.Scene {
  private sceneData!: TrainerBattleSceneData;
  private room!: Room;

  private trainerNameText!: Phaser.GameObjects.Text;
  private trainerTeamText!: Phaser.GameObjects.Text;
  private trainerHpBar!: Phaser.GameObjects.Rectangle;
  private trainerHpText!: Phaser.GameObjects.Text;

  private playerNameText!: Phaser.GameObjects.Text;
  private playerHpBar!: Phaser.GameObjects.Rectangle;
  private playerHpText!: Phaser.GameObjects.Text;

  private logText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;
  private moveButtons: Phaser.GameObjects.Text[] = [];
  private itemsButton!: Phaser.GameObjects.Text;
  private itemButtons: Phaser.GameObjects.Text[] = [];
  private itemMenuOpen = false;
  private ended = false;

  constructor() {
    super('trainerBattle');
  }

  init(data: TrainerBattleSceneData): void {
    this.sceneData = data;
    this.ended = false;
    this.moveButtons = [];
    this.itemButtons = [];
    this.itemMenuOpen = false;
  }

  async create(): Promise<void> {
    this.cameras.main.setBackgroundColor('#1a1420');

    this.add.text(16, 8, 'Trainer battle!', { color: '#ffffff', fontFamily: 'monospace', fontSize: '14px' });

    // Trainer's active creature panel.
    this.trainerNameText = this.add.text(290, 30, '', { color: '#ffffff', fontFamily: 'monospace', fontSize: '14px' });
    this.trainerTeamText = this.add.text(290, 48, '', { color: '#d6a4ff', fontFamily: 'monospace', fontSize: '11px' });
    this.add.rectangle(290 + HP_BAR_WIDTH / 2, 70, HP_BAR_WIDTH, HP_BAR_HEIGHT, 0x333333).setOrigin(0.5);
    this.trainerHpBar = this.add
      .rectangle(290 + 2, 70, HP_BAR_WIDTH - 4, HP_BAR_HEIGHT - 4, TRAINER_BAR_COLOR)
      .setOrigin(0, 0.5);
    this.trainerHpText = this.add.text(290, 80, '', { color: '#ffffff', fontFamily: 'monospace', fontSize: '11px' });

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

    // No flee/capture in a trainer battle — only moves and heal-only items.
    this.itemsButton = this.makeButton(420, 320, 'Items', () => this.toggleItemMenu());

    this.room = await createTrainerBattle(this.sceneData.sessionToken, this.sceneData.trainerBattleToken);
    this.room.onStateChange((state: NetworkedTrainerBattleState) => this.renderState(state));
    this.room.onMessage('itemUseError', (message: ItemUseErrorMessage) => {
      this.logText.setText(`${this.logText.text}\n${message.reason}`.trim());
    });
  }

  private renderState(state: NetworkedTrainerBattleState): void {
    this.trainerNameText.setText(`${state.trainerName}`);
    this.trainerTeamText.setText(
      `${state.trainer.name}  Lv.${state.trainer.level}  (${state.trainerTeamRemaining}/${state.trainerTeamSize} left)`,
    );
    this.setHpBar(this.trainerHpBar, state.trainer.currentHp, state.trainer.maxHp);
    this.trainerHpText.setText(`HP ${Math.max(0, state.trainer.currentHp)}/${state.trainer.maxHp}`);

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

  private renderMoveButtons(state: NetworkedTrainerBattleState): void {
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

  /** Opens/closes a small inline menu of heal-only items, built from the inventory snapshot passed in at battle start. */
  private toggleItemMenu(): void {
    this.itemMenuOpen = !this.itemMenuOpen;
    for (const button of this.itemButtons) button.destroy();
    this.itemButtons = [];
    if (!this.itemMenuOpen) return;

    const healItems = (this.sceneData.inventory ?? []).filter((slot) => getItem(slot.itemId).effect.kind === 'heal');
    const startX = 150;
    const startY = 258 + 70;
    healItems.forEach((slot, index) => {
      const item = getItem(slot.itemId);
      const x = startX + (index % 2) * 150;
      const y = startY + Math.floor(index / 2) * 34;
      const button = this.makeButton(x, y, `${item.name} x${slot.quantity}`, () => {
        this.room.send('useItem', { itemId: slot.itemId });
      });
      this.itemButtons.push(button);
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

  private showResult(state: NetworkedTrainerBattleState): void {
    let message = '';
    if (state.status === 'won') {
      message = `You won! +${state.expGained} XP`;
      if (state.leveledUp) message += `\nLevel up! Now Lv.${state.newLevel}`;
      if (state.badgeAwarded) message += `\nEarned the ${state.badgeName}!`;
    } else if (state.status === 'lost') {
      message = 'You blacked out...';
    }

    this.resultText.setText(message).setVisible(true);
    for (const button of this.moveButtons) button.disableInteractive();
    for (const button of this.itemButtons) button.disableInteractive();
    this.itemsButton.disableInteractive();

    this.sceneData.overworldRoom.send('trainerBattleEnded');
    this.time.delayedCall(RESULT_DELAY_MS, () => {
      this.scene.start('overworld', {
        room: this.sceneData.overworldRoom,
        map: this.sceneData.map,
        sessionToken: this.sceneData.sessionToken,
      });
    });
  }
}

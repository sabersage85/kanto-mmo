import Phaser from 'phaser';
import type { Room } from 'colyseus.js';
import { getMove, type MapDefinition } from '@kanto-mmo/shared';
import { joinPvpBattle } from '../net.js';

/** Structural shape of the networked BattleCreatureSchema we care about client-side. */
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

type PvpBattleStatus = 'waiting' | 'ongoing' | 'challenger_win' | 'opponent_win';

interface NetworkedPvpBattleState {
  challenger: NetworkedBattleCreature;
  opponent: NetworkedBattleCreature;
  challengerName: string;
  opponentName: string;
  challengerSessionId: string;
  opponentSessionId: string;
  status: PvpBattleStatus;
  log: NetworkedBattleLogEntry[];
  challengerWins: number;
  challengerLosses: number;
  opponentWins: number;
  opponentLosses: number;
}

export interface PvpBattleSceneData {
  roomId: string;
  opponentName: string;
  sessionToken: string;
  overworldRoom: Room;
  map: MapDefinition;
}

const MY_BAR_COLOR = 0x4fa8ff;
const OPPONENT_BAR_COLOR = 0xff6b6b;
const HP_BAR_WIDTH = 160;
const HP_BAR_HEIGHT = 14;
const LOG_LINES_SHOWN = 6;
const RESULT_DELAY_MS = 2500;

/**
 * PvP battle scene (Milestone 4) — mirrors `BattleScene`'s placeholder-art
 * HP-bar/move-button/log layout, but for two human-controlled sides. Which
 * schema side ("challenger" or "opponent") is "me" is determined by
 * comparing `room.sessionId` against the schema's `*SessionId` fields,
 * since either player may be the challenger or the opponent. After
 * submitting a move, buttons disable and show "waiting for opponent..."
 * until the log grows (a turn resolved), at which point they re-enable.
 */
export class PvpBattleScene extends Phaser.Scene {
  private sceneData!: PvpBattleSceneData;
  private room!: Room;
  private mySide: 'challenger' | 'opponent' = 'challenger';

  private opponentNameText!: Phaser.GameObjects.Text;
  private opponentHpBar!: Phaser.GameObjects.Rectangle;
  private opponentHpText!: Phaser.GameObjects.Text;

  private myNameText!: Phaser.GameObjects.Text;
  private myHpBar!: Phaser.GameObjects.Rectangle;
  private myHpText!: Phaser.GameObjects.Text;

  private logText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;
  private waitingText!: Phaser.GameObjects.Text;
  private moveButtons: Phaser.GameObjects.Text[] = [];
  private submittedThisTurn = false;
  private lastLogLength = 0;
  private ended = false;

  constructor() {
    super('pvpBattle');
  }

  init(data: PvpBattleSceneData): void {
    this.sceneData = data;
    this.ended = false;
    this.submittedThisTurn = false;
    this.lastLogLength = 0;
    this.moveButtons = [];
  }

  async create(): Promise<void> {
    this.cameras.main.setBackgroundColor('#101418');

    this.add.text(16, 8, `PvP battle vs ${this.sceneData.opponentName}`, {
      color: '#ffffff',
      fontFamily: 'monospace',
      fontSize: '14px',
    });

    // Opponent panel.
    this.opponentNameText = this.add.text(290, 36, '', { color: '#ffffff', fontFamily: 'monospace', fontSize: '14px' });
    this.add.rectangle(290 + HP_BAR_WIDTH / 2, 60, HP_BAR_WIDTH, HP_BAR_HEIGHT, 0x333333).setOrigin(0.5);
    this.opponentHpBar = this.add
      .rectangle(290 + 2, 60, HP_BAR_WIDTH - 4, HP_BAR_HEIGHT - 4, OPPONENT_BAR_COLOR)
      .setOrigin(0, 0.5);
    this.opponentHpText = this.add.text(290, 70, '', { color: '#ffffff', fontFamily: 'monospace', fontSize: '11px' });

    // My creature panel.
    this.myNameText = this.add.text(20, 150, '', { color: '#ffffff', fontFamily: 'monospace', fontSize: '14px' });
    this.add.rectangle(20 + HP_BAR_WIDTH / 2, 174, HP_BAR_WIDTH, HP_BAR_HEIGHT, 0x333333).setOrigin(0.5);
    this.myHpBar = this.add
      .rectangle(20 + 2, 174, HP_BAR_WIDTH - 4, HP_BAR_HEIGHT - 4, MY_BAR_COLOR)
      .setOrigin(0, 0.5);
    this.myHpText = this.add.text(20, 184, '', { color: '#ffffff', fontFamily: 'monospace', fontSize: '11px' });

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

    this.waitingText = this.add
      .text(240, 290, '', { color: '#9db4ff', fontFamily: 'monospace', fontSize: '12px' })
      .setOrigin(0.5);

    this.room = await joinPvpBattle(this.sceneData.sessionToken, this.sceneData.roomId);
    this.room.onStateChange((state: NetworkedPvpBattleState) => this.renderState(state));
  }

  private renderState(state: NetworkedPvpBattleState): void {
    this.mySide = state.challengerSessionId === this.room.sessionId ? 'challenger' : 'opponent';
    const mine = this.mySide === 'challenger' ? state.challenger : state.opponent;
    const theirs = this.mySide === 'challenger' ? state.opponent : state.challenger;
    const theirName = this.mySide === 'challenger' ? state.opponentName : state.challengerName;

    this.opponentNameText.setText(`${theirName}  Lv.${theirs.level}`);
    this.setHpBar(this.opponentHpBar, theirs.currentHp, theirs.maxHp);
    this.opponentHpText.setText(`HP ${Math.max(0, theirs.currentHp)}/${theirs.maxHp}`);

    this.myNameText.setText(`${mine.name}  Lv.${mine.level}`);
    this.setHpBar(this.myHpBar, mine.currentHp, mine.maxHp);
    this.myHpText.setText(`HP ${Math.max(0, mine.currentHp)}/${mine.maxHp}`);

    const lines = state.log.map((entry) => entry.text).slice(-LOG_LINES_SHOWN);
    this.logText.setText(lines.join('\n'));

    this.renderMoveButtons(mine);

    // A new log entry means a turn resolved (or the match just started) —
    // re-enable move buttons for the next turn if the battle is still ongoing.
    if (state.log.length !== this.lastLogLength) {
      this.lastLogLength = state.log.length;
      if (state.status === 'ongoing' && this.submittedThisTurn) {
        this.submittedThisTurn = false;
        this.waitingText.setText('');
        for (const b of this.moveButtons) b.setInteractive({ useHandCursor: true }).setAlpha(1);
      }
    }

    if (state.status !== 'ongoing' && !this.ended) {
      this.ended = true;
      this.showResult(state);
    }
  }

  private setHpBar(bar: Phaser.GameObjects.Rectangle, current: number, max: number): void {
    const ratio = max > 0 ? Phaser.Math.Clamp(current / max, 0, 1) : 0;
    bar.width = (HP_BAR_WIDTH - 4) * ratio;
  }

  private renderMoveButtons(mine: NetworkedBattleCreature): void {
    if (this.moveButtons.length > 0 || mine.moveIds.length === 0) return; // Moveset doesn't change mid-battle; build once.

    const startX = 150;
    const startY = 258;
    mine.moveIds.forEach((moveId, index) => {
      const move = getMove(moveId);
      const x = startX + (index % 2) * 150;
      const y = startY + Math.floor(index / 2) * 34;
      const button = this.makeButton(x, y, move.name, () => {
        if (this.submittedThisTurn || this.ended) return;
        this.room.send('selectMove', { moveId });
        this.submittedThisTurn = true;
        this.waitingText.setText('Waiting for opponent...');
        for (const b of this.moveButtons) b.disableInteractive().setAlpha(0.5);
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

  private showResult(state: NetworkedPvpBattleState): void {
    const iWon =
      (this.mySide === 'challenger' && state.status === 'challenger_win') ||
      (this.mySide === 'opponent' && state.status === 'opponent_win');
    const myWins = this.mySide === 'challenger' ? state.challengerWins : state.opponentWins;
    const myLosses = this.mySide === 'challenger' ? state.challengerLosses : state.opponentLosses;

    let message = iWon ? 'You won the battle!' : 'You lost the battle...';
    message += `\nRecord: ${myWins}W / ${myLosses}L`;

    this.resultText.setText(message).setVisible(true);
    this.waitingText.setText('');
    for (const button of this.moveButtons) button.disableInteractive();

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

import Phaser from 'phaser';
import { OverworldScene } from './scenes/OverworldScene.js';
import { BattleScene } from './scenes/BattleScene.js';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 480,
  height: 352,
  backgroundColor: '#000000',
  pixelArt: true,
  physics: {
    default: 'arcade',
  },
  scene: [OverworldScene, BattleScene],
});

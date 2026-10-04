import Phaser from 'phaser';
import { OverworldScene } from './scenes/OverworldScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import { PvpBattleScene } from './scenes/PvpBattleScene.js';
import { showAuthOverlay } from './ui/authOverlay.js';
import { getStoredSession } from './net.js';

async function bootstrap(): Promise<void> {
  // Reuse a cached, not-yet-expired session (page reload / reconnect) so the
  // player isn't forced to log in again every time; otherwise show the
  // login/register overlay and wait for it to resolve.
  const session = getStoredSession() ?? (await showAuthOverlay());

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    width: 480,
    height: 352,
    backgroundColor: '#000000',
    pixelArt: true,
    physics: {
      default: 'arcade',
    },
    scene: [BattleScene, PvpBattleScene],
  });

  // Added (rather than listed in `scene` above) so we can pass the session
  // token/name straight into OverworldScene's init() as it boots.
  game.scene.add('overworld', OverworldScene, true, { sessionToken: session.token, name: session.name });
}

void bootstrap();

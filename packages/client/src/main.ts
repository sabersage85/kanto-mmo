import Phaser from 'phaser';
import { OverworldScene } from './scenes/OverworldScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import { PvpBattleScene } from './scenes/PvpBattleScene.js';
import { TrainerBattleScene } from './scenes/TrainerBattleScene.js';
import { showAuthOverlay } from './ui/authOverlay.js';
import { fetchInitialMapId, getStoredSession } from './net.js';

async function bootstrap(): Promise<void> {
  // Reuse a cached, not-yet-expired session (page reload / reconnect) so the
  // player isn't forced to log in again every time; otherwise show the
  // login/register overlay and wait for it to resolve.
  const session = getStoredSession() ?? (await showAuthOverlay());

  // Milestone 7: the world is now multiple maps, each with its own
  // OverworldRoom instance — resolve which one the player should join
  // (their last known position, or the starting town for new accounts)
  // before opening the first websocket connection.
  const mapId = await fetchInitialMapId(session.token);

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
    scene: [BattleScene, PvpBattleScene, TrainerBattleScene],
  });

  // Added (rather than listed in `scene` above) so we can pass the session
  // token/name/mapId straight into OverworldScene's init() as it boots.
  game.scene.add('overworld', OverworldScene, true, { sessionToken: session.token, name: session.name, mapId });
}

void bootstrap();

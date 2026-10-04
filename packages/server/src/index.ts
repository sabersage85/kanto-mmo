import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import colyseus from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { OverworldRoom } from './rooms/OverworldRoom.js';
import { BattleRoom } from './rooms/BattleRoom.js';
import { PvpBattleRoom } from './rooms/PvpBattleRoom.js';
import { TrainerBattleRoom } from './rooms/TrainerBattleRoom.js';
import { loadMap } from './mapLoader.js';
import { AuthError, login, register, validateToken } from './auth/authService.js';
import { getPersistenceStore } from './persistence/store.js';
import { loadSession } from './sessionCache.js';

const { Server } = colyseus;

const PORT = Number(process.env.PORT ?? 2567);

const KNOWN_MAP_IDS = new Set(['hearthfield', 'fernway', 'stonehollow', 'tidemoor', 'cinderfell']);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

interface AuthRequestBody {
  email?: unknown;
  password?: unknown;
  name?: unknown;
}

app.post('/auth/register', async (req, res) => {
  const body = req.body as AuthRequestBody;
  if (typeof body?.email !== 'string' || typeof body?.password !== 'string') {
    res.status(400).json({ error: 'email and password are required.' });
    return;
  }
  try {
    const result = await register(body.email, body.password, typeof body.name === 'string' ? body.name : undefined);
    res.json(result);
  } catch (err) {
    res.status(err instanceof AuthError ? 400 : 500).json({ error: errorMessage(err) });
  }
});

app.post('/auth/login', async (req, res) => {
  const body = req.body as AuthRequestBody;
  if (typeof body?.email !== 'string' || typeof body?.password !== 'string') {
    res.status(400).json({ error: 'email and password are required.' });
    return;
  }
  try {
    const result = await login(body.email, body.password);
    res.json(result);
  } catch (err) {
    res.status(err instanceof AuthError ? 401 : 500).json({ error: errorMessage(err) });
  }
});

function errorMessage(err: unknown): string {
  if (err instanceof AuthError) return err.message;
  // eslint-disable-next-line no-console
  console.error(err);
  return 'Something went wrong. Please try again.';
}

// Lets the client fetch map/tile data over plain HTTP without duplicating
// the JSON map files or hardcoding them client-side.
app.get('/maps/:id', (req, res) => {
  try {
    const map = loadMap(req.params.id);
    res.json(map);
  } catch {
    res.status(404).json({ error: `Unknown map: ${req.params.id}` });
  }
});

// Milestone 7: the client needs to know which map's OverworldRoom to
// join/create *before* it opens its first websocket connection (so it can
// pass the right `mapId` to `joinOrCreate`). This eagerly resolves/loads
// the session via `loadSession` (same call OverworldRoom.onJoin makes),
// which also conveniently warms the process-wide session cache.
app.get('/players/me/map', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : (req.query.token as string | undefined);
  const accountId = token ? await validateToken(token) : null;
  if (!accountId) {
    res.status(401).json({ error: 'Invalid or expired session — please log in again.' });
    return;
  }

  const store = getPersistenceStore();
  const session = await loadSession(store, accountId, `Trainer${accountId.slice(0, 4)}`, {
    mapId: 'hearthfield',
    x: 0,
    y: 0,
    direction: 'down',
  });
  // Guard against any pre-Milestone-7 persisted mapId that no longer
  // exists (the old single test map was renamed/split up) by falling back
  // to the starting town rather than letting the client request a map
  // that 404s.
  const mapId = KNOWN_MAP_IDS.has(session.mapId) ? session.mapId : 'hearthfield';
  res.json({ mapId });
});

const httpServer = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('overworld', OverworldRoom).filterBy(['mapId']);
gameServer.define('battle', BattleRoom);
gameServer.define('pvpBattle', PvpBattleRoom);
gameServer.define('trainerBattle', TrainerBattleRoom);

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Kanto MMO server listening on http://localhost:${PORT}`);
});

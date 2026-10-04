import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import colyseus from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { OverworldRoom } from './rooms/OverworldRoom.js';
import { BattleRoom } from './rooms/BattleRoom.js';
import { loadMap } from './mapLoader.js';
import { AuthError, login, register } from './auth/authService.js';

const { Server } = colyseus;

const PORT = Number(process.env.PORT ?? 2567);

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

const httpServer = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('overworld', OverworldRoom);
gameServer.define('battle', BattleRoom);

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Kanto MMO server listening on http://localhost:${PORT}`);
});

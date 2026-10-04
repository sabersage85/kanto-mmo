import http from 'node:http';
import express from 'express';
import cors from 'cors';
import colyseus from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { OverworldRoom } from './rooms/OverworldRoom.js';
import { BattleRoom } from './rooms/BattleRoom.js';
import { loadMap } from './mapLoader.js';

const { Server } = colyseus;

const PORT = Number(process.env.PORT ?? 2567);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

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

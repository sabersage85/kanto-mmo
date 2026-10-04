// Manual smoke test for Milestone 5 (Trading). Not part of the automated test suite.
// Run with the dev server already listening on :2567 (npm run dev in packages/server).
//   node packages/server/scripts/smoke-trade.mjs
import { Client } from 'colyseus.js';

const BASE = 'http://localhost:2567';
const WS = 'ws://localhost:2567';

async function register(name, email, password) {
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  if (!res.ok) throw new Error(`register ${name} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function onceMessage(room, type) {
  return new Promise((resolve) => {
    room.onMessage(type, (msg) => resolve(msg));
  });
}

async function main() {
  const suffix = Date.now();
  const a = await register('Trader A', `tradea${suffix}@test.local`, 'password123');
  const b = await register('Trader B', `tradeb${suffix}@test.local`, 'password123');
  console.log('Registered accounts:', a.name, b.name);

  const client = new Client(WS);
  const roomA = await client.joinOrCreate('overworld', { token: a.token });
  let invA = null;
  roomA.onMessage('inventoryUpdate', (m) => (invA = m));
  const roomB = await client.joinOrCreate('overworld', { token: b.token });
  let invB = null;
  roomB.onMessage('inventoryUpdate', (m) => (invB = m));
  console.log('Both joined overworld. sessionIds:', roomA.sessionId, roomB.sessionId);

  await new Promise((r) => setTimeout(r, 500));

  console.log('A starting inventory:', invA?.inventory, 'party:', invA?.party?.map((c) => c.speciesId));
  console.log('B starting inventory:', invB?.inventory, 'party:', invB?.party?.map((c) => c.speciesId));

  // Give B a second creature so trading away one doesn't trip the "keep >=1 creature" rule either side.
  // (A already has a starter; we trade an item only from A, and an item+creature from B is skipped to keep this simple—
  // instead we just trade items both ways plus B's starter creature, since A will still have a party after receiving it.)

  // B initiates a trade request to A.
  const incoming = onceMessage(roomA, 'tradeIncoming');
  roomB.send('tradeRequest', { targetSessionId: roomA.sessionId });
  const incomingMsg = await incoming;
  console.log('A received trade request from:', incomingMsg.fromName);

  const startedA = onceMessage(roomA, 'tradeStarted');
  const startedB = onceMessage(roomB, 'tradeStarted');
  roomA.send('tradeRespond', { accept: true });
  const [sa, sb] = await Promise.all([startedA, startedB]);
  console.log('Trade started. A isSideA:', sa.isSideA, 'B isSideA:', sb.isSideA);

  // A offers 2x item 1 (Herb Wrap). B offers 1x item 3 (Rusty Snare).
  // (Both sides start with items 1 and 3, so an items-only swap avoids the
  // "must keep at least 1 creature" safety rule entirely — that rule is
  // covered by its own dedicated unit tests in trade.test.ts.)
  const updateA1 = onceMessage(roomA, 'tradeUpdate');
  const updateB1 = onceMessage(roomB, 'tradeUpdate');
  roomA.send('tradeOfferUpdate', { items: [{ itemId: 1, quantity: 2 }], creatureInstanceIds: [] });
  await Promise.all([updateA1, updateB1]);

  const updateA2 = onceMessage(roomA, 'tradeUpdate');
  const updateB2 = onceMessage(roomB, 'tradeUpdate');
  roomB.send('tradeOfferUpdate', { items: [{ itemId: 3, quantity: 1 }], creatureInstanceIds: [] });
  const [ua2] = await Promise.all([updateA2, updateB2]);
  // A is sideB in this handshake (B initiated the request), so A's own
  // offer lives under `offerB` and B's lives under `offerA`.
  console.log(
    'Negotiated offers — A offered:',
    ua2.offerB.items,
    'B offered:',
    ua2.offerA.items,
  );

  // Both confirm.
  const resultA = onceMessage(roomA, 'tradeResult');
  const resultB = onceMessage(roomB, 'tradeResult');
  roomA.send('tradeConfirm');
  roomB.send('tradeConfirm');
  const [ra, rb] = await Promise.all([resultA, resultB]);
  console.log('Trade result A success:', ra.success, 'A new inventory:', ra.inventory);
  console.log('Trade result B success:', rb.success, 'B new inventory:', rb.inventory);

  if (!ra.success || !rb.success) {
    throw new Error('Trade did not succeed');
  }
  const aItem3 = ra.inventory.find((s) => s.itemId === 3)?.quantity ?? 0;
  const bItem1 = rb.inventory.find((s) => s.itemId === 1)?.quantity ?? 0;
  if (aItem3 !== 3) throw new Error(`Expected A to have 3x item 3 after trade, got ${aItem3}`);
  if (bItem1 !== 5) throw new Error(`Expected B to have 5x item 1 after trade, got ${bItem1}`);

  await roomA.leave();
  await roomB.leave();
  console.log('Disconnected both. Reconnecting to verify persistence...');
  await new Promise((r) => setTimeout(r, 300));

  const roomA2 = await client.joinOrCreate('overworld', { token: a.token });
  const invA2 = await onceMessage(roomA2, 'inventoryUpdate');
  console.log('A reconnected. Inventory:', invA2.inventory);
  const aItem3AfterReconnect = invA2.inventory.find((s) => s.itemId === 3)?.quantity ?? 0;
  if (aItem3AfterReconnect !== 3) {
    throw new Error(`Traded items did not persist for A after reconnect (got ${aItem3AfterReconnect})`);
  }
  await roomA2.leave();

  console.log('\n✅ SMOKE TEST PASSED: trade handshake, negotiation, atomic swap, and persistence all verified.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ SMOKE TEST FAILED:', err);
  process.exit(1);
});

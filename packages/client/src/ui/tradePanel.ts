import type { CreatureInstance, InventorySlot, TradeOffer } from '@kanto-mmo/shared';
import { getItem, getSpecies } from '@kanto-mmo/shared';

/**
 * DOM-based trade negotiation panel (Milestone 5 Trading), styled
 * consistently with `inventoryPanel.ts`/`shopOverlay.ts`. Shows both
 * sides' offered items/creatures with add/remove controls on the local
 * player's side, a confirm/lock button, and the opponent's live offer +
 * confirmation state. Any local offer change re-sends the full offer to
 * the server (which resets both sides' confirmations — "both must
 * re-confirm after any change" is enforced server-side, this panel just
 * reflects that state back).
 */
export interface TradePanelContext {
  opponentName: string;
  /** Our own inventory/party/storage, to build the "what can I offer" controls. */
  inventory: InventorySlot[];
  party: CreatureInstance[];
  storage: CreatureInstance[];
}

export interface TradePanelState {
  /** Our own current offer (items + creature instance ids), mirrored from the server. */
  myOffer: TradeOffer;
  /** The opponent's current offer, plus resolved creature data for display. */
  theirOffer: TradeOffer;
  theirOfferCreatures: CreatureInstance[];
  myConfirmed: boolean;
  theirConfirmed: boolean;
}

export interface TradePanelHandlers {
  onOfferChange: (offer: TradeOffer) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

let ctx: TradePanelContext | null = null;
let state: TradePanelState = {
  myOffer: { items: [], creatureInstanceIds: [] },
  theirOffer: { items: [], creatureInstanceIds: [] },
  theirOfferCreatures: [],
  myConfirmed: false,
  theirConfirmed: false,
};
let handlers: TradePanelHandlers | null = null;

export function showTradePanel(panelContext: TradePanelContext, panelHandlers: TradePanelHandlers): void {
  ctx = panelContext;
  handlers = panelHandlers;
  state = {
    myOffer: { items: [], creatureInstanceIds: [] },
    theirOffer: { items: [], creatureInstanceIds: [] },
    theirOfferCreatures: [],
    myConfirmed: false,
    theirConfirmed: false,
  };
  render();
}

export function updateTradePanelState(partial: Partial<TradePanelState>): void {
  state = { ...state, ...partial };
  if (document.getElementById('trade-overlay')) render();
}

export function hideTradePanel(): void {
  document.getElementById('trade-overlay')?.remove();
}

export function isTradePanelOpen(): boolean {
  return Boolean(document.getElementById('trade-overlay'));
}

/** Shows a short-lived result banner in place of the panel (success or failure), then closes. */
export function showTradeResultBanner(message: string, onDone: () => void): void {
  document.getElementById('trade-overlay')?.remove();
  const banner = document.createElement('div');
  banner.id = 'trade-overlay';
  banner.innerHTML = `
    <style>
      #trade-overlay { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); background: #1b1f27; border: 2px solid #333; padding: 16px 20px; border-radius: 6px; font-family: monospace; color: #fff; z-index: 1000; }
    </style>
    <p>${escapeHtml(message)}</p>
  `;
  document.body.appendChild(banner);
  window.setTimeout(() => {
    banner.remove();
    onDone();
  }, 2200);
}

function toggleItemOffer(itemId: number, quantity: number): void {
  const items = state.myOffer.items.filter((slot) => slot.itemId !== itemId);
  if (quantity > 0) items.push({ itemId, quantity });
  emitOfferChange({ ...state.myOffer, items });
}

function toggleCreatureOffer(instanceId: string, offered: boolean): void {
  const creatureInstanceIds = offered
    ? [...state.myOffer.creatureInstanceIds, instanceId]
    : state.myOffer.creatureInstanceIds.filter((id) => id !== instanceId);
  emitOfferChange({ ...state.myOffer, creatureInstanceIds });
}

function emitOfferChange(offer: TradeOffer): void {
  state = { ...state, myOffer: offer, myConfirmed: false };
  handlers?.onOfferChange(offer);
  render();
}

function render(): void {
  if (!ctx) return;
  document.getElementById('trade-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'trade-overlay';
  overlay.innerHTML = `
    <style>
      #trade-overlay { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); background: #1b1f27; border: 2px solid #333; padding: 14px; width: 520px; max-height: 80vh; overflow-y: auto; border-radius: 6px; font-family: monospace; color: #fff; z-index: 1000; }
      #trade-overlay h3 { margin: 0 0 10px; font-size: 14px; }
      #trade-overlay .columns { display: flex; gap: 14px; }
      #trade-overlay .column { flex: 1; border: 1px solid #333; border-radius: 4px; padding: 8px; min-height: 160px; }
      #trade-overlay .column h4 { margin: 0 0 6px; font-size: 12px; color: #ffe066; }
      #trade-overlay .row { display: flex; align-items: center; justify-content: space-between; font-size: 11px; padding: 3px 0; }
      #trade-overlay .row input[type=number] { width: 42px; font-family: monospace; }
      #trade-overlay .offered { color: #8fe08f; font-size: 11px; padding: 2px 0; }
      #trade-overlay .empty { color: #888; font-size: 11px; }
      #trade-overlay .status { margin-top: 10px; font-size: 11px; }
      #trade-overlay .status .yes { color: #8fe08f; }
      #trade-overlay .status .no { color: #ff8a3d; }
      #trade-overlay .actions { margin-top: 10px; display: flex; gap: 8px; }
      #trade-overlay button { font-family: monospace; font-size: 12px; border: none; padding: 7px 10px; cursor: pointer; color: #fff; }
      #trade-overlay .confirm { background: #2d8f4e; flex: 1; }
      #trade-overlay .confirm.confirmed { background: #1f6e2d; }
      #trade-overlay .cancel { background: #8f2d2d; }
      #trade-overlay .close { float: right; background: #8f2d2d; }
    </style>
    <button class="close" id="trade-close">X</button>
    <h3>Trading with ${escapeHtml(ctx.opponentName)}</h3>
    <div class="columns">
      <div class="column" id="trade-mine"><h4>Your Offer</h4></div>
      <div class="column" id="trade-theirs"><h4>Their Offer</h4></div>
    </div>
    <div class="status">
      You: <span class="${state.myConfirmed ? 'yes' : 'no'}">${state.myConfirmed ? 'Confirmed' : 'Not confirmed'}</span>
      &nbsp;|&nbsp;
      ${escapeHtml(ctx.opponentName)}: <span class="${state.theirConfirmed ? 'yes' : 'no'}">${state.theirConfirmed ? 'Confirmed' : 'Not confirmed'}</span>
    </div>
    <div class="actions">
      <button class="confirm ${state.myConfirmed ? 'confirmed' : ''}" id="trade-confirm">${state.myConfirmed ? 'Confirmed ✓' : 'Confirm'}</button>
      <button class="cancel" id="trade-cancel">Cancel Trade</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#trade-close')?.addEventListener('click', () => handlers?.onCancel());
  overlay.querySelector('#trade-cancel')?.addEventListener('click', () => handlers?.onCancel());
  overlay.querySelector('#trade-confirm')?.addEventListener('click', () => {
    state = { ...state, myConfirmed: true };
    handlers?.onConfirm();
    render();
  });

  renderMyColumn(overlay.querySelector('#trade-mine') as HTMLDivElement);
  renderTheirColumn(overlay.querySelector('#trade-theirs') as HTMLDivElement);
}

function renderMyColumn(container: HTMLDivElement): void {
  if (!ctx) return;

  const itemsHeader = document.createElement('div');
  itemsHeader.innerHTML = '<strong style="font-size:11px;">Items</strong>';
  container.appendChild(itemsHeader);

  if (ctx.inventory.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No items.';
    container.appendChild(empty);
  }
  for (const slot of ctx.inventory) {
    const item = getItem(slot.itemId);
    const offeredQty = state.myOffer.items.find((o) => o.itemId === slot.itemId)?.quantity ?? 0;
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <span>${escapeHtml(item.name)} (own ${slot.quantity})</span>
      <input type="number" min="0" max="${slot.quantity}" value="${offeredQty}" />
    `;
    const input = row.querySelector('input') as HTMLInputElement;
    input.addEventListener('change', () => {
      const raw = Number(input.value);
      const clamped = Number.isFinite(raw) ? Math.max(0, Math.min(slot.quantity, Math.floor(raw))) : 0;
      input.value = String(clamped);
      toggleItemOffer(slot.itemId, clamped);
    });
    container.appendChild(row);
  }

  const creaturesHeader = document.createElement('div');
  creaturesHeader.innerHTML = '<strong style="font-size:11px;">Creatures</strong>';
  creaturesHeader.style.marginTop = '8px';
  container.appendChild(creaturesHeader);

  const allMyCreatures = [...ctx.party, ...ctx.storage];
  if (allMyCreatures.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No creatures.';
    container.appendChild(empty);
  }
  for (const creature of allMyCreatures) {
    const species = getSpecies(creature.speciesId);
    const offered = state.myOffer.creatureInstanceIds.includes(creature.instanceId);
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <span>${escapeHtml(species.name)} (Lv.${creature.level})</span>
      <input type="checkbox" ${offered ? 'checked' : ''} />
    `;
    const checkbox = row.querySelector('input') as HTMLInputElement;
    checkbox.addEventListener('change', () => toggleCreatureOffer(creature.instanceId, checkbox.checked));
    container.appendChild(row);
  }
}

function renderTheirColumn(container: HTMLDivElement): void {
  const itemsHeader = document.createElement('div');
  itemsHeader.innerHTML = '<strong style="font-size:11px;">Items</strong>';
  container.appendChild(itemsHeader);

  if (state.theirOffer.items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Nothing offered.';
    container.appendChild(empty);
  }
  for (const slot of state.theirOffer.items) {
    const item = getItem(slot.itemId);
    const row = document.createElement('div');
    row.className = 'offered';
    row.textContent = `${item.name} x${slot.quantity}`;
    container.appendChild(row);
  }

  const creaturesHeader = document.createElement('div');
  creaturesHeader.innerHTML = '<strong style="font-size:11px;">Creatures</strong>';
  creaturesHeader.style.marginTop = '8px';
  container.appendChild(creaturesHeader);

  if (state.theirOfferCreatures.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Nothing offered.';
    container.appendChild(empty);
  }
  for (const creature of state.theirOfferCreatures) {
    const species = getSpecies(creature.speciesId);
    const row = document.createElement('div');
    row.className = 'offered';
    row.textContent = `${species.name} (Lv.${creature.level})`;
    container.appendChild(row);
  }
}

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

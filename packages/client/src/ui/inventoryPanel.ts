import type { CreatureInstance, InventorySlot } from '@kanto-mmo/shared';
import { getItem, getSpecies } from '@kanto-mmo/shared';

/**
 * DOM-based inventory panel (Milestone 2 Inventory & Items), styled
 * consistently with `challengeOverlay.ts`. Lists held items with
 * quantities; healing/boost items can be used on a party creature picked
 * from a small target list. Capture items are overworld-only unusable
 * (they're battle-only), so they're shown but without a Use button here.
 */
export interface InventoryPanelData {
  inventory: InventorySlot[];
  party: CreatureInstance[];
  currency: number;
}

let currentData: InventoryPanelData | null = null;
let useHandler: ((itemId: number, instanceId: string) => void) | null = null;

export function showInventoryPanel(
  data: InventoryPanelData,
  onUse: (itemId: number, instanceId: string) => void,
): void {
  currentData = data;
  useHandler = onUse;
  render();
}

export function updateInventoryPanel(data: Partial<InventoryPanelData>): void {
  if (!currentData) return;
  currentData = { ...currentData, ...data };
  if (document.getElementById('inventory-overlay')) render();
}

export function hideInventoryPanel(): void {
  document.getElementById('inventory-overlay')?.remove();
}

export function isInventoryPanelOpen(): boolean {
  return Boolean(document.getElementById('inventory-overlay'));
}

function render(): void {
  if (!currentData) return;
  document.getElementById('inventory-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'inventory-overlay';
  overlay.innerHTML = `
    <style>
      #inventory-overlay { position: fixed; top: 16px; left: 16px; background: #1b1f27; border: 2px solid #333; padding: 14px; width: 260px; max-height: 70vh; overflow-y: auto; border-radius: 6px; font-family: monospace; color: #fff; z-index: 1000; }
      #inventory-overlay h3 { margin: 0 0 8px; font-size: 14px; }
      #inventory-overlay .currency { color: #ffe066; margin-bottom: 10px; font-size: 12px; }
      #inventory-overlay .slot { border-top: 1px solid #333; padding: 8px 0; }
      #inventory-overlay .slot-name { font-size: 12px; }
      #inventory-overlay .slot-desc { font-size: 10px; color: #aaa; margin: 2px 0 6px; }
      #inventory-overlay select, #inventory-overlay button { font-family: monospace; font-size: 11px; }
      #inventory-overlay button { background: #2d6f8f; color: #fff; border: none; padding: 4px 8px; cursor: pointer; margin-left: 6px; }
      #inventory-overlay .close { float: right; background: #8f2d2d; }
      #inventory-overlay .empty { font-size: 12px; color: #aaa; }
    </style>
    <button class="close" id="inventory-close">X</button>
    <h3>Inventory</h3>
    <div class="currency">Currency: ${currentData.currency}</div>
    <div id="inventory-slots"></div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#inventory-close')?.addEventListener('click', hideInventoryPanel);

  const slotsContainer = overlay.querySelector('#inventory-slots') as HTMLDivElement;
  if (currentData.inventory.length === 0) {
    slotsContainer.innerHTML = '<div class="empty">No items yet. Visit the shop!</div>';
    return;
  }

  for (const slot of currentData.inventory) {
    const item = getItem(slot.itemId);
    const slotEl = document.createElement('div');
    slotEl.className = 'slot';

    const usable = item.category !== 'capture' && currentData.party.length > 0;
    const options = currentData.party
      .map((c) => `<option value="${c.instanceId}">${getSpecies(c.speciesId).name} (Lv.${c.level})</option>`)
      .join('');

    slotEl.innerHTML = `
      <div class="slot-name">${escapeHtml(item.name)} x${slot.quantity}</div>
      <div class="slot-desc">${escapeHtml(item.description)}</div>
      ${
        usable
          ? `<select class="target-select">${options}</select><button class="use-btn">Use</button>`
          : item.category === 'capture'
            ? '<div class="slot-desc">Usable during a wild battle.</div>'
            : ''
      }
    `;

    if (usable) {
      slotEl.querySelector('.use-btn')?.addEventListener('click', () => {
        const select = slotEl.querySelector('.target-select') as HTMLSelectElement;
        const instanceId = select?.value;
        if (instanceId) useHandler?.(slot.itemId, instanceId);
      });
    }

    slotsContainer.appendChild(slotEl);
  }
}

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

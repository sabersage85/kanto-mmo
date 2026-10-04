import type { ItemDefinition } from '@kanto-mmo/shared';

/**
 * DOM-based shop overlay (Milestone 2 Inventory & Items acquisition
 * mechanic): opens when the player steps onto a 'shop' tile, lists the
 * full item catalog with prices, and lets them buy one at a time against
 * their currency balance.
 */
let currentCurrency = 0;
let buyHandler: ((itemId: number) => void) | null = null;
let currentCatalog: ItemDefinition[] = [];

export function showShopOverlay(
  catalog: ItemDefinition[],
  currency: number,
  onBuy: (itemId: number) => void,
): void {
  currentCatalog = catalog;
  currentCurrency = currency;
  buyHandler = onBuy;
  render();
}

export function updateShopCurrency(currency: number): void {
  currentCurrency = currency;
  if (document.getElementById('shop-overlay')) render();
}

export function hideShopOverlay(): void {
  document.getElementById('shop-overlay')?.remove();
}

export function isShopOverlayOpen(): boolean {
  return Boolean(document.getElementById('shop-overlay'));
}

function render(): void {
  document.getElementById('shop-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'shop-overlay';
  overlay.innerHTML = `
    <style>
      #shop-overlay { position: fixed; top: 16px; right: 16px; background: #1b1f27; border: 2px solid #333; padding: 14px; width: 260px; max-height: 70vh; overflow-y: auto; border-radius: 6px; font-family: monospace; color: #fff; z-index: 1000; }
      #shop-overlay h3 { margin: 0 0 8px; font-size: 14px; }
      #shop-overlay .currency { color: #ffe066; margin-bottom: 10px; font-size: 12px; }
      #shop-overlay .item { border-top: 1px solid #333; padding: 8px 0; display: flex; justify-content: space-between; align-items: center; }
      #shop-overlay .item-info { font-size: 12px; }
      #shop-overlay .item-desc { font-size: 10px; color: #aaa; margin-top: 2px; max-width: 160px; }
      #shop-overlay button { font-family: monospace; font-size: 11px; background: #2d8f4e; color: #fff; border: none; padding: 5px 8px; cursor: pointer; }
      #shop-overlay button:disabled { background: #555; cursor: not-allowed; }
      #shop-overlay .close { float: right; background: #8f2d2d; }
    </style>
    <button class="close" id="shop-close">X</button>
    <h3>Shop</h3>
    <div class="currency">Currency: ${currentCurrency}</div>
    <div id="shop-items"></div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#shop-close')?.addEventListener('click', hideShopOverlay);

  const itemsContainer = overlay.querySelector('#shop-items') as HTMLDivElement;
  for (const item of currentCatalog) {
    const row = document.createElement('div');
    row.className = 'item';
    const affordable = currentCurrency >= item.price;
    row.innerHTML = `
      <div class="item-info">${escapeHtml(item.name)} — ${item.price}g<div class="item-desc">${escapeHtml(item.description)}</div></div>
      <button ${affordable ? '' : 'disabled'}>Buy</button>
    `;
    row.querySelector('button')?.addEventListener('click', () => buyHandler?.(item.id));
    itemsContainer.appendChild(row);
  }
}

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

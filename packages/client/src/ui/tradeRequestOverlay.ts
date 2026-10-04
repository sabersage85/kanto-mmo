/**
 * Minimal DOM-based incoming-trade-request prompt (Milestone 5 Trading),
 * styled consistently with `challengeOverlay.ts`. Auto-declines after
 * `AUTO_DECLINE_MS` to match the server's request TTL, so a stale prompt
 * doesn't linger after the requester moved on.
 */
const AUTO_DECLINE_MS = 20_000;

export function showTradeRequestOverlay(fromName: string, onRespond: (accept: boolean) => void): void {
  // Only one incoming-request prompt at a time.
  document.getElementById('trade-request-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'trade-request-overlay';
  overlay.innerHTML = `
    <style>
      #trade-request-overlay { position: fixed; top: 16px; right: 16px; background: #1b1f27; border: 2px solid #333; padding: 16px; width: 220px; border-radius: 6px; font-family: monospace; color: #fff; z-index: 1000; }
      #trade-request-overlay p { margin: 0 0 10px; font-size: 13px; }
      #trade-request-overlay .row { display: flex; gap: 8px; }
      #trade-request-overlay button { flex: 1; padding: 7px; border: none; color: #fff; cursor: pointer; font-family: monospace; }
      #trade-request-overlay .accept { background: #2d8f4e; }
      #trade-request-overlay .decline { background: #8f2d2d; }
    </style>
    <p>${escapeHtml(fromName)} wants to trade!</p>
    <div class="row">
      <button class="accept" id="trade-request-accept">Accept</button>
      <button class="decline" id="trade-request-decline">Decline</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const timeout = window.setTimeout(() => respond(false), AUTO_DECLINE_MS);

  function respond(accept: boolean): void {
    window.clearTimeout(timeout);
    overlay.remove();
    onRespond(accept);
  }

  overlay.querySelector('#trade-request-accept')?.addEventListener('click', () => respond(true));
  overlay.querySelector('#trade-request-decline')?.addEventListener('click', () => respond(false));
}

export function hideTradeRequestOverlay(): void {
  document.getElementById('trade-request-overlay')?.remove();
}

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

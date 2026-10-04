/**
 * Minimal DOM-based incoming-challenge prompt (Milestone 4 PvP), styled
 * consistently with `authOverlay.ts` — plain HTML, no custom graphics.
 * Auto-declines after `AUTO_DECLINE_MS` to match the server's challenge
 * TTL, so a stale prompt doesn't linger after the challenger moved on.
 */
const AUTO_DECLINE_MS = 20_000;

export function showChallengeOverlay(
  fromName: string,
  onRespond: (accept: boolean) => void,
): void {
  // Only one incoming-challenge prompt at a time.
  document.getElementById('challenge-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'challenge-overlay';
  overlay.innerHTML = `
    <style>
      #challenge-overlay { position: fixed; top: 16px; right: 16px; background: #1b1f27; border: 2px solid #333; padding: 16px; width: 220px; border-radius: 6px; font-family: monospace; color: #fff; z-index: 1000; }
      #challenge-overlay p { margin: 0 0 10px; font-size: 13px; }
      #challenge-overlay .row { display: flex; gap: 8px; }
      #challenge-overlay button { flex: 1; padding: 7px; border: none; color: #fff; cursor: pointer; font-family: monospace; }
      #challenge-overlay .accept { background: #2d8f4e; }
      #challenge-overlay .decline { background: #8f2d2d; }
    </style>
    <p>${escapeHtml(fromName)} wants to battle!</p>
    <div class="row">
      <button class="accept" id="challenge-accept">Accept</button>
      <button class="decline" id="challenge-decline">Decline</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const timeout = window.setTimeout(() => respond(false), AUTO_DECLINE_MS);

  function respond(accept: boolean): void {
    window.clearTimeout(timeout);
    overlay.remove();
    onRespond(accept);
  }

  overlay.querySelector('#challenge-accept')?.addEventListener('click', () => respond(true));
  overlay.querySelector('#challenge-decline')?.addEventListener('click', () => respond(false));
}

export function hideChallengeOverlay(): void {
  document.getElementById('challenge-overlay')?.remove();
}

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

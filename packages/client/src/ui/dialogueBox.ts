/**
 * Minimal DOM-based NPC dialogue box (Milestone 7), styled consistently
 * with `challengeOverlay.ts` — plain HTML, no custom graphics. Supports a
 * handful of fixed lines per NPC; clicking/pressing through advances one
 * line at a time, closing automatically after the last one.
 */
export function showDialogue(name: string, lines: string[]): void {
  document.getElementById('dialogue-box')?.remove();
  if (lines.length === 0) return;

  let index = 0;

  const box = document.createElement('div');
  box.id = 'dialogue-box';
  box.innerHTML = `
    <style>
      #dialogue-box { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: #1b1f27; border: 2px solid #333; padding: 14px 18px; width: 360px; max-width: 80vw; border-radius: 6px; font-family: monospace; color: #fff; z-index: 1000; }
      #dialogue-box .name { color: #ffd166; font-size: 12px; margin-bottom: 6px; font-weight: bold; }
      #dialogue-box .line { font-size: 13px; line-height: 1.4; min-height: 36px; }
      #dialogue-box .hint { text-align: right; color: #888; font-size: 10px; margin-top: 8px; }
    </style>
    <div class="name">${escapeHtml(name)}</div>
    <div class="line" id="dialogue-line"></div>
    <div class="hint">Click to continue</div>
  `;
  document.body.appendChild(box);

  const lineEl = box.querySelector('#dialogue-line') as HTMLElement;

  function render(): void {
    lineEl.textContent = lines[index];
  }
  render();

  box.addEventListener('click', () => {
    index += 1;
    if (index >= lines.length) {
      box.remove();
      return;
    }
    render();
  });
}

export function hideDialogue(): void {
  document.getElementById('dialogue-box')?.remove();
}

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

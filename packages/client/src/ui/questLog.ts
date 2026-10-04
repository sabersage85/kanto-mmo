/**
 * Minimal DOM-based quest-log panel (Milestone 7 "Murk Crew" questline).
 * Toggled with the [Q] key, consistent with the inventory panel's [I]
 * toggle; shows just the current stage's title/description, since the
 * server intentionally tracks only a single current-stage integer (no
 * full quest-engine, per the brief's "simple state tracking" scope).
 */
let currentStage = 0;
let currentTitle = 'Murk Crew';
let currentDescription = '';

export function updateQuestLog(stage: number, title: string, description: string): void {
  currentStage = stage;
  currentTitle = title;
  currentDescription = description;
  const body = document.getElementById('quest-log-body');
  if (body) body.textContent = currentDescription;
  const heading = document.getElementById('quest-log-title');
  if (heading) heading.textContent = currentTitle;
}

export function isQuestLogOpen(): boolean {
  return document.getElementById('quest-log-panel') !== null;
}

export function showQuestLog(): void {
  if (isQuestLogOpen()) return;

  const panel = document.createElement('div');
  panel.id = 'quest-log-panel';
  panel.innerHTML = `
    <style>
      #quest-log-panel { position: fixed; top: 16px; left: 16px; background: #1b1f27; border: 2px solid #333; padding: 12px 14px; width: 220px; border-radius: 6px; font-family: monospace; color: #fff; z-index: 999; }
      #quest-log-panel .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
      #quest-log-panel h3 { margin: 0; font-size: 12px; color: #ffd166; }
      #quest-log-panel .close { cursor: pointer; color: #888; font-size: 12px; }
      #quest-log-panel .body { font-size: 11px; line-height: 1.4; color: #ccc; }
    </style>
    <div class="header">
      <h3 id="quest-log-title">${escapeHtml(currentTitle)}</h3>
      <span class="close" id="quest-log-close">[Q]</span>
    </div>
    <div class="body" id="quest-log-body">${escapeHtml(currentDescription)}</div>
  `;
  document.body.appendChild(panel);
  panel.querySelector('#quest-log-close')?.addEventListener('click', hideQuestLog);
}

export function hideQuestLog(): void {
  document.getElementById('quest-log-panel')?.remove();
}

export function getQuestStage(): number {
  return currentStage;
}

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

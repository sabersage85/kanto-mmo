import { login, register, type StoredSession } from '../net.js';

/**
 * Minimal DOM-based login/register overlay (no Phaser scene needed for this —
 * consistent with the project's "no copied art" rule since it's just plain
 * HTML form controls, no custom graphics at all). Resolves once a session is
 * established, after which the caller should remove this from the page.
 */
export function showAuthOverlay(): Promise<StoredSession> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.innerHTML = `
      <style>
        #auth-overlay { position: fixed; inset: 0; background: #111; display: flex; align-items: center; justify-content: center; font-family: monospace; color: #fff; z-index: 1000; }
        #auth-overlay .panel { background: #1b1f27; border: 2px solid #333; padding: 24px; width: 260px; border-radius: 6px; }
        #auth-overlay h1 { font-size: 18px; margin: 0 0 14px; text-align: center; }
        #auth-overlay input { width: 100%; box-sizing: border-box; margin-bottom: 8px; padding: 7px; background: #0d0f13; border: 1px solid #444; color: #fff; font-family: monospace; }
        #auth-overlay button { width: 100%; padding: 8px; margin-top: 4px; background: #2d6cdf; border: none; color: #fff; cursor: pointer; font-family: monospace; }
        #auth-overlay button:disabled { opacity: 0.6; cursor: default; }
        #auth-overlay button.secondary { background: transparent; color: #9db4ff; text-decoration: underline; margin-top: 10px; }
        #auth-overlay .error { color: #ff6b6b; min-height: 16px; font-size: 12px; margin-top: 4px; }
      </style>
      <div class="panel">
        <h1 id="auth-title">Log in</h1>
        <input id="auth-email" type="email" placeholder="Email" autocomplete="username" />
        <input id="auth-password" type="password" placeholder="Password (8+ chars)" autocomplete="current-password" />
        <input id="auth-name" type="text" placeholder="Trainer name (optional)" style="display:none" />
        <button id="auth-submit">Log in</button>
        <div class="error" id="auth-error"></div>
        <button class="secondary" id="auth-toggle">Need an account? Register</button>
      </div>
    `;
    document.body.appendChild(overlay);

    let mode: 'login' | 'register' = 'login';
    const title = overlay.querySelector<HTMLElement>('#auth-title')!;
    const emailInput = overlay.querySelector<HTMLInputElement>('#auth-email')!;
    const passwordInput = overlay.querySelector<HTMLInputElement>('#auth-password')!;
    const nameInput = overlay.querySelector<HTMLInputElement>('#auth-name')!;
    const submitButton = overlay.querySelector<HTMLButtonElement>('#auth-submit')!;
    const toggleButton = overlay.querySelector<HTMLButtonElement>('#auth-toggle')!;
    const errorText = overlay.querySelector<HTMLElement>('#auth-error')!;

    toggleButton.addEventListener('click', () => {
      mode = mode === 'login' ? 'register' : 'login';
      title.textContent = mode === 'login' ? 'Log in' : 'Register';
      submitButton.textContent = mode === 'login' ? 'Log in' : 'Create account';
      toggleButton.textContent =
        mode === 'login' ? 'Need an account? Register' : 'Already have an account? Log in';
      nameInput.style.display = mode === 'register' ? 'block' : 'none';
      errorText.textContent = '';
    });

    submitButton.addEventListener('click', () => void submit());
    for (const input of [emailInput, passwordInput, nameInput]) {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') void submit();
      });
    }

    async function submit(): Promise<void> {
      errorText.textContent = '';
      submitButton.disabled = true;
      try {
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const session =
          mode === 'login'
            ? await login(email, password)
            : await register(email, password, nameInput.value.trim() || undefined);
        overlay.remove();
        resolve(session);
      } catch (err) {
        errorText.textContent = err instanceof Error ? err.message : 'Something went wrong.';
      } finally {
        submitButton.disabled = false;
      }
    }
  });
}

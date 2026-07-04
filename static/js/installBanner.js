/**
 * TaiAi PWA install banner.
 *
 * Captures the `beforeinstallprompt` event when the browser fires it (Chrome,
 * Edge, Samsung Internet, etc.), persists the event across page reloads via
 * sessionStorage, and exposes a small dismissible banner with an Install button.
 *
 * On Firefox / Safari the event never fires, so the banner never shows — which
 * is correct (those browsers don't yet implement the install prompt API).
 *
 * Usage: <script src="/static/js/installBanner.js" defer></script>
 * (the file is fully self-contained — no app.js dependency).
 */
(function () {
  'use strict';

  const STORAGE_KEY_DISMISS = 'TaiAi-install-dismissed';
  const STORAGE_KEY_INSTALLED = 'TaiAi-installed';
  // The beforeinstallprompt event is non-serializable; we stash the bare
  // minimum (prompt, userChoice) into sessionStorage via JSON-then-restore
  // is not possible across reloads. Instead, we restore the *intent* and
  // re-prompt when the browser fires the event again. sessionStorage is
  // enough because reloading same-tab keeps the event object alive in memory.
  let _deferredPrompt = null;

  function _isDismissed() {
    try { return !!sessionStorage.getItem(STORAGE_KEY_DISMISS); } catch (_) { return false; }
  }
  function _markDismissed() {
    try { sessionStorage.setItem(STORAGE_KEY_DISMISS, '1'); } catch (_) {}
  }
  function _isInstalled() {
    // 1) explicit flag (set after a successful install prompt or after we
    //    detect display-mode=standalone).
    try { if (sessionStorage.getItem(STORAGE_KEY_INSTALLED)) return true; } catch (_) {}
    // 2) standalone media query (PWA already installed and launched).
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    } catch (_) {}
    // 3) iOS Safari hack — navigator.standalone is true when launched from home screen.
    try { if (window.navigator && window.navigator.standalone === true) return true; } catch (_) {}
    return false;
  }
  function _markInstalled() {
    try { sessionStorage.setItem(STORAGE_KEY_INSTALLED, '1'); } catch (_) {}
  }

  function _banner() {
    let el = document.getElementById('TaiAi-install-banner');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'TaiAi-install-banner';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Install TaiAi as an app');
    el.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:24px',
      'transform:translateX(-50%) translateY(120%)',
      'display:flex',
      'align-items:center',
      'gap:12px',
      'padding:12px 16px',
      'background:var(--panel, #11111e)',
      'color:var(--fg, #e8e8f0)',
      'border:1px solid var(--border, #355a66)',
      'border-radius:10px',
      'box-shadow:0 12px 36px rgba(0,0,0,0.45)',
      'font:13px/1.4 system-ui,sans-serif',
      'z-index:100000',
      'max-width:calc(100vw - 32px)',
      'transition:transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      'pointer-events:auto',
    ].join(';');
    el.innerHTML =
      '<span style="display:inline-flex;color:var(--red,#e06c75);">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/>' +
        '</svg>' +
      '</span>' +
      '<span style="display:flex;flex-direction:column;gap:1px;min-width:0;">' +
        '<strong style="font-size:13px;">Install TaiAi</strong>' +
        '<span style="font-size:11px;opacity:0.75;">Add to home screen for one-click access.</span>' +
      '</span>' +
      '<button type="button" id="TaiAi-install-go" style="' +
        'appearance:none;border:1px solid var(--red,#e06c75);background:var(--red,#e06c75);' +
        'color:#0c0c12;padding:6px 12px;border-radius:6px;cursor:pointer;font:inherit;font-weight:600;' +
        '">Install</button>' +
      '<button type="button" id="TaiAi-install-dismiss" aria-label="Dismiss install banner" style="' +
        'appearance:none;border:none;background:transparent;color:var(--fg,#e8e8f0);opacity:0.5;' +
        'cursor:pointer;font:inherit;padding:4px 6px;font-size:16px;line-height:1;" +
        '">✕</button>';
    document.body.appendChild(el);
    return el;
  }

  function _show() {
    if (_isDismissed() || _isInstalled()) return;
    const el = _banner();
    // Animate in
    requestAnimationFrame(() => {
      el.style.transform = 'translateX(-50%) translateY(0)';
    });
    const go = document.getElementById('TaiAi-install-go');
    const dismiss = document.getElementById('TaiAi-install-dismiss');
    if (go) go.onclick = async () => {
      if (!_deferredPrompt) return;
      try {
        _deferredPrompt.prompt();
        const choice = await _deferredPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          _markInstalled();
          _hide();
        }
      } catch (e) {
        // ignore — banner stays visible
      }
      _deferredPrompt = null;
    };
    if (dismiss) dismiss.onclick = () => {
      _markDismissed();
      _hide();
    };
  }

  function _hide() {
    const el = document.getElementById('TaiAi-install-banner');
    if (!el) return;
    el.style.transform = 'translateX(-50%) translateY(120%)';
    setTimeout(() => { try { el.remove(); } catch (_) {} }, 320);
  }

  // Capture the install event (Chrome / Edge).
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredPrompt = e;
    _show();
  });

  // After successful install, hide the banner and remember it.
  window.addEventListener('appinstalled', () => {
    _markInstalled();
    _hide();
    _deferredPrompt = null;
  });

  // If the page is already running in standalone mode (already installed),
  // set the flag so we never show again in this browser.
  if (_isInstalled()) _markInstalled();

  // Expose a tiny API for debugging / future admin-triggered install.
  window._TaiAiInstall = {
    show: _show,
    hide: _hide,
    canInstall: () => !!_deferredPrompt,
    isInstalled: _isInstalled,
  };
})();

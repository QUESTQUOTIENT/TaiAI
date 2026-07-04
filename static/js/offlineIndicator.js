/**
 * Offline status indicator + queued-action replay.
 *
 * Phase 2.9. Listens to `online`/`offline` window events and to the
 * browser's `navigator.onLine` state at boot. When offline:
 *
 *   - Shows a sticky banner at the top with the disconnect reason
 *     (offline / server unreachable) and a Retry button.
 *   - Queues any user-initiated fetch POST that failed with a
 *     network error, replays them when back online (with a max age so
 *     the queue doesn't grow unbounded).
 *
 * This complements the existing PWA service worker (which caches the
 * shell + static assets) by surfacing the connection state to the user
 * and giving them a way to retry lost writes.
 */
(function () {
  'use strict';

  const QUEUE_KEY = 'TaiAi-offline-queue';
  const MAX_AGE_MS = 30 * 60 * 1000;        // 30 min
  const MAX_QUEUE = 50;

  function _esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function _loadQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') || []; }
    catch (_) { return []; }
  }
  function _saveQueue(q) {
    try {
      // Trim before saving: drop expired entries + cap to MAX_QUEUE.
      const now = Date.now();
      const trimmed = q.filter(e => (now - e.queued_at) < MAX_AGE_MS).slice(-MAX_QUEUE);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed));
      return trimmed;
    } catch (_) { return q; }
  }

  function _renderBanner(visible, reason) {
    let el = document.getElementById('TaiAi-offline-banner');
    if (!visible) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = 'TaiAi-offline-banner';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.style.cssText = [
        'position:fixed',
        'left:0', 'right:0', 'top:0',
        'z-index:100001',
        'display:flex', 'align-items:center', 'gap:12px',
        'padding:10px 16px',
        'background:#7a1f1f',
        'color:#fff',
        'font:13px/1.4 system-ui,sans-serif',
        'box-shadow:0 2px 8px rgba(0,0,0,0.35)',
      ].join(';');
      document.body.appendChild(el);
    }
    const queueLen = _loadQueue().length;
    el.innerHTML = ''
      + '<strong style="color:#fff;">Offline.</strong> '
      + '<span>' + _esc(reason || 'No network connection') + '</span>'
      + '<span style="margin-left:auto;display:flex;gap:8px;align-items:center;">'
      +   '<span style="opacity:0.85;font-size:11px;">'
      +     (queueLen > 0 ? queueLen + ' action' + (queueLen === 1 ? '' : 's') + ' queued' : '')
      +   '</span>'
      +   '<button type="button" id="TaiAi-offline-retry" style="'
      +     'appearance:none;border:1px solid #fff;background:transparent;color:#fff;'
      +     'padding:4px 10px;border-radius:4px;cursor:pointer;font:inherit;">'
      +     'Retry</button>'
      +   '<button type="button" id="TaiAi-offline-dismiss" aria-label="Dismiss" style="'
      +     'appearance:none;border:none;background:transparent;color:#fff;'
      +     'opacity:0.7;cursor:pointer;font:inherit;padding:4px 8px;font-size:16px;">'
      +     '&#x2715;</button>'
      + '</span>';
    const retry = document.getElementById('TaiAi-offline-retry');
    const dismiss = document.getElementById('TaiAi-offline-dismiss');
    if (retry) retry.onclick = () => _checkAndRetry();
    if (dismiss) dismiss.onclick = () => _renderBanner(false, '');
  }

  async function _checkAndRetry() {
    try {
      const r = await fetch('/api/version', { credentials: 'same-origin', cache: 'no-store' });
      if (r.ok) {
        // Server reachable. Replay queue.
        await _replayQueue();
        _renderBanner(false, '');
      } else {
        _renderBanner(true, 'Server returned ' + r.status + ' — retrying.');
      }
    } catch (e) {
      _renderBanner(true, 'Still unreachable: ' + (e && e.message ? e.message : e));
    }
  }

  async function _replayQueue() {
    const queue = _loadQueue();
    if (!queue.length) return;
    const remaining = [];
    for (const entry of queue) {
      try {
        const r = await fetch(entry.url, {
          method: entry.method || 'POST',
          credentials: 'same-origin',
          headers: entry.headers || { 'Content-Type': 'application/json' },
          body: entry.body || null,
        });
        if (!r.ok && r.status >= 500) remaining.push(entry);
      } catch (_) {
        remaining.push(entry);
      }
    }
    _saveQueue(remaining);
  }

  // Public API: callers can ask us to queue a failed POST.
  window._TaiAiOffline = {
    enqueue(url, method, headers, body) {
      const q = _loadQueue();
      q.push({ url, method: method || 'POST', headers: headers || {},
              body: body || null, queued_at: Date.now() });
      _saveQueue(q);
      _renderBanner(true, 'Network down — your last action will retry when you reconnect.');
    },
    retry: _checkAndRetry,
    queueLen() { return _loadQueue().length; },
  };

  function _init() {
    function _update() {
      const online = navigator.onLine !== false;
      if (!online) {
        _renderBanner(true, 'No network connection detected.');
      } else {
        _renderBanner(false, '');
        // On reconnect, replay queue + re-check server.
        _checkAndRetry();
      }
    }
    window.addEventListener('online', _update);
    window.addEventListener('offline', _update);
    _update();
    // Periodic server reachability ping (every 60s) so the banner can
    // distinguish "browser offline" from "server unreachable".
    setInterval(() => {
      if (navigator.onLine) {
        fetch('/api/version', { credentials: 'same-origin', cache: 'no-store' })
          .then(r => {
            if (!r.ok) _renderBanner(true, 'Server is not responding (' + r.status + ').');
          }).catch(() => {
            _renderBanner(true, 'Cannot reach server.');
          });
      }
    }, 60_000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})();

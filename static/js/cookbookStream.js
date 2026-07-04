/**
 * Cookbook Install Stream + Error Categorizer.
 *
 * Phase 1.2 UI follow-up. Companion to the server endpoints:
 *   GET  /api/cookbook/install/stream?name=<task>
 *   POST /api/cookbook/error/categorize
 *
 * Exports two functions:
 *   - watchInstall(taskName, containerEl, opts): opens an EventSource
 *     and appends each line as a styled row inside `containerEl`.
 *   - categorizeError(text): POSTs to the categorizer and renders the
 *     returned category + fix into a small banner.
 *
 * Usage from cookbook.js (or any consumer):
 *   import { watchInstall, categorizeError } from './cookbookStream.js';
 *   watchInstall('cookbook-download-abc', document.getElementById('logs'));
 *   const cat = await categorizeError(stderr);
 *   if (cat.category !== 'unknown') showFixBanner(cat);
 */

let _currentStream = null;

function _esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function _rowClass(kind) {
  switch (kind) {
    case 'stderr': return 'cbk-stream-line cbk-stream-stderr';
    case 'system': return 'cbk-stream-line cbk-stream-system';
    case 'history': return 'cbk-stream-line cbk-stream-history';
    default: return 'cbk-stream-line cbk-stream-stdout';
  }
}

export function watchInstall(taskName, container, opts = {}) {
  if (!taskName || !container) return null;
  // Close any prior stream — only one open at a time per page.
  if (_currentStream) {
    try { _currentStream.close(); } catch (_) {}
    _currentStream = null;
  }
  const maxLines = opts.maxLines || 500;
  const onDone = opts.onDone || (() => {});

  // Show a loading state while we connect + replay history.
  container.innerHTML = ''
    + '<div class="cbk-stream-status">Connecting to <code>' + _esc(taskName) + '</code> ...</div>';

  let url = '/api/cookbook/install/stream?name=' + encodeURIComponent(taskName);
  if (opts.lines) url += '&lines=' + encodeURIComponent(String(opts.lines));

  const es = new EventSource(url, { withCredentials: true });
  _currentStream = es;

  // Strip the loading status on first event.
  let firstEvent = true;

  es.onmessage = (ev) => {
    if (firstEvent) {
      firstEvent = false;
      container.innerHTML = '';
    }
    let payload = null;
    try { payload = JSON.parse(ev.data); } catch (_) { return; }
    if (!payload || typeof payload.line !== 'string') return;
    const div = document.createElement('div');
    div.className = _rowClass(payload.kind);
    div.textContent = payload.line;
    container.appendChild(div);
    // Trim if over cap.
    while (container.childElementCount > maxLines) {
      container.removeChild(container.firstChild);
    }
    // Auto-scroll only if user is at the bottom.
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    if (nearBottom) container.scrollTop = container.scrollHeight;
    if (payload.line && payload.line.indexOf('<<< stream ended >>>') !== -1) {
      es.close();
      _currentStream = null;
      onDone({ ok: true });
    }
  };

  es.onerror = () => {
    if (firstEvent) {
      // Connect failed before we got any event — likely auth or 404.
      container.innerHTML = ''
        + '<div class="cbk-stream-line cbk-stream-stderr">'
        + 'Could not connect to install stream (auth required, or task "' + _esc(taskName) + '" does not exist).'
        + '</div>';
      onDone({ ok: false, reason: 'connect-failed' });
    } else {
      // Stream dropped mid-way (server restarted, network blip).
      container.insertAdjacentHTML('beforeend',
        '<div class="cbk-stream-line cbk-stream-system">[stream disconnected]</div>');
      onDone({ ok: false, reason: 'stream-dropped' });
    }
    try { es.close(); } catch (_) {}
    if (_currentStream === es) _currentStream = null;
  };

  return es;
}

export function stopWatching() {
  if (_currentStream) {
    try { _currentStream.close(); } catch (_) {}
    _currentStream = null;
  }
}

export async function categorizeError(text) {
  if (!text || typeof text !== 'string') return { category: 'unknown', fix: '' };
  try {
    const r = await fetch('/api/cookbook/error/categorize', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) return { category: 'unknown', fix: '' };
    return await r.json();
  } catch (e) {
    return { category: 'unknown', fix: '', error: String(e) };
  }
}

/**
 * Render a fix banner into a container given the output of categorizeError.
 * Returns the banner element.
 */
export function renderFixBanner(container, cat) {
  if (!container || !cat) return null;
  const banner = document.createElement('div');
  banner.className = 'cbk-fix-banner cbk-fix-' + (cat.category || 'unknown');
  banner.setAttribute('role', 'note');
  banner.innerHTML = ''
    + '<strong>Failure category: ' + _esc(cat.category || 'unknown') + '</strong>'
    + '<div class="cbk-fix-text">' + _esc(cat.fix || 'No automatic fix available — see logs.') + '</div>';
  container.appendChild(banner);
  return banner;
}

/**
 * TaiAi Diagnostics panel - Settings > Diagnostics (admin).
 *
 * Phase 1.1 - Healthy Stack Wizard.
 *
 * Actions:
 *   1. Healthy Stack Wizard - fetches /api/health/deep which runs the
 *      central diagnostics registry (core/diagnostics.py). Renders a
 *      categorized checklist with per-row Retry buttons that re-run a
 *      single check. Each row shows status, detail, and (on warn/fail)
 *      an actionable fix suggestion.
 *   2. Export Diagnostic Bundle - collects client-side state (recent JS
 *      errors, feature flags, version) plus the server's /api/diagnostics
 *      bundle into a single JSON file the user downloads.
 *
 * Wire-up: import + call initDiagnostics() from admin.js after the
 * `settings-modal` element is in the DOM.
 */

let _initialized = false;

function _esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

const _STATUS_BADGE = {
  ok:   { glyph: 'OK',   cls: 'diag-badge-ok' },
  warn: { glyph: 'WARN', cls: 'diag-badge-warn' },
  fail: { glyph: 'FAIL', cls: 'diag-badge-fail' },
  skip: { glyph: 'SKIP', cls: 'diag-badge-skip' },
};

function _setMsg(text, cls) {
  const el = document.getElementById('diag-msg');
  if (!el) return;
  el.textContent = text || '';
  el.className = 'admin-toggle-sub' + (cls ? ' ' + cls : '');
}

function _summaryPill(summary) {
  const total = (summary && summary.total) || 0;
  const ok = (summary && summary.ok) || 0;
  const warn = (summary && summary.warn) || 0;
  const fail = (summary && summary.fail) || 0;
  const cls = fail > 0 ? 'diag-summary-fail' : (warn > 0 ? 'diag-summary-warn' : 'diag-summary-ok');
  return '<span class="diag-summary-pill ' + cls + '">' + ok + '/' + total + ' OK, ' + warn + ' warn, ' + fail + ' fail</span>';
}

function _renderWizard(results) {
  const out = document.getElementById('diag-results');
  if (!out) return;
  if (!results || !results.length) {
    out.innerHTML = '<div class="admin-empty">No checks ran.</div>';
    return;
  }
  out.innerHTML = results.map(r => {
    const badge = _STATUS_BADGE[r.status] || _STATUS_BADGE.skip;
    const fixHtml = (r.fix && (r.status === 'fail' || r.status === 'warn'))
      ? '<div class="diag-fix">' + _esc(r.fix) + '</div>' : '';
    const detailHtml = r.detail ? '<div class="diag-detail">' + _esc(r.detail) + '</div>' : '';
    return ''
      + '<div class="diag-row" data-check-id="' + _esc(r.id) + '">'
      +   '<div class="diag-row-head">'
      +     '<span class="diag-badge ' + badge.cls + '">' + badge.glyph + '</span>'
      +     '<span class="diag-label">' + _esc(r.label) + '</span>'
      +     '<code class="diag-id">' + _esc(r.id) + '</code>'
      +     '<span class="diag-elapsed">' + (r.elapsed_ms || 0) + 'ms</span>'
      +     '<button type="button" class="diag-retry" data-retry-id="' + _esc(r.id) + '">Retry</button>'
      +   '</div>'
      +   detailHtml
      +   fixHtml
      + '</div>';
  }).join('');
  // Wire per-row Retry buttons - they re-run only that single check
  out.querySelectorAll('.diag-retry').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.retryId;
      btn.disabled = true;
      const prev = btn.textContent;
      btn.textContent = 'Running...';
      try {
        const res = await fetch('/api/health/deep?ids=' + encodeURIComponent(id), {
          credentials: 'same-origin',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.results && data.results[0]) {
            // Re-render only this row inline
            _renderWizard(data.results.concat(
              results.filter(r => r.id !== id)
            ));
            return;
          }
        }
      } catch (_) {}
      btn.disabled = false;
      btn.textContent = prev;
    });
  });
}

async function _runWizard() {
  _setMsg('Running all checks...');
  try {
    const res = await fetch('/api/health/deep', { credentials: 'same-origin' });
    if (!res.ok) {
      _setMsg('Failed (HTTP ' + res.status + ').', 'admin-error');
      return;
    }
    const data = await res.json();
    _renderWizard(data.results || []);
    const summary = data.summary || {};
    const cls = summary.fail > 0 ? 'admin-error'
              : summary.warn > 0 ? 'admin-warning'
              : 'admin-success';
    _setMsg('Last run: ' + data.ran_at + '. ' + _summaryPill(summary), cls);
    try { localStorage.setItem('TaiAi-last-health', JSON.stringify({ ts: Date.now(), summary })); } catch (_) {}
  } catch (e) {
    _setMsg('Network error: ' + e.message, 'admin-error');
  }
}

async function _exportBundle() {
  _setMsg('Building bundle...');
  const errors = (window.__TaiAiRecentErrors || []).slice(-50);
  const client = {
    captured_at: new Date().toISOString(),
    url: location.href,
    user_agent: navigator.userAgent,
    online: navigator.onLine,
    cookies_enabled: navigator.cookieEnabled,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    theme: (() => { try { return JSON.parse(localStorage.getItem('TaiAi-theme') || 'null'); } catch (_) { return null; } })(),
    style_theme: (() => { try { return localStorage.getItem('TaiAi-style-theme'); } catch (_) { return null; } })(),
    flip_side: (() => { try { return localStorage.getItem('sidebar-side'); } catch (_) { return null; } })(),
    recent_errors: errors,
  };
  let server = null, health = null;
  try {
    const r = await fetch('/api/diagnostics', { credentials: 'same-origin' });
    if (r.ok) server = await r.json();
  } catch (_) {}
  try {
    const r = await fetch('/api/health/deep', { credentials: 'same-origin' });
    if (r.ok) health = await r.json();
  } catch (_) {}
  const bundle = { client, server, health };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'TaiAi-diagnostics-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 100);
  _setMsg('Bundle downloaded.', 'admin-success');
}

function _renderAbout() {
  const el = document.getElementById('diag-about');
  if (!el) return;
  el.innerHTML = ''
    + '<div><strong>TaiAi</strong> - self-hosted AI workspace.</div>'
    + '<div style="margin-top:6px;">If something is broken, run the Healthy Stack Wizard, export a diagnostic bundle, and attach it to your issue.</div>'
    + '<div style="margin-top:6px;">Repository: <a href="https://github.com/TieAI-archdaemon/TaiAi" target="_blank" rel="noopener">github.com/TieAI-archdaemon/TaiAi</a></div>'
    + '<div style="margin-top:6px;">License: AGPL-3.0 (see <code>LICENSE</code> in the project root).</div>';
}

function _renderWizardShortcuts() {
  const out = document.getElementById('diag-results');
  if (!out) return;
  out.innerHTML = ''
    + '<div class="admin-empty">'
    + 'Click <strong>Run Healthy Stack Wizard</strong> to check Ollama, GPU, ChromaDB, embeddings, search, env vars, and filesystem.'
    + ' Each row has a Retry button that re-runs only that check.'
    + '</div>';
}

export function initDiagnostics() {
  if (_initialized) return;
  _initialized = true;
  const check = document.getElementById('diag-check-btn');
  const exp = document.getElementById('diag-bundle-btn');
  if (check) check.addEventListener('click', _runWizard);
  if (exp) exp.addEventListener('click', _exportBundle);
  _renderAbout();
  _renderWizardShortcuts();

  // Capture client-side JS errors so the diagnostic bundle can include them.
  window.addEventListener('error', (e) => {
    try {
      const list = (window.__TaiAiRecentErrors = window.__TaiAiRecentErrors || []);
      list.push({
        ts: new Date().toISOString(),
        msg: e.message,
        file: e.filename,
        line: e.lineno,
        col: e.colno,
      });
      if (list.length > 200) list.shift();
    } catch (_) {}
  });
  window.addEventListener('unhandledrejection', (e) => {
    try {
      const list = (window.__TaiAiRecentErrors = window.__TaiAiRecentErrors || []);
      list.push({ ts: new Date().toISOString(), msg: 'unhandledrejection: ' + String(e.reason) });
      if (list.length > 200) list.shift();
    } catch (_) {}
  });
}

export default { initDiagnostics };

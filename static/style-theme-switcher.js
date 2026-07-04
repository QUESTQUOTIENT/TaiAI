/* ============================================================
   TaiAi Visual Style Switcher + Navigation Wiring
   Loads the selected visual style theme CSS file dynamically,
   renders a "Visual Style" grid inside the existing theme
   picker popup, and wires navigation buttons across all pages
   so the Coding tab (which only loads coding.js) can still
   reach the rest of the app.
   ============================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = 'TaiAi-style-theme';

  // 12 visual styles: 'default' is the original TaiAi look (no extra CSS).
  const STYLES = [
    { id: 'default',          label: 'TaiAi Classic', icon: '◆', accent: '#9cdef2', sample: 'linear-gradient(135deg, #282c34, #111)' },
    { id: 'cyberpunk',        label: 'Cyberpunk',     icon: '◢', accent: '#00f0ff', sample: 'linear-gradient(135deg, #07070d, #0d0d18)' },
    { id: 'chibi-anime',      label: 'Chibi Anime',   icon: '♡', accent: '#ff6fa5', sample: 'linear-gradient(135deg, #fff0f5, #ffd6e7)' },
    { id: 'kawaii-doodle',    label: 'Kawaii Doodle', icon: '✿', accent: '#ff7f7f', sample: 'linear-gradient(135deg, #fdf6e3, #fffaf0)' },
    { id: 'retro-comic',      label: 'Retro Comic',   icon: '✸', accent: '#e53935', sample: 'linear-gradient(135deg, #fff8dc, #fdd835)' },
    { id: 'synthwave',        label: 'Synthwave',     icon: '◣', accent: '#ff2bd6', sample: 'linear-gradient(135deg, #1a0033, #ff6ec7)' },
    { id: 'pop-art',          label: 'Pop Art',       icon: '✺', accent: '#ed1c24', sample: 'linear-gradient(135deg, #fff100, #ed1c24)' },
    { id: 'y2k-futuristic',   label: 'Y2K Futuristic',icon: '◇', accent: '#ff1493', sample: 'linear-gradient(135deg, #c0c0d0, #ff1493)' },
    { id: 'watercolor-sketch',label: 'Watercolor',    icon: '❀', accent: '#6a85a5', sample: 'linear-gradient(135deg, #f5efe0, #c75a5a)' },
    { id: 'claymorphic',      label: 'Claymorphic',   icon: '○', accent: '#c8a8ff', sample: 'linear-gradient(135deg, #f0e8dc, #ffb088)' },
    { id: 'vaporwave',        label: 'Vaporwave',     icon: '◐', accent: '#ff71ce', sample: 'linear-gradient(135deg, #2d0b4e, #ff71ce)' },
    { id: 'pixel-art',        label: 'Pixel Art',     icon: '▣', accent: '#ffcd75', sample: 'linear-gradient(135deg, #1a1c2c, #38b764)' }
  ];

  // 1. Apply the saved style theme (idempotent)
  function applyStyle(styleId) {
    const id = (styleId === 'default' || !STYLES.find(s => s.id === styleId)) ? null : styleId;
    document.querySelectorAll('link[data-style-theme]').forEach((el) => el.remove());
    if (id) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/static/themes/' + id + '.css';
      link.setAttribute('data-style-theme', id);
      document.head.appendChild(link);
      document.documentElement.setAttribute('data-style-theme', id);
    } else {
      document.documentElement.removeAttribute('data-style-theme');
    }
  }

  function getSavedStyle() {
    try { return localStorage.getItem(STORAGE_KEY) || 'default'; } catch (_) { return 'default'; }
  }

  function saveStyle(styleId) {
    try { localStorage.setItem(STORAGE_KEY, styleId); } catch (_) {}
  }

  // 2. Inject the "Visual Style" grid into the theme picker popup
  function ensurePickerUI() {
    const popup = document.getElementById('theme-popup')
      || document.querySelector('[data-tab="theme-tab-browse"]')
      || document.querySelector('.theme-custom')
      || document.querySelector('#theme-modal .modal-body');
    if (!popup) return false;
    if (document.getElementById('style-themes-grid')) return true;

    const section = document.createElement('div');
    section.id = 'style-themes-section';
    section.style.cssText = 'margin-top:24px;padding-top:16px;border-top:1px solid var(--border, #355a66);';
    section.innerHTML =
      '<h3 style="margin:0 0 12px;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:var(--accent, var(--red));">' +
      'Visual Style</h3>' +
      '<p style="margin:0 0 12px;font-size:11px;opacity:0.7;">Independent of color theme. Switches the entire UI style.</p>' +
      '<div id="style-themes-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;"></div>';

    const body = popup.querySelector('.modal-body') || popup;
    body.appendChild(section);

    const grid = document.getElementById('style-themes-grid');
    const current = getSavedStyle();

    STYLES.forEach((s) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.styleId = s.id;
      btn.style.cssText = [
        'display:flex',
        'flex-direction:column',
        'align-items:center',
        'gap:6px',
        'padding:10px 8px',
        'background:var(--panel, #111)',
        'border:1px solid var(--border, #355a66)',
        'border-radius:6px',
        'cursor:pointer',
        'color:var(--fg, #9cdef2)',
        'font-family:inherit',
        'font-size:11px',
        'letter-spacing:0.05em',
        'text-transform:uppercase',
        'transition:all 0.15s ease',
        'min-height:64px'
      ].join(';');
      btn.innerHTML =
        '<span style="font-size:18px;line-height:1;color:' + s.accent + ';text-shadow:0 0 6px ' + s.accent + ';">' + s.icon + '</span>' +
        '<span style="font-weight:700;">' + s.label + '</span>' +
        '<span style="width:100%;height:4px;border-radius:2px;background:' + s.sample + ';"></span>';
      btn.addEventListener('click', () => {
        saveStyle(s.id);
        applyStyle(s.id);
        highlightCurrent();
        if (window.showToast) window.showToast('Visual style: ' + s.label, 'success');
      });
      btn.addEventListener('mouseenter', () => { btn.style.borderColor = s.accent; btn.style.transform = 'translateY(-2px)'; });
      btn.addEventListener('mouseleave', () => { btn.style.borderColor = ''; btn.style.transform = ''; });
      grid.appendChild(btn);
    });

    highlightCurrent();
    return true;
  }

  function highlightCurrent() {
    const current = getSavedStyle();
    document.querySelectorAll('#style-themes-grid button[data-style-id]').forEach((b) => {
      const isCurrent = b.dataset.styleId === current;
      b.style.outline = isCurrent ? '2px solid var(--accent, var(--red))' : 'none';
      b.style.outlineOffset = isCurrent ? '2px' : '0';
      b.style.boxShadow = isCurrent ? '0 0 12px var(--accent-glow, transparent)' : 'none';
    });
  }

  // 3. Navigation wiring
  //    On /coding (or any future standalone page) only that page's JS
  //    is loaded, so its icon rail and sidebar buttons are dead. This
  //    module maps each control to a URL; the main app's route opener
  //    (app.js) handles opening the right modal once we land on /.
  const NAV_MAP = {
    // Home (back to chat)
    'rail-search-btn':       '/',
    'rail-new-session':      '/',
    'rail-delete-session':   '/',
    'sidebar-brand-btn':     '/',
    'sidebar-new-chat-btn':  '/',
    'sidebar-search-btn':    '/',
    'user-bar-settings':     '/?open=settings',
    'rail-settings':         '/?open=settings',
    'user-bar-profile':      '/?open=account',
    'user-bar-avatar':       '/?open=account',
    'user-bar-name':         '/?open=account',
    'user-bar-admin':        '/?open=admin',

    // Coding (special — full page, not modal)
    'rail-coding':           '/coding',
    'tool-coding-btn':       '/coding',

    // Tools (deep-link paths the server already serves as index.html with modal auto-opened)
    'rail-calendar':         '/calendar',
    'tool-calendar-btn':     '/calendar',
    'rail-compare':          '/',
    'rail-cookbook':         '/cookbook',
    'tool-cookbook-btn':     '/cookbook',
    'rail-research':         '/',
    'tool-research-btn':     '/',
    'rail-email':            '/email',
    'email-section-title':   '/email',
    'rail-gallery':          '/gallery',
    'tool-gallery-btn':      '/gallery',
    'rail-archive':          '/library',
    'tool-library-btn':      '/library',
    'tool-archive-btn':      '/library',
    'rail-memory':           '/memory',
    'tool-memory-btn':       '/memory',
    'rail-notes':            '/notes',
    'tool-notes-btn':        '/notes',
    'rail-tasks':            '/tasks',
    'tool-tasks-btn':        '/tasks',
    'rail-theme':            '/?open=theme',
    'tool-theme-btn':        '/?open=theme',
    'rail-info':             '/info',
    'tool-info-btn':         '/info'
  };

  function wireNavigation() {
    const path = (window.location.pathname || '').replace(/\/+$/, '') || '/';
    const isCoding = path === '/coding';
    const wired = (window.__cy_navWired = window.__cy_navWired || new Set());

    Object.keys(NAV_MAP).forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn || wired.has(id)) return;
      wired.add(id);

      const dest = NAV_MAP[id];
      const handler = (e) => {
        if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1)) return;
        if (e) { e.preventDefault(); e.stopPropagation(); }
        window.location.href = dest;
      };
      btn.addEventListener('click', handler);
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') handler(e);
      });
    });

    if (isCoding) {
      const codingRail = document.getElementById('rail-coding');
      const codingSide = document.getElementById('tool-coding-btn');
      if (codingRail) codingRail.classList.add('active');
      if (codingSide) codingSide.classList.add('active', 'active-session');
    }
  }

  /* ============================================================
     Flip Orientation
     Toggles the icon rail + sidebar between the left and right of
     the chat area. Persists to localStorage['sidebar-side'] so the
     rest of the app (sidebar-layout.js, init.js, etc.) picks up the
     same value on next load.
     ============================================================ */
  // Use the same storage key as the rest of the app (Storage.KEYS.SIDEBAR_SIDE)
  // so the Shift-click hamburger, mobile swipe-to-side gesture, and this
  // toggle all stay in sync. The previous key ('TaiAi-layout-flipped')
  // diverged from the rest of the codebase and left the flip non-functional.
  const FLIP_KEY = 'sidebar-side';
  let _flipStylesInjected = false;

  function injectFlipStyles() {
    if (_flipStylesInjected) return;
    _flipStylesInjected = true;
    // The .sidebar.right-side / .icon-rail.right-side CSS already exists in
    // style.css (lines 262-269, 418-431, 675-684, etc.) and is used by the
    // Shift-click hamburger and the mobile swipe-to-side gesture. We only
    // need to inject styles for the body-level toggle / icon affordance.
    const css = `
      .cy-flip-toggle {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        margin: 8px 0 12px;
        background: color-mix(in oklab, var(--panel, #11111e) 70%, transparent);
        border: 1px solid var(--border, #355a66);
        border-radius: 6px;
        cursor: pointer;
        font-family: inherit;
        font-size: 12px;
        color: var(--fg, #9cdef2);
        transition: all 0.15s ease;
        width: 100%;
        text-align: left;
      }
      .cy-flip-toggle:hover {
        border-color: var(--accent, var(--red));
        box-shadow: 0 0 0 1px var(--accent-soft, transparent), 0 0 12px var(--accent-glow, transparent);
        transform: translateY(-1px);
      }
      .cy-flip-toggle:active { transform: translateY(0); }
      .cy-flip-toggle .cy-flip-icon {
        width: 18px; height: 18px;
        display: grid; place-items: center;
        color: var(--accent, var(--red));
        flex-shrink: 0;
        transition: transform 0.4s var(--ease-spring, cubic-bezier(.34, 1.56, .64, 1));
      }
      .sidebar.right-side ~ .app-body .cy-flip-toggle .cy-flip-icon,
      body.layout-flipped .cy-flip-toggle .cy-flip-icon { transform: rotate(180deg); }
      .cy-flip-toggle .cy-flip-text {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .cy-flip-toggle .cy-flip-title {
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      .cy-flip-toggle .cy-flip-hint {
        font-size: 10px;
        opacity: 0.65;
        letter-spacing: 0.03em;
        text-transform: none;
        font-weight: 400;
      }
      .cy-flip-toggle .cy-flip-state {
        font-size: 10px;
        padding: 2px 8px;
        background: color-mix(in oklab, var(--accent, var(--red)) 18%, transparent);
        border: 1px solid var(--accent, var(--red));
        border-radius: 999px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 700;
      }
      .sidebar.right-side ~ .app-body .cy-flip-toggle .cy-flip-state,
      body.layout-flipped .cy-flip-toggle .cy-flip-state { background: color-mix(in oklab, var(--cy-magenta, #ff2bd6) 18%, transparent); border-color: var(--cy-magenta, #ff2bd6); }
    `.trim();
    const style = document.createElement('style');
    style.id = 'cy-flip-orientation-styles';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  function isFlipped() {
    try { return localStorage.getItem(FLIP_KEY) === 'right'; } catch (_) { return false; }
  }
  function setFlipped(on) {
    // Single source of truth — the `sidebar-side` localStorage key. Other
    // code paths (sidebar-layout.js, init.js, mobile swipe gesture) read
    // this same key, so we no longer mirror to the legacy TaiAi-layout-flipped
    // key. A migration step below covers installs that previously stored the
    // legacy value.
    try {
      const legacy = localStorage.getItem('TaiAi-layout-flipped');
      if (legacy === '1' && on) {
        // Already flipped under the legacy key — keep that intent.
      } else if (legacy !== null) {
        // Clean up the legacy key on next write so we don't keep stale state.
        localStorage.removeItem('TaiAi-layout-flipped');
      }
      localStorage.setItem(FLIP_KEY, on ? 'right' : 'left');
    } catch (_) {}
    // Apply to the same elements the rest of the app uses. Both selectors
    // already have full CSS rules in style.css (lines 262-269, 418-431, etc.),
    // so flipping these classes produces the expected layout.
    const sidebar = document.getElementById('sidebar');
    const iconRail = document.getElementById('icon-rail');
    if (sidebar) sidebar.classList.toggle('right-side', !!on);
    if (iconRail) iconRail.classList.toggle('right-side', !!on);
    // Keep body.layout-flipped in sync too — sidebar-layout.js's _syncRailSideCore
    // ORs that class with .sidebar.right-side when computing the effective side
    // for the rail, so both inputs need to stay consistent.
    document.body.classList.toggle('layout-flipped', !!on);
    updateFlipButton();
  }
  function updateFlipButton() {
    const btn = document.getElementById('cy-flip-orientation-toggle');
    if (!btn) return;
    const label = btn.querySelector('.cy-flip-state');
    if (label) label.textContent = isFlipped() ? 'Right' : 'Left';
  }

  function injectFlipToggle() {
    // Inject into the Appearance > Sidebar admin-card on Settings page.
    // Look for the Sidebar h2 inside the Appearance panel; the toggle
    // goes immediately after it (top of the card).
    const sidebarH2 = Array.from(document.querySelectorAll('[data-settings-panel="appearance"] .admin-card h2'))
      .find((h) => /sidebar/i.test(h.textContent));
    if (!sidebarH2) return false;

    // Don't double-inject
    if (document.getElementById('cy-flip-orientation-toggle')) return true;

    const card = sidebarH2.closest('.admin-card');
    if (!card) return false;

    const wrap = document.createElement('button');
    wrap.type = 'button';
    wrap.id = 'cy-flip-orientation-toggle';
    wrap.className = 'cy-flip-toggle';
    wrap.setAttribute('role', 'switch');
    wrap.setAttribute('aria-checked', isFlipped() ? 'true' : 'false');
    wrap.setAttribute('title', 'Swap the icon rail + sidebar between the left and right side of the chat area');
    wrap.innerHTML =
      '<span class="cy-flip-icon" aria-hidden="true">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>' +
        '</svg>' +
      '</span>' +
      '<span class="cy-flip-text">' +
        '<span class="cy-flip-title">Flip Orientation</span>' +
        '<span class="cy-flip-hint">Move the icon rail + sidebar to the opposite side</span>' +
      '</span>' +
      '<span class="cy-flip-state">' + (isFlipped() ? 'Right' : 'Left') + '</span>';

    wrap.addEventListener('click', () => {
      const next = !isFlipped();
      setFlipped(next);
      wrap.setAttribute('aria-checked', next ? 'true' : 'false');
      if (window.showToast) window.showToast('Layout: sidebar ' + (next ? 'right' : 'left'), 'success');
    });

    // Insert at the top of the card, right after the h2
    sidebarH2.insertAdjacentElement('afterend', wrap);
    return true;
  }

  /* ============================================================
     Free providers — one-click add a curated free chat API as an
     endpoint. Backend registry in src/free_providers.py.
     ============================================================ */
  function renderFreeProviderCard(p) {
    const card = document.createElement('div');
    card.className = 'cy-free-card';
    card.style.cssText = [
      'position:relative',
      'padding:12px',
      'background:rgba(13,13,24,0.7)',
      'border:1px solid var(--border, #355a66)',
      'border-radius:6px',
      'display:flex',
      'flex-direction:column',
      'gap:8px',
      'font-size:12px',
      'transition:all 0.15s ease'
    ].join(';');

    const accent = 'var(--accent, #00f0ff)';
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;';
    header.innerHTML =
      '<span style="font-size:18px;line-height:1;color:' + accent + ';">' + (p.logo || '◆') + '</span>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:700;color:var(--fg, #9cdef2);letter-spacing:0.04em;">' + p.name + '</div>' +
        '<div style="font-size:10px;color:var(--fg, #9cdef2);opacity:0.6;font-family:var(--font-mono, monospace);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (p.models && p.models[0] ? p.models[0] : p.id) + '</div>' +
      '</div>' +
      (p.already_added ? '<span style="font-size:9px;padding:2px 6px;background:rgba(80,250,123,0.18);border:1px solid rgba(80,250,123,0.4);border-radius:999px;color:#50fa7b;letter-spacing:0.06em;text-transform:uppercase;font-weight:700;">Added</span>' : '<span style="font-size:9px;padding:2px 6px;background:rgba(0,240,255,0.12);border:1px solid rgba(0,240,255,0.4);border-radius:999px;color:#00f0ff;letter-spacing:0.06em;text-transform:uppercase;font-weight:700;">Free</span>');
    card.appendChild(header);

    if (p.description) {
      const desc = document.createElement('div');
      desc.style.cssText = 'font-size:11px;color:var(--fg, #9cdef2);opacity:0.75;line-height:1.45;';
      desc.textContent = p.description;
      card.appendChild(desc);
    }

    if (p.needs_api_key) {
      const keyInput = document.createElement('input');
      keyInput.type = 'password';
      keyInput.placeholder = p.key_label || 'API key';
      keyInput.autocomplete = 'off';
      keyInput.style.cssText = [
        'width:100%',
        'padding:6px 10px',
        'background:var(--bg, #07070d)',
        'border:1px solid var(--border, #355a66)',
        'border-radius:4px',
        'color:var(--fg, #9cdef2)',
        'font-family:inherit',
        'font-size:11px',
        'outline:none',
        'min-height:32px'
      ].join(';');
      keyInput.addEventListener('focus', () => { keyInput.style.borderColor = accent; });
      keyInput.addEventListener('blur',  () => { keyInput.style.borderColor = ''; });
      card.appendChild(keyInput);

      if (p.key_help) {
        const help = document.createElement('a');
        help.href = p.key_help;
        help.target = '_blank';
        help.rel = 'noopener noreferrer';
        help.textContent = 'Get a free key ↗';
        help.style.cssText = 'font-size:10px;color:#00f0ff;text-decoration:none;opacity:0.7;align-self:flex-start;';
        help.addEventListener('mouseenter', () => { help.style.opacity = '1'; });
        help.addEventListener('mouseleave', () => { help.style.opacity = '0.7'; });
        card.appendChild(help);
      }

      card._keyInput = keyInput;
    }

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.style.cssText = [
      'padding:6px 12px',
      'background:var(--accent, #00f0ff)',
      'background-image:linear-gradient(135deg, var(--accent, #00f0ff), var(--cy-violet, #9b30ff))',
      'background-size:200% 200%',
      'border:1px solid var(--accent, #00f0ff)',
      'border-radius:4px',
      'color:#07070d',
      'font-family:inherit',
      'font-size:11px',
      'font-weight:700',
      'letter-spacing:0.1em',
      'text-transform:uppercase',
      'cursor:pointer',
      'transition:all 0.15s ease',
      'min-height:32px',
      'clip-path:polygon(0 6px, 6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%)'
    ].join(';');
    addBtn.textContent = p.already_added ? '✓ Added' : '+ Add endpoint';

    if (p.already_added) {
      addBtn.disabled = true;
      addBtn.style.opacity = '0.5';
      addBtn.style.cursor = 'default';
    } else {
      addBtn.addEventListener('click', async () => {
        addBtn.disabled = true;
        addBtn.textContent = 'Adding…';
        try {
          const fd = new FormData();
          fd.append('api_key', (card._keyInput && card._keyInput.value) || '');
          fd.append('shared', 'true');
          const res = await fetch('/api/free-providers/' + encodeURIComponent(p.id) + '/add', {
            method: 'POST', body: fd, credentials: 'same-origin'
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || ('HTTP ' + res.status));
          }
          addBtn.textContent = '✓ Added';
          addBtn.style.opacity = '0.7';
          if (window.showToast) window.showToast(p.name + ' added as endpoint', 'success');
          // Mark this card as added without a full reload.
          p.already_added = true;
          const headerBadge = header.querySelector('span:last-child');
          if (headerBadge) headerBadge.outerHTML = '<span style="font-size:9px;padding:2px 6px;background:rgba(80,250,123,0.18);border:1px solid rgba(80,250,123,0.4);border-radius:999px;color:#50fa7b;letter-spacing:0.06em;text-transform:uppercase;font-weight:700;">Added</span>';
        } catch (err) {
          addBtn.disabled = false;
          addBtn.textContent = '+ Add endpoint';
          if (window.showToast) window.showToast('Failed: ' + err.message, 'error');
          else alert('Failed to add ' + p.name + ': ' + err.message);
        }
      });
    }
    card.appendChild(addBtn);

    card.addEventListener('mouseenter', () => {
      card.style.borderColor = 'var(--accent, #00f0ff)';
      card.style.boxShadow = '0 0 0 1px var(--accent-soft, rgba(0,240,255,0.3)), 0 0 16px rgba(0, 240, 255, 0.2)';
      card.style.transform = 'translateY(-2px)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = '';
      card.style.boxShadow = '';
      card.style.transform = '';
    });
    return card;
  }

  async function loadFreeProviders() {
    const grid = document.getElementById('adm-free-providers-grid');
    if (!grid) return;
    if (grid.__cy_freeLoaded) return;
    grid.__cy_freeLoaded = true;
    grid.innerHTML = '<div style="opacity:0.6;font-size:11px;">Loading free providers…</div>';
    try {
      const res = await fetch('/api/free-providers', { credentials: 'same-origin' });
      if (!res.ok) {
        grid.innerHTML = '<div style="opacity:0.6;font-size:11px;color:#ff3b5c;">Failed to load (admin only?).</div>';
        return;
      }
      const data = await res.json();
      const providers = (data && data.providers) || [];
      if (!providers.length) {
        grid.innerHTML = '<div style="opacity:0.6;font-size:11px;">No providers registered.</div>';
        return;
      }
      grid.innerHTML = '';
      providers.forEach((p) => grid.appendChild(renderFreeProviderCard(p)));
    } catch (err) {
      grid.innerHTML = '<div style="opacity:0.6;font-size:11px;color:#ff3b5c;">Error: ' + err.message + '</div>';
    }
  }

  function wireFlipOrientation() {
    injectFlipStyles();
    setFlipped(isFlipped()); // apply persisted state on load
    // Try to inject the toggle now; if Settings panel isn't open yet,
    // retry when it gets inserted into the DOM.
    if (!injectFlipToggle()) {
      const obs = new MutationObserver(() => { if (injectFlipToggle()) obs.disconnect(); });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => obs.disconnect(), 30000);
    }
  }

  function wireCodingNav() {
    const railBtn = document.getElementById('rail-coding');
    const sideBtn = document.getElementById('tool-coding-btn');
    const wired = (window.__cy_codingWired = window.__cy_codingWired || new Set());
    [railBtn, sideBtn].forEach((btn) => {
      if (!btn || wired.has(btn.id)) return;
      wired.add(btn.id);
      const go = (e) => {
        if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1)) return;
        if (e) { e.preventDefault(); e.stopPropagation(); }
        window.location.href = '/coding';
      };
      btn.addEventListener('click', go);
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    });
  }

  function wireStandaloneNav() {
    // Only runs on standalone pages (e.g. /coding) where app.js did
    // not load. On the main / page app.js already binds every modal
    // button via direct addEventListener — adding ours on top causes
    // double-firing (modal opens, then we navigate, page reloads,
    // user sees only URL change).
    if (window.sessionModule || window.themeModule) return;
    if (/^\/(login|static|api)(\/|$)/.test(window.location.pathname)) return;
    wireNavigation();
  }

  // 4. Boot
  function boot() {
    applyStyle(getSavedStyle());
    wireFlipOrientation();   // sidebar/rail flip — works on every page
    wireCodingNav();         // always — needed on every page with these buttons
    wireStandaloneNav();     // only on standalone pages

    // Free providers — lazy-load when the admin Settings → Add Models
    // panel becomes visible. MutationObserver picks up the toggle
    // expansion of the Free Providers subsection.
    const freeObs = new MutationObserver(() => {
      const grid = document.getElementById('adm-free-providers-grid');
      const section = document.getElementById('adm-add-free');
      if (grid && section && !grid.__cy_freeLoaded
          && (section.classList.contains('open') || section.getBoundingClientRect().height > 0)) {
        loadFreeProviders();
      }
    });
    if (document.body) freeObs.observe(document.body, { childList: true, subtree: true, attributes: true });

    if (!ensurePickerUI()) {
      const observer = new MutationObserver(() => {
        if (ensurePickerUI()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 30000);
    }
    // Re-wire coding nav if the buttons are added later.
    if (document.body) {
      const codingObs = new MutationObserver(() => wireCodingNav());
      codingObs.observe(document.body, { childList: true, subtree: true });
    }
  }

  window.TaiAiStyles = {
    apply: applyStyle,
    list: STYLES,
    get current() { return getSavedStyle(); },
    save: saveStyle
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

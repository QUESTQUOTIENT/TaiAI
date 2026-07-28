// static/sw.js — TaiAi PWA Service Worker
// Strategy:
//   - HTML (navigation): stale-while-revalidate. Instant open from cache,
//     background refresh so the next open has latest HTML.
//   - JS/CSS (/static/*.js|.css): network-first, cache fallback for offline.
//     (So code/style edits show up on a normal reload, no manual cache clear.)
//   - Other static assets (images/fonts/libs): cache-first with bg refresh.
//   - API / non-GET: never cached.
// Bump CACHE_NAME whenever the precache list or SW logic changes.
const CACHE_NAME = 'TaiAi-v328';

// Bump CACHE_NAME format: TaiAi-v<deploy_count>. Whenever you add or remove
// a path from PRECACHE below, bump this. The bump forces the SW to evict
// old precaches on next activate, which is the correct (and only) way to
// make precache-list changes reach existing installs. Avoid bumping for
// changes outside PRECACHE (those are network-first and self-heal).
// Last bump: v328 (added info.js, installBanner.js, diagnostics.js, plus
// the new PWA icons; v327 was the prior baseline).

// Core shell precached on install so repeat opens are instant without any
// network wait. Keep this list in sync with the <script type="module"> tags
// and <link rel="stylesheet"> in index.html.
const PRECACHE = [
  '/',
  '/static/style.css',
  '/static/app.js',
  '/static/js/storage.js',
  '/static/js/ui.js',
  '/static/js/markdown.js',
  '/static/js/dragSort.js',
  '/static/js/sessions.js',
  '/static/js/memory.js',
  '/static/js/skills.js',
  '/static/js/tourHints.js',
  '/static/js/fileHandler.js',
  '/static/js/voiceRecorder.js',
  '/static/js/models.js',
  '/static/js/rag.js',
  '/static/js/presets.js',
  '/static/js/search.js',
  '/static/js/spinner.js',
  '/static/js/tts-ai.js',
  '/static/js/document.js',
  '/static/js/gallery.js',
  '/static/js/chatRenderer.js',
  '/static/js/codeRunner.js',
  '/static/js/chatStream.js',
  '/static/js/chat.js',
  '/static/js/cookbook.js',
  '/static/js/search-chat.js',
  '/static/js/compare/index.js',
  '/static/js/theme.js',
  '/static/js/censor.js',
  '/static/js/settings.js',
  '/static/js/admin.js',
  '/static/js/init.js',
  '/static/js/slashCommands.js',
  '/static/js/emailInbox.js',
  '/static/js/emailLibrary/utils.js',
  '/static/js/emailLibrary/signatureFold.js',
  '/static/js/emailLibrary/state.js',
  '/static/js/notes.js',
  '/static/js/tasks.js',
  '/static/js/calendar.js',
  '/static/js/calendar/utils.js',
  '/static/js/calendar/reminders.js',
  '/static/js/group.js',
  '/static/js/keyboard-shortcuts.js',
  '/static/js/sidebar-layout.js',
  '/static/js/section-management.js',
  '/static/js/info.js',
  '/static/js/installBanner.js',
  '/static/js/diagnostics.js',
  '/static/style-theme-switcher.js',
  '/static/icon-192.png',
  '/static/icon-512.png',
  '/static/icon-maskable-192.png',
  '/static/icon-maskable-512.png',
  '/static/manifest.json',
  '/static/lib/highlight.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // addAll is atomic — if any item fails, none are cached. Use individual
      // puts so a single 404 can't block the whole install.
      // P3-41: only force a network-bypass (`cache: 'reload'`) for the SPA
      // shell + manifest — the rest of the precache list is content-hashed
      // or rarely changes, so a single network round-trip per install is
      // cheaper than 50+ on first run.
      Promise.all(
        PRECACHE.map(url => {
          const forceReload = url === '/' || url.endsWith('manifest.json');
          return fetch(url, forceReload ? { cache: 'reload' } : undefined)
            .then(res => res.ok ? cache.put(url, res) : null)
            .catch(() => null);
        })
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Never touch API calls or non-GET.
  if (url.pathname.startsWith('/api/') || e.request.method !== 'GET') return;

  // HTML navigation: stale-while-revalidate the app shell — but ONLY for the
  // SPA root. Other navigations (e.g. a deep-linked /static/*.html page) must
  // go to the network/static handlers below; otherwise every navigation was
  // served the app index, replacing the page the user actually asked for.
  if (e.request.mode === 'navigate' && url.pathname === '/') {
    e.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match('/');
        const network = fetch(e.request).then(res => {
          if (res && res.ok) cache.put('/', res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // JS/CSS: network-first — always try the network so code/style edits show up
  // on a normal reload; fall back to cache only when offline.
  if (url.pathname.startsWith('/static/') && /\.(js|css)(\?|$)/.test(url.pathname + url.search)) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Other static assets (images, fonts, libs): cache-first with background refresh.
  if (url.pathname.startsWith('/static/')) {
    e.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(e.request);
        const fetching = fetch(e.request).then(res => {
          if (res && res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fetching;
      })
    );
    return;
  }
});

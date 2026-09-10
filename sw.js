/* =====================================================================
   sw.js — lets MindNote start with no connection.

   Rules:
   - /api/ is never cached. Sync always talks to the network.
   - The page itself is fetched from the network first, so a new deploy
     is picked up immediately, with the cached copy as the fallback.
   - Assets are served from cache and refreshed in the background. Their
     URLs carry a ?v= number, so a new version is a new URL and can
     never be served stale.
   ===================================================================== */

const CACHE = 'mindnote-v12';
const SHELL = [
  './',
  './index.html',
  './styles.css?v=12',
  './app.js?v=12',
  './sync.js?v=12',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .catch(() => { })          // a missing file must not block installation
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;      // sync is always live

  // The document: network first, cache as the safety net.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => { });
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Everything else: serve what we have, refresh it quietly for next time.
  event.respondWith(
    caches.match(req).then(hit => {
      const live = fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => { });
        }
        return res;
      }).catch(() => hit);
      return hit || live;
    })
  );
});

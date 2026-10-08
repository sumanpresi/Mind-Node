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

const CACHE = 'mindnote-v26';
const SHELL = [
  './',
  './index.html',
  './styles.css?v=26',
  './app.js?v=26',
  './sync.js?v=26',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png'
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

  /* The document: the network first, so a new deploy is picked up at once —
     but only for as long as anyone would reasonably wait. A signal that is
     present without actually carrying anything, which is what a train or a
     field site gives you, leaves fetch hanging for the better part of a
     minute, and a blank screen is a far worse answer than yesterday's copy
     of the app. The request is left running either way, so the newer page
     still lands in the cache for next time. */
  if (req.mode === 'navigate') {
    const fromCache = () => caches.match('./index.html').then(r => r || caches.match('./'));
    event.respondWith(new Promise(resolve => {
      let settled = false;
      const done = res => { if (!settled && res) { settled = true; resolve(res); } };
      const waited = setTimeout(() => { fromCache().then(done).catch(() => { }); }, 3500);
      fetch(req).then(res => {
        clearTimeout(waited);
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => { });
        done(res);
      }).catch(() => {
        clearTimeout(waited);
        fromCache().then(r => done(r || Response.error())).catch(() => done(Response.error()));
      });
    }));
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

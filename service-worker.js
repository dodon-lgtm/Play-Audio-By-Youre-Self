const CACHE_NAME = 'music-player-pwa-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/sidebar.css',
  './css/player.css',
  './css/responsive.css',
  './js/app.js',
  './js/ui.js',
  './js/storage.js',
  './js/player.js',
  './js/playlist.js',
  './js/search.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin GET requests.
  if (req.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req).then((res) => {
        // Cache successful responses for app shell assets.
        if (res && res.status === 200 && (req.destination === '' || req.destination === 'document' || req.destination === 'script' || req.destination === 'style' || req.destination === 'image')) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => {
        // Fallback: if offline and no match, return index.html for navigation.
        if (req.headers.get('accept')?.includes('text/html')) return caches.match('./index.html');
        return new Response('', { status: 504 });
      });
    })
  );
});


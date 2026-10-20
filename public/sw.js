/**
 * DocuLens Service Worker v1.2.0 (Offline Cache & PWA)
 * - Versioned cache (doculens-v1.2.0) with automated cleanup of obsolete caches
 * - Cache-first strategy for static assets (HTML, JS, CSS, self-hosted fonts, icons)
 * - Precaches and runtime-caches Tesseract OCR runtime (/ocr/) and language data (/eng.traineddata)
 * - Runtime-caches same-origin bundles and PDF worker (/assets/*)
 * - Zero access / interference with client-side IndexedDB document stores
 * - Supports skip-waiting for instant updates
 */

const CACHE_VERSION = 'doculens-v1.2.0';
const CACHE_NAME = `doculens-static-${CACHE_VERSION}`;

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/favicon-32.png',
  '/favicon-64.png',
  '/apple-touch-icon.png',
  '/doculens-mark-transparent.png',
  '/doculens-logo.jpg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-192x192.png',
  '/pwa-maskable-512x512.png',
  '/eng.traineddata',
  '/ocr/worker.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        // Tolerant precaching so individual missing optional assets never break worker install
        await Promise.all(
          PRECACHE_ASSETS.map(async (url) => {
            try {
              const response = await fetch(url, { cache: 'no-cache' });
              if (response && response.status === 200) {
                await cache.put(url, response);
              }
            } catch (err) {
              console.warn('[SW] Optional precache asset skipped:', url, err);
            }
          })
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME && name.startsWith('doculens-')) {
              console.log('[SW] Purging outdated cache:', name);
              return caches.delete(name);
            }
            return Promise.resolve(false);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Only handle GET requests
  if (req.method !== 'GET') {
    return;
  }

  // 2. Never cache or intercept API proxy routes (/api/*)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 3. Ignore chrome-extension and unsupported schemes
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // 4. Cache-First Strategy for static resources, fonts, workers, and offline assets
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(req)
        .then((networkResponse) => {
          // If valid response, clone and save to versioned cache (runtime cache for same-origin assets)
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            url.origin === self.location.origin
          ) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Fallback for navigation requests when completely offline
          if (req.mode === 'navigate') {
            return caches.match('/index.html') || caches.match('/');
          }
          return new Response('Network error occurred while offline', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' },
          });
        });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

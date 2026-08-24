const CACHE_NAME = 'zoho-notes-v11-interactive';
const OFFLINE_URL = '/offline.html';

// Static Shell & Local-First Engine Assets to Pre-cache
const PRECACHE_ASSETS = [
  '/',
  '/offline.html',
  '/css/style.css',
  '/js/db/database.js',
  '/js/db/syncEngine.js',
  '/js/engine/browserEngine.js',
  '/js/offlineManager.js',
  '/js/notebook.js',
  '/js/pwa.js',
  '/images/favicon.png',
  '/images/icon-192.png',
  '/images/icon-512.png',
  '/images/icon-maskable-192.png',
  '/images/icon-maskable-512.png',
  '/images/apple-touch-icon.png',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/dexie@3.2.4/dist/dexie.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/typescript/5.3.3/typescript.min.js',
  'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap',
  'https://unpkg.com/lucide@latest'
];

// Install Event - Pre-cache App Shell & Engine
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching Local-First Engine for Zoho Notes');
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Some precache assets failed to load:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean Up Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Deleting obsolete cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Dynamic Caching for WASM, Libraries & HTML
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET requests and mutating API/Auth/Admin routes
  if (request.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/admin/')) {
    return;
  }

  // Strategy 1: HTML Navigation Requests -> Network First, Fallback to Cached Shell or Offline Page
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            return cachedResponse || caches.match('/') || caches.match(OFFLINE_URL);
          });
        })
    );
    return;
  }

  // Strategy 2: Pyodide WASM & Heavy Libraries -> Cache First with Network Fallback
  if (url.hostname.includes('jsdelivr.net') || url.hostname.includes('cdnjs.cloudflare.com') || url.hostname.includes('unpkg.com') || url.pathname.endsWith('.wasm') || url.pathname.endsWith('.zip')) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((networkResponse) => {
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone).catch(() => {}));
          }
          return networkResponse;
        }).catch(() => cachedResponse || new Response(null, { status: 504, statusText: 'CDN Gateway Error' }));
      })
    );
    return;
  }

  // Strategy 3: Static Assets (CSS, JS, Images, Fonts) -> Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      }).catch(() => null);

      return cachedResponse || fetchPromise;
    })
  );
});

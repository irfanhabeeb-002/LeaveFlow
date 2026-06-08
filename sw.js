// ─────────────────────────────────────────────────────────────────
//  LeaveFlow Service Worker
//  Version is injected by build.js at CI time (CACHE_NAME constant).
//  The version string is also logged to the console so you can verify
//  which build is running in DevTools → Application → Service Workers.
// ─────────────────────────────────────────────────────────────────

const CACHE_VERSION = 'leaveflow-v1780927684425';      // build.js replaces this line
const CACHE_NAME    = CACHE_VERSION;        // alias kept for clarity
const CACHE_PREFIX  = 'leaveflow-';        // used to delete ALL old caches

// ── Version log ────────────────────────────────────────────────────
// Open DevTools → Console (check "All") to see this on every SW boot.
console.log(`[LeaveFlow SW] version=${CACHE_NAME} scope=${self.registration.scope}`);

// ── Static assets to pre-cache at install time ─────────────────────
// Use self.location.pathname to derive the base path automatically.
// This makes the SW work correctly regardless of the deployment base
// (localhost:3000/, /LeaveFlow/, etc.) without hardcoding a path prefix.
const BASE = self.registration.scope;  // e.g. "https://.../LeaveFlow/"

const STATIC_ASSETS = [
  BASE + 'index.html',
  BASE + 'admin.html',
  BASE + 'manifest.json',
  BASE + 'css/style.css',
  BASE + 'css/admin.css',
  BASE + 'js/api.js',
  BASE + 'js/app.js',
  BASE + 'js/admin.js',
  BASE + 'js/config.js',
  BASE + 'icons/icon-72.png',
  BASE + 'icons/icon-96.png',
  BASE + 'icons/icon-128.png',
  BASE + 'icons/icon-144.png',
  BASE + 'icons/icon-152.png',
  BASE + 'icons/icon-192.png',
  BASE + 'icons/icon-384.png',
  BASE + 'icons/icon-512.png',
];

// ── INSTALL ─────────────────────────────────────────────────────────
// Pre-cache all static assets, then skipWaiting() so this SW activates
// immediately without waiting for the old one to release its clients.
self.addEventListener('install', event => {
  console.log(`[LeaveFlow SW] install — ${CACHE_NAME}`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // addAll fails if any request fails; use individual puts for resilience
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            fetch(url, { cache: 'no-store' })
              .then(res => {
                if (res.ok) return cache.put(url, res);
              })
              .catch(err => console.warn(`[LeaveFlow SW] pre-cache miss: ${url}`, err))
          )
        );
      })
      .then(() => {
        console.log(`[LeaveFlow SW] install complete — skipWaiting`);
        return self.skipWaiting();  // ← activate immediately, don't wait
      })
  );
});

// ── ACTIVATE ────────────────────────────────────────────────────────
// Delete ALL caches that start with our prefix but aren't the current
// version. Then claim all open clients immediately so the new SW takes
// control of every tab without a reload.
self.addEventListener('activate', event => {
  console.log(`[LeaveFlow SW] activate — ${CACHE_NAME} — claiming all clients`);
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        const toDelete = cacheNames.filter(name =>
          name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME
        );
        console.log(`[LeaveFlow SW] deleting stale caches:`, toDelete);
        return Promise.all(toDelete.map(name => caches.delete(name)));
      })
      .then(() => self.clients.claim())  // ← take control immediately
      .then(() => console.log(`[LeaveFlow SW] all clients claimed`))
  );
});

// ── FETCH ───────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Skip non-GET requests entirely
  if (req.method !== 'GET') return;

  // 2. Network-first for Google APIs (Apps Script + Fonts CDN)
  //    Never cache API responses — always hit the server.
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com')
  ) {
    event.respondWith(
      fetch(req).catch(() =>
        new Response(
          JSON.stringify({ error: 'offline', message: 'You are offline.' }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // 3. Stale-while-revalidate for HTML documents
  //    Serve cached HTML instantly, then fetch fresh copy in background.
  //    This prevents the blank screen on launch while still getting updates.
  if (req.destination === 'document') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(req);

        // Fetch fresh copy in background (non-blocking)
        const networkFetch = fetch(req, { cache: 'no-store' })
          .then(res => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);

        // Return cached immediately if available; otherwise wait for network
        if (cached) {
          event.waitUntil(networkFetch);  // update cache in background
          return cached;
        }

        // No cache yet — wait for network
        const networkRes = await networkFetch;
        if (networkRes) return networkRes;

        // Absolute last resort — return cached index.html
        return cache.match(BASE + 'index.html');
      })
    );
    return;
  }

  // 4. Cache-first for all other static assets (CSS, JS, images)
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;

      return fetch(req).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        return res;
      }).catch(() => {
        // If asset fetch fails and it's a document, return index.html
        if (req.destination === 'document') {
          return caches.match(BASE + 'index.html');
        }
      });
    })
  );
});

// ── BACKGROUND SYNC ─────────────────────────────────────────────────
// Triggered by the browser when connectivity is restored after an
// offline leave submission was queued.
self.addEventListener('sync', event => {
  if (event.tag === 'sync-leave') {
    event.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach(client => client.postMessage({ type: 'SYNC_LEAVE' }));
}

// ── MESSAGE HANDLER ──────────────────────────────────────────────────
// Allows the app to programmatically request a cache clear.
// Usage from app.js: navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' })
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    console.log('[LeaveFlow SW] SKIP_WAITING received — activating now');
    self.skipWaiting();
  }
  if (event.data?.type === 'GET_VERSION') {
    event.source?.postMessage({ type: 'VERSION', version: CACHE_NAME });
  }
});

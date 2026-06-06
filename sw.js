/* ============================================================
   Tempo Service Worker
   ============================================================
   A service worker is a tiny script the browser runs in the
   background, separate from any page. It can intercept every
   network request the app makes and decide whether to fulfil it
   from a local cache instead. That's what lets a web app work
   with no network at all.

   Strategy for Tempo:
   -------------------
   Tempo is a single HTML file plus fonts from Google. So we use
   two simple caches:

   1. App-shell cache: contains the HTML, the manifest, and the
      icons. We use "stale-while-revalidate" for index.html —
      always serve from cache instantly so the app opens even
      with no network, while quietly fetching the latest version
      in the background and using it next time.

   2. Fonts cache: contains the Google Fonts CSS and the actual
      .woff2 files. These never change once cached, so we use
      "cache-first" — return from cache forever, only hitting
      the network if the file isn't there yet.

   The version constant below should be bumped whenever you
   ship breaking changes; the activate handler then nukes the
   old caches and the new ones take over.
   ============================================================ */

const VERSION = 'tempo-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const FONTS_CACHE = `${VERSION}-fonts`;

// Files that make up the "app shell" — everything the app needs
// to load and render its UI offline. Tempo is unusual in being
// a single self-contained HTML file, so this list is tiny.
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest'
];

// =============================================================
// INSTALL
// Fires once when the service worker is first installed (or
// updated to a new version). We pre-cache the app shell so the
// app is offline-ready the moment the user closes the tab.
// =============================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES))
      // Skip waiting so the new SW takes control immediately,
      // rather than waiting for all tabs to close.
      .then(() => self.skipWaiting())
  );
});

// =============================================================
// ACTIVATE
// Fires when the new service worker takes over. We delete any
// caches from old versions so storage doesn't grow forever.
// =============================================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => !key.startsWith(VERSION))
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// =============================================================
// FETCH
// Fires for every network request the page makes. We decide
// per-request whether to serve from cache, network, or both.
// =============================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests. POSTs and friends pass through.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // ----- Google Fonts: cache-first -----
  // Fonts never change once loaded. Hit the cache forever;
  // only fall back to the network if it's not cached yet.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, FONTS_CACHE));
    return;
  }

  // ----- Same-origin requests (the HTML, manifest, icons): stale-while-revalidate -----
  // Return cached version instantly, then update the cache from the network
  // in the background. Means the app always opens fast, even offline, and
  // gets updates eventually without ever blocking the user.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }

  // ----- Everything else: try network, fall back to cache -----
  // Any other third-party request (analytics, CDNs, etc).
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// =============================================================
// STRATEGIES
// =============================================================

// Look in the cache first. If found, return it. Otherwise fetch
// from the network and stash the response in the cache for next time.
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Only cache successful responses. (opaque responses from cross-origin
    // requests have status 0, but we still cache them — they're how Google
    // Fonts works without CORS.)
    if (response && (response.ok || response.type === 'opaque')) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Network failed and we have nothing cached. Return a graceful
    // empty response rather than letting the page crash.
    return new Response('', { status: 504, statusText: 'Gateway Timeout' });
  }
}

// Return the cached version immediately (if any), and kick off a
// background fetch to update the cache for next visit. If there's
// no cache yet, await the network fetch.
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);   // network might be down — that's fine

  // If we have a cached copy, return it now and let the network
  // request update the cache in the background. If we don't, we
  // have to await the network. If THAT fails too, return the
  // cached index.html as a last-ditch offline fallback so the
  // user never sees the browser's "no internet" page.
  return cached || (await networkFetch) || (await cache.match('./index.html'));
}

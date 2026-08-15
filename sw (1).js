const CACHE = "wychat-shell-v9-analytics-nonblocking";
const ASSETS = [
  "/", "/index.html", "/styles.css", "/app.js", "/firebase.js", "/auth.js",
  "/rooms.js", "/messages.js", "/realtime.js", "/storage.js", "/moderation.js",
  "/subscription.js", "/payments.js", "/router.js", "/manifest.json",
  "/icon.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/favicon.ico"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // Never cache API calls or cross-origin requests (Firebase, ad network) — always go to network.
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // Network-first: always try to get the latest app.js/styles.css/index.html
  // before falling back to cache. The previous "cache-first" strategy meant
  // every fix pushed here could sit unseen indefinitely for returning
  // visitors — this was very likely why things looked "reverted" or "broken"
  // after they'd actually already been fixed. Cache is now purely an
  // offline fallback, not the default source of truth.
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request))
  );
});

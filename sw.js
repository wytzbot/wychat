const CACHE = "wychat-shell-v2";
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
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return r;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

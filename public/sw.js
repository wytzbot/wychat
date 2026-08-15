const CACHE = "wychat-shell-v6-starter-pro";
const ASSETS = [
  "/", "/index.html", "/styles.css", "/app.js", "/firebase.js", "/auth.js",
  "/rooms.js", "/messages.js", "/realtime.js", "/storage.js", "/moderation.js",
  "/subscription.js", "/payments.js", "/router.js", "/messaging.js", "/manifest.json",
  "/icon.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/favicon.ico"
];

// --- Background push (Firebase Cloud Messaging) ---
// Loaded as "compat" scripts because service workers can't use bare ES module
// imports the way app.js does. This lets the SW show a native OS notification
// for pushes that arrive while WyChat isn't in the foreground.
importScripts("https://www.gstatic.com/firebasejs/12.1.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.1.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCFQ9eljuHD22tgPRvnzmJqYhXvPHGdoPE",
  authDomain: "wychat.firebaseapp.com",
  projectId: "wychat",
  storageBucket: "wychat.firebasestorage.app",
  messagingSenderId: "391750518125",
  appId: "1:391750518125:web:fea89b402190a614e98664"
});

const fcm = firebase.messaging();
fcm.onBackgroundMessage(payload => {
  const title = payload.notification?.title || "WyChat";
  const body = payload.notification?.body || "You have a new message.";
  self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: payload.data?.url || "/" }
  });
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = e.notification.data?.url || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(location.origin));
      if (existing) return existing.focus().then(c => c.navigate ? c.navigate(url) : c);
      return self.clients.openWindow(url);
    })
  );
});

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

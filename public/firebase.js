import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCFQ9eljuHD22tgPRvnzmJqYhXvPHGdoPE",
  authDomain: "wychat.firebaseapp.com",
  projectId: "wychat",
  storageBucket: "wychat.firebasestorage.app",
  messagingSenderId: "391750518125",
  appId: "1:391750518125:web:fea89b402190a614e98664",
  measurementId: "G-4LRW5YEHEK"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
// Offline persistence: writes made while offline (e.g. a message sent on a
// dead Airtel connection) are queued in IndexedDB and automatically flushed
// to Firestore the moment connectivity returns — no custom retry code
// needed for that case, and cached reads still render instantly if the
// network drops mid-session instead of showing a blank room.
export const db = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) })
});

// Explicit, not just relying on Firebase's default: keep people signed in
// across tabs and browser restarts until they actually tap "Sign out" —
// nobody should have to re-authenticate just from closing the app.
// (Private/incognito browsing can still force in-memory-only persistence —
// that's a browser restriction, not something any app can override.)
setPersistence(auth, browserLocalPersistence).catch(()=>{});

// Analytics only initializes in browsers that support it (e.g. it's unavailable
// in some in-app browsers and always unavailable in SSR/build contexts).
// Loaded dynamically and swallowed on any failure — analytics is optional,
// and it must never be able to break app startup if its CDN module is
// blocked or unreachable (a static top-level import here previously could).
export let analytics = null;
import("https://www.gstatic.com/firebasejs/12.1.0/firebase-analytics.js")
  .then(({ isSupported, getAnalytics }) => isSupported().then(ok => { if (ok) analytics = getAnalytics(firebaseApp); }))
  .catch(()=>{});

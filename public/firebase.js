import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { isSupported as analyticsSupported, getAnalytics } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-analytics.js";

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
export const db = getFirestore(firebaseApp);

// Explicit, not just relying on Firebase's default: keep people signed in
// across tabs and browser restarts until they actually tap "Sign out" —
// nobody should have to re-authenticate just from closing the app.
// (Private/incognito browsing can still force in-memory-only persistence —
// that's a browser restriction, not something any app can override.)
setPersistence(auth, browserLocalPersistence).catch(()=>{});

// Analytics only initializes in browsers that support it (e.g. it's unavailable
// in some in-app browsers and always unavailable in SSR/build contexts).
export let analytics = null;
analyticsSupported().then(ok=>{ if(ok) analytics=getAnalytics(firebaseApp); }).catch(()=>{});

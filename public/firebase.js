import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

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

// Keep the receiver signed in across tabs and browser restarts. If the
// browser blocks persistent storage, Firebase falls back to its own behavior.
setPersistence(auth, browserLocalPersistence).catch(e => {
  console.warn("WyChat auth persistence unavailable:", e?.code || e?.message || e);
});

import { auth } from "./firebase.js";
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

function isRetryableAuthError(e) {
  return [
    "auth/network-request-failed",
    "auth/internal-error",
    "auth/timeout",
    "auth/popup-blocked",
    "auth/operation-not-supported-in-this-environment"
  ].includes(e?.code);
}

// Popup is convenient on desktop. If the browser/network makes popup auth
// unreliable, fall back to Google's redirect flow, which is more dependable
// on mobile browsers and PWAs.
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (e) {
    if (e?.code === "auth/popup-closed-by-user") throw e;
    if (!isRetryableAuthError(e)) throw e;

    // Redirect is a navigation, so callers should not expect a user result
    // from this branch. Firebase restores the auth session after returning.
    await signInWithRedirect(auth, provider);
    return null;
  }
}

export async function finishGoogleRedirect() {
  try {
    const result = await getRedirectResult(auth);
    return result?.user || null;
  } catch (e) {
    console.error("WyChat Google redirect sign-in failed:", e?.code, e?.message);
    throw e;
  }
}

export function watchAuth(cb) { return onAuthStateChanged(auth, cb); }
export function logout() { return signOut(auth); }

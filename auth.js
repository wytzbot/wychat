import { auth } from "./firebase.js";
import {
  signInWithPopup, GoogleAuthProvider,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

// Google Sign-In: no email is ever sent for this path, so it has no daily
// quota, no SMTP account, and no per-send cost — the most reliable option,
// and the only sign-in method WyChat offers.
export async function signInWithGoogle(){
  const result=await signInWithPopup(auth,new GoogleAuthProvider());
  return result.user;
}

export function watchAuth(cb) { return onAuthStateChanged(auth, cb); }
export function logout() { return signOut(auth); }

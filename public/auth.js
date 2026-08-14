import { auth } from "./firebase.js";
import {
  isSignInWithEmailLink, sendSignInLinkToEmail, signInWithEmailLink,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const ACTIONS = {
  url: location.origin + "/",
  handleCodeInApp: true
};

// A network hiccup (slow DNS, a dropped packet, momentary carrier flakiness)
// is common on mobile connections and usually resolves itself within a
// second or two — so we retry quietly before ever bothering the user with it.
async function withRetry(fn, attempts=3, delayMs=1200){
  let lastErr;
  for(let i=0;i<attempts;i++){
    try{ return await fn(); }
    catch(err){
      lastErr=err;
      if(err.code!=="auth/network-request-failed" || i===attempts-1) throw friendlyAuthError(err);
      await new Promise(r=>setTimeout(r,delayMs*(i+1)));
    }
  }
  throw friendlyAuthError(lastErr);
}

function friendlyAuthError(err){
  const map={
    "auth/network-request-failed":"Couldn't reach the sign-in service after a few tries. Try switching to Wi-Fi or a different network, then try again.",
    "auth/unauthorized-continue-uri":"This site isn't authorized for sign-in yet — contact support.",
    "auth/invalid-action-code":"This sign-in link has already been used or is invalid. Request a new one.",
    "auth/expired-action-code":"This sign-in link has expired. Request a new one.",
    "auth/invalid-email":"That email address doesn't look right."
  };
  return new Error(map[err.code] || err.message || "Something went wrong signing you in.");
}

export async function sendMagicLink(email) {
  await withRetry(()=>sendSignInLinkToEmail(auth, email, ACTIONS));
  localStorage.setItem("wychat_auth_email", email);
}

export async function finishMagicLink(promptEmail) {
  if (!isSignInWithEmailLink(auth, location.href)) return null;
  let email = localStorage.getItem("wychat_auth_email");
  if (!email) email = await promptEmail?.();
  if (!email) throw new Error("Email is required to finish sign-in.");
  const result = await withRetry(()=>signInWithEmailLink(auth, email, location.href));
  localStorage.removeItem("wychat_auth_email");
  history.replaceState({}, "", "/");
  return result.user;
}

export function watchAuth(cb) { return onAuthStateChanged(auth, cb); }
export function logout() { return signOut(auth); }

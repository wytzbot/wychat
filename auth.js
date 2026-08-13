import { auth } from "./firebase.js";
import {
  isSignInWithEmailLink, sendSignInLinkToEmail, signInWithEmailLink,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const ACTIONS = {
  url: location.origin + "/",
  handleCodeInApp: true
};

export async function sendMagicLink(email) {
  await sendSignInLinkToEmail(auth, email, ACTIONS);
  localStorage.setItem("wychat_auth_email", email);
}

export async function finishMagicLink(promptEmail) {
  if (!isSignInWithEmailLink(auth, location.href)) return null;
  let email = localStorage.getItem("wychat_auth_email");
  if (!email) email = await promptEmail?.();
  if (!email) throw new Error("Email is required to finish sign-in.");
  const result = await signInWithEmailLink(auth, email, location.href);
  localStorage.removeItem("wychat_auth_email");
  history.replaceState({}, "", "/");
  return result.user;
}

export function watchAuth(cb) { return onAuthStateChanged(auth, cb); }
export function logout() { return signOut(auth); }
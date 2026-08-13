import { firebaseApp, auth, db } from "./firebase.js";
import {
  getMessaging, getToken, onMessage, isSupported
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-messaging.js";
import { doc, setDoc, deleteField, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// Public VAPID key for Web Push (pairs with the private key held by the
// server/Cloud Function that actually sends messages). Safe to ship client-side.
const VAPID_KEY = "BNVnWBal_MCLhMtzLwIsVJR9vxslfhx4c2iFo2QHD4FsCcuqRCo9o_hft-eR75GfMPFyvHGYXl50CjEI7wAKWgk";

let messagingInstance = null;
async function messaging(){
  if(messagingInstance) return messagingInstance;
  if(!(await isSupported())) throw new Error("Push notifications aren't supported in this browser.");
  messagingInstance = getMessaging(firebaseApp);
  return messagingInstance;
}

export function pushAvailable(){
  return "Notification" in window && "serviceWorker" in navigator;
}
export function pushEnabled(){
  return pushAvailable() && Notification.permission==="granted" && localStorage.getItem("wychat_push")==="on";
}

// Ask the user for permission, mint an FCM token, and save it to their user
// doc so a server-side sender (e.g. a Cloud Function on new-message writes)
// can deliver "someone replied to your room" pushes.
export async function enablePush(){
  if(!pushAvailable()) throw new Error("This browser doesn't support push notifications.");
  const uid=auth.currentUser?.uid;
  if(!uid) throw new Error("Sign in first to enable notifications.");
  const permission=await Notification.requestPermission();
  if(permission!=="granted") throw new Error("Notifications permission was not granted.");
  const registration=await navigator.serviceWorker.ready;
  const msg=await messaging();
  const token=await getToken(msg,{vapidKey:VAPID_KEY,serviceWorkerRegistration:registration});
  if(!token) throw new Error("Couldn't register this device for notifications.");
  await setDoc(doc(db,"users",uid),{fcmToken:token,fcmTokenUpdatedAt:serverTimestamp()},{merge:true});
  localStorage.setItem("wychat_push","on");
  onMessage(msg,payload=>{
    // App is in the foreground — show our own in-app toast rather than a
    // duplicate OS notification (the service worker handles background pushes).
    window.dispatchEvent(new CustomEvent("wychat:push",{detail:{
      title:payload.notification?.title||"WyChat",
      body:payload.notification?.body||""
    }}));
  });
  return token;
}

export async function disablePush(){
  const uid=auth.currentUser?.uid;
  localStorage.removeItem("wychat_push");
  if(uid){ await setDoc(doc(db,"users",uid),{fcmToken:deleteField()},{merge:true}); }
}

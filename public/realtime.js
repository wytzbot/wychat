import { db } from "./firebase.js";
import {
  doc, setDoc, deleteDoc, collection, query, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const STALE_MS = 8000; // a typing flag older than this is ignored (tab closed, connection dropped, etc.)

export function setTyping(roomId, participantId) {
  return setDoc(doc(db, "typing", roomId, "users", participantId), {
    participantId, updatedAt: serverTimestamp()
  });
}
export function clearTyping(roomId, participantId) {
  return deleteDoc(doc(db, "typing", roomId, "users", participantId)).catch(() => {});
}
export function subscribeTyping(roomId, participantId, cb) {
  const q = query(collection(db, "typing", roomId, "users"));
  return onSnapshot(q, snap => {
    const now = Date.now();
    const typing = snap.docs
      .map(d => d.data())
      .filter(u => u.participantId !== participantId && (now - (u.updatedAt?.toMillis?.() || now)) < STALE_MS)
      .map(u => u.participantId);
    cb(typing);
  }, () => cb([]));
}

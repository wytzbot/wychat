import { db } from "./firebase.js";
import { doc,setDoc,deleteDoc,collection,onSnapshot,serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
export async function blockIdentity(roomId,participantId){return setDoc(doc(db,"rooms",roomId,"blocked",participantId),{createdAt:serverTimestamp()});}
export async function unblockIdentity(roomId,participantId){return deleteDoc(doc(db,"rooms",roomId,"blocked",participantId));}
export function subscribeBlocked(roomId,cb){
  return onSnapshot(collection(db,"rooms",roomId,"blocked"), snap=>cb(snap.docs.map(d=>d.id)), ()=>cb([]));
}
export async function reportMessage(roomId,messageId,reason){return setDoc(doc(db,"reports",roomId+"_"+messageId+"_"+Date.now()),{roomId,messageId,reason,createdAt:serverTimestamp(),status:"pending"});}

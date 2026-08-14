import { db } from "./firebase.js";
import {
  collection, addDoc, doc, updateDoc, deleteDoc, query, where, orderBy, limit,
  onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

export function subscribeMessages(roomId, cb) {
  const q=query(collection(db,"messages"),where("roomId","==",roomId),orderBy("createdAt","asc"),limit(500));
  return onSnapshot(q, snap=>cb(snap.docChanges(),snap), err=>cb(null,null,err));
}
export async function sendMessage(roomId, participantId, content, quote, clientId, roomCreatedAtMs, retentionDays=30) {
  // Every message in a room shares the same expiry: room creation date + the
  // room's retention window. Not "30 days from when this message was sent" —
  // that would make messages in the same room expire on different days,
  // which doesn't match how a WhatsApp-style group should behave.
  const expiresAt=new Date(roomCreatedAtMs+retentionDays*86400000);
  return addDoc(collection(db,"messages"),{
    roomId, participantId, content:content.trim(), quotedMessageId:quote?.messageId||null,
    quoteSnapshot:quote?{participantId:quote.participantId,content:String(quote.content).slice(0,500)}:null,
    createdAt:serverTimestamp(), expiresAt,
    edited:false,clientId
  });
}
export async function editMessage(id, content){await updateDoc(doc(db,"messages",id),{content:content.trim(),edited:true});}
export async function deleteMessage(id){await deleteDoc(doc(db,"messages",id));}
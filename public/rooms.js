import { db } from "./firebase.js";
import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit,
  addDoc, setDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function randomId(n=8) {
  let s=""; crypto.getRandomValues(new Uint32Array(n)).forEach(x=>s+=alphabet[x%alphabet.length]);
  return s;
}
export function sanitizeSlug(v) {
  return String(v).toLowerCase().trim().replace(/[^a-z0-9-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,48);
}
export async function createRoom(uid, question, slug="", retentionDays=3) {
  const roomId=randomId(12);
  const cleanSlug=sanitizeSlug(slug);
  if(cleanSlug){
    const taken=await getDocs(query(collection(db,"rooms"),where("slug","==",cleanSlug),limit(1)));
    if(!taken.empty) throw new Error("That custom link is already taken — try another.");
  }
  const data={ownerUid:uid,question:question.trim(),slug:cleanSlug,status:"live",
    createdAt:serverTimestamp(),planSlug:!!cleanSlug,retentionDays:3};
  await setDoc(doc(db,"rooms",roomId),data);
  return roomId;
}
export async function getRoom(key) {
  const normalize = snap => {
    if(!snap.exists()) return null;
    const data={roomId:snap.id,...snap.data()};
    const createdMs=data.createdAt?.toMillis?.();
    if(data.status==="expired" || (createdMs && Date.now() >= createdMs + 3*86400000)) return {...data,status:"expired"};
    return data;
  };
  let snap=await getDoc(doc(db,"rooms",key));
  if(snap.exists()) return normalize(snap);
  const q=query(collection(db,"rooms"),where("slug","==",key),limit(1));
  const s=await getDocs(q); if(s.empty) return null;
  return normalize(s.docs[0]);
}
export async function ownerRooms(uid) {
  const q=query(collection(db,"rooms"),where("ownerUid","==",uid));
  const s=await getDocs(q); return s.docs.map(d=>({roomId:d.id,...d.data()}));
}
export async function setRoomStatus(id,status){await updateDoc(doc(db,"rooms",id),{status});}
export async function removeRoom(id){await deleteDoc(doc(db,"rooms",id));}

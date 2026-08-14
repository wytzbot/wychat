import { db } from "./firebase.js";

import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";


/*
 * REALTIME MESSAGE DELIVERY
 *
 * Uses a simple Firestore realtime listener:
 * roomId == current room
 *
 * No composite index is required.
 * Messages are sorted by app.js after they arrive.
 */
export function subscribeMessages(roomId, cb) {

  const q = query(
    collection(db, "messages"),
    where("roomId", "==", roomId),
    limit(500)
  );

  return onSnapshot(
    q,
    {
      includeMetadataChanges: true
    },

    (snapshot) => {
      cb(snapshot.docChanges(), snapshot);
    },

    (error) => {
      console.error(
        "WyChat realtime message error:",
        error?.code,
        error?.message
      );

      cb(null, null, error);
    }
  );
}


/*
 * SEND MESSAGE
 *
 * Messages expire with the ROOM.
 * WyChat rooms use 3 days on Free and 10 days on paid plans.
 *
 * The expiry is calculated from the room's creation time,
 * NOT from the time the message was sent.
 */
export async function sendMessage(
  roomId,
  participantId,
  content,
  quote,
  clientId,
  roomCreatedAtMs,
  retentionDays = 3
) {

  const cleanContent = String(content || "").trim();

  if (!cleanContent) {
    throw new Error("Message cannot be empty.");
  }

  if (cleanContent.length > 2000) {
    throw new Error("Message is too long.");
  }

  if (!roomId) {
    throw new Error("Missing room ID.");
  }

  if (!participantId) {
    throw new Error("Missing participant ID.");
  }

  /*
   * Every message expires when the room expires.
   * Default = 3 days; paid rooms may use 10 days.
   */
  const expiresAt = new Date(
    roomCreatedAtMs + retentionDays * 86400000
  );

  return addDoc(
    collection(db, "messages"),
    {
      roomId,

      participantId,

      content: cleanContent,

      quotedMessageId:
        quote?.messageId || null,

      quoteSnapshot: quote
        ? {
            participantId: quote.participantId,
            content: String(quote.content || "").slice(0, 500)
          }
        : null,

      createdAt: serverTimestamp(),

      expiresAt,

      edited: false,

      clientId
    }
  );
}


/*
 * EDIT MESSAGE
 */
export async function editMessage(id, content) {

  const cleanContent = String(content || "").trim();

  if (!cleanContent) {
    throw new Error("Message cannot be empty.");
  }

  if (cleanContent.length > 2000) {
    throw new Error("Message is too long.");
  }

  await updateDoc(
    doc(db, "messages", id),
    {
      content: cleanContent,
      edited: true
    }
  );
}


/*
 * DELETE MESSAGE
 */
export async function deleteMessage(id) {

  await deleteDoc(
    doc(db, "messages", id)
  );
}

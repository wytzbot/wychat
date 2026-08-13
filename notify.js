import { admin, json } from "./_firebase-admin.js";

// Debounce window: rapid-fire replies in a burst collapse into one push
// instead of spamming the room owner with one notification per message.
const DEBOUNCE_MS = 20_000;

export default async function handler(req,res){
  if(req.method!=="POST") return json(res,405,{ok:false,error:"Method not allowed"});

  try{
    const {roomId,messageId}=req.body||{};
    if(!roomId || !messageId) return json(res,400,{ok:false,error:"Missing roomId or messageId."});

    const {db,messaging,FieldValue}=admin();

    // Re-read the message from Firestore rather than trusting the client body,
    // so a caller can't spoof arbitrary notification text.
    const msgSnap=await db.collection("messages").doc(messageId).get();
    if(!msgSnap.exists) return json(res,200,{ok:true,skipped:"message-not-found"});
    const msg=msgSnap.data();
    if(msg.roomId!==roomId) return json(res,200,{ok:true,skipped:"room-mismatch"});
    // Only notify for genuinely recent messages — closes the door on replaying
    // an old messageId to trigger a fresh push at will.
    const createdMs=msg.createdAt?.toMillis?.() ?? 0;
    if(!createdMs || Date.now()-createdMs>60_000) return json(res,200,{ok:true,skipped:"stale"});

    const roomRef=db.collection("rooms").doc(roomId);
    const roomSnap=await roomRef.get();
    if(!roomSnap.exists) return json(res,200,{ok:true,skipped:"room-not-found"});
    const room=roomSnap.data();
    if(room.status!=="live") return json(res,200,{ok:true,skipped:"room-closed"});

    // Debounce per room using a field on the room doc itself — avoids a second collection.
    const lastNotifiedMs=room.lastNotifiedAt?.toMillis?.() ?? 0;
    if(Date.now()-lastNotifiedMs<DEBOUNCE_MS) return json(res,200,{ok:true,skipped:"debounced"});

    const ownerSnap=await db.collection("users").doc(room.ownerUid).get();
    const token=ownerSnap.data()?.fcmToken;
    if(!token) return json(res,200,{ok:true,skipped:"no-token"});

    await roomRef.update({lastNotifiedAt:FieldValue.serverTimestamp()});

    try{
      await messaging.send({
        token,
        notification:{
          title:"New reply in your room",
          body:`${msg.participantId}: ${String(msg.content||"").slice(0,120)}`
        },
        data:{url:`/q/${room.slug||roomId}`},
        webpush:{fcmOptions:{link:`/q/${room.slug||roomId}`}}
      });
    }catch(sendErr){
      // A stale/uninstalled token — clean it up so we stop trying it.
      if(sendErr?.code==="messaging/registration-token-not-registered"){
        await db.collection("users").doc(room.ownerUid).update({fcmToken:FieldValue.delete()});
      }
      return json(res,200,{ok:true,skipped:"send-failed"});
    }

    return json(res,200,{ok:true,sent:true});
  }catch(e){
    console.error("notify:",e);
    return json(res,200,{ok:true,skipped:"error"});
  }
}

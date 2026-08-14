import { admin, json } from "./_firebase-admin.js";

// Vercel Cron Jobs call this via GET and — when CRON_SECRET is set in the
// project's environment variables — automatically attach
// `Authorization: Bearer <CRON_SECRET>`. Accepting GET here (not POST) is
// what makes the schedule in vercel.json actually fire.
export default async function handler(req,res){
  if(req.method!=="GET" && req.method!=="POST") return json(res,405,{ok:false,error:"Method not allowed"});
  const auth=req.headers.authorization||"";
  if(!process.env.CRON_SECRET || auth!==`Bearer ${process.env.CRON_SECRET}`){
    return json(res,401,{ok:false,error:"Unauthorized"});
  }

  try{
    const {db}=admin();
    const now=Date.now();
    // Delete messages that have reached the 3-day room lifetime.
    const messageSnap=await db.collection("messages").where("expiresAt","<=",now).limit(400).get();
    let deletedMessages=0;
    if(!messageSnap.empty){
      const batch=db.batch();
      messageSnap.docs.forEach(d=>batch.delete(d.ref));
      await batch.commit();
      deletedMessages=messageSnap.size;
    }

    // Also remove expired room documents. This makes old /q/... links genuinely
    // dead after the cleanup job runs, while the client enforces the 3-day
    // expiry immediately even between cron runs.
    const cutoff=new Date(now-3*24*60*60*1000);
    const roomSnap=await db.collection("rooms").where("createdAt","<=",cutoff).limit(400).get();
    let deletedRooms=0;
    if(!roomSnap.empty){
      const batch=db.batch();
      roomSnap.docs.forEach(d=>batch.delete(d.ref));
      await batch.commit();
      deletedRooms=roomSnap.size;
    }

    return json(res,200,{ok:true,deletedMessages,deletedRooms});
  }catch(e){
    return json(res,500,{ok:false,error:"Cleanup failed."});
  }
}

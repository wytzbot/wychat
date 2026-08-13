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
    const snap=await db.collection("messages").where("expiresAt","<=",now).limit(400).get();
    if(snap.empty) return json(res,200,{ok:true,deleted:0});

    const batch=db.batch();
    snap.docs.forEach(d=>batch.delete(d.ref));
    await batch.commit();
    return json(res,200,{ok:true,deleted:snap.size});
  }catch(e){
    return json(res,500,{ok:false,error:"Cleanup failed."});
  }
}
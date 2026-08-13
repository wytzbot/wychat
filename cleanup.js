import { admin, json } from "./_firebase-admin.js";

export default async function handler(req,res){
  if(req.method!=="POST") return json(res,405,{ok:false,error:"Method not allowed"});
  const secret=req.headers["x-cleanup-secret"];
  if(!process.env.CLEANUP_SECRET || secret!==process.env.CLEANUP_SECRET){
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
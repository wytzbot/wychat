import { admin, requireUser, json } from "./_firebase-admin.js";

export default async function handler(req,res){
  if(req.method!=="GET") return json(res,405,{ok:false,error:"Method not allowed"});
  try{
    const decoded=await requireUser(req);
    const {db}=admin();
    const snap=await db.collection("users").doc(decoded.uid).get();
    const d=snap.exists?snap.data():{};
    const expires=d.subscriptionExpiresAt?.toMillis?.() ?? d.subscriptionExpiresAt ?? null;
    const active=(d.plan==="starter"||d.plan==="pro") &&
      d.subscriptionStatus==="active" &&
      (!expires || expires>Date.now());

    return json(res,200,{
      ok:true,
      plan:active?d.plan:"free",
      subscriptionStatus:active?"active":"inactive",
      subscriptionExpiresAt:active?expires:null,
      ads:!active
    });
  }catch(e){
    return json(res,401,{ok:false,error:"Unable to verify your session or subscription."});
  }
}

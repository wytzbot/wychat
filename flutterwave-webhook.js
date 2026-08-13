import crypto from "node:crypto";
import { admin, json } from "./_firebase-admin.js";

function validSignature(req){
  const secret=process.env.FLW_SECRET_HASH;
  if(!secret) return false;
  const supplied=req.headers["verif-hash"] || req.headers["x-verif-hash"] || "";
  const a=Buffer.from(String(supplied));
  const b=Buffer.from(String(secret));
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}

export default async function handler(req,res){
  if(req.method!=="POST") return json(res,405,{ok:false,error:"Method not allowed"});
  if(!validSignature(req)) return json(res,401,{ok:false,error:"Invalid webhook signature."});

  try{
    const event=req.body||{};
    const data=event.data||{};
    const plan=data.meta?.plan;
    const uid=data.meta?.firebaseUid || data.meta?.uid;

    if(event.event!=="charge.completed" || data.status!=="successful" || !uid || !["starter","pro"].includes(plan)){
      return json(res,200,{ok:true,ignored:true});
    }

    const expected={
      starter:{NGN:900,USD:1},
      pro:{NGN:1500,USD:2}
    };
    const currency=String(data.currency||"").toUpperCase();
    if(Number(data.amount)!==expected[plan]?.[currency]){
      return json(res,400,{ok:false,error:"Invalid amount."});
    }

    const {db,FieldValue}=admin();
    const txId=String(data.id||data.transaction_id||data.tx_ref||"");
    if(!txId) return json(res,400,{ok:false,error:"Missing transaction ID."});

    const paymentRef=db.collection("payments").doc(txId);
    const payment=await paymentRef.get();
    if(payment.exists) return json(res,200,{ok:true,alreadyProcessed:true});

    await db.runTransaction(async tx=>{
      const userRef=db.collection("users").doc(String(uid));
      const user=await tx.get(userRef);
      const current=user.exists?user.data():{};
      const currentExp=current.subscriptionExpiresAt?.toMillis?.() ?? current.subscriptionExpiresAt ?? 0;
      const expires=Math.max(Date.now(),Number(currentExp)||0)+30*24*60*60*1000;

      tx.set(userRef,{
        uid:String(uid),
        plan,
        subscriptionStatus:"active",
        subscriptionExpiresAt:expires,
        updatedAt:FieldValue.serverTimestamp()
      },{merge:true});

      tx.create(paymentRef,{
        uid:String(uid),
        plan,
        transactionId:txId,
        txRef:String(data.tx_ref||""),
        amount:Number(data.amount),
        currency,
        status:"successful",
        verifiedAt:FieldValue.serverTimestamp()
      });
    });

    return json(res,200,{ok:true});
  }catch(e){
    console.error(e);
    return json(res,500,{ok:false,error:"Webhook processing failed."});
  }
}
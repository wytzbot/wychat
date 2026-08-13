import { admin, requireUser, json } from "./_firebase-admin.js";

const PLANS = {
  starter: { NGN: 900, USD: 1 },
  pro: { NGN: 1500, USD: 2 }
};

function normalizeCurrency(v){ return String(v || "").trim().toUpperCase(); }

export default async function handler(req,res){
  if(req.method!=="POST") return json(res,405,{ok:false,error:"Method not allowed"});

  try{
    const user=await requireUser(req);
    const {transactionId}=req.body || {};
    if(!transactionId) return json(res,400,{ok:false,error:"Missing Flutterwave transaction ID."});

    const secret=process.env.FLW_SECRET_KEY;
    if(!secret) return json(res,500,{ok:false,error:"Flutterwave verification is not configured on the server."});

    const response=await fetch(
      `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`,
      {headers:{Authorization:`Bearer ${secret}`,Accept:"application/json"}}
    );
    const result=await response.json();

    if(!response.ok || result.status!=="success" || result.data?.status!=="successful"){
      return json(res,400,{ok:false,error:"Payment is still being verified or was not successful."});
    }

    const payment=result.data;
    const currency=normalizeCurrency(payment.currency);
    const amount=Number(payment.amount);
    const metadata=payment.meta || {};
    const plan=String(metadata.plan || "").toLowerCase();
    const expected=PLANS[plan]?.[currency];

    if(!expected || amount!==expected){
      return json(res,400,{ok:false,error:"The verified payment amount or currency does not match a WyChat plan."});
    }

    // If the transaction has account metadata, it must belong to this Firebase user.
    // A static hosted link may not carry metadata; in that case we still require
    // the authenticated user to perform this verification themselves.
    const metadataUid=metadata.firebaseUid || metadata.uid || metadata.userId;
    if(metadataUid && String(metadataUid)!==String(user.uid)){
      return json(res,403,{ok:false,error:"This payment belongs to a different WyChat account."});
    }

    const {db,FieldValue}=admin();
    const paymentId=String(payment.id || transactionId);
    const paymentRef=db.collection("payments").doc(paymentId);
    const existing=await paymentRef.get();

    if(existing.exists){
      const old=existing.data();
      if(String(old.uid)!==String(user.uid)){
        return json(res,403,{ok:false,error:"This transaction has already been linked to another account."});
      }
      return json(res,200,{
        ok:true,
        plan:old.plan,
        subscriptionStatus:"active",
        alreadyApplied:true
      });
    }

    await db.runTransaction(async tx=>{
      const userRef=db.collection("users").doc(user.uid);
      const userSnap=await tx.get(userRef);
      const current=userSnap.exists ? userSnap.data() : {};

      const oldExpiry=current.subscriptionExpiresAt?.toMillis?.()
        ?? Number(current.subscriptionExpiresAt || 0);

      const start=Math.max(Date.now(),oldExpiry || 0);
      const expiry=start+(30*24*60*60*1000);

      tx.set(userRef,{
        uid:user.uid,
        email:user.email || null,
        plan,
        subscriptionStatus:"active",
        subscriptionExpiresAt:expiry,
        updatedAt:FieldValue.serverTimestamp()
      },{merge:true});

      tx.create(paymentRef,{
        uid:user.uid,
        plan,
        transactionId:paymentId,
        txRef:String(payment.tx_ref || ""),
        amount,
        currency,
        status:"successful",
        verifiedAt:FieldValue.serverTimestamp()
      });
    });

    return json(res,200,{
      ok:true,
      plan,
      subscriptionStatus:"active"
    });
  }catch(error){
    console.error("verify-payment:",error);
    return json(res,401,{ok:false,error:error.message || "Payment verification failed."});
  }
}
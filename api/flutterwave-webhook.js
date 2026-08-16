import crypto from "node:crypto";
import { admin, json } from "./_firebase-admin.js";
import wyteaiSdk from "firebase-admin";

function validSignature(req){
  const secret=process.env.FLW_SECRET_HASH;
  if(!secret) return false;
  const supplied=req.headers["verif-hash"] || req.headers["x-verif-hash"] || "";
  const a=Buffer.from(String(supplied));
  const b=Buffer.from(String(secret));
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}

// --- WYTE AI: separate Firebase project, initialized as a second named
// app on the same firebase-admin package so it doesn't collide with
// WyChat's own app inside _firebase-admin.js. Only touched for
// transactions that don't carry WyChat's meta (see routing below). ---
let wyteaiHandle=null;
function getWyteaiAdmin(){
  if(wyteaiHandle) return wyteaiHandle;
  const raw=process.env.WYTEAI_FIREBASE_SERVICE_ACCOUNT_JSON;
  if(!raw) throw new Error("WYTEAI_FIREBASE_SERVICE_ACCOUNT_JSON is not configured.");
  const app=wyteaiSdk.apps.find(a=>a.name==="wyteai")
    || wyteaiSdk.initializeApp({credential:wyteaiSdk.credential.cert(JSON.parse(raw))},"wyteai");
  wyteaiHandle={
    db:wyteaiSdk.firestore(app),
    auth:wyteaiSdk.auth(app),
    FieldValue:wyteaiSdk.firestore.FieldValue
  };
  return wyteaiHandle;
}

const WYTEAI_MIN_AMOUNT=2.5;
const WYTEAI_CURRENCY="USD";

// WYTE AI's Pro payment is a static Flutterwave hosted link, so unlike
// WyChat's transactions it carries no meta.firebaseUid/plan — this is the
// fallback branch for exactly that shape: no WyChat meta, amount/currency
// matches WYTE AI's $2.50 Pro price. It matches the payer's checkout email
// to a WYTE AI Firebase Auth account. If someone pays with a different
// email than their WYTE AI account, this can't know who to credit and
// just logs it — WYTE AI's own manual "Verify & activate Pro" form (tied
// to the signed-in session, not email) is unaffected and always works
// regardless of this webhook.
async function handleWyteaiCharge(data,res){
  const currency=String(data.currency||"").toUpperCase();
  const amount=Number(data.amount);
  if(currency!==WYTEAI_CURRENCY || amount<WYTEAI_MIN_AMOUNT){
    return json(res,200,{ok:true,ignored:true});
  }

  const txRef=String(data.tx_ref||"");
  if(!txRef) return json(res,400,{ok:false,error:"Missing tx_ref."});

  const email=data.customer?.email;
  if(!email) return json(res,200,{ok:true,ignored:true});

  const {db,auth,FieldValue}=getWyteaiAdmin();

  // Keyed by tx_ref (not Flutterwave's transaction id) so this shares the
  // exact same idempotency record as WYTE AI's own /api/verify-payment —
  // a tx_ref can only ever grant Pro once, whichever path processes it first.
  const usedRef=db.collection("usedPayments").doc(txRef);
  const usedSnap=await usedRef.get();
  if(usedSnap.exists) return json(res,200,{ok:true,alreadyProcessed:true});

  let uid;
  try{
    const user=await auth.getUserByEmail(email);
    uid=user.uid;
  }catch{
    console.warn("wyteai webhook: no account matches checkout email",email);
    return json(res,200,{ok:true,unmatched:true});
  }

  await usedRef.set({
    uid,
    txRef,
    amount,
    currency,
    verifiedAt:FieldValue.serverTimestamp()
  });
  await db.collection("users").doc(uid).set(
    {pro:true,proSince:FieldValue.serverTimestamp()},
    {merge:true}
  );

  return json(res,200,{ok:true,app:"wyteai"});
}

export default async function handler(req,res){
  if(req.method!=="POST") return json(res,405,{ok:false,error:"Method not allowed"});
  if(!validSignature(req)) return json(res,401,{ok:false,error:"Invalid webhook signature."});

  try{
    const event=req.body||{};
    const data=event.data||{};

    if(event.event!=="charge.completed" || data.status!=="successful"){
      return json(res,200,{ok:true,ignored:true});
    }

    const plan=data.meta?.plan;
    const uid=data.meta?.firebaseUid || data.meta?.uid;

    // --- WyChat: identified by its own meta. Unchanged from before. ---
    if(uid && ["starter","pro"].includes(plan)){
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
    }

    // --- WYTE AI: no WyChat meta present. Only handled if the
    // amount/currency actually matches WYTE AI's Pro price, so an
    // unrelated or malformed WyChat charge doesn't fall through here. ---
    const currency=String(data.currency||"").toUpperCase();
    if(!uid && currency===WYTEAI_CURRENCY && Number(data.amount)>=WYTEAI_MIN_AMOUNT){
      return await handleWyteaiCharge(data,res);
    }

    return json(res,200,{ok:true,ignored:true});
  }catch(e){
    console.error(e);
    return json(res,500,{ok:false,error:"Webhook processing failed."});
  }
}

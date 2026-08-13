import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

function adminApp(){
  if(getApps().length) return getApps()[0];

  const privateKey=(process.env.FIREBASE_PRIVATE_KEY||"").replace(/\\n/g,"\n");
  if(!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey){
    throw new Error("Firebase Admin environment variables are not configured.");
  }

  return initializeApp({
    credential: cert({
      projectId:process.env.FIREBASE_PROJECT_ID,
      clientEmail:process.env.FIREBASE_CLIENT_EMAIL,
      privateKey
    })
  });
}

export function admin(){
  const app=adminApp();
  return {
    auth:getAuth(app),
    db:getFirestore(app),
    messaging:getMessaging(app),
    FieldValue
  };
}

export async function requireUser(req){
  const header=req.headers.authorization||"";
  if(!header.startsWith("Bearer ")) throw new Error("Authentication required.");
  const token=header.slice(7).trim();
  if(!token) throw new Error("Authentication required.");
  const {auth}=admin();
  return auth.verifyIdToken(token,true);
}

export function json(res,status,body){
  res.status(status).json(body);
}

export async function requireAdmin(req){
  const decoded=await requireUser(req);
  const allowed=(process.env.ADMIN_UIDS||"")
    .split(",").map(x=>x.trim()).filter(Boolean);
  if(!allowed.includes(decoded.uid)) throw new Error("Platform administrator access required.");
  return decoded;
}

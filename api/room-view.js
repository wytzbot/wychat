import crypto from "node:crypto";
import { admin, json } from "./_firebase-admin.js";

export default async function handler(req,res){
  if(req.method!=="POST") return json(res,405,{ok:false,error:"Method not allowed."});
  try{
    const roomId=String(req.body?.roomId||"").trim();
    if(!roomId || !/^[A-Za-z0-9_-]{6,80}$/.test(roomId)) return json(res,400,{ok:false,error:"Invalid room."});

    const forwarded=String(req.headers["x-forwarded-for"]||"").split(",")[0].trim();
    const ip=forwarded || String(req.socket?.remoteAddress||"unknown");
    const day=new Date().toISOString().slice(0,10);
    const salt=process.env.ROOM_VIEW_SALT || process.env.FIREBASE_PROJECT_ID || "wychat";
    const visitorHash=crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0,32);

    const {db}=admin();
    const roomRef=db.collection("rooms").doc(roomId);
    const roomSnap=await roomRef.get();
    if(!roomSnap.exists) return json(res,404,{ok:false,error:"Room not found."});

    const viewRef=roomRef.collection("viewers").doc(`${day}_${visitorHash}`);
    const viewSnap=await viewRef.get();
    if(!viewSnap.exists){
      await viewRef.set({day,createdAt:new Date(),visitorHash});
      await roomRef.update({viewCount: (roomSnap.data().viewCount||0)+1});
    }
    return json(res,200,{ok:true});
  }catch(e){
    console.error("room-view:",e);
    return json(res,500,{ok:false,error:"Couldn't record room view."});
  }
}

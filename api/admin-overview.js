import { admin, requireAdmin, json } from "./_firebase-admin.js";

export default async function handler(req,res){
  if(req.method!=="GET") return json(res,405,{ok:false,error:"Method not allowed"});
  try{
    await requireAdmin(req);
    const {db}=admin();

    const [users,rooms,messages,payments]=await Promise.all([
      db.collection("users").get(),
      db.collection("rooms").get(),
      db.collection("messages").get(),
      db.collection("payments").get()
    ]);

    let starter=0,pro=0,revenue=0,reports=0;
    payments.forEach(d=>{
      const p=d.data();
      if(p.status==="successful"){
        if(p.plan==="starter") starter++;
        if(p.plan==="pro") pro++;
        revenue+=Number(p.amount||0);
      }
    });

    return json(res,200,{
      ok:true,
      registeredReceivers:users.size,
      activeRooms:rooms.docs.filter(d=>d.data().status==="live").length,
      messagesProcessed:messages.size,
      subscriptions:starter+pro,
      starterSubscribers:starter,
      proSubscribers:pro,
      revenue
    });
  }catch(e){
    return json(res,403,{ok:false,error:"Administrator access denied."});
  }
}

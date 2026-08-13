const LINKS={
  ng:{starter:"https://flutterwave.com/pay/7zg1w2li2vrk",pro:"https://flutterwave.com/pay/lqxanvm51vdb"},
  intl:{starter:"https://flutterwave.com/pay/pjaosdo2jdvg",pro:"https://flutterwave.com/pay/wnggjr7xjwfb"}
};

export function startPayment(plan,region="ng"){
  const target=LINKS[region]?.[plan];
  if(!target) throw new Error("Payment option unavailable.");
  // The hosted link is only the payment destination. It is NOT proof of payment.
  location.href=target;
}

export async function verifyPayment(transactionId,getIdToken){
  if(!transactionId) throw new Error("Missing payment transaction ID.");
  const idToken=await getIdToken();
  const r=await fetch("/api/verify-payment",{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":`Bearer ${idToken}`},
    body:JSON.stringify({transactionId})
  });
  const data=await r.json();
  if(!r.ok||!data.ok) throw new Error(data.error||"Payment is still being verified.");
  return data;
}

export async function getServerSubscription(getIdToken){
  const idToken=await getIdToken();
  const r=await fetch("/api/subscription",{headers:{Authorization:`Bearer ${idToken}`}});
  const data=await r.json();
  if(!r.ok||!data.ok) throw new Error(data.error||"Subscription status unavailable.");
  return data;
}
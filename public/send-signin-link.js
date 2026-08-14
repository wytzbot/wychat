import { admin, json } from "./_firebase-admin.js";
import nodemailer from "nodemailer";

// Sends WyChat's own branded sign-in email instead of relying on Firebase's
// built-in email delivery — which is (a) capped by a daily quota on the free
// plan, (b) unbranded, and (c) sent from a shared domain with worse spam
// deliverability. The Firebase Auth *link itself* still comes from Firebase
// (via generateSignInWithEmailLink) — only who sends the email changes.
//
// Delivery is via Gmail SMTP (an existing Gmail account + an App Password —
// no third-party email service signup, no separate cost). Gmail's own
// sending caps still apply (~500/day on a free personal account, ~2,000/day
// on Google Workspace) — this removes the Firebase-specific quota, not
// sending limits in general, since no email provider offers those for free.
const RATE_LIMIT_WINDOW_MS = 60_000;
const recentRequests = new Map(); // email -> last request timestamp (per warm serverless instance; best-effort only)

let transporter=null;
function getTransporter(){
  if(transporter) return transporter;
  transporter=nodemailer.createTransport({
    service:"gmail",
    auth:{ user:process.env.GMAIL_USER, pass:process.env.GMAIL_APP_PASSWORD }
  });
  return transporter;
}

function emailTemplate(link, email){
  return `<div style="background:#11102b;padding:40px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#1a1840;border-radius:20px;overflow:hidden;border:1px solid #2c2860;">
    <tr><td style="padding:32px 32px 0;text-align:center;">
      <span style="font-size:20px;font-weight:800;color:#ffffff;">WyChat</span>
    </td></tr>
    <tr><td style="padding:28px 32px 8px;">
      <h1 style="margin:0 0 6px;font-size:22px;line-height:1.3;color:#ffffff;font-weight:800;">Your sign-in link</h1>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#a8a3d1;">Tap the button below to sign in to WyChat as <strong style="color:#ffffff;">${email}</strong>. No password needed.</p>
    </td></tr>
    <tr><td style="padding:24px 32px;">
      <a href="${link}" style="display:block;text-align:center;background:#7957e8;color:#ffffff;font-weight:800;font-size:15px;text-decoration:none;padding:14px 20px;border-radius:14px;">Sign in to WyChat</a>
    </td></tr>
    <tr><td style="padding:0 32px 28px;">
      <p style="margin:0;font-size:12px;line-height:1.6;color:#716c9c;">This link expires soon and can only be used once. If you didn't request it, you can safely ignore this email.</p>
    </td></tr>
    <tr><td style="padding:18px 32px;border-top:1px solid #2c2860;">
      <p style="margin:0;font-size:11px;color:#544f80;">WyChat — Talk freely. Stay anonymous.</p>
    </td></tr>
  </table>
</div>`;
}

export default async function handler(req,res){
  if(req.method!=="POST") return json(res,405,{ok:false,error:"Method not allowed"});

  const email=String(req.body?.email||"").trim().toLowerCase();
  if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    return json(res,400,{ok:false,error:"Enter a valid email address."});
  }

  const last=recentRequests.get(email);
  if(last && Date.now()-last<RATE_LIMIT_WINDOW_MS){
    return json(res,429,{ok:false,error:"Please wait a moment before requesting another link."});
  }

  if(!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD){
    return json(res,500,{ok:false,error:"Email delivery isn't configured yet."});
  }

  try{
    const {auth}=admin();
    const appUrl=process.env.APP_URL || `https://${req.headers.host}`;
    const link=await auth.generateSignInWithEmailLink(email,{
      url:`${appUrl}/`,
      handleCodeInApp:true
    });

    try{
      await getTransporter().sendMail({
        from:`"WyChat" <${process.env.GMAIL_USER}>`,
        to:email,
        subject:"Your WyChat sign-in link",
        html:emailTemplate(link,email)
      });
    }catch(sendErr){
      console.error("Gmail SMTP send failed:",sendErr.message||sendErr);
      return json(res,502,{ok:false,error:"Couldn't send the sign-in email right now. Try again shortly."});
    }

    recentRequests.set(email,Date.now());
    return json(res,200,{ok:true});
  }catch(e){
    console.error("send-signin-link:",e);
    return json(res,500,{ok:false,error:"Couldn't send the sign-in email right now. Try again shortly."});
  }
}

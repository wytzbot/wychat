import { auth } from "./firebase.js";
import { watchAuth, logout, signInWithGoogle } from "./auth.js";
import { route } from "./router.js";
import { getRoom, createRoom, ownerRooms, setRoomStatus, removeRoom, updateRoom, randomId } from "./rooms.js";
import { subscribeMessages, sendMessage, editMessage, deleteMessage, getRoomMessageStats } from "./messages.js";
import { cleanupExpired } from "./storage.js";
import { startPayment, verifyPayment, getServerSubscription } from "./payments.js";
import { reportMessage, blockIdentity, subscribeBlocked } from "./moderation.js";
import { setTyping, clearTyping, subscribeTyping } from "./realtime.js";

const app=document.querySelector("#app");
const FREE_ROOM_LIMIT=10;
const state={
  user:null,room:null,participant:null,unsubscribe:null,messages:new Map(),quote:null,
  plan:{plan:"free",ads:true,ready:false},blockedUnsub:null,typingUnsub:null,typingTimer:null,pendingPlanHandled:false
};

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

// WhatsApp-style day divider label: "Today", "Yesterday", or a short date.
function dayLabel(date){
  const d=new Date(date.getFullYear(),date.getMonth(),date.getDate());
  const today=new Date(); today.setHours(0,0,0,0);
  const yesterday=new Date(today); yesterday.setDate(yesterday.getDate()-1);
  if(d.getTime()===today.getTime())return "Today";
  if(d.getTime()===yesterday.getTime())return "Yesterday";
  const sameYear=d.getFullYear()===today.getFullYear();
  return d.toLocaleDateString(undefined,sameYear?{month:"long",day:"numeric"}:{month:"long",day:"numeric",year:"numeric"});
}

function identity(roomId){
  const k="wychat_identity_"+roomId, old=localStorage.getItem(k);
  if(old)return old;
  const id=randomId(4); localStorage.setItem(k,id); return id;
}
function theme(){
  const saved=localStorage.getItem("wychat_theme")||"system";
  document.documentElement.dataset.theme=saved;
}
function themeLabel(){
  const t=localStorage.getItem("wychat_theme")||"system";
  return t[0].toUpperCase()+t.slice(1);
}
function cycleTheme(){
  const order=["system","light","dark"];
  const cur=localStorage.getItem("wychat_theme")||"system";
  const next=order[(order.indexOf(cur)+1)%order.length];
  localStorage.setItem("wychat_theme",next);
  theme();
  const btn=document.querySelector("#themeBtn");
  if(btn) btn.textContent="Theme: "+themeLabel();
}

// ---------- native-style helpers: toast + modal (standalone PWAs can't rely on alert/confirm/prompt) ----------
function toastHost(){
  let host=document.querySelector("#toastHost");
  if(!host){host=document.createElement("div");host.id="toastHost";host.className="toast-stack";document.body.appendChild(host);}
  return host;
}
function toast(msg,kind="info"){
  const host=toastHost();
  const t=document.createElement("div");
  t.className=`toast ${kind}`; t.textContent=msg;
  host.appendChild(t);
  requestAnimationFrame(()=>t.classList.add("show"));
  setTimeout(()=>{t.classList.remove("show");setTimeout(()=>t.remove(),250);},3400);
}
function openModal({title,body="",withInput=false,inputType="textarea",placeholder="",value="",confirmText="OK",cancelText="Cancel",danger=false}){
  return new Promise(resolve=>{
    const scrim=document.createElement("div"); scrim.className="modal-scrim";
    const field = !withInput ? "" : inputType==="textarea"
      ? `<textarea class="modal-input" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
      : `<input class="modal-input" type="${esc(inputType)}" autocomplete="${inputType==="email"?"email":"off"}" placeholder="${esc(placeholder)}" value="${esc(value)}">`;
    scrim.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><h3>${esc(title)}</h3>${body?`<p>${esc(body)}</p>`:""}${field}<div class="modal-actions"><button class="secondary" id="mCancel">${esc(cancelText)}</button><button class="${danger?"danger":"primary"}" id="mOk">${esc(confirmText)}</button></div></div>`;
    document.body.appendChild(scrim);
    requestAnimationFrame(()=>scrim.classList.add("show"));
    const input=scrim.querySelector(".modal-input"); input?.focus();
    const close=val=>{scrim.classList.remove("show");setTimeout(()=>scrim.remove(),200);resolve(val);};
    scrim.querySelector("#mCancel").onclick=()=>close(null);
    scrim.querySelector("#mOk").onclick=()=>close(withInput?(input.value.trim()||null):true);
    scrim.addEventListener("click",e=>{if(e.target===scrim)close(null);});
  });
}
function reportDialog(){
  const reasons=["Harassment","Spam","Threats","Sexual content","Hate or abuse","Self-harm concern","Other"];
  return new Promise(resolve=>{
    const scrim=document.createElement("div"); scrim.className="modal-scrim";
    scrim.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><h3>Report message</h3><p>Choose the reason that fits best.</p><div class="reason-grid">${reasons.map(r=>`<button class="reason" data-r="${esc(r)}">${esc(r)}</button>`).join("")}</div><div class="modal-actions"><button class="secondary" id="mCancel">Cancel</button></div></div>`;
    document.body.appendChild(scrim);
    requestAnimationFrame(()=>scrim.classList.add("show"));
    const close=val=>{scrim.classList.remove("show");setTimeout(()=>scrim.remove(),200);resolve(val);};
    scrim.querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>close(b.dataset.r));
    scrim.querySelector("#mCancel").onclick=()=>close(null);
    scrim.addEventListener("click",e=>{if(e.target===scrim)close(null);});
  });
}

// ---------- install prompt (native "add to home screen") ----------
let deferredInstall=null;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;});
function isStandalone(){return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;}
async function triggerInstall(){
  if(deferredInstall){const e=deferredInstall;deferredInstall=null;e.prompt();await e.userChoice;}
  else toast("Use your browser menu's \u201cAdd to Home Screen\u201d option to install WyChat.");
}

// ---------- auth/session helpers ----------
async function getIdToken(){
  if(!auth.currentUser) throw new Error("Please sign in first.");
  return auth.currentUser.getIdToken();
}
function getDeviceId(){
  let id=localStorage.getItem("wychat_device_id");
  if(!id){
    id=randomId(24); // reuse rooms.js's crypto.getRandomValues-based id — avoids crypto.randomUUID's HTTPS-only requirement
    localStorage.setItem("wychat_device_id",id);
  }
  return id;
}
async function claimDevice(){
  try{
    const token=await getIdToken();
    await fetch("/api/claim-device",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({deviceId:getDeviceId()})});
  }catch(e){console.warn("claimDevice failed:",e.message||e);}
}
async function loadPlan(){
  try{
    const s=await getServerSubscription(getIdToken);
    state.plan={plan:s.plan,ads:s.ads,freeTierLocked:!!s.freeTierLocked,ready:true};
  }catch{
    state.plan={plan:"free",ads:true,freeTierLocked:false,ready:true};
  }
}

// ---------- shell / navigation ----------
function shell(content,opts={}){
  const menu = opts.menu!==false;
  app.innerHTML=`<div class="scrim"></div>
  <aside class="drawer">
    <div class="drawer-head"><span class="brand">WyChat</span><button class="icon" data-navlink aria-label="Close menu">\u2715</button></div>
    <nav>
      <a href="/" data-navlink>Home</a>
      <a href="/pricing" data-navlink>Plans ${state.user?`<span class="plan-pill" data-plan="${state.plan.plan}">${state.plan.plan.toUpperCase()}</span>`:""}</a>
      <a href="/how-it-works" data-navlink>How it works</a>
      <a href="/privacy" data-navlink>Privacy</a>
      <a href="/security" data-navlink>Security</a>
      <a href="/safety" data-navlink>Safety</a>
      <a href="/terms" data-navlink>Terms</a>
    </nav>
    <div class="drawer-foot">
      <button class="secondary" id="themeBtn">Theme: ${themeLabel()}</button>
      ${isStandalone()?"":`<button class="secondary" id="installBtn">Install app</button>`}
      ${state.user?`<button class="secondary" id="drawerLogout">Sign out</button>`:`<a class="primary" href="/signin" data-navlink>Sign in</a>`}
    </div>
  </aside>
  <header><a class="brand" href="/">WyChat</a>${menu?`<button class="icon" id="menu" aria-label="Menu">\u2630</button>`:""}</header>
  <main class="page-enter">${content}</main>`;
  requestAnimationFrame(()=>app.querySelector(".page-enter")?.classList.add("in"));
  document.querySelector("#themeBtn").onclick=cycleTheme;
  document.querySelector("#installBtn")?.addEventListener("click",triggerInstall);
  document.querySelector("#drawerLogout")?.addEventListener("click",async()=>{await logout();location.href="/";});
}

// One delegated listener handles the drawer for every render (menu button is replaced by shell() each time).
document.addEventListener("click",e=>{
  if(e.target.closest("#menu")){document.body.classList.toggle("nav-open");return;}
  if(e.target.closest(".scrim") || e.target.closest("[data-navlink]")) document.body.classList.remove("nav-open");
});

// ---------- ads (kept exactly as configured — gated to free-plan viewers only) ----------
function mountAd(container){
  if(!container) return ()=>{};
  const paint=()=>{
    container.innerHTML="";
    const cfg=document.createElement("script");
    cfg.text=`atOptions={'key':'7f9cfb791a04825a9d4d5971dc043d99','format':'iframe','height':250,'width':300,'params':{}};`;
    container.appendChild(cfg);
    const invoke=document.createElement("script");
    invoke.src="https://potterynaggingformerly.com/7f9cfb791a04825a9d4d5971dc043d99/invoke.js";
    invoke.async=true; container.appendChild(invoke);
  };
  paint();
  const timer=setInterval(paint,34000);
  return ()=>clearInterval(timer);
}

// Full-screen 5s ad shown to free-tier room participants when they tap Home
// in the room's collapsible menu, then continues on to "/" automatically.
function showHomeInterstitial(){
  const overlay=document.createElement("div");
  overlay.setAttribute("style","position:fixed;inset:0;z-index:9999;background:#0b0b12;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px");
  overlay.innerHTML=`<div class="ad-label">ADVERTISEMENT</div><div id="interstitial-ad-slot"></div><p style="color:#aaa;font:14px system-ui,sans-serif">Continuing to WyChat in <span id="adCountdown">5</span>s…</p>`;
  document.body.appendChild(overlay);
  const stopAd=mountAd(overlay.querySelector("#interstitial-ad-slot"));
  let n=5;
  const countdownEl=overlay.querySelector("#adCountdown");
  const timer=setInterval(()=>{
    n--;
    if(countdownEl) countdownEl.textContent=String(Math.max(n,0));
    if(n<=0){
      clearInterval(timer);
      stopAd();
      location.href="/";
    }
  },1000);
}

function home(){
  shell(`<section class="hero"><span class="eyebrow">PRIVATE BY DESIGN</span><h1>Talk freely.<br><em>Stay anonymous.</em></h1><p>Create a question, share your link, and let people give honest opinions without revealing who they are.</p><div class="actions"><button class="primary" id="create">Create your anonymous room</button><a class="secondary" href="/how-it-works" data-navlink>How it works</a></div></section>
  <section class="flow"><div><b>ASK</b><span>Ask anything.</span></div><div><b>SHARE</b><span>Send your link.</span></div><div><b>TALK</b><span>Everyone joins.</span></div><div><b>DISAPPEAR</b><span>Messages expire.</span></div></section>
  <section class="card"><h2>One link. One shared conversation.</h2><p>No account for participants. No profiles. No @mentions. Just a room-specific anonymous ID, live replies, quotes, and a 3-day free lifespan.</p></section>`);
  document.querySelector("#create").onclick=()=>state.user?dashboard():(location.href="/signin");
}

function signin(){
  shell(`<section class="auth card">${isStandalone()?"":`<button class="corner-install" id="cornerInstall" aria-label="Install app to device"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13"/><path d="M7 11l5 5 5-5"/><path d="M5 21h14"/></svg>Install app</button>`}<span class="eyebrow">RECEIVER CONTROL</span><h1>Sign in to WyChat</h1><p>Continue with Google. No password or phone number.</p>
  <button class="secondary google-btn" id="googleSignin"><svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58z"/></svg>Continue with Google</button>
  <small id="authmsg" class="auth-hint">Having trouble signing in? It's often a network/carrier issue — try switching to Wi-Fi or another network provider (e.g. MTN, Airtel, Glo in Nigeria; Verizon, T-Mobile, AT&amp;T in the US; Jio, Airtel, Vi in India) and try again.</small>
  <div id="freeAd" class="free-ad"><div class="ad-label">ADVERTISEMENT</div><div id="ad-slot"></div></div></section>`,{menu:true});
  const stopAd=mountAd(document.querySelector("#ad-slot"));
  window.addEventListener("beforeunload",stopAd,{once:true});
  document.querySelector("#cornerInstall")?.addEventListener("click",triggerInstall);
  document.querySelector("#googleSignin").onclick=async()=>{
    try{ await signInWithGoogle(); }
    catch(e){
      if(e.code!=="auth/popup-closed-by-user"){
        document.querySelector("#authmsg").textContent="Couldn't sign in. Try switching to Wi-Fi or another network provider (e.g. MTN, Airtel, Glo in Nigeria; Verizon, T-Mobile, AT&T in the US; Jio, Airtel, Vi in India) and try again.";
        toast(e.message||"Couldn't sign in with Google.","error");
      }
    }
  };
}

async function dashboard(){
  if(!state.plan.ready) await loadPlan();
  const rooms=await ownerRooms(state.user.uid);
  rooms.sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
  const isFree=state.plan.plan==="free";
  const deviceLocked=isFree && state.plan.freeTierLocked;
  const atLimit=isFree && (rooms.length>=FREE_ROOM_LIMIT || deviceLocked);
  const slugField = state.plan.plan==="pro"
    ? `<input id="slug" placeholder="Custom link (optional) — e.g. launch-feedback" maxlength="48">`
    : `<div class="locked-input"><span>Custom link</span><small><a href="/pricing" data-navlink>Upgrade to Pro</a> to pick your own room link.</small></div>`;
  const retentionDays = isFree ? 3 : state.plan.plan==="starter" ? 7 : 10;
  shell(`<section class="dashhead"><div><span class="eyebrow">CONTROL ROOM</span><h1>Welcome back \u{1F44B}</h1><p>Manage your anonymous spaces.</p></div><button id="logout" class="secondary">Sign out</button></section>
  <div class="stats"><div><b>${rooms.filter(r=>r.status==="live").length}</b><span>Active rooms</span></div><div><b>${isFree?`${rooms.length}/${FREE_ROOM_LIMIT}`:rooms.length}</b><span>Total rooms</span></div><div><b>${state.plan.plan[0].toUpperCase()+state.plan.plan.slice(1)}</b><span>Current plan</span></div></div>
  ${atLimit?(deviceLocked?`<section class="card upgrade-banner"><h2>This device has already used the free plan</h2><p>Only one free-plan account is allowed per device, to keep the free tier fair. Upgrade to Starter or Pro to create rooms from this device and account.</p><a class="primary" href="/pricing" data-navlink>See plans</a></section>`:`<section class="card upgrade-banner"><h2>You\u2019ve reached the free plan\u2019s ${FREE_ROOM_LIMIT}-room limit</h2><p>Close or delete an old room, or upgrade for unlimited rooms, a custom link, and no ads.</p><a class="primary" href="/pricing" data-navlink>See plans</a></section>`):`
  <section class="card create"><h2>Create a question</h2><input id="question" placeholder="Should I start this business?">${slugField}<button id="newroom" class="primary">Create anonymous room</button><p id="createMsg"></p></section>`}
  <section><div class="sectiontitle"><h2>My rooms</h2><a href="/pricing" data-navlink>Plans</a></div><div id="rooms" class="roomgrid">${rooms.map(roomCard).join("")||`<div class="empty card">No rooms yet \u{1F440}<br><small>Create your first question above.</small></div>`}</div></section>
  ${isFree?`<section class="free-ad"><div class="ad-label">ADVERTISEMENT</div><div id="dash-ad-slot"></div></section>`:""}`);
  const stopAd=isFree?mountAd(document.querySelector("#dash-ad-slot")):null;
  if(stopAd) window.addEventListener("beforeunload",stopAd,{once:true});
  document.querySelector("#logout").onclick=async()=>{await logout();location.href="/";};
  document.querySelector("#newroom")?.addEventListener("click",async()=>{
    const q=document.querySelector("#question").value.trim();
    const slug=document.querySelector("#slug")?.value.trim()||"";
    if(!q)return;
    try{const id=await createRoom(state.user.uid,q,slug,retentionDays,state.plan.plan);location.href="/q/"+id;}
    catch(e){document.querySelector("#createMsg").textContent=e.message;}
  });
  document.querySelectorAll("[data-open]").forEach(x=>x.onclick=()=>location.href="/q/"+x.dataset.open);
  document.querySelectorAll("[data-copy]").forEach(x=>x.onclick=async()=>{
    try{await navigator.clipboard.writeText(location.origin+"/q/"+x.dataset.copy);toast("Room link copied.");}
    catch{toast("Couldn't copy — copy the link manually.","error");}
  });
  document.querySelectorAll("[data-analytics]").forEach(x=>x.onclick=async()=>{
    try{
      const room=rooms.find(r=>r.roomId===x.dataset.analytics);
      if(!room) return;
      const start=new Date(); start.setDate(1); start.setHours(0,0,0,0);
      const stats=await getRoomMessageStats(room.roomId,start);
      await openModal({
        title:"Room analytics",
        body:`Views: ${room.viewCount||0} · Messages this month: ${stats.thisPeriod} · Total messages: ${stats.total} · Anonymous participants: ${stats.uniqueParticipants}`
      });
    }catch(e){toast("Couldn't load analytics.","error");}
  });
  document.querySelectorAll("[data-close]").forEach(x=>x.onclick=async()=>{await setRoomStatus(x.dataset.close,"closed");dashboard();});
  document.querySelectorAll("[data-reopen]").forEach(x=>x.onclick=async()=>{await setRoomStatus(x.dataset.reopen,"live");dashboard();});
  document.querySelectorAll("[data-delete]").forEach(x=>x.onclick=async()=>{
    const ok=await openModal({title:"Delete this room?",body:"This can't be undone — all its messages will be removed.",confirmText:"Delete",cancelText:"Cancel",danger:true});
    if(ok){await removeRoom(x.dataset.delete);toast("Room deleted.");dashboard();}
  });
}
function roomCard(r){const hasAnalytics=r.plan==="starter"||r.plan==="pro";return `<article class="roomcard"><span class="status">${r.status==="live"?"LIVE":"CLOSED"}</span><h3>${esc(r.question)}</h3><p>Room link: /q/${esc(r.slug||r.roomId)}</p><div class="roomactions"><button data-open="${esc(r.slug||r.roomId)}">Open</button>${hasAnalytics?`<button data-analytics="${r.roomId}">Analytics</button>`:`<a class="locked-action" href="/pricing" data-navlink title="Upgrade to Starter or Pro for room analytics">Analytics 🔒</a>`}<button data-copy="${esc(r.slug||r.roomId)}">Copy</button>${r.status==="live"?`<button data-close="${r.roomId}">Close</button>`:`<button data-reopen="${r.roomId}">Reopen</button>`}<button data-delete="${r.roomId}">Delete</button></div></article>`}

async function roomPage(key){
  const room=await getRoom(key);
  if(!room){shell(`<section class="card error"><h1>This question link no longer exists.</h1><p>It may have been deleted or the link is incorrect.</p><a class="primary" href="/" data-navlink>Go to WyChat</a></section>`,{menu:false});return;}
  state.room=room; state.participant=identity(room.roomId);
  const isOwner = state.user?.uid===room.ownerUid;
  // Record one privacy-preserving daily view for analytics; failure never blocks the room.
  if(!isOwner) fetch("/api/room-view",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({roomId:room.roomId})}).catch(()=>{});
  const retentionDays = room.retentionDays ?? 3;
  const roomCreatedAtMs = room.createdAt?.toMillis?.() ?? Date.now();
  const expiresAtMs = roomCreatedAtMs+retentionDays*86400000;
  if(Date.now()>=expiresAtMs){
    shell(`<section class="card error"><h1>This link has expired.</h1><p>Room links stay active for ${retentionDays} day${retentionDays===1?"":"s"} after creation. This one has passed that window and can no longer be opened. If you still need this conversation, let the person who shared the link with you know so they can create a new room.</p><a class="primary" href="/" data-navlink>Go to WyChat</a></section>`,{menu:false});
    return;
  }
  const clearsOn=new Date(expiresAtMs).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
  const roomPlan=room.plan||"free";
  const monthlyLimit=roomPlan==="starter"?10000:Infinity;
  let monthlyMessageCount=0;
  if(roomPlan==="starter"){
    try{
      const start=new Date(); start.setDate(1); start.setHours(0,0,0,0);
      const stats=await getRoomMessageStats(room.roomId,start);
      monthlyMessageCount=stats.thisPeriod;
    }catch(e){console.warn("message quota check failed:",e);}
  }
  const quotaReached=monthlyMessageCount>=monthlyLimit;
  shell(`<section class="roomtop"><a href="/" class="back" data-navlink>\u2039</a><div><span class="eyebrow">ANONYMOUS ROOM</span><h1>${esc(room.question)}</h1><span class="live">${room.status==="live"?"\u25CF LIVE":"CLOSED — read only"}</span><small class="retention-note">This link expires on ${clearsOn} — after that it'll show as expired for everyone.</small></div></section>
  ${room.pinnedMessageId?`<div class="pinned-banner">📌 <b>Pinned message</b><span id="pinnedText">Loading…</span></div>`:""}
  <section class="conversation" id="conversation"><div class="empty" id="empty">No opinions yet \u{1F440}<br><small>Share your link and let the conversation begin.</small></div></section>
  <div id="typing" class="typing-indicator hidden"></div>
  <div id="quote" class="quote-preview hidden"></div>
  ${room.status==="live"&&!quotaReached?`<form id="composer" class="composer"><button type="button" id="plus" class="plus">+</button><input id="message" maxlength="2000" placeholder="Type anonymously…" autocomplete="off"><button class="send" type="submit">Send</button></form>`:room.status==="live"&&quotaReached?`<div class="closednote">This Starter room has reached its 10,000-message monthly allowance. Upgrade to Pro to continue.</div>`:`<div class="closednote">This room is closed. You can still read the conversation.</div>`}
  <div class="roommenu"><a href="/" data-navlink>Go to WyChat</a></div>`,{menu:true});

  // Extra ad exposure for free-tier rooms: participants (not the room owner)
  // leaving via the collapsible menu's Home link see a 5s interstitial first.
  const isFreeRoom=(room.plan||"free")==="free";
  if(isFreeRoom && !isOwner){
    document.querySelector(".drawer nav a[href=\"/\"]")?.addEventListener("click",e=>{
      e.preventDefault();
      showHomeInterstitial();
    });
  }

  let blocked=new Set();
  state.blockedUnsub?.(); state.blockedUnsub=subscribeBlocked(room.roomId,ids=>{blocked=new Set(ids);renderMessages();});

  const conv=document.querySelector("#conversation");
  state.unsubscribe?.();
  state.unsubscribe=subscribeMessages(room.roomId,(changes,_,err)=>{
    if(err){
      console.error("subscribeMessages error:",err.code||err,err.message||"");
      conv.innerHTML=`<div class="error">Couldn't load messages (${esc(err.code||"unknown error")}). <button id="retryLoad" class="secondary">Retry</button></div>`;
      document.querySelector("#retryLoad")?.addEventListener("click",()=>roomPage(key));
      return;
    }
    changes?.forEach(ch=>{
      if(ch.type==="removed"){state.messages.delete(ch.doc.id);return;}
      const data=ch.doc.data();
      // Replace the optimistic local echo once its real doc arrives, matched by clientId.
      if(data.clientId) state.messages.delete("local-"+data.clientId);
      state.messages.set(ch.doc.id,{messageId:ch.doc.id,...data});
    });
    renderMessages();
  });

  function renderMessages(){
    const vals=[...state.messages.values()]
      .filter(m=>!m.expiresAt || m.expiresAt.toDate?.()>new Date())
      .filter(m=>!blocked.has(m.participantId))
      .sort((a,b)=>(a.createdAt?.toMillis?.()||Date.now())-(b.createdAt?.toMillis?.()||Date.now()));
    document.querySelector("#empty")?.remove();
    let lastDay=null, html="";
    for(const m of vals){
      const when=m.createdAt?.toDate?m.createdAt.toDate():new Date();
      const dayKey=when.toDateString();
      if(dayKey!==lastDay){ html+=`<div class="day-divider"><span>${dayLabel(when)}</span></div>`; lastDay=dayKey; }
      html+=`<article class="msg" id="m-${m.messageId}"><div class="bubble${m.unconfirmed?" unconfirmed":""}"><b>${esc(m.participantId)}</b>${m.quotedMessageId?`<div class="quoted">\u21B3 ${esc(m.quoteSnapshot?.participantId)} "${esc(m.quoteSnapshot?.content)}"</div>`:""}<p>${esc(m.content)}</p><div class="meta">${m.edited?"edited · ":""}${m.createdAt?.toDate?when.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):(m.unconfirmed?"not confirmed — will appear once reconnected":"sending")} · <button data-quote="${m.messageId}">Quote</button> <button data-report="${m.messageId}">Report</button>${m.participantId===state.participant?` <button data-edit="${m.messageId}">Edit</button> <button data-del="${m.messageId}">Delete</button>`:""}${isOwner&&m.participantId!==state.participant?` <button class="block-btn" data-block="${esc(m.participantId)}">Block</button>`:""}${isOwner&&(roomPlan==="starter"||roomPlan==="pro")?` <button data-pin="${m.messageId}">${room.pinnedMessageId===m.messageId?"Unpin":"Pin"}</button>`:""}</div></div></article>`;
    }
    conv.innerHTML=html||`<div class="empty"><h2>No opinions yet \u{1F440}</h2><small>Share your link and let the conversation begin.</small></div>`;
    const pinnedEl=document.querySelector("#pinnedText");
    if(pinnedEl){
      const pm=room.pinnedMessageId ? state.messages.get(room.pinnedMessageId) : null;
      pinnedEl.textContent=pm ? `${pm.participantId}: ${String(pm.content||"").slice(0,120)}` : "Pinned message";
    }
    conv.querySelectorAll("[data-quote]").forEach(b=>b.onclick=()=>{const m=state.messages.get(b.dataset.quote);state.quote=m;const q=document.querySelector("#quote");q.classList.remove("hidden");q.innerHTML=`\u21B3 <b>${esc(m.participantId)}</b> "${esc(m.content.slice(0,180))}" <button id="clearq">\u00D7</button>`;document.querySelector("#message")?.focus();});
    conv.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{
      const ok=await openModal({title:"Delete this message?",confirmText:"Delete",cancelText:"Cancel",danger:true});
      if(ok) deleteMessage(b.dataset.del);
    });
    conv.querySelectorAll("[data-report]").forEach(b=>b.onclick=async()=>{
      const reason=await reportDialog();
      if(reason){await reportMessage(room.roomId,b.dataset.report,reason);toast("Report sent — thank you.");}
    });
    conv.querySelectorAll("[data-block]").forEach(b=>b.onclick=async()=>{
      const ok=await openModal({title:"Block this anonymous ID?",body:"They’ll no longer be able to post or be seen in this room.",confirmText:"Block",cancelText:"Cancel",danger:true});
      if(ok){await blockIdentity(room.roomId,b.dataset.block);toast("Blocked.");}
    });
    conv.querySelectorAll("[data-pin]").forEach(b=>b.onclick=async()=>{
      const next=room.pinnedMessageId===b.dataset.pin ? null : b.dataset.pin;
      await updateRoom(room.roomId,{pinnedMessageId:next});
      room.pinnedMessageId=next;
      toast(next?"Message pinned.":"Message unpinned.");
      renderMessages();
    });
    conv.querySelectorAll("[data-edit]").forEach(b=>b.onclick=async()=>{
      const m=state.messages.get(b.dataset.edit);
      const n=await openModal({title:"Edit your message",withInput:true,value:m.content,confirmText:"Save"});
      if(n) await editMessage(m.messageId,n);
    });
    if(vals.length) conv.lastElementChild?.scrollIntoView({behavior:"smooth",block:"end"});
  }

  document.querySelector("#quote")?.addEventListener("click",e=>{if(e.target.id==="clearq"){state.quote=null;document.querySelector("#quote").classList.add("hidden");}});
  document.querySelector("#plus")?.addEventListener("click",()=>document.querySelector("#message")?.focus());

  // typing indicator — a small native chat touch
  const typingEl=document.querySelector("#typing");
  state.typingUnsub?.(); state.typingUnsub=subscribeTyping(room.roomId,state.participant,ids=>{
    if(!typingEl) return;
    if(!ids.length){typingEl.classList.add("hidden");return;}
    typingEl.classList.remove("hidden");
    typingEl.textContent=ids.length===1?`${ids[0]} is typing…`:`${ids.length} people are typing…`;
  });
  document.querySelector("#message")?.addEventListener("input",()=>{
    setTyping(room.roomId,state.participant).catch(()=>{});
    clearTimeout(state.typingTimer);
    state.typingTimer=setTimeout(()=>clearTyping(room.roomId,state.participant),2500);
  });

  // Retention is fixed to the room itself (set once, at creation, from the
  // owner's plan at that time) — not the current viewer's plan. That's what
  // makes every message in the room expire together, like a WhatsApp group,
  // regardless of who's sending or what plan they're on.
  document.querySelector("#composer")?.addEventListener("submit",async e=>{
    e.preventDefault();const input=document.querySelector("#message"),content=input.value.trim();if(!content)return;
    const clientId=crypto.randomUUID(), q=state.quote;input.value="";state.quote=null;document.querySelector("#quote").classList.add("hidden");
    clearTimeout(state.typingTimer); clearTyping(room.roomId,state.participant).catch(()=>{});
    const optimistic={messageId:"local-"+clientId,participantId:state.participant,content,quotedMessageId:q?.messageId,quoteSnapshot:q?{participantId:q.participantId,content:q.content}:null,createdAt:null};
    state.messages.set(optimistic.messageId,optimistic);renderMessages();
    try{
      // Retry transient failures (dropped packets, brief carrier hiccups)
      // a few times with backoff before treating it as a real failure.
      // Firestore's offline queue (enabled in firebase.js) already handles
      // the fully-offline case — this covers the "technically connected but
      // the write keeps failing" case in between.
      let ref, lastErr;
      for(let attempt=1;attempt<=3;attempt++){
        try{
          ref=await sendMessage(room.roomId,state.participant,content,q,clientId,roomCreatedAtMs,retentionDays);
          lastErr=null;
          break;
        }catch(e){
          lastErr=e;
          // Don't retry validation errors (empty/too-long/missing IDs) —
          // only retry things that look like real network failures.
          if(!navigator.onLine || e?.code==="unavailable" || e?.message?.toLowerCase().includes("network")){
            if(attempt<3) await new Promise(r=>setTimeout(r,600*attempt));
          } else break;
        }
      }
      if(lastErr) throw lastErr;
      console.log("sendMessage: write acknowledged by Firestore, doc id",ref.id,"— waiting for realtime listener to confirm it back...");
      // The write succeeded, but don't delete the optimistic echo here — the
      // realtime listener above swaps it out (matched by clientId) once the
      // confirmed doc arrives. If that never happens within a few seconds
      // (e.g. the listener query is broken), flag it instead of leaving it
      // silently stuck on "sending" forever.
      setTimeout(()=>{
        if(state.messages.has(optimistic.messageId)){
          console.warn("Message",ref.id,"was written to Firestore but never came back through the realtime listener. This usually means the Firestore composite index for the messages query isn't built yet — check Firebase Console → Firestore → Indexes.");
          optimistic.unconfirmed=true;
          renderMessages();
        }
      },8000);
    }
    catch(err){
      const el=document.querySelector("#m-local-"+clientId);if(el)el.classList.add("failed");input.value=content;
      toast(navigator.onLine?"Couldn't send your message. Check your connection and try again.":"You're offline — this will send once you're back online.","error");
    }
  });
}

function teardownRoom(){
  state.unsubscribe?.(); state.unsubscribe=null;
  state.blockedUnsub?.(); state.blockedUnsub=null;
  state.typingUnsub?.(); state.typingUnsub=null;
  clearTimeout(state.typingTimer);
}

function pendingPlanKey(){return "wychat_pending_plan";}

function simplePage(name){
  const pages={
    pricing:["Plans","Free — ₦0","10 rooms · anonymous conversations · quotes · moderation · ads · 3-day room expiry","Starter — ₦900/month","Unlimited rooms · no ads · 10,000 messages/month · room analytics · pin important messages · 7-day room expiry","Pro — ₦1,500/month","Everything in Starter · custom room links · 10-day room expiry · advanced analytics · unlimited messages · enhanced moderation"],
    "how-it-works":["How WyChat works","ASK → SHARE → TALK → DISAPPEAR","Create a question, share the room link, and let people join without an account. Every participant gets a random room-specific ID. Free rooms last 3 days, Starter rooms 7 days, and Pro rooms 10 days. Starter adds analytics and message pins; Pro adds custom links, advanced analytics and unlimited messages."],
    privacy:["Privacy","Your identity isn't revealed to other participants in the room.","WyChat uses Firebase authentication for receiver accounts. Anonymous room identities are random and room-specific. We do not use anonymous conversation content for targeted advertising."],
    security:["Security","Secure authentication, access controls, validation and abuse prevention.","Never use WyChat to share sensitive information you would not want stored temporarily. Privacy does not mean technical untraceability."],
    safety:["Safety & moderation","Report harassment, spam, threats, sexual content, hate/abuse, self-harm concerns or other harmful content.","Room owners can delete messages and block room-specific anonymous identities."],
    terms:["Terms","Use WyChat lawfully and respectfully.","Do not use rooms for threats, harassment, fraud, exploitation or illegal activity. Room owners and the platform may remove harmful content."]
  };
  const p=pages[name]||pages["how-it-works"];
  shell(`<section class="legal card"><span class="eyebrow">WYCHAT</span><h1>${p[0]}</h1>${p.slice(1).map(x=>`<p>${esc(x)}</p>`).join("")}</section>`);
  if(name==="pricing"){
    document.querySelector(".legal").insertAdjacentHTML("afterend",`<div class="region-switch"><button class="secondary" id="ngPrices">Pay in Nigeria (₦)</button><button class="secondary" id="intlPrices">Pay internationally ($)</button></div><div class="plans" id="plans"></div>`);
    const renderPrices=region=>{
      const intl=region==="intl";
      document.querySelector("#plans").innerHTML=
        `<button class="plan" data-plan="starter" data-region="${region}"><b>Starter</b><strong>₦900 <span class="price-alt">/ $1</span></strong><span class="price-note">per month${intl?" — charged in $":" — charged in ₦"}</span><span>Unlimited rooms · 10k messages/month · Analytics · Pins · 7-day expiry · No ads</span></button>
         <button class="plan" data-plan="pro" data-region="${region}"><b>Pro</b><strong>₦1,500 <span class="price-alt">/ $2</span></strong><span class="price-note">per month${intl?" — charged in $":" — charged in ₦"}</span><span>Everything in Starter · Custom links · 10-day expiry · Advanced analytics · Unlimited messages</span></button>`;
      document.querySelectorAll("#plans [data-plan]").forEach(b=>b.onclick=()=>{
        if(!state.user){
          sessionStorage.setItem(pendingPlanKey(),JSON.stringify({plan:b.dataset.plan,region:b.dataset.region}));
          toast("Sign in to continue to payment.");
          location.href="/signin";
          return;
        }
        startPayment(b.dataset.plan,b.dataset.region);
      });
    };
    document.querySelector("#ngPrices").onclick=()=>renderPrices("ng");
    document.querySelector("#intlPrices").onclick=()=>renderPrices("intl");
    renderPrices("ng");
  }
}

// Resume a plan purchase right after the person signs in from the pricing page.
async function resumePendingPlan(){
  if(state.pendingPlanHandled) return;
  const raw=sessionStorage.getItem(pendingPlanKey());
  if(!raw) return;
  state.pendingPlanHandled=true;
  sessionStorage.removeItem(pendingPlanKey());
  try{
    const {plan,region}=JSON.parse(raw);
    toast("Continuing to payment…");
    startPayment(plan,region);
  }catch{}
}

// Flutterwave redirects back with transaction_id/tx_ref + status query params.
async function handlePaymentReturn(){
  const params=new URLSearchParams(location.search);
  const transactionId=params.get("transaction_id")||params.get("tx_ref");
  const status=params.get("status");
  if(!transactionId) return;
  history.replaceState({},"",location.pathname);
  if(status && status!=="successful" && status!=="completed"){
    toast("Payment wasn't completed.","error");
    return;
  }
  try{
    await verifyPayment(transactionId,getIdToken);
    await loadPlan();
    toast("Payment verified — your plan is now active!","success");
  }catch(e){
    toast(e.message||"We couldn't verify that payment yet. It may still be processing.","error");
  }
}

async function promptForEmail(){
  return openModal({title:"Confirm your email",body:"Enter the email address you used to request this sign-in link — you opened it in a different browser or device than you signed in from.",withInput:true,inputType:"email",placeholder:"you@example.com",confirmText:"Continue"});
}

async function start(){
  theme();

  // Never block the first paint on cleanup, service-worker registration,
  // or authentication. Render the route immediately, then hydrate it.
  const initialRoute = route();
  if(initialRoute.name === "home") home();
  else if(["pricing","how-it-works","privacy","security","safety","terms"].includes(initialRoute.name)) simplePage(initialRoute.name);
  else if(initialRoute.name === "signin") signin();
  else if(initialRoute.name === "room") {
    // Room data still has to come from Firebase, but the browser no longer
    // gets stuck behind a generic full-screen "Loading WyChat..." page.
    roomPage(initialRoute.key);
  }

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("/sw.js").catch(()=>{});
  }

  // Maintenance runs in the background.
  cleanupExpired().catch(()=>{});

  watchAuth(async u=>{
    state.user=u;
    if(u){
      if(!state.deviceClaimChecked){state.deviceClaimChecked=true;await claimDevice();}
      await loadPlan(); await handlePaymentReturn(); await resumePendingPlan();
    }
    else { state.plan={plan:"free",ads:true,freeTierLocked:false,ready:true}; }
    const r=route();
    if(r.name!=="room") teardownRoom();
    if(r.name==="room")roomPage(r.key);
    else if(u&&(r.name==="home"||r.name==="signin"))dashboard();
    else renderRoute(r);
  });
}
function renderRoute(r){
  if(r.name==="home")home();
  else if(r.name==="signin")signin();
  else if(["pricing","how-it-works","privacy","security","safety","terms"].includes(r.name))simplePage(r.name);
  else if(r.name==="room")roomPage(r.key);
  else home();
}
start();

const DB_NAME = "wychat-local";
const VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("rooms")) db.createObjectStore("rooms", {keyPath:"roomId"});
      if (!db.objectStoreNames.contains("messages")) {
        const s = db.createObjectStore("messages", {keyPath:"messageId"});
        s.createIndex("roomId", "roomId");
      }
      if (!db.objectStoreNames.contains("identities")) db.createObjectStore("identities", {keyPath:"roomId"});
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", {keyPath:"clientId"});
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function put(store, value) {
  const db = await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,"readwrite"); tx.objectStore(store).put(value);
    tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error);
  });
}
export async function all(store) {
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,"readonly"), req=tx.objectStore(store).getAll();
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
export async function remove(store,key) {
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,"readwrite"); tx.objectStore(store).delete(key);
    tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error);
  });
}
export async function cleanupExpired() {
  const now=Date.now(), msgs=await all("messages");
  await Promise.all(msgs.filter(m=>m.expiresAt && m.expiresAt<=now).map(m=>remove("messages",m.messageId)));
}
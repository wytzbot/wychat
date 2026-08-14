import { admin, requireUser, json } from "./_firebase-admin.js";

// Ties one device to one account for free-plan purposes. The client sends a
// device id it generates once and persists in localStorage (see
// getDeviceId() in app.js). Signing out and creating a new account on the
// same device doesn't reset anything: the device's first claimant "owns"
// the free plan on this device, and any other account seen on it gets
// flagged (users/{uid}.freeTierLocked) so free-tier room creation is
// rejected server-side by Firestore rules — not just hidden in the UI.
//
// This is a practical deterrent, not a hard guarantee: clearing site data,
// using a different browser, or private/incognito mode all reset the
// stored device id. True device fingerprinting is out of scope here.
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  try {
    const decoded = await requireUser(req);
    const deviceId = String(req.body?.deviceId || "");
    if (!/^[A-Za-z0-9_-]{10,64}$/.test(deviceId)) {
      return json(res, 400, { ok: false, error: "Invalid device id." });
    }

    const { db, FieldValue } = admin();
    const claimRef = db.collection("deviceClaims").doc(deviceId);
    const userRef = db.collection("users").doc(decoded.uid);

    const result = await db.runTransaction(async tx => {
      const claimSnap = await tx.get(claimRef);
      if (!claimSnap.exists) {
        tx.set(claimRef, { uid: decoded.uid, claimedAt: FieldValue.serverTimestamp() });
        tx.set(userRef, { freeTierLocked: false }, { merge: true });
        return { deviceReused: false };
      }
      const claimedUid = claimSnap.data().uid;
      if (claimedUid === decoded.uid) {
        return { deviceReused: false };
      }
      tx.set(userRef, { freeTierLocked: true }, { merge: true });
      return { deviceReused: true };
    });

    return json(res, 200, { ok: true, ...result });
  } catch (e) {
    return json(res, 401, { ok: false, error: "Unable to verify your session." });
  }
}

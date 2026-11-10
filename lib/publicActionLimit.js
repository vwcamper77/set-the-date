import { createHash } from 'crypto';
import { db } from '@/lib/firebaseAdmin';

// Small Firestore-backed limiter shared by account-free public endpoints.
// Keep only hashed identifiers, not raw addresses or IPs, in the limiter.
export async function allowPublicAction(req, action, identifier = '', maxCount = 4, minutes = 60) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim();
  const hashed = createHash('sha256')
    .update([action, ip, String(identifier).trim().toLowerCase()].join(':'))
    .digest('hex');
  const ref = db.collection('publicActionLimits').doc(hashed);
  const now = Date.now();
  const allowed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;
    const stillInWindow = data && Number(data.resetAtMs) > now;
    const count = stillInWindow ? Number(data.count || 0) : 0;
    if (count >= maxCount) return false;
    tx.set(ref, {
      count: count + 1,
      resetAtMs: stillInWindow ? data.resetAtMs : now + minutes * 60000,
      updatedAtMs: now,
    });
    return true;
  });
  return allowed;
}

import { db, FieldValue } from '@/lib/firebaseAdmin';
import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { isAdminEmail } from '@/lib/adminUsers';
import { allowPublicAction } from '@/lib/publicActionLimit';
import { EVENT_ID, MESSAGE_ID, validateMessage, canModerate } from '@/lib/communityValidation.cjs';

// Separate, server-only collections. No client Firestore permissions are added.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.EVENT_COMMUNITY_ENABLED !== 'true') {
    return res.status(503).json({ error: 'Event conversations are being prepared. Voting and event management are still available.' });
  }
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const id = req.query.id;
  if (typeof id !== 'string' || !EVENT_ID.test(id)) return res.status(400).json({ error: 'Invalid event link.' });
  try {
    const pollSnap = await db.collection('polls').doc(id).get();
    if (!pollSnap.exists || pollSnap.data().deletedAt) return res.status(404).json({ error: 'This event is no longer available.' });
    const poll = pollSnap.data();
    const ref = db.collection('eventCommunities').doc(id);
    const messages = ref.collection('messages');
    if (req.method === 'GET') {
      const [settings, feed] = await Promise.all([ref.get(), messages.orderBy('createdAt', 'desc').limit(50).get()]);
      let moderator = false;
      if (req.headers.authorization) {
        const user = await verifyRequestFirebaseUser(req);
        moderator = canModerate(user, poll, isAdminEmail);
      }
      return res.status(200).json({
        title: poll.eventTitle || 'Your event',
        eventPath: poll.eventType === 'holiday' ? `/trip/${id}` : `/poll/${id}`,
        closed: settings.data()?.closed === true, announcement: settings.data()?.announcement || '', moderator,
        messages: feed.docs.map(doc => ({ id: doc.id, name: doc.data().name, text: doc.data().text,
          createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null })).reverse(),
      });
    }
    if (req.method === 'POST') {
      let message;
      try { message = validateMessage(req.body); }
      catch (error) { return res.status(400).json({ error: error.message }); }
      if (String(req.body?.website || '').trim()) return res.status(400).json({ error: 'Unable to post this message.' });
      if (!await allowPublicAction(req, 'event-community', '', 10, 60)) return res.status(429).json({ error: 'Please wait before posting again.' });
      const newMessage = messages.doc();
      await db.runTransaction(async tx => {
        const settings = await tx.get(ref);
        if (settings.data()?.closed) { const error = new Error('This discussion is closed.'); error.statusCode = 409; throw error; }
        tx.set(newMessage, { ...message, createdAt: FieldValue.serverTimestamp() });
      });
      return res.status(201).json({ ok: true });
    }
    const user = await verifyRequestFirebaseUser(req);
    if (!canModerate(user, poll, isAdminEmail)) return res.status(403).json({ error: 'Only the organiser or an admin can moderate this discussion.' });
    if (req.method === 'DELETE') {
      if (!MESSAGE_ID.test(String(req.body?.messageId || ''))) return res.status(400).json({ error: 'Invalid message.' });
      await messages.doc(req.body.messageId).delete();
    } else {
      const { closed, announcement } = req.body || {};
      if (typeof closed !== 'boolean' || typeof announcement !== 'string' || announcement.trim().length > 1000) return res.status(400).json({ error: 'Please check the discussion settings.' });
      await ref.set({ closed, announcement: announcement.trim(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Event community request failed', error);
    return res.status(error.statusCode || 500).json({ error: error.statusCode === 409 ? error.message : 'We could not load or update this conversation. Please try again.' });
  }
}

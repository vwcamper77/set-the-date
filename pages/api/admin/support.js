import { db, FieldValue } from '@/lib/firebaseAdmin';
import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { isAdminEmail } from '@/lib/adminUsers';
import { sendBrevoEmail } from '@/lib/brevo';

const allowedStatuses = new Set(['open', 'in_progress', 'waiting', 'resolved']);
const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const user = await verifyRequestFirebaseUser(req);
    const adminEmail = user?.email || user?.userEmail || '';
    if (!isAdminEmail(adminEmail)) return res.status(403).json({ error: 'Forbidden' });

    if (req.method === 'GET') {
      const snapshot = await db.collection('supportTickets')
        .orderBy('createdAt', 'desc').limit(150).get();
      return res.status(200).json({
        tickets: snapshot.docs.map((doc) => {
          const value = doc.data();
          return {
            id: doc.id, name: value.name || '', email: value.email || '',
            category: value.category || 'other', status: value.status || 'open',
            message: value.message || '', eventLink: value.eventLink || '',
            source: value.source || 'unknown', replies: value.replies || [],
            createdAt: value.createdAt?.toDate?.()?.toISOString() || null,
          };
        }),
      });
    }

    const id = String(req.body?.ticketId || '');
    const status = req.body?.status;
    const reply = String(req.body?.reply || '').trim();
    if (!/^[a-zA-Z0-9]{10,80}$/.test(id) ||
        (status && !allowedStatuses.has(status)) ||
        reply.length > 4000 || (!status && !reply)) {
      return res.status(400).json({ error: 'Invalid ticket update' });
    }

    const ref = db.collection('supportTickets').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Ticket not found' });
    const ticket = snap.data();
    const update = { updatedAt: FieldValue.serverTimestamp() };
    if (status) update.status = status;

    if (reply) {
      await sendBrevoEmail({
        sender: { name: 'Set The Date Support', email: 'hello@setthedate.app' },
        replyTo: { name: 'Set The Date Support', email: 'hello@setthedate.app' },
        to: [{ email: ticket.email, name: ticket.name }],
        subject: 'Re: Your Set The Date support request [' + id.slice(0, 8) + ']',
        htmlContent: '<p>Hi ' + escapeHtml(ticket.name || 'there') +
          ',</p><p style="white-space:pre-wrap">' + escapeHtml(reply) +
          '</p><p>Thanks,<br>Gavin<br>Set The Date</p>',
        textContent: 'Hi ' + (ticket.name || 'there') + ',\n\n' + reply +
          '\n\nThanks,\nGavin\nSet The Date',
      });
      update.replies = FieldValue.arrayUnion({
        text: reply, sentAt: new Date().toISOString(), sentBy: adminEmail,
      });
      if (!status) update.status = 'waiting';
    }

    await ref.update(update);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Admin support request failed', error);
    return res.status(error?.statusCode || 500).json({ error: 'Could not complete support action.' });
  }
}

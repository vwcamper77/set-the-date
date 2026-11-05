import { db, FieldValue } from '@/lib/firebaseAdmin';
import { sendBrevoEmail } from '@/lib/brevo';
import { allowPublicAction } from '@/lib/publicActionLimit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CATEGORIES = new Set(['event-access', 'event-changes', 'technical', 'billing', 'feedback', 'other']);
const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const name = String(req.body?.name || '').trim().slice(0, 100);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const category = String(req.body?.category || 'other').trim();
  const message = String(req.body?.message || '').trim();
  const eventLink = String(req.body?.eventLink || '').trim().slice(0, 500);
  if (!EMAIL_RE.test(email) || email.length > 254 || !name || message.length < 8 ||
      message.length > 4000 || !CATEGORIES.has(category)) {
    return res.status(400).json({ message: 'Please enter your name, email and a message of 8 to 4000 characters.' });
  }
  if (String(req.body?.website || '').trim()) {
    return res.status(200).json({ message: 'Thank you. Your message has been received.' });
  }
  if (eventLink && !/^https:\/\/plan\.setthedate\.app\/(poll|trip|share|results|trip-results)\/[a-zA-Z0-9_-]+\/?$/.test(eventLink)) {
    return res.status(400).json({ message: 'Use a public Set The Date event link, not a private edit link.' });
  }

  try {
    const allowed = await allowPublicAction(req, 'support-ticket', email, 5, 60);
    if (!allowed) return res.status(429).json({ message: 'Too many messages. Please try again later.' });

    const ticketRef = db.collection('supportTickets').doc();
    await ticketRef.set({
      name, email, category, message, eventLink,
      source: 'plan-help', status: 'open',
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      replies: [],
    });
    try {
      await sendBrevoEmail({
        sender: { name: 'Set The Date Support', email: 'hello@setthedate.app' },
        replyTo: { name, email },
        to: [{ email: 'hello@setthedate.app' }],
        subject: '[Support ' + ticketRef.id.slice(0, 8) + '] ' + category + ' - ' + name,
        htmlContent: '<p>New support request</p><p><strong>From:</strong> ' + escapeHtml(name) +
          ' (' + escapeHtml(email) + ')</p><p><strong>Category:</strong> ' + escapeHtml(category) +
          '</p><p><strong>Event:</strong> ' + escapeHtml(eventLink) +
          '</p><p style="white-space:pre-wrap">' + escapeHtml(message) + '</p>' +
          '<p>Manage this request at <a href="https://plan.setthedate.app/admin/support">Admin Support</a>.</p>',
        textContent: 'New support request ' + ticketRef.id +
          '\nFrom: ' + name + ' <' + email + '>\nCategory: ' + category +
          '\nEvent: ' + eventLink + '\n\n' + message +
          '\n\nhttps://plan.setthedate.app/admin/support',
      });
    } catch (emailError) {
      // Keep the enquiry in the support inbox even if email delivery is degraded.
      console.error('Support notification email failed', emailError);
      await ticketRef.update({ emailNotificationFailed: true });
    }
    return res.status(201).json({
      message: 'Your message is safely received. We will reply by email.',
      ticket: ticketRef.id.slice(0, 8),
    });
  } catch (error) {
    console.error('Support submission failed', error);
    return res.status(500).json({ message: 'Unable to send your message. Please email hello@setthedate.app.' });
  }
}

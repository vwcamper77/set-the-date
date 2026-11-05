import { db } from '@/lib/firebaseAdmin';
import { sendBrevoEmail } from '@/lib/brevo';
import { allowPublicAction } from '@/lib/publicActionLimit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Identical response for known and unknown addresses prevents event enumeration.
  const confirmation = { message: 'If we find events for this email, we will send a private management link.' };
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }
  if (String(req.body?.website || '').trim()) {
    return res.status(200).json(confirmation);
  }

  try {
    const allowed = await allowPublicAction(req, 'recover-events', email, 3, 60);
    if (!allowed) return res.status(200).json(confirmation);

    const snap = await db.collection('polls')
      .where('organiserEmail', '==', email)
      .limit(20).get();
    const events = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((poll) => typeof poll.editToken === 'string' && poll.editToken.length > 8 && !poll.deletedAt);

    if (events.length) {
      const links = events.map((poll) => {
        const href = 'https://plan.setthedate.app/edit/' + encodeURIComponent(poll.id) +
          '?token=' + encodeURIComponent(poll.editToken);
        return { href, title: String(poll.eventTitle || 'Untitled event').slice(0, 120) };
      });
      await sendBrevoEmail({
        sender: { name: 'Set The Date', email: 'hello@setthedate.app' },
        replyTo: { name: 'Set The Date Support', email: 'hello@setthedate.app' },
        to: [{ email }],
        subject: 'Your private Set The Date event links',
        htmlContent: '<p>Hi there,</p><p>Here are the private management links for events created using this email address:</p><ul>' +
          links.map(({ href, title }) => '<li><a href="' + href + '">' + escapeHtml(title) + '</a></li>').join('') +
          '</ul><p>Keep these links private. You can edit or cancel your event from its management screen.</p>' +
          '<p>Need help? Visit <a href="https://plan.setthedate.app/help">Set The Date Support</a>.</p>',
        textContent: 'Your private Set The Date event links:\n\n' +
          links.map(({ href, title }) => title + '\n' + href).join('\n\n') +
          '\n\nKeep these links private. Need help? https://plan.setthedate.app/help',
      });
    }
    return res.status(200).json(confirmation);
  } catch (error) {
    console.error('Event recovery failed', error);
    return res.status(500).json({ message: 'Unable to process your request right now.' });
  }
}

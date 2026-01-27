import crypto from 'crypto';
import { db, FieldValue } from '@/lib/firebaseAdmin';
import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { isAdminEmail } from '@/lib/adminUsers';
import { sendBrevoEmail } from '@/lib/brevo';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://plan.setthedate.app';

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const isSafeName = (value) => {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.length > 24) return false;
  return /^[a-zA-Z\s'’-]+$/.test(trimmed);
};

const formatGreeting = (name) => (isSafeName(name) ? `Hi ${name.trim()},` : 'Hi there,');

const buildButton = (url, label) => `
  <div style="margin:18px 0;">
    <a href="${url}"
       style="display:inline-block;background:#0f172a;color:#ffffff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600;font-size:15px;">
      ${label}
    </a>
  </div>
`;

const signatureHtml = `
  <p style="font-size:16px;margin-top:20px;">
    Thanks,<br />The Set The Date Team
  </p>
`;

const buildOrganiserEmail = ({ name, eventTitle, reviewUrl }) => {
  const greeting = formatGreeting(name);
  const safeTitle = escapeHtml(eventTitle || 'your event');
  const htmlContent = `
    <p style="font-size:16px;">${greeting}</p>
    <p style="font-size:16px;line-height:1.5;">
      Hope your event <strong>${safeTitle}</strong> went well.
      Could you leave a quick rating and review? It takes 30 seconds.
    </p>
    ${buildButton(reviewUrl, 'Leave a quick review')}
    <p style="font-size:14px;color:#475569;">
      We only show public reviews with your consent.
    </p>
    <p style="font-size:12px;color:#64748b;">
      If the button does not work, use this link: ${reviewUrl}
    </p>
    ${signatureHtml}
  `;
  const textContent = `${greeting}\n\nHope your event "${eventTitle}" went well. Could you leave a quick rating and review? It takes 30 seconds.\n\n${reviewUrl}\n\nWe only show public reviews with your consent.\n\nThanks,\nThe Set The Date Team`;
  return { htmlContent, textContent };
};

const buildAttendeeEmail = ({ name, eventTitle, reviewUrl }) => {
  const greeting = formatGreeting(name);
  const safeTitle = escapeHtml(eventTitle || 'the event');
  const htmlContent = `
    <p style="font-size:16px;">${greeting}</p>
    <p style="font-size:16px;line-height:1.5;">
      Thanks for joining <strong>${safeTitle}</strong>. If you have a moment, could you leave a quick review?
    </p>
    ${buildButton(reviewUrl, 'Leave a quick review')}
    <p style="font-size:14px;color:#475569;">
      We only show public reviews with your consent.
    </p>
    <p style="font-size:12px;color:#64748b;">
      You received this because you voted on "${safeTitle}".
      If the button does not work, use this link: ${reviewUrl}
    </p>
    ${signatureHtml}
  `;
  const textContent = `${greeting}\n\nThanks for joining "${eventTitle}". If you have a moment, could you leave a quick review?\n\n${reviewUrl}\n\nWe only show public reviews with your consent.\n\nYou received this because you voted on "${eventTitle}".\n\nThanks,\nThe Set The Date Team`;
  return { htmlContent, textContent };
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const decoded = await verifyRequestFirebaseUser(req);
    const adminEmail = decoded?.email || decoded?.userEmail || '';
    if (!isAdminEmail(adminEmail)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { pollId } = req.body || {};
    if (!pollId) {
      return res.status(400).json({ error: 'Missing pollId' });
    }

    const pollRef = db.collection('polls').doc(pollId);
    const pollSnap = await pollRef.get();
    if (!pollSnap.exists) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    const poll = pollSnap.data() || {};
    const organiserEmail = (poll.organiserEmail || '').trim().toLowerCase();
    const organiserName =
      poll.organiserFirstName || poll.organiserName || poll.organiser || '';
    const eventTitle = poll.eventTitle || poll.title || 'your event';
    const editToken = poll.editToken || '';

    if (!editToken) {
      return res.status(400).json({ error: 'Missing organiser token.' });
    }

    const organiserReviewUrl = `${APP_URL}/review/${pollId}?token=${editToken}`;
    if (organiserEmail) {
      const organiserEmailContent = buildOrganiserEmail({
        name: organiserName,
        eventTitle,
        reviewUrl: organiserReviewUrl,
      });
      await sendBrevoEmail({
        sender: { name: 'Set The Date Team', email: 'hello@setthedate.app' },
        replyTo: { name: 'Set The Date Team', email: 'hello@setthedate.app' },
        to: [{ email: organiserEmail }],
        subject: `Quick review for "${eventTitle}"?`,
        ...organiserEmailContent,
      });
    }

    const votesSnap = await db.collection('polls').doc(pollId).collection('votes').get();
    let attendeeCount = 0;

    for (const voteDoc of votesSnap.docs) {
      const vote = voteDoc.data() || {};
      const email = (vote.email || '').trim().toLowerCase();
      if (!email) continue;

      const reviewToken = crypto.randomUUID();
      const tokenRef = db
        .collection('polls')
        .doc(pollId)
        .collection('reviewTokens')
        .doc(reviewToken);
      await tokenRef.set({
        email,
        voteId: voteDoc.id,
        displayName: vote.displayName || vote.name || null,
        createdAt: FieldValue.serverTimestamp(),
      });

      const attendeeReviewUrl = `${APP_URL}/review/${pollId}?token=${reviewToken}`;
      const attendeeEmailContent = buildAttendeeEmail({
        name: vote.displayName || vote.name || '',
        eventTitle,
        reviewUrl: attendeeReviewUrl,
      });

      await sendBrevoEmail({
        sender: { name: 'Set The Date Team', email: 'hello@setthedate.app' },
        replyTo: { name: 'Set The Date Team', email: 'hello@setthedate.app' },
        to: [{ email }],
        subject: `How did "${eventTitle}" go?`,
        ...attendeeEmailContent,
      });

      attendeeCount += 1;
    }

    return res.status(200).json({
      ok: true,
      organiserSent: Boolean(organiserEmail),
      attendeeCount,
    });
  } catch (error) {
    console.error('admin review request failed', error);
    const status = error?.statusCode || 500;
    return res.status(status).json({ error: error?.message || 'Unable to send review request' });
  }
}

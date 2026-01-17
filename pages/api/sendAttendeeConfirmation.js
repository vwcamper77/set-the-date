import { db } from '@/lib/firebase';
import { defaultSender, defaultReplyTo } from '@/lib/emailConfig';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  const { pollId, finalDate, organiser, eventTitle, location, organiserMessage } = req.body;
  if (!pollId || !finalDate || !organiser || !eventTitle || !location) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    // Update poll
    await db.collection('polls').doc(pollId).update({ finalDate });

    // Get attendees, for simplicity assume you fetch an array of email addresses
    const attendeesSnap = await db.collection('polls').doc(pollId).collection('votes').get();
    const attendeeEmails = attendeesSnap.docs.map(doc => doc.data().email).filter(Boolean);

    // Build email HTML
    const pollLink = `https://plan.setthedate.app/results/${pollId}`;
    const html = `
      <div style="text-align:center;">
        <img src="https://plan.setthedate.app/images/email-logo.png" width="220" />
      </div>
      <p>Hi there,</p>
      <p><strong>${organiser}</strong> has locked in the date for <strong>"${eventTitle}"</strong>.</p>
      <p><strong>Date:</strong> ${finalDate}</p>
      <p><strong>Location:</strong> ${location}</p>
      ${organiserMessage ? `<hr/><p><strong>A message from ${organiser}:</strong></p><p>${organiserMessage}</p>` : ''}
      <p style="text-align:center; margin:24px 0;">
        <a href="${pollLink}" style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:16px;">
          📅 View Event Details
        </a>
      </p>
      <p style="font-size:12px;color:#666;">You can still update your availability if needed via the above link.</p>
      <p>Best,<br/>–Set The Date Team</p>
    `;

    // Send via Brevo
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sender: defaultSender,
        to: attendeeEmails.map(email => ({ email })),
        replyTo: defaultReplyTo,
        subject: `🎉 ${organiser} has locked in the date for "${eventTitle}"`,
        htmlContent: html,
      })
    });

    if (!resp.ok) {
      const error = await resp.text();
      return res.status(500).json({ message: 'Brevo send failed', error });
    }

    return res.status(200).json({ message: 'Attendees notified and poll updated.' });
  } catch (err) {
    console.error('Error sending combined finalisation email:', err);
    return res.status(500).json({ message: 'Internal error' });
  }
}

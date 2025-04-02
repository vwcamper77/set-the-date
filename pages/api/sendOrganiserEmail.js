// pages/api/sendOrganiserEmail.js
import { db } from '@/lib/firebase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { firstName, email, pollId, editToken, eventTitle } = req.body;

  if (!firstName || !email || !pollId || !editToken || !eventTitle) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const pollLink = `https://setthedate.app/poll/${pollId}`;
  const editLink = `https://setthedate.app/edit/${pollId}?token=${editToken}`;

  try {
    // ✅ Add to Brevo 'Organisers' list
    await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        attributes: { FIRSTNAME: firstName },
        listIds: [4],
        updateEnabled: true,
      }),
    });

    // ✅ Send Share Link Email
    const shareHtml = `
      <div style="text-align: center;">
        <img src="https://setthedate.app/images/eveningout-logo.png" width="200" style="border-radius: 16px;" />
      </div>
      <p>Hey ${firstName},</p>
      <p>Your Evening Out ✨ best date poll is live!</p>
      <p>Share this link with your friends to collect their votes:</p>
      <p><a href="${pollLink}" style="font-size: 18px; color: #007bff;">${pollLink}</a></p>
      <p>We’ll notify you as soon as people start responding.</p>
      <p>– The Evening Out Team</p>
    `;

    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Evening Out', email: 'noreply@eveningout.social' },
        to: [{ email, name: firstName }],
        subject: `Your "${eventTitle}" Evening Out ✨ poll is live!`,
        htmlContent: shareHtml,
      }),
    });

    // ✅ Send Edit Link Email
    const editHtml = `
      <div style="text-align: center;">
        <img src="https://setthedate.app/images/eveningout-logo.png" width="200" style="border-radius: 16px;" />
      </div>
      <p>Hey ${firstName},</p>
      <p>You can manage your Evening Out event here:</p>
      <p><a href="${editLink}" style="font-size: 18px; color: #007bff;">Edit Your Event</a></p>
      <p><em>This link is private – keep it safe so only you can make changes.</em></p>
      <p>– The Evening Out Team</p>
    `;

    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Evening Out', email: 'noreply@eveningout.social' },
        to: [{ email, name: firstName }],
        subject: `Edit your "${eventTitle}" Evening Out poll – link inside`,
        htmlContent: editHtml,
      }),
    });

    res.status(200).json({ message: 'Both emails sent successfully.' });
  } catch (error) {
    console.error('Error sending organiser emails:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

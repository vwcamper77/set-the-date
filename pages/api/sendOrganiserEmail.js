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

  const pollLink = `https://plan.setthedate.app/poll/${pollId}`;
  const editLink = `https://plan.setthedate.app/edit/${pollId}?token=${editToken}`;

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
        <img src="https://plan.setthedate.app/images/setthedate-logo.png" width="200" style="border-radius: 16px;" />
      </div>
      <p>Hey ${firstName},</p>
      <p>Your <strong>Set The Date</strong> poll is live!</p>
      <p>Share this link with your friends to collect their votes:</p>
      <p><a href="${pollLink}" style="font-size: 18px; color: #007bff;">${pollLink}</a></p>
      <p>We’ll notify you as soon as people start responding.</p>
      <p>– The Set The Date Team</p>
    `;

    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Set The Date', email: 'noreply@setthedate.app' },
        to: [{ email, name: firstName }],
        subject: `Your "${eventTitle}" Set The Date poll is live!`,
        htmlContent: shareHtml,
      }),
    });

    // ✅ Send Edit Link Email
    const editHtml = `
      <div style="text-align: center;">
        <img src="https://plan.setthedate.app/images/setthedate-logo.png" width="200" style="border-radius: 16px;" />
      </div>
      <p>Hey ${firstName},</p>
      <p>You can manage your <strong>Set The Date</strong> event here:</p>
      <p><a href="${editLink}" style="font-size: 18px; color: #007bff;">Edit Your Event</a></p>
      <p><em>This link is private – keep it safe so only you can make changes.</em></p>
      <p>– The Set The Date Team</p>
    `;

    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Set The Date', email: 'noreply@setthedate.app' },
        to: [{ email, name: firstName }],
        subject: `Edit your "${eventTitle}" Set The Date poll – link inside`,
        htmlContent: editHtml,
      }),
    });

    res.status(200).json({ message: 'Both emails sent successfully.' });
  } catch (error) {
    console.error('Error sending organiser emails:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
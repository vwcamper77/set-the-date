// pages/api/sendOrganiserEmail.js
import { db } from '@/lib/firebase';
import { defaultSender, defaultReplyTo } from '@/lib/emailConfig';

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
    // Add to Brevo 'Organisers' list
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

    // --- Share Link Email ---
    const shareHtml = `
      <div style="text-align: center;">
        <img src="https://plan.setthedate.app/images/setthedate-logo.png" width="200" style="border-radius: 16px;" alt="Set The Date logo" />
      </div>
      <p>Hey ${firstName},</p>
      <p>Your <strong>Set The Date</strong> poll is live!</p>
      <p>Share this link with your friends to collect their votes:</p>
      <p><a href="${pollLink}" style="font-size: 18px; color: #007bff;">${pollLink}</a></p>
      <h3 style="margin-top:24px;">📣 Share Event with Friends</h3>
      <ul style="list-style:none;padding-left:0;font-size:16px;">
        <li>📲 <a href="https://api.whatsapp.com/send?text=Help%20choose%20a%20date%20for%20'${eventTitle}'%20here:%20${pollLink}">Share via WhatsApp</a></li>
        <li>📱 <a href="sms:?body=Help%20choose%20a%20date%20for%20'${eventTitle}':%20${pollLink}">Share via SMS</a></li>
        <li>💬 <a href="https://discord.com/channels/@me">Share via Discord</a></li>
        <li>📨 <a href="https://slack.com/">Share via Slack</a></li>
        <li>🔗 <a href="${pollLink}">Copy Poll Link</a></li>
        <li>📧 <a href="mailto:?subject=Vote%20on%20Dates&body=Hey!%20Help%20choose%20a%20date%20for%20'${eventTitle}'%20here:%20${pollLink}">Share via Email</a></li>
      </ul>
      <p style="margin-top:24px;">
        We’ll notify you as soon as people start responding.<br>
        <strong>If you have any questions or feedback, just reply to this email – I read every message!</strong>
      </p>
      <p>– Gavin<br>Founder, Set The Date</p>
    `;

    const shareText = `
Hey ${firstName},

Your Set The Date poll is live!

Share this link with your friends to collect their votes:
${pollLink}

We’ll notify you as soon as people start responding.

If you have any questions or feedback, just reply to this email – I read every message!

– Gavin
Founder, Set The Date
    `;

    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: defaultSender,
        replyTo: defaultReplyTo,
        to: [{ email, name: firstName }],
        subject: `Your "${eventTitle}" Set The Date poll is live!`,
        htmlContent: shareHtml,
        textContent: shareText,
      }),
    });

    // --- Edit Link Email ---
    const editHtml = `
      <div style="text-align: center;">
        <img src="https://plan.setthedate.app/images/setthedate-logo.png" width="200" style="border-radius: 16px;" alt="Set The Date logo" />
      </div>
      <p>Hey ${firstName},</p>
      <p>You can manage your <strong>Set The Date</strong> event here:</p>
      <p><a href="${editLink}" style="font-size: 18px; color: #007bff;">Edit Your Event</a></p>
      <p><em>This link is private – keep it safe so only you can make changes.</em></p>
      <p>– Gavin<br>Founder, Set The Date</p>
    `;

    const editText = `
Hey ${firstName},

You can manage your Set The Date event here:
${editLink}

This link is private – keep it safe so only you can make changes.

– Gavin
Founder, Set The Date
    `;

    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: defaultSender,
        replyTo: defaultReplyTo,
        to: [{ email, name: firstName }],
        subject: `Edit your "${eventTitle}" Set The Date poll – link inside`,
        htmlContent: editHtml,
        textContent: editText,
      }),
    });

    res.status(200).json({ message: 'Both emails sent successfully.' });
  } catch (error) {
    console.error('Error sending organiser emails:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

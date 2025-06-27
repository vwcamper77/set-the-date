// pages/api/sendOrganiserEmail.js
import { defaultSender, defaultReplyTo } from '@/lib/emailConfig';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { to, subject, htmlContent, sender, replyTo } = req.body;

  if (!to || !subject || !htmlContent) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: sender || defaultSender,
        replyTo: replyTo || defaultReplyTo,
        to: [{ email: to }],
        subject,
        htmlContent,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Brevo responded with error:', errorText);
      return res.status(500).json({ message: 'Brevo send failed', error: errorText });
    }

    res.status(200).json({ message: 'Organiser email sent' });
  } catch (error) {
    console.error('Error sending organiser email:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

import { defaultSender, defaultReplyTo } from '@/lib/emailConfig';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { to, subject, htmlContent, sender, replyTo } = req.body;

  if (!to || !subject || !htmlContent) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const emailSender = sender || defaultSender;
  const emailReplyTo = replyTo || defaultReplyTo;
  const recipients = Array.isArray(to)
    ? to.map(t => (typeof t === 'string' ? { email: t } : t))
    : [{ email: to }];

  const payload = {
    sender: emailSender,
    replyTo: emailReplyTo,
    to: recipients,
    subject,
    htmlContent,
  };

  try {
    console.log('📤 Brevo request:', JSON.stringify(payload));

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log('📨 Brevo response:', responseText);

    if (!response.ok) {
      return res.status(500).json({ message: 'Brevo send failed', error: responseText });
    }

    return res.status(200).json({ message: 'Email sent', response: responseText });
  } catch (err) {
    console.error('❌ Error sending organiser email:', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
}

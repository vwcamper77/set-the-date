import { db, FieldValue } from '@/lib/firebaseAdmin';
import { normaliseEmail } from '@/lib/organiserService';

const ADMIN_EMAIL = process.env.RENTALS_CONTACT_EMAIL || process.env.ENTERPRISE_CONTACT_EMAIL || 'hello@setthedate.app';
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const requestsCollection = db.collection('rentalsEnterpriseRequests');

const sendContactEmail = async ({ requesterEmail, phone, propertyCount, message }) => {
  if (!process.env.BREVO_API_KEY) {
    throw new Error('Missing BREVO API key');
  }

  const subject = `Custom rentals plan request from ${requesterEmail}`;
  const plain = [
    `Email: ${requesterEmail}`,
    phone ? `Phone: ${phone}` : null,
    `Properties: ${propertyCount}`,
    '',
    message,
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;padding:24px;border-radius:16px;border:1px solid #e2e8f0;background:#ffffff;color:#0f172a;">
      <h2 style="margin:0 0 12px;font-size:20px;">New rentals custom plan request</h2>
      <p style="margin:0 0 4px;"><strong>Email:</strong> ${requesterEmail}</p>
      ${phone ? `<p style="margin:0 0 4px;"><strong>Phone:</strong> ${phone}</p>` : ''}
      <p style="margin:0 0 12px;"><strong>Properties:</strong> ${propertyCount}</p>
      <p style="margin:16px 0 8px;font-weight:600;">Message</p>
      <p style="white-space:pre-wrap;margin:0;">${message.replace(/</g, '&lt;')}</p>
    </div>
  `;

  const response = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Set The Date Rentals', email: 'noreply@setthedate.app' },
      replyTo: { email: requesterEmail },
      to: [{ email: ADMIN_EMAIL, name: 'Set The Date' }],
      subject,
      htmlContent: html,
      textContent: plain,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Brevo send failed: ${response.status} ${detail}`);
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { email = '', phone = '', propertyCount = 0, message = '' } = req.body || {};

    const requesterEmail = normaliseEmail(email);
    if (!requesterEmail) {
      return res.status(400).json({ error: 'Valid email is required.' });
    }

    const parsedCount = Number.parseInt(propertyCount, 10);
    const safeCount = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 0;
    if (!safeCount) {
      return res.status(400).json({ error: 'Property count is required.' });
    }

    const trimmedMessage = String(message).trim();
    if (!trimmedMessage) {
      return res.status(400).json({ error: 'Message is required.' });
    }
    if (trimmedMessage.length > 2000) {
      return res.status(400).json({ error: 'Message is too long.' });
    }

    const record = {
      email: requesterEmail,
      phone: String(phone || '').trim(),
      propertyCount: safeCount,
      message: trimmedMessage,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await requestsCollection.add(record);

    await sendContactEmail({
      requesterEmail,
      phone: record.phone,
      propertyCount: safeCount,
      message: trimmedMessage,
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('rentals contact error', error);
    return res.status(500).json({
      error: error?.message || 'Unable to submit your request right now.',
    });
  }
}

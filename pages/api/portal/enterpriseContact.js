import { FieldValue, db } from '@/lib/firebaseAdmin';
import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { normaliseEmail } from '@/lib/organiserService';

const ADMIN_EMAIL = process.env.ENTERPRISE_CONTACT_EMAIL || 'hello@setthedate.app';
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const requestsCollection = db.collection('portalEnterpriseRequests');

const sendEnterpriseEmail = async ({ requesterEmail, requesterName, phone, organisation, venues, message }) => {
  if (!process.env.BREVO_API_KEY) {
    throw new Error('Missing BREVO API key');
  }

  const subject = `Enterprise venue request from ${organisation || requesterEmail}`;
  const plain = [
    `Request from: ${requesterName || requesterEmail}`,
    `Email: ${requesterEmail}`,
    phone ? `Phone: ${phone}` : null,
    organisation ? `Organisation: ${organisation}` : null,
    `Existing venues: ${venues}`,
    '',
    message,
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;padding:24px;border-radius:16px;border:1px solid #e2e8f0;background:#ffffff;color:#0f172a;">
      <h2 style="margin:0 0 12px;font-size:20px;">New enterprise venue request</h2>
      <p style="margin:0 0 4px;"><strong>From:</strong> ${requesterName || 'Unknown'} (${requesterEmail})</p>
      ${phone ? `<p style="margin:0 0 4px;"><strong>Phone:</strong> ${phone}</p>` : ''}
      ${organisation ? `<p style="margin:0 0 4px;"><strong>Organisation:</strong> ${organisation}</p>` : ''}
      <p style="margin:0 0 12px;"><strong>Existing venues:</strong> ${venues}</p>
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
      sender: { name: 'Set The Date Portal', email: 'noreply@setthedate.app' },
      replyTo: { name: requesterName || requesterEmail, email: requesterEmail },
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
    const decoded = await verifyRequestFirebaseUser(req);
    const {
      message = '',
      phone = '',
      organisation = '',
      venues = 0,
    } = req.body || {};

    const trimmedMessage = String(message).trim();
    if (!trimmedMessage) {
      return res.status(400).json({ error: 'Message is required.' });
    }
    if (trimmedMessage.length > 2000) {
      return res.status(400).json({ error: 'Message is too long.' });
    }

    const requesterEmail = normaliseEmail(decoded.email || decoded.userEmail || '');
    if (!requesterEmail) {
      return res.status(400).json({ error: 'Missing requester email.' });
    }

    const parsedVenues = Number.parseInt(venues, 10);
    const safeVenueCount = Number.isFinite(parsedVenues) && parsedVenues >= 0 ? parsedVenues : 0;

    const requesterName = decoded.name || decoded.displayName || organisation || '';

    const record = {
      uid: decoded.uid,
      email: requesterEmail,
      organisation: String(organisation || '').trim(),
      phone: String(phone || '').trim(),
      message: trimmedMessage,
      venues: safeVenueCount,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await requestsCollection.add(record);

    await sendEnterpriseEmail({
      requesterEmail,
      requesterName: requesterName || requesterEmail,
      phone: record.phone,
      organisation: record.organisation,
      venues: safeVenueCount,
      message: trimmedMessage,
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    const status = error?.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 500;
    if (status === 500) {
      console.error('enterprise contact error', error);
    }
    return res.status(status).json({
      error: error?.message || 'Unable to submit enterprise request right now.',
    });
  }
}

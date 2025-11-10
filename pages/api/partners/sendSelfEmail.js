import { db } from '@/lib/firebaseAdmin';
import { buildPartnerOwnerEmail } from '@/lib/partners/emailTemplates';

const sendEmail = async (partner) => {
  const { subject, htmlContent, textContent } = buildPartnerOwnerEmail(partner);
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Set The Date', email: 'noreply@setthedate.app' },
      to: [{ email: partner.contactEmail, name: partner.contactName }],
      subject,
      htmlContent,
      textContent,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Brevo send failed: ${response.status} ${detail}`);
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { slug } = req.body || {};
  if (!slug) {
    return res.status(400).json({ message: 'Missing slug' });
  }

  try {
    const slugValue = String(slug).toLowerCase();
    const ref = db.collection('partners').doc(slugValue);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      return res.status(404).json({ message: 'Partner not found' });
    }

    const partner = { ...snapshot.data(), slug: slugValue };
    await sendEmail(partner);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('partner self email failed', error);
    return res.status(500).json({ message: 'Unable to send email' });
  }
}

import { db } from '@/lib/firebase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { name, email, eventTitle, pollId, organiserFirstName } = req.body;

  if (!email || !eventTitle || !pollId) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const htmlContent = `
    <div style="text-align: center; margin-bottom: 20px;">
      <img src="https://plan.eveningout.social/images/eveningout-logo.png" alt="Evening Out" width="200" style="max-width: 100%; border-radius: 16px;" />
    </div>
    <p>Hi ${name || 'there'},</p>
    <p>Thanks for voting for <strong>${eventTitle}</strong>!</p>
    <p>We’ll let you know once the date is confirmed — stay tuned 🥂</p>
    <p>– The Evening Out Team</p>
    <p style="font-size: 12px; color: #666; margin-top: 20px;">
      💡 Don’t see this email? Please check your spam or junk folder and mark it as safe.
    </p>
  `;

  try {
    // Add to Brevo Attendees list (ID 5)
    await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        email,
        attributes: { FIRSTNAME: name || '' },
        listIds: [5],
        updateEnabled: true,
      }),
    });

    // Send the email
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Evening Out', email: 'noreply@eveningout.social' },
        replyTo: { name: 'Evening Out Team', email: 'hello@eveningout.social' },
        to: [{ email, name: name || 'Attendee' }],
        subject: `✨ ${organiserFirstName || 'Someone'} is planning an evening out – we’ll confirm the date soon!`,
        htmlContent,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to send attendee email. ${errorText}`);
    }

    res.status(200).json({ message: 'Attendee email sent and contact added.' });
  } catch (error) {
    console.error('Error sending attendee email:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

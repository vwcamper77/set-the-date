// pages/api/sendAttendeeMessage.js
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { pollId, message, organiserName, eventTitle } = req.body;

  if (!pollId || !message || !organiserName || !eventTitle) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const votesSnap = await getDocs(collection(db, 'polls', pollId, 'votes'));
    const attendees = votesSnap.docs.map(doc => doc.data()).filter(v => v.email);

    const htmlContent = (email) => `
      <div style="text-align:center;">
        <img src="https://plan.setthedate.app/images/setthedate-logo.png" width="200" />
      </div>
      <p>Hi there,</p>
      <p><strong>${organiserName}</strong> has sent you a message about the event: <strong>${eventTitle}</strong></p>
      <blockquote style="border-left: 4px solid #ccc; padding-left: 10px; margin: 10px 0;">${message}</blockquote>
      <p><a href="https://plan.setthedate.app/poll/${pollId}" style="font-size: 18px;">View or Update Your Availability</a></p>
      <p>– The Set The Date Team</p>
    `;

    const results = await Promise.allSettled(attendees.map(async (attendee) => {
      try {
        console.log('📤 Broadcasting message to:', attendee.email);
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': process.env.BREVO_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: { name: 'Set The Date', email: 'noreply@setthedate.app' },
            to: [{ email: attendee.email }],
            subject: `📣 Update from ${organiserName} about "${eventTitle}"`,
            htmlContent: htmlContent(attendee.email)
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Brevo error: ${errorText}`);
        }
      } catch (err) {
        console.error(`❌ Failed to send to ${attendee.email}:`, err);
      }
    }));

    return res.status(200).json({ message: 'Message broadcast complete', results });
  } catch (err) {
    console.error('Error sending broadcast:', err);
    return res.status(500).json({ error: 'Failed to send message' });
  }
}

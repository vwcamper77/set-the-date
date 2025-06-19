// pages/api/pollClosingSoonReminder.js

import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { defaultSender, defaultReplyTo } from '@/lib/emailConfig';

export default async function handler(req, res) {
  // ✅ Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Only POST allowed' });
  }

  const { pollId } = req.body;

  if (!pollId) {
    return res.status(400).json({ message: 'Missing pollId' });
  }

  try {
    // ✅ Fetch poll data
    const pollRef = doc(db, 'polls', pollId);
    const pollSnap = await getDoc(pollRef);

    if (!pollSnap.exists()) {
      return res.status(404).json({ message: 'Poll not found' });
    }

    const poll = pollSnap.data();

    const organiserEmail = poll.organiserEmail;
    const organiserName = poll.organiserFirstName || 'Friend';
    const eventTitle = poll.eventTitle || 'your event';
    const location = poll.location || 'somewhere';
    const editToken = poll.editToken; // ✅ include this

    if (!editToken) {
      return res.status(400).json({ message: 'Missing editToken in poll data' });
    }

    // ✅ Build email content
    const html = `
      <div style="text-align:center;">
        <img src="https://plan.setthedate.app/images/email-logo.png" width="220" style="margin-bottom: 20px;" />
      </div>

      <p style="font-size: 16px;">Hi ${organiserName},</p>

      <p style="font-size: 16px;">
        Just a quick reminder — your event <strong>“${eventTitle}”</strong> in <strong>${location}</strong> is closing for votes soon.
      </p>

      <p style="font-size: 16px;">
        If you’d like to give people a bit more time, you can extend the deadline now:
      </p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="https://plan.setthedate.app/edit/${pollId}?token=${editToken}" style="background: #facc15; color: #000; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: bold;">
          🔁 Extend Deadline
        </a>
      </div>

      <p style="font-size: 14px; color: #666;">
        Or view your event progress here:<br/>
        <a href="https://plan.setthedate.app/results/${pollId}">https://plan.setthedate.app/results/${pollId}</a>
      </p>

      <p style="margin-top: 40px; font-size: 14px; color: #666;">
        Questions or feedback? Just reply — always happy to help.
      </p>

      <p style="margin-top: 40px; font-size: 14px; color: #666;">
        Warm wishes,<br/>
        Gavin<br/>
        Founder, Set The Date
      </p>
    `;

    // ✅ Send email via Brevo
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: defaultSender,
        replyTo: defaultReplyTo,
        to: [{ email: organiserEmail, name: organiserName }],
        subject: `⏳ “${eventTitle}” is closing soon — want to extend it?`,
        htmlContent: html,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(500).json({ message: 'Brevo send failed', error: text });
    }

    res.status(200).json({ message: 'Poll closing reminder sent' });

  } catch (err) {
    console.error('❌ Error in pollClosingSoonReminder:', err);
    res.status(500).json({ message: 'Internal server error', error: err.message });
  }
}

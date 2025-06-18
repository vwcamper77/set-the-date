import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default async function handler(req, res) {
  const { pollId } = req.body;

  if (!pollId) {
    return res.status(400).json({ message: 'Missing pollId' });
  }

  const pollSnap = await getDoc(doc(db, 'polls', pollId));

  if (!pollSnap.exists()) {
    return res.status(404).json({ message: 'Poll not found' });
  }

  const poll = pollSnap.data();

  // Skip if no organiser or no edit token
  if (!poll.organiserEmail || !poll.editToken) {
    return res.status(400).json({ message: 'Missing organiser email or edit token' });
  }

  // Skip if poll already finalised
  if (poll.finalDate) {
    return res.status(200).json({ message: 'Poll already has a final date' });
  }

  // Check deadline
  const now = new Date();
  const deadline = poll.deadline?.toDate?.();
  if (!deadline || deadline > now) {
    return res.status(200).json({ message: 'Poll deadline not yet passed' });
  }

  try {
    await fetch('https://plan.setthedate.app/api/emailPostDeadlineReminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organiserEmail: poll.organiserEmail,
        organiserName: poll.organiserFirstName || 'there',
        eventTitle: poll.eventTitle,
        location: poll.location,
        pollId,
        editToken: poll.editToken, // ✅ include to show organiser options
      }),
    });

    return res.status(200).json({ message: '✅ Reminder email sent to organiser' });
  } catch (err) {
    console.error('❌ Failed to send organiser reminder:', err);
    return res.status(500).json({ message: 'Error sending email' });
  }
}

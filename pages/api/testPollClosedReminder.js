import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
console.log("🔁 testPollClosedReminder sending token:", poll.editToken);


export default async function handler(req, res) {
  const { pollId } = req.body;

  if (!pollId) {
    return res.status(400).json({ message: 'Missing pollId' });
  }

  try {
    const pollSnap = await getDoc(doc(db, 'polls', pollId));

    if (!pollSnap.exists()) {
      return res.status(404).json({ message: 'Poll not found' });
    }

    const poll = pollSnap.data();

    if (poll.finalDate) {
      return res.status(200).json({ message: 'Poll already finalised' });
    }

    const deadline = poll.deadline?.toDate?.();
    const now = new Date();
    if (!deadline || deadline > now) {
      return res.status(200).json({ message: 'Deadline not yet passed' });
    }

    if (!poll.organiserEmail || !poll.editToken) {
      return res.status(400).json({ message: 'Missing organiserEmail or editToken' });
    }

    const response = await fetch('https://plan.setthedate.app/api/emailPostDeadlineReminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organiserEmail: poll.organiserEmail,
        organiserName: poll.organiserFirstName || 'there',
        eventTitle: poll.eventTitle,
        location: poll.location,
        pollId,
        editToken: poll.editToken, // ✅ required to unlock controls
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    res.status(200).json({ message: '✅ Reminder email sent' });
  } catch (err) {
    console.error('❌ Error sending reminder:', err);
    res.status(500).json({ message: 'Reminder failed', error: err.message });
  }
}

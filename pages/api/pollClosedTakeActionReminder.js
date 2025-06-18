import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

export default async function handler(req, res) {
  const now = new Date();
  const pollsRef = collection(db, 'polls');
  const pollsSnap = await getDocs(pollsRef);
  let notified = 0;

  for (const pollDoc of pollsSnap.docs) {
    const poll = pollDoc.data();
    const pollId = pollDoc.id;

    if (poll.finalDate) continue;

    const deadline = poll.deadline?.toDate?.();
    if (!deadline || deadline > now) continue;

    if (!poll.organiserEmail || !poll.editToken) continue;

    await fetch('https://plan.setthedate.app/api/emailPostDeadlineReminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organiserEmail: poll.organiserEmail,
        organiserName: poll.organiserFirstName || 'Your',
        eventTitle: poll.eventTitle || 'your event',
        location: poll.location || 'somewhere',
        pollId,
        editToken: poll.editToken  // ✅ Critical
      }),
    });

    notified++;
  }

  res.status(200).json({ message: `Post-deadline reminders sent to ${notified} organiser(s)` });
}

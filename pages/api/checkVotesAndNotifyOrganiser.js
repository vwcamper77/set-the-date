import { db } from '@/lib/firebase';
import { collection, getDocs, getDoc, doc, Timestamp } from 'firebase/firestore';

export default async function handler(req, res) {
  const now = new Date();
  const pollsRef = collection(db, 'polls');
  const pollsSnap = await getDocs(pollsRef);
  let notified = 0;

  for (const pollDoc of pollsSnap.docs) {
    const poll = pollDoc.data();
    const pollId = pollDoc.id;

    // Skip if already has a finalDate
    if (poll.finalDate) continue;

    // Skip if no deadline or not passed yet
    const deadline = poll.deadline?.toDate?.();
    if (!deadline || deadline > now) continue;

    // Get votes
    const votesRef = collection(db, 'polls', pollId, 'votes');
    const votesSnap = await getDocs(votesRef);
    const voteCount = votesSnap.size;

    if (voteCount >= 3) continue; // Only notify if very few have voted

    // Send email
    await fetch('https://setthedate.app/api/emailLowVotesReminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organiserEmail: poll.organiserEmail,
        organiserName: poll.organiserFirstName,
        eventTitle: poll.eventTitle,
        location: poll.location,
        pollId,
        voteCount,
      }),
    });

    notified++;
  }

  res.status(200).json({ message: `Notified ${notified} organiser(s)` });
}

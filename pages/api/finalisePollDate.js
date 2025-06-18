// pages/api/finalisePollDate.js
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { pollId, finalDate, organiserEmail, organiserName, eventTitle, location } = req.body;

  if (!pollId || !finalDate) {
    return res.status(400).json({ message: 'Missing pollId or finalDate' });
  }

  try {
    await updateDoc(doc(db, 'polls', pollId), {
      finalDate,
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.headers.origin;
    const notifyRes = await fetch(`${baseUrl}/api/notifyAttendees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pollId,
        organiser: organiserName,
        eventTitle,
        location,
        message: `📅 The event "${eventTitle}" has been scheduled for ${finalDate}. See who’s coming and get ready!`,
      })
    });

    if (!notifyRes.ok) {
      const errorText = await notifyRes.text();
      console.error('Notify attendees failed:', errorText);
    }

    return res.status(200).json({ message: 'Final date saved and attendees notified' });
  } catch (err) {
    console.error('Error finalising poll:', err);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}

const fetch = require('node-fetch'); // npm install node-fetch@2
const { db, FieldValue } = require('../lib/firebase');

/**
 * Sends final event announcements to all attendees
 * when a poll has been finalised but the attendees
 * haven't yet been notified.
 */
module.exports = async function finalisePollAnnouncementTask() {
  console.log('📢 Running finalisePollAnnouncementTask...');

  try {
    const pollsSnap = await db.collection('polls').get();
    let count = 0;

    for (const pollDoc of pollsSnap.docs) {
      const pollId = pollDoc.id;
      const p = pollDoc.data();

      // Need a final date and must not have sent announcement yet
      if (!p.finalDate || p.finalAnnouncementSent) continue;

      const organiser = p.organiserFirstName || 'The organiser';
      const eventTitle = p.eventTitle || 'the event';
      const location = p.location || '';

      const message = `📅 The event "${eventTitle}" has been scheduled for ${p.finalDate}. See who’s coming and get ready!`;

      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/notifyAttendees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pollId,
          organiser,
          eventTitle,
          location,
          message,
        }),
      });

      await db.collection('polls').doc(pollId).update({
        finalAnnouncementSent: true,
        finalAnnouncementSentAt: FieldValue.serverTimestamp(),
      });

      console.log(`✅ Final announcement sent for poll ${pollId}`);
      count++;
    }

    console.log(`📢 finalisePollAnnouncementTask completed: ${count} announcements sent`);
  } catch (err) {
    console.error('❌ Error in finalisePollAnnouncementTask:', err);
  }
};

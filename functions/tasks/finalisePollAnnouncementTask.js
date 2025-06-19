// ✅ 3. functions/tasks/finalisePollAnnouncementTask.js
const { db } = require('../lib/firebase');
const { collection, getDocs } = require('firebase/firestore');

module.exports = async function finalisePollAnnouncementTask() {
  console.log('📣 Running finalisePollAnnouncementTask...');

  try {
    const pollsSnap = await getDocs(collection(db, 'polls'));
    let announced = 0;

    for (const pollDoc of pollsSnap.docs) {
      const poll = pollDoc.data();
      const pollId = pollDoc.id;

      if (!poll.finalDate || poll.finalDateAnnounced) continue;

      await fetch('https://plan.setthedate.app/api/notifyAttendees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pollId,
          organiser: poll.organiserFirstName || 'The organiser',
          eventTitle: poll.eventTitle,
          location: poll.location,
          message: `📅 The event "${poll.eventTitle}" has been scheduled for ${poll.finalDate}. See who’s coming and get ready!`
        }),
      });

      await db.collection('polls').doc(pollId).update({ finalDateAnnounced: true });
      announced++;
      console.log(`✅ Notified attendees for poll ${pollId}`);
    }

    console.log(`📢 Finalised events announced: ${announced}`);
  } catch (err) {
    console.error('❌ Error in finalisePollAnnouncementTask:', err);
  }
};
const { db: db2 } = require('../lib/firebase');
const { collection: collection2, getDocs: getDocs2 } = require('firebase/firestore');

module.exports = async function pollClosedTakeActionReminderTask() {
  console.log('📅 Running pollClosedTakeActionReminderTask...');

  try {
    const now = new Date();
    const pollsSnap = await getDocs2(collection2(db2, 'polls'));
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
          editToken: poll.editToken
        }),
      });

      notified++;
      console.log(`📧 Sent post-deadline reminder for poll ${pollId}`);
    }

    console.log(`📨 Completed: ${notified} organisers notified.`);
  } catch (err) {
    console.error('❌ Error in pollClosedTakeActionReminderTask:', err);
  }
};

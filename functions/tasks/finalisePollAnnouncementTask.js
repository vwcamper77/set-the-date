const fetch = require('node-fetch'); // npm install node-fetch@2
const { db } = require('../lib/firebase');
const { FieldValue } = require('firebase-admin').firestore;

/**
 * Sends a reminder to organisers if their poll's deadline has passed,
 * the poll hasn't been finalised, and they haven't already been reminded.
 */
module.exports = async function pollClosedTakeActionReminderTask() {
  console.log('⌛ Running pollClosedTakeActionReminderTask…');

  const now = new Date();
  let count = 0;

  try {
    const pollsSnap = await db.collection('polls').get(); // ✅ use admin.firestore()

    for (const pollDoc of pollsSnap.docs) {
      const p = pollDoc.data();
      const id = pollDoc.id;

      // Skip if no deadline or it's still in the future
      if (!p.deadline) continue;
      const deadline = p.deadline.toDate ? p.deadline.toDate() : new Date(p.deadline);
      if (deadline > now) continue;

      // Skip if finalised or already reminded
      if (p.finalDate || p.closedReminderSent) continue;

      // Build edit link
      const editUrl = `https://plan.setthedate.app/edit/${id}?token=${p.editToken}`;

      // Send organiser reminder email
      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/sendOrganiserEmail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: p.organiserEmail,
          subject: `Your poll deadline for “${p.eventTitle}” has passed`,
          htmlContent: `
            <p>Hi ${p.organiserFirstName || 'there'},</p>
            <p>The voting deadline for your event “<strong>${p.eventTitle}</strong>” has now passed. You can finalise the date or extend the deadline:</p>
            <p><a href="${editUrl}" style="font-size:16px;">🔗 Finalise or extend your poll</a></p>
            <p>Need help? Just reply to this email.</p>
            <p>– The Set The Date Team</p>
          `,
          sender: { name: 'Set The Date', email: 'noreply@setthedate.app' },
          replyTo: { name: 'Gavin', email: 'hello@setthedate.app' }
        }),
      });

      // Mark as reminded in Firestore
      await db.collection('polls').doc(id).update({
        closedReminderSent: true,
        closedReminderSentAt: FieldValue.serverTimestamp()
      });

      console.log(`✅ Closed-deadline reminder sent for poll ${id}`);
      count++;
    }

    console.log(`⌛ pollClosedTakeActionReminderTask: ${count} reminders sent`);
  } catch (err) {
    console.error('❌ Error in pollClosedTakeActionReminderTask:', err);
  }
};

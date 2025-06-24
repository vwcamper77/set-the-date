// functions/tasks/checkVotesAndNotifyOrganiserTask.js

const fetch = require('node-fetch');                      // npm install node-fetch@2
const { db, FieldValue } = require('../lib/firebase');    // centralized Firebase init
const { differenceInHours } = require('date-fns');         // npm install date-fns

/**
 * Runs through all polls between 24h and 120h old,
 * and if no one except the organiser has voted,
 * sends up to two “low votes” reminder emails.
 */
module.exports = async function checkVotesAndNotifyOrganiserTask() {
  console.log('🔔 Running checkVotesAndNotifyOrganiserTask...');

  try {
    const now = new Date();
    const pollsSnap = await db.collection('polls').get();

    for (const pollDoc of pollsSnap.docs) {
      const pollId   = pollDoc.id;
      const data     = pollDoc.data();
      const createdAt  = data.createdAt?.toDate?.() || new Date(0);
      const lastRem    = data.lastLowVotesReminder?.toDate?.() || new Date(0);
      const ageHrs     = differenceInHours(now, createdAt);
      const sinceLast  = differenceInHours(now, lastRem);

      // Only consider polls 24–120 hours old
      if (ageHrs < 24 || ageHrs > 120) continue;

      const sentCount = data.lowVotesReminderCount || 0;
      // Max two reminders, spacing at least 48h
      if (sentCount >= 2) continue;
      if (sentCount === 1 && sinceLast < 48) continue;

      // Check for any non-organiser votes
      const votesSnap = await db
        .collection('polls').doc(pollId)
        .collection('votes').get();

      const nonOrgVotes = votesSnap.docs.filter(
        vd => vd.data().email !== data.organiserEmail
      );
      if (nonOrgVotes.length > 0) continue;

      // Prepare email content
      const editUrl   = `${process.env.NEXT_PUBLIC_BASE_URL}/edit/${pollId}?token=${data.editToken}`;
      const isSecond  = sentCount === 1;
      const subject   = isSecond
        ? `Still no responses? You can extend your event's deadline`
        : `Still waiting on your first votes?`;

      const htmlContent = isSecond
        ? `
          <p>Hi ${data.organiserFirstName || 'there'},</p>
          <p>Your event "<strong>${data.eventTitle}</strong>" still hasn’t had any responses. You can extend the deadline or adjust your dates to help people respond.</p>
          <p><a href="${editUrl}" style="font-size:16px;">🔗 Manage or re-share your event</a></p>
          <p>Questions? Just reply — I’m here to help.</p>
          <p>Warm wishes,<br/>Gavin<br/>Founder, Set The Date</p>
        `
        : `
          <p>Hi ${data.organiserFirstName || 'there'},</p>
          <p>Your event "<strong>${data.eventTitle}</strong>" hasn’t had any responses yet. No worries — it happens!</p>
          <p><a href="${editUrl}" style="font-size:16px;">🔗 Share your event again</a></p>
          <p>Need support? Just reply — I’d love to assist.</p>
          <p>Warm wishes,<br/>Gavin<br/>Founder, Set The Date</p>
        `;

      // Send the reminder via your REST endpoint
      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/sendOrganiserEmail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:       data.organiserEmail,
          subject,
          htmlContent,
          sender:   { name: 'Gavin at Set The Date', email: 'hello@setthedate.app' },
          replyTo:  { name: 'Gavin', email: 'hello@setthedate.app' },
        }),
      });

      // Record that we sent a reminder
      await db.collection('polls').doc(pollId).update({
        lowVotesReminderCount:   sentCount + 1,
        lastLowVotesReminder:    FieldValue.serverTimestamp(),
      });

      console.log(`✅ Sent reminder #${sentCount + 1} to ${data.organiserEmail} for poll ${pollId}`);
    }
  } catch (err) {
    console.error('❌ Error in checkVotesAndNotifyOrganiserTask:', err);
  }
};

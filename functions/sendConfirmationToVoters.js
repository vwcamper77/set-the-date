const admin = require('firebase-admin');
const fetch = require('node-fetch'); // npm install node-fetch@2
const serviceAccount = require('./service-account.json'); // Path to your service account

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function sendConfirmationToVoters() {
  const pollsSnap = await db.collection('polls').get();
  let totalSent = 0;

  for (const pollDoc of pollsSnap.docs) {
    const pollId = pollDoc.id;
    const pollData = pollDoc.data();

    // Collect event info
    const eventTitle = pollData.eventTitle || '(Untitled Event)';
    const location = pollData.location || '';

    // Get all votes for the poll
    const votesSnap = await db.collection('polls').doc(pollId).collection('votes').get();
    if (votesSnap.empty) continue;

    for (const voteDoc of votesSnap.docs) {
      const vote = voteDoc.data();
      const voterEmail = vote.email?.toLowerCase();
      // Use a fallback for firstName if missing
      const firstName = vote.name || vote.firstName || 'there';

      if (!voterEmail) continue;

      // Log what you're about to send
      console.log('Sending:', {
        email: voterEmail,
        firstName,
        eventTitle,
        pollId,
        location,
      });

      try {
        const resp = await fetch('https://plan.setthedate.app/api/sendAttendeeMessage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: voterEmail,
            firstName,
            eventTitle,
            pollId,
            location,
          }),
        });

        if (resp.ok) {
          console.log(`✅ Sent confirmation email to ${voterEmail} for "${eventTitle}"`);
          totalSent++;
        } else {
          const errText = await resp.text();
          console.error(`❌ Failed to send to ${voterEmail}: ${errText}`);
        }
      } catch (err) {
        console.error(`❌ Error sending to ${voterEmail}:`, err);
      }
    }
  }

  console.log(`\nDone! Sent ${totalSent} confirmation emails.`);
}

sendConfirmationToVoters();

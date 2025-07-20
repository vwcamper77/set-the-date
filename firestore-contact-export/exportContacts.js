const admin = require('firebase-admin');
const fs = require('fs');

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.applicationDefault()
});

const db = admin.firestore();

(async () => {
  const pollsSnap = await db.collection('polls').get();
  const contacts = [];

  for (const pollDoc of pollsSnap.docs) {
    const votesSnap = await db.collection('polls').doc(pollDoc.id).collection('votes').get();
    votesSnap.forEach(voteDoc => {
      const data = voteDoc.data();
      if (data.email && data.displayName) {
        contacts.push({
          email: data.email.trim().toLowerCase(),
          firstName: data.displayName.trim()
        });
      }
    });
  }

  fs.writeFileSync('attendee_contacts_for_brevo.json', JSON.stringify(contacts, null, 2));
  console.log(`✅ Exported ${contacts.length} contacts to attendee_contacts_for_brevo.json`);
})();

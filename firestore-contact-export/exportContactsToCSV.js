const admin = require('firebase-admin');
const fs = require('fs');
const { parse } = require('json2csv');

// Init Firebase
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

  if (contacts.length === 0) {
    console.log('⚠️ No contacts found.');
    return;
  }

  const csv = parse(contacts, { fields: ['email', 'firstName'] });
  fs.writeFileSync('attendee_contacts_for_brevo.csv', csv);
  console.log(`✅ Exported ${contacts.length} contacts to attendee_contacts_for_brevo.csv`);
})();

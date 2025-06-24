// functions/lib/firebase.js

const admin = require('firebase-admin');

// Only initialize the app if it hasn’t been already (important for testing/emulator)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

module.exports = {
  admin,
  db,
  FieldValue,
};

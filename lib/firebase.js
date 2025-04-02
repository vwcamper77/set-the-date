import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: NEXT_PUBLIC_FIREBASE_measurement_Id,
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);

// Function to update organiser email and send notification
const updateOrganiserEmail = async (pollId, email, organiserFirstName, eventTitle) => {
  try {
    const docRef = doc(db, 'polls', pollId);
    await updateDoc(docRef, { organiserEmail: email });

    // Send notification email to organiser after saving their email
    await fetch('/api/sendOrganiserEmail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: organiserFirstName,
        email: email,
        pollId: pollId,
        eventTitle: eventTitle
      }),
    });

    console.log("✅ Organiser email updated and notification sent.");

  } catch (error) {
    console.error("❌ Error updating organiser email:", error);
  }
};

// Exports for Firebase services
export { db, auth, updateOrganiserEmail };

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const logRentalEvent = async (eventName, payload = {}) => {
  if (!eventName) return;
  try {
    await addDoc(collection(db, 'rentalsEvents'), {
      event: eventName,
      ...payload,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('rentals event log failed', error);
  }
};

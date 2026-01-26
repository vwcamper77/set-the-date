import { db as adminDb, FieldValue } from '@/lib/firebaseAdmin';
import { organiserIdFromEmail } from '@/lib/organiserService';

const cleanString = (value, maxLength) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (maxLength && trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength);
  }
  return trimmed;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const {
    pollId,
    token,
    rating,
    text,
    firstName,
    consentPublic,
  } = req.body || {};

  if (!pollId || !token) {
    return res.status(400).json({ message: 'Missing pollId or token' });
  }

  const parsedRating = Number(rating);
  if (!Number.isFinite(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    return res.status(400).json({ message: 'Rating must be between 1 and 5.' });
  }

  const reviewText = cleanString(text, 500);
  if (!reviewText) {
    return res.status(400).json({ message: 'Review text is required.' });
  }

  try {
    const pollRef = adminDb.collection('polls').doc(pollId);
    const pollSnap = await pollRef.get();

    if (!pollSnap.exists) {
      return res.status(404).json({ message: 'Poll not found.' });
    }

    const poll = pollSnap.data();
    if (!poll?.editToken || token !== poll.editToken) {
      return res.status(403).json({ message: 'Invalid organiser token.' });
    }

    const organiserEmail = poll.organiserEmail || '';
    const organiserEmailHash = organiserEmail ? organiserIdFromEmail(organiserEmail) : null;
    const organiserUid = poll.organiserUid || null;
    const organiserName =
      poll.organiserFirstName || poll.organiserName || poll.organiser || null;

    const payload = {
      pollId,
      organiserEmailHash,
      organiserUid,
      organiserName,
      rating: Math.round(parsedRating),
      text: reviewText,
      firstName: cleanString(firstName, 80),
      consentPublic: Boolean(consentPublic),
      verifiedOrganiser: true,
      createdAt: FieldValue.serverTimestamp(),
      eventTitle: poll.eventTitle || null,
      location: poll.location || null,
    };

    const docRef = await adminDb.collection('reviews').add(payload);

    return res.status(200).json({
      ok: true,
      reviewId: docRef.id,
      review: {
        rating: payload.rating,
        text: payload.text,
        firstName: payload.firstName,
        consentPublic: payload.consentPublic,
        verifiedOrganiser: payload.verifiedOrganiser,
        eventTitle: payload.eventTitle,
        location: payload.location,
      },
    });
  } catch (error) {
    console.error('reviews submit error', error);
    return res.status(500).json({ message: 'Failed to submit review.' });
  }
}

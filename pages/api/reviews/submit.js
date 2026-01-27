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

const normalizeDateValue = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
};

const getInviteCountSnapshot = (poll) => {
  const numericCandidates = [
    poll?.attendeesInvitedCount,
    poll?.inviteCount,
    poll?.invitedCount,
    poll?.attendeesInvited,
  ];
  for (const value of numericCandidates) {
    if (Number.isFinite(value)) return value;
  }

  const listCandidates = [
    poll?.inviteEmails,
    poll?.invitedEmails,
    poll?.invites,
    poll?.attendees,
  ];
  for (const list of listCandidates) {
    if (Array.isArray(list)) return list.length;
  }

  return null;
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
    city,
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
    let reviewerRole = 'organiser';
    let reviewerEmail = poll.organiserEmail || '';
    let reviewerName = cleanString(firstName, 80);
    let reviewerCity = cleanString(city, 80);
    let verifiedSource = 'organiserToken';
    let verified = true;
    let tokenRef = null;

    if (!poll?.editToken || token !== poll.editToken) {
      tokenRef = adminDb
        .collection('polls')
        .doc(pollId)
        .collection('reviewTokens')
        .doc(token);
      const tokenSnap = await tokenRef.get();
      if (!tokenSnap.exists) {
        return res.status(403).json({ message: 'Invalid review token.' });
      }
      const tokenData = tokenSnap.data() || {};
      if (tokenData.usedAt) {
        return res.status(403).json({ message: 'Review token already used.' });
      }
      reviewerRole = 'attendee';
      reviewerEmail = tokenData.email || '';
      reviewerName = reviewerName || tokenData.displayName || null;
      reviewerCity = reviewerCity || null;
      verifiedSource = 'voteId';
      verified = true;
    }

    const organiserEmail = poll.organiserEmail || '';
    const organiserEmailHash = organiserEmail ? organiserIdFromEmail(organiserEmail) : null;
    const organiserUid = poll.organiserUid || null;
    const organiserName =
      poll.organiserFirstName || poll.organiserName || poll.organiser || null;
    const normalizedReviewerEmail = reviewerEmail ? reviewerEmail.trim().toLowerCase() : null;
    const pollFinalDateSnapshot = normalizeDateValue(poll.finalDate);
    const attendeesInvitedSnapshot = getInviteCountSnapshot(poll);

    const votesSnapshot = await adminDb
      .collection('polls')
      .doc(pollId)
      .collection('votes')
      .get();
    const votesCountSnapshot = votesSnapshot.size;
    let attendeesOnFinalDateSnapshot = null;
    if (pollFinalDateSnapshot) {
      let yesCount = 0;
      votesSnapshot.forEach((voteDoc) => {
        const voteData = voteDoc.data() || {};
        const voteMap = voteData.votes || voteData.availability || {};
        const response = voteMap?.[pollFinalDateSnapshot];
        if (typeof response === 'string' && response.toLowerCase() === 'yes') {
          yesCount += 1;
        }
      });
      attendeesOnFinalDateSnapshot = yesCount;
    }

    const publicConsent = consentPublic ? 'yes' : 'pending';

    const payload = {
      pollId,
      reviewId: null,
      organiserEmailHash,
      organiserUid,
      organiserName,
      rating: Math.round(parsedRating),
      text: reviewText,
      firstName: reviewerName,
      city: reviewerCity,
      reviewerName,
      reviewerCity,
      reviewerEmail: normalizedReviewerEmail,
      consentPublic: Boolean(consentPublic),
      publicConsent,
      visibility: 'private',
      moderationStatus: 'pending',
      publicDisplay: false,
      verifiedOrganiser: reviewerRole === 'organiser',
      verified,
      verifiedSource,
      reviewerRole,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      eventTitle: poll.eventTitle || null,
      location: poll.location || null,
      pollTitleSnapshot: poll.eventTitle || poll.title || null,
      pollLocationSnapshot: poll.location || null,
      pollFinalDateSnapshot,
      attendeesInvitedSnapshot,
      votesCountSnapshot,
      attendeesOnFinalDateSnapshot,
    };

    const docRef = adminDb.collection('reviews').doc();
    payload.reviewId = docRef.id;
    await docRef.set(payload);

    if (tokenRef) {
      await tokenRef.update({
        usedAt: FieldValue.serverTimestamp(),
        reviewId: docRef.id,
      });
    }

    return res.status(200).json({
      ok: true,
      reviewId: docRef.id,
      review: {
        rating: payload.rating,
        text: payload.text,
        firstName: payload.firstName,
        city: payload.city,
        consentPublic: payload.consentPublic,
        publicConsent: payload.publicConsent,
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

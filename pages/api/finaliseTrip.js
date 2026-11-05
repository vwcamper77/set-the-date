import { db, FieldValue } from '@/lib/firebaseAdmin';
import { calendarDate, getTripAvailability } from '@/lib/tripDates.mjs';
import { differenceInCalendarDays } from 'date-fns';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { pollId, editToken, start, end } = req.body || {};
  if (typeof pollId !== 'string' || !/^[\w-]{1,128}$/.test(pollId)) return res.status(400).json({ error: 'Invalid trip' });
  if (typeof editToken !== 'string' || !editToken) return res.status(403).json({ error: 'Use your organiser management link to confirm dates.' });
  if (typeof start !== 'string' || typeof end !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return res.status(400).json({ error: 'Choose a start and end date.' });
  try {
    const ref = db.collection('polls').doc(pollId);
    const result = await db.runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
      if (!snap.exists) fail(404, 'Trip not found');
      const poll = snap.data();
      if (poll.editToken !== editToken) fail(403, 'Use your organiser management link to confirm dates.');
      if (poll.eventType !== 'holiday') fail(400, 'This event is not a trip.');
      if (poll.finalDate) {
        if (poll.finalDate === start && poll.finalEndDate === end) return { finalDate: start, finalEndDate: end };
        fail(409, 'This trip already has confirmed dates.');
      }
      const available = getTripAvailability(poll);
      const from = calendarDate(start);
      const to = calendarDate(end);
      if (!available || !from || !to || from > to || from < available.start || to > available.end) fail(400, 'Choose remaining dates within the travel window.');
      const minimum = Number(poll.eventOptions?.minTripDays ?? poll.eventOptions?.minDays) || 1;
      if (differenceInCalendarDays(to, from) + 1 < minimum) fail(400, `Choose at least ${minimum} days.`);
      transaction.update(ref, { finalDate: start, finalEndDate: end, finalisedAt: FieldValue.serverTimestamp() });
      return { finalDate: start, finalEndDate: end };
    });
    return res.status(200).json(result);
  } catch (error) {
    if (!error.status) console.error('Trip finalisation failed', error);
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not confirm the trip. Please try again.' });
  }
}

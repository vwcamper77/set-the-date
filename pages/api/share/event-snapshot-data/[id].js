import { eachDayOfInterval, format } from 'date-fns';

import { getHolidayDurationLabel } from '@/utils/eventOptions';
import { serializeFirestoreData } from '@/utils/serializeFirestore';

const toDateEntry = (value) => {
  if (!value) return null;

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return { date: parsed, iso: parsed.toISOString() };
    }
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return { date: value, iso: value.toISOString() };
  }

  if (typeof value.toDate === 'function') {
    try {
      const date = value.toDate();
      if (!Number.isNaN(date.getTime())) {
        return { date, iso: date.toISOString() };
      }
    } catch {
      return null;
    }
  }

  return null;
};

const formatLongDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  try {
    return format(date, 'EEEE do MMMM yyyy');
  } catch {
    return '';
  }
};

const deriveCalendarDates = (isHolidayEvent, entries) => {
  if (!Array.isArray(entries) || !entries.length) {
    return [];
  }

  if (isHolidayEvent && entries.length > 1) {
    try {
      const intervalDates = eachDayOfInterval({
        start: entries[0].date,
        end: entries[entries.length - 1].date,
      });
      return intervalDates.map((date) => date.toISOString());
    } catch {
      return entries.map((entry) => entry.iso);
    }
  }

  return entries.map((entry) => entry.iso);
};

const normaliseId = (value) => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length) return value[0];
  return null;
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = normaliseId(req.query?.id);
  if (!id) {
    return res.status(400).json({ error: 'Missing poll id' });
  }

  try {
    const { db: adminDb } = await import('@/lib/firebaseAdmin');
    const pollSnap = await adminDb.collection('polls').doc(id).get();

    if (!pollSnap.exists) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    const poll = serializeFirestoreData(pollSnap.data() || {});

    const eventTitle = poll?.eventTitle || poll?.title || 'Set The Date event';
    const location = poll?.location || 'Location TBC';
    const organiser = poll?.organiserFirstName || '';
    const eventType = poll?.eventType || 'general';
    const isHolidayEvent = eventType === 'holiday';

    const rawDateValues = Array.isArray(poll?.dates) && poll.dates.length
      ? poll.dates
      : Array.isArray(poll?.selectedDates) && poll.selectedDates.length
      ? poll.selectedDates
      : [];

    const normalisedEntries = rawDateValues
      .map(toDateEntry)
      .filter(Boolean)
      .sort((a, b) => a.date - b.date);

    const sortedDates = normalisedEntries.map((entry) => entry.iso);
    const formattedDates = normalisedEntries.map((entry) => formatLongDate(entry.date)).filter(Boolean);
    const calendarDates = deriveCalendarDates(isHolidayEvent, normalisedEntries);

    const holidayStartEntry = isHolidayEvent && normalisedEntries.length ? normalisedEntries[0] : null;
    const holidayEndEntry =
      isHolidayEvent && normalisedEntries.length ? normalisedEntries[normalisedEntries.length - 1] : null;

    const formattedHolidayStart = holidayStartEntry ? formatLongDate(holidayStartEntry.date) : '';
    const formattedHolidayEnd = holidayEndEntry ? formatLongDate(holidayEndEntry.date) : '';
    const holidayStart = holidayStartEntry ? holidayStartEntry.iso : '';
    const holidayEnd = holidayEndEntry ? holidayEndEntry.iso : '';
    const proposedDurationLabel = isHolidayEvent
      ? getHolidayDurationLabel(poll?.eventOptions?.proposedDuration) || ''
      : '';

    const payload = {
      id,
      eventTitle,
      organiser,
      location,
      eventType,
      isHolidayEvent,
      sortedDates,
      formattedDates,
      calendarDates,
      formattedHolidayStart,
      formattedHolidayEnd,
      holidayStart,
      holidayEnd,
      proposedDurationLabel,
      hasDates: Boolean(sortedDates.length),
    };

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    return res.status(200).json(payload);
  } catch (error) {
    console.error('event snapshot data fetch failed', error);
    return res.status(500).json({ error: 'Unable to build event snapshot' });
  }
}

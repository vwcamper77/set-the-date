import { serializeFirestoreData } from '@/utils/serializeFirestore';

const PUBLIC_POLL_FIELDS = [
  'organiserFirstName',
  'eventTitle',
  'title',
  'location',
  'dates',
  'selectedDates',
  'deadline',
  'createdAt',
  'finalDate',
  'eventType',
  'planType',
  'unlocked',
  'eventOptions',
  'partnerSlug',
  'featuredEventTitle',
  'featuredEventDescription',
  'organiserNotes',
  'notes',
];

export const buildPublicPollSnapshot = (poll) => {
  const data = serializeFirestoreData(poll || {});
  const snapshot = {};

  PUBLIC_POLL_FIELDS.forEach((field) => {
    if (typeof data?.[field] !== 'undefined') {
      snapshot[field] = data[field];
    }
  });

  if (!snapshot.eventTitle && data?.title) {
    snapshot.eventTitle = data.title;
  }

  return snapshot;
};

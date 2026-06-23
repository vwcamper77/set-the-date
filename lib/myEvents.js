const STORAGE_KEY = 'std_my_events_v1';
const MAX_SAVED_EVENTS = 25;

const isBrowser = () => typeof window !== 'undefined';
const getStorage = () => {
  if (!isBrowser()) return null;

  try {
    return window.localStorage;
  } catch (error) {
    console.error('[my-events]', error);
    return null;
  }
};

const normaliseRecord = (record = {}) => {
  try {
    const pollId = typeof record?.pollId === 'string' ? record.pollId.trim() : '';
    if (!pollId) return null;

    return {
      pollId,
      title:
        typeof record?.title === 'string' && record.title.trim()
          ? record.title.trim()
          : 'Untitled event',
      location: typeof record?.location === 'string' ? record.location.trim() : '',
      createdAt:
        typeof record?.createdAt === 'string' && record.createdAt.trim()
          ? record.createdAt
          : new Date().toISOString(),
      organiserName: typeof record?.organiserName === 'string' ? record.organiserName.trim() : '',
      organiserEmail:
        typeof record?.organiserEmail === 'string' ? record.organiserEmail.trim().toLowerCase() : '',
      editToken: typeof record?.editToken === 'string' ? record.editToken.trim() : '',
      eventType: typeof record?.eventType === 'string' ? record.eventType.trim() : 'general',
    };
  } catch (error) {
    console.error('[my-events]', error);
    return null;
  }
};

export const getStoredEvents = () => {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normaliseRecord)
      .filter(Boolean)
      .sort((a, b) => {
        const aTime = Number.isFinite(new Date(a?.createdAt || '').getTime())
          ? new Date(a.createdAt).getTime()
          : 0;
        const bTime = Number.isFinite(new Date(b?.createdAt || '').getTime())
          ? new Date(b.createdAt).getTime()
          : 0;
        return bTime - aTime;
      });
  } catch (error) {
    console.error('[my-events]', error);
    return [];
  }
};

export const saveStoredEvent = (record) => {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const nextRecord = normaliseRecord(record);
    if (!nextRecord) return getStoredEvents();

    const existing = getStoredEvents().filter((entry) => entry.pollId !== nextRecord.pollId);
    const nextEvents = [nextRecord, ...existing].slice(0, MAX_SAVED_EVENTS);
    storage.setItem(STORAGE_KEY, JSON.stringify(nextEvents));
    return nextEvents;
  } catch (error) {
    console.error('[my-events]', error);
    return getStoredEvents();
  }
};

export const getEventPaths = (event) => {
  try {
    const pollId = typeof event?.pollId === 'string' ? event.pollId : '';
    const eventType = event?.eventType === 'holiday' ? 'holiday' : 'general';

    return {
      share: pollId ? `/share/${pollId}` : '/',
      voting: pollId ? (eventType === 'holiday' ? `/trip/${pollId}` : `/poll/${pollId}`) : '/',
      results: pollId ? (eventType === 'holiday' ? `/trip-results/${pollId}` : `/results/${pollId}`) : '/',
      manage:
        pollId && event?.editToken
          ? `/edit/${pollId}?token=${encodeURIComponent(event.editToken)}`
          : '',
    };
  } catch (error) {
    console.error('[my-events]', error);
    return {
      share: '/',
      voting: '/',
      results: '/',
      manage: '',
    };
  }
};

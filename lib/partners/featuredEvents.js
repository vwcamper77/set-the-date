import { nanoid } from 'nanoid';

export const FEATURED_EVENT_TITLE_LIMIT = 100;
export const FEATURED_EVENT_DESCRIPTION_LIMIT = 5000;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_FEATURED_EVENTS = 12;

const clampText = (value, max = 120) => {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, max);
};

const formatDateOnly = (date) => {
  if (!(date instanceof Date)) return null;
  const safe = new Date(date);
  if (Number.isNaN(safe.getTime())) return null;
  const year = safe.getFullYear();
  const month = String(safe.getMonth() + 1).padStart(2, '0');
  const day = String(safe.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDateOnlyString = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (DATE_ONLY_REGEX.test(trimmed.slice(0, 10))) {
      return trimmed.slice(0, 10);
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : formatDateOnly(parsed);
  }
  if (value instanceof Date) {
    return formatDateOnly(value);
  }
  if (typeof value.toDate === 'function') {
    return formatDateOnly(value.toDate());
  }
  if (typeof value.toMillis === 'function') {
    return formatDateOnly(new Date(value.toMillis()));
  }
  if (value?.seconds) {
    return formatDateOnly(new Date(value.seconds * 1000));
  }
  return null;
};

const normalizeDateList = (rawDates = []) => {
  if (!Array.isArray(rawDates)) return [];
  const seen = new Set();
  const result = [];
  for (const value of rawDates) {
    const parsed = toDateOnlyString(value);
    if (parsed && !seen.has(parsed)) {
      seen.add(parsed);
      result.push(parsed);
    }
  }
  return result;
};

export const normalizeFeaturedEvents = (events = [], { limit = MAX_FEATURED_EVENTS } = {}) => {
  if (!Array.isArray(events)) return [];
  const seen = new Set();
  const normalized = [];

  for (const raw of events) {
    if (limit && normalized.length >= limit) break;
    const title = clampText(raw?.title || '', FEATURED_EVENT_TITLE_LIMIT);
    if (!title) continue;

    const id = clampText(raw?.id || nanoid(10), 40) || nanoid(10);
    if (seen.has(id)) continue;
    seen.add(id);

    const fixedDates = normalizeDateList(
      Array.isArray(raw?.fixedDates) && raw.fixedDates.length ? raw.fixedDates : raw?.fixedDate ? [raw.fixedDate] : []
    );
    const primaryFixedDate = fixedDates[0] || toDateOnlyString(raw?.fixedDate);

    normalized.push({
      id,
      title,
      description: clampText(raw?.description || '', FEATURED_EVENT_DESCRIPTION_LIMIT),
      fixedDate: primaryFixedDate || null,
      fixedDates,
      isActive: raw?.isActive === false ? false : true,
    });
  }

  return normalized;
};

export const dateInputStringToDate = (value) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  const match = trimmed.match(DATE_ONLY_REGEX);
  if (!match) return null;
  const [year, month, day] = trimmed.split('-').map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

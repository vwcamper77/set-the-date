// pages/trip-results/[id].js
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import {
  addDays,
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  eachMonthOfInterval,
  isAfter,
  isBefore,
  differenceInCalendarDays,
} from 'date-fns';

import LogoHeader from '@/components/LogoHeader';
import ShareButtons from '@/components/ShareButtons';

import { logEventIfAvailable } from '@/lib/logEventIfAvailable';

/* -------------------- helpers -------------------- */
const serializeValue = (value) => {
  if (!value) return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serializeValue(v)]));
  }
  return value;
};

const DEFAULT_MIN_TRIP_DAYS = 2;

const toDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const safeParseISO = (v) => {
  if (!v) return null;
  try {
    if (v instanceof Date) return v;
    if (typeof v === 'string') return parseISO(v);
    return null;
  } catch {
    return null;
  }
};

const cleanNote = (text) => {
  if (!text) return '';
  const replacements = {
    'ΓÇÖ': "'",
    'ΓÇô': '-',
    'ΓÇ£': '"',
    'ΓÇ¥': '"',
    'ΓÇ¶': '...',
    'ΓÇ£ΓÇ¥': '"',
  };
  let result = String(text);
  Object.entries(replacements).forEach(([bad, good]) => {
    result = result.split(bad).join(good);
  });
  const visible = result.trim();
  if (!visible || visible === "''" || visible === '""') return '';
  return visible;
};

const buildDayRange = (start, end) => {
  const days = [];
  let cursor = toDay(start);
  const final = toDay(end);
  while (cursor <= final) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
};

const durationToNights = (value) => {
  if (!value || typeof value !== 'string') return null;
  if (value.endsWith('_nights')) {
    const parsed = parseInt(value.split('_')[0], 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  switch (value) {
    case '1_week':
      return 7;
    case '10_nights':
      return 10;
    case '2_weeks':
      return 14;
    case 'unlimited':
      return null;
    default:
      return null;
  }
};

const deriveMinTripDays = (eventOptions = {}) => {
  const raw = Number(eventOptions.minTripDays ?? eventOptions.minDays);
  if (Number.isFinite(raw) && raw > 0) return raw;
  const nightsFromDuration = durationToNights(eventOptions.proposedDuration);
  if (Number.isFinite(nightsFromDuration) && nightsFromDuration > 0) return nightsFromDuration + 1;
  return DEFAULT_MIN_TRIP_DAYS;
};

/* -------------------- vote normalisation -------------------- */
const normaliseVotes = (votes) =>
  (votes || [])
    .map((v) => {
      const windows = [];
      if (Array.isArray(v.holidayChoices)) {
        v.holidayChoices.forEach((c) => {
          const sRaw = safeParseISO(c.start);
          const eRaw = safeParseISO(c.end);
          if (!sRaw || !eRaw) return;
          const s = toDay(sRaw);
          const e = toDay(eRaw);
          if (s <= e) {
            windows.push({
              start: s,
              end: e,
              preferredNights: c.preferredNights || c.preferredDuration || '',
            });
          }
        });
      }
      if (!windows.length) return null;
      return {
        id: v.id,
        name: v.displayName || v.name || 'Someone',
        email: v.email || '',
        message: v.message || '',
        preferredDuration: v.preferredDuration || '',
        windows,
      };
    })
    .filter(Boolean);

/* -------------------- computations -------------------- */
const buildDayCounts = (organiserStart, organiserEnd, votes) => {
  const startDay = toDay(organiserStart);
  const endDay = toDay(organiserEnd);
  const counts = new Map();

  for (const v of votes) {
    const voterKey = v.id || v.email || v.name || 'Unknown';
    const voterLabel = v.name || v.email || 'Someone';

    for (const w of v.windows) {
      const windowStart = toDay(w.start);
      const windowEnd = toDay(w.end);

      const s = isBefore(windowStart, startDay) ? startDay : windowStart;
      const e = isAfter(windowEnd, endDay) ? endDay : windowEnd;
      if (isAfter(s, e)) continue;

      let c = s;
      while (c <= e) {
        const key = new Date(c.getFullYear(), c.getMonth(), c.getDate()).getTime();
        if (!counts.has(key)) counts.set(key, { voters: new Map() });
        counts.get(key).voters.set(voterKey, voterLabel);
        c = addDays(c, 1);
      }
    }
  }

  for (const [, entry] of counts) entry.count = entry.voters.size;
  return counts;
};

const getBestCoverageWindow = (organiserStart, organiserEnd, counts, desiredLength = 1) => {
  if (!organiserStart || !organiserEnd) return null;

  const days = buildDayRange(organiserStart, organiserEnd).map((day) => {
    const entry = counts.get(day.getTime());
    return { date: day, voters: entry?.voters ? new Map(entry.voters) : new Map() };
  });
  if (!days.length) return null;

  const windowLength = Math.min(Math.max(1, desiredLength), days.length);
  let best = null;

  for (let i = 0; i + windowLength <= days.length; i++) {
    const slice = days.slice(i, i + windowLength);
    const totalAvailability = slice.reduce((sum, d) => sum + d.voters.size, 0);
    const minAvailability = Math.min(...slice.map((d) => d.voters.size));
    if (totalAvailability === 0) continue;

    const attendeeDayCounts = new Map();
    slice.forEach(({ voters }) => {
      for (const name of voters.values()) attendeeDayCounts.set(name, (attendeeDayCounts.get(name) || 0) + 1);
    });

    const everyDayAttendees = Array.from(attendeeDayCounts.entries())
      .filter(([, dayCount]) => dayCount === windowLength)
      .map(([name]) => name);

    const topAttendees = Array.from(attendeeDayCounts.entries())
      .sort((a, b) => {
        const delta = b[1] - a[1];
        if (delta !== 0) return delta;
        return a[0].localeCompare(b[0]);
      })
      .map(([name]) => name);

    const attendees =
      everyDayAttendees.length > 0
        ? everyDayAttendees
        : topAttendees.slice(0, Math.max(1, minAvailability || 1));

    const score = minAvailability * 10000 + totalAvailability;

    if (!best || score > best.score || (score === best.score && slice[0].date < best.start)) {
      best = { start: slice[0].date, end: slice[slice.length - 1].date, attendees, score };
    }
  }

  return best ? { start: best.start, end: best.end, attendees: best.attendees } : null;
};

const getRecommendedWindow = (organiserStart, organiserEnd, counts, minTripDays = 1) => {
  if (!organiserStart || !organiserEnd) return null;

  const days = buildDayRange(organiserStart, organiserEnd);
  const dayEntries = days.map((day) => {
    const entry = counts.get(day.getTime());
    return { date: day, voters: entry?.voters ? new Map(entry.voters) : new Map() };
  });

  const candidates = [];

  for (let i = 0; i < dayEntries.length; i++) {
    let intersection = null;

    for (let j = i; j < dayEntries.length; j++) {
      const spanLength = differenceInCalendarDays(dayEntries[j].date, dayEntries[i].date) + 1;
      const votersMap = dayEntries[j].voters;

      if (intersection === null) {
        intersection = new Map(votersMap);
      } else if (intersection.size) {
        for (const key of Array.from(intersection.keys())) {
          if (!votersMap.has(key)) intersection.delete(key);
        }
      }

      if (spanLength < minTripDays) continue;
      if (!intersection || intersection.size === 0) continue;

      const attendees = Array.from(new Set(intersection.values()));
      if (!attendees.length) continue;

      candidates.push({
        start: dayEntries[i].date,
        end: dayEntries[j].date,
        attendees,
        lengthInDays: spanLength,
      });
    }
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const attendeeDelta = b.attendees.length - a.attendees.length;
    if (attendeeDelta !== 0) return attendeeDelta;
    const lengthDelta = b.lengthInDays - a.lengthInDays;
    if (lengthDelta !== 0) return lengthDelta;
    const startDelta = a.start - b.start;
    if (startDelta !== 0) return startDelta;
    return a.end - b.end;
  });

  const best = candidates[0];
  return { start: best.start, end: best.end, attendees: best.attendees };
};

const getPreferredTripDaysMode = (votesNorm = []) => {
  const days = [];
  votesNorm.forEach((v) => {
    const fromPreferred = durationToNights(v.preferredDuration);
    if (Number.isFinite(fromPreferred) && fromPreferred >= 0) days.push(fromPreferred + 1);

    v.windows?.forEach((w) => {
      const raw = w.preferredNights;
      const parsed =
        Number.isFinite(raw) && raw >= 0
          ? raw
          : durationToNights(typeof raw === 'string' ? raw : v.preferredDuration);
      if (Number.isFinite(parsed) && parsed >= 0) days.push(parsed + 1);
    });
  });

  if (!days.length) return null;

  const counts = new Map();
  days.forEach((d) => counts.set(d, (counts.get(d) || 0) + 1));
  const sorted = Array.from(counts.entries()).sort((a, b) => {
    const freqDelta = b[1] - a[1];
    if (freqDelta !== 0) return freqDelta;
    return a[0] - b[0];
  });
  return sorted[0]?.[0] || null;
};

const chooseRecommendedWindow = (organiserStart, organiserEnd, counts, minTripDays = 2, targetTripDays = null) => {
  if (!organiserStart || !organiserEnd || !counts || counts.size === 0) return null;

  const spanDays = differenceInCalendarDays(organiserEnd, organiserStart) + 1;
  const minDays = Math.max(2, Number.isFinite(minTripDays) ? minTripDays : 2);
  const target = Number.isFinite(targetTripDays)
    ? Math.min(Math.max(targetTripDays, minDays), spanDays)
    : null;

  const lengths = (() => {
    if (!spanDays || spanDays < minDays) return [];
    if (target) {
      const ordered = [];
      for (let delta = 0; delta <= spanDays; delta += 1) {
        const lower = target - delta;
        const upper = target + delta;
        if (lower >= minDays && lower <= spanDays) ordered.push(lower);
        if (upper !== lower && upper >= minDays && upper <= spanDays) ordered.push(upper);
        if (ordered.length >= spanDays - minDays + 1) break;
      }
      return Array.from(new Set(ordered));
    }
    return Array.from({ length: spanDays - minDays + 1 }, (_, i) => minDays + i);
  })();

  const compare = (a, b) => {
    const attendeesDelta = (b.attendees?.length || 0) - (a.attendees?.length || 0);
    if (attendeesDelta !== 0) return attendeesDelta;

    const lenA = differenceInCalendarDays(a.end, a.start) + 1;
    const lenB = differenceInCalendarDays(b.end, b.start) + 1;

    const diffA = target ? Math.abs(lenA - target) : 0;
    const diffB = target ? Math.abs(lenB - target) : 0;
    if (diffA !== diffB) return diffA - diffB;

    const startDelta = a.start - b.start;
    if (startDelta !== 0) return startDelta;

    return lenA - lenB;
  };

  const strictCandidates = [];
  lengths.forEach((len) => {
    const win = getRecommendedWindow(organiserStart, organiserEnd, counts, len);
    if (win) strictCandidates.push(win);
  });
  if (strictCandidates.length) {
    strictCandidates.sort(compare);
    return strictCandidates[0];
  }

  const coverageCandidates = [];
  lengths.forEach((len) => {
    const win = getBestCoverageWindow(organiserStart, organiserEnd, counts, len);
    if (win) coverageCandidates.push(win);
  });
  if (coverageCandidates.length) {
    coverageCandidates.sort(compare);
    return coverageCandidates[0];
  }

  return null;
};

/* -------------------- heat map -------------------- */
const PersonIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true" focusable="false">
    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-7 2-7 4v1h14v-1c0-2-3-4-7-4Z" />
  </svg>
);

function HeatMapWithPagination({ organiserStart, organiserEnd, counts, maxCount, recommended, totalAttendees }) {
  const resolvedRecommended = useMemo(() => {
    if (recommended) return recommended;
    if (!counts || counts.size === 0) return null;
    return getBestCoverageWindow(organiserStart, organiserEnd, counts, 2) || null;
  }, [recommended, counts, organiserStart, organiserEnd]);

  const months = useMemo(
    () =>
      eachMonthOfInterval({
        start: startOfMonth(organiserStart),
        end: endOfMonth(organiserEnd),
      }),
    [organiserStart, organiserEnd]
  );

  const isSingleMonth = months.length === 1;
  const [monthIdx, setMonthIdx] = useState(0);
  const canPrev = !isSingleMonth && monthIdx > 0;
  const canNext = !isSingleMonth && monthIdx < Math.max(0, months.length - 2);

  const colorFor = (count) => {
    if (!count || !maxCount) {
      return { bg: 'rgba(0,0,0,0.04)', txt: 'text-gray-400', border: 'border-gray-200' };
    }
    const ratio = Math.min(1, count / maxCount);
    const alpha = 0.12 + ratio * 0.78;
    return {
      bg: `rgba(59,130,246,${alpha})`,
      txt: alpha > 0.55 ? 'text-white' : 'text-blue-900',
      border: 'border-blue-200',
    };
  };

  const renderAvailabilityStack = (count) => {
    if (!count) return <div className="flex items-center justify-center h-4" />;
    const visible = Math.min(count, 3);
    const extra = count - visible;
    return (
      <div className="flex items-center justify-center h-4">
        <div className="flex items-center">
          {Array.from({ length: visible }).map((_, idx) => (
            <span
              key={idx}
              className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white border border-blue-200 text-blue-600 shadow-sm"
              style={{ marginLeft: idx === 0 ? 0 : -6, zIndex: visible - idx }}
            >
              <PersonIcon className="w-3 h-3" />
            </span>
          ))}
          {extra > 0 && <span className="ml-1 text-[9px] font-semibold text-blue-900">+{extra}</span>}
        </div>
      </div>
    );
  };

  const renderMonthGrid = (month) => {
    const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const gridDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

    return (
      <div key={month.toISOString()} className={isSingleMonth ? 'w-full md:max-w-lg mx-auto' : 'w-full md:w-1/2'}>
        <div className="text-center text-sm font-semibold text-gray-800 mb-2">{format(month, 'LLLL yyyy')}</div>
        <div className="grid grid-cols-7 gap-1">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="text-[11px] text-gray-500 text-center mb-1">
              {d}
            </div>
          ))}

          {gridDays.map((d) => {
            const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
            const entry = counts.get(key);
            const voters = entry?.voters ? Array.from(entry.voters.values()) : [];
            const c = voters.length;
            const color = colorFor(c);

            const inRecommendedWindow =
              resolvedRecommended && d >= resolvedRecommended.start && d <= resolvedRecommended.end;

            const tooltip =
              c > 0
                ? `${format(d, 'EEE d MMM')}: ${c} available (${voters.join(', ')})`
                : `${format(d, 'EEE d MMM')}: No availability yet`;

            const cellStyle = { backgroundColor: color.bg };
            if (inRecommendedWindow) {
              cellStyle.borderColor = 'rgba(250,204,21,0.85)';
              cellStyle.boxShadow = '0 0 0 2px rgba(250,204,21,0.35), 0 0 0 4px rgba(250,204,21,0.18)';
              cellStyle.outline = '2px solid rgba(250,204,21,0.8)';
              cellStyle.outlineOffset = '2px';
              cellStyle.backgroundImage = 'linear-gradient(135deg, rgba(250,204,21,0.18), rgba(250,204,21,0.06))';
            }

            return (
              <div
                key={key}
                className={`h-10 relative rounded border text-xs flex items-center justify-center ${color.border}`}
                style={cellStyle}
                title={tooltip}
              >
                <div className={`relative flex flex-col items-center gap-1 ${color.txt}`}>
                  <div className="text-[11px] font-medium">{format(d, 'd')}</div>
                  {renderAvailabilityStack(c)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const visibleMonths = isSingleMonth ? months : months.slice(monthIdx, monthIdx + 2);

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Availability heat map</h3>
          {resolvedRecommended ? (
            <div className="mt-1 text-[11px] text-yellow-700 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400 border border-yellow-500" />
                <span className="font-semibold text-yellow-800">Best overlap so far</span>
              </div>
              <div className="text-yellow-800">
                {format(resolvedRecommended.start, 'EEE d MMM')} to {format(resolvedRecommended.end, 'EEE d MMM yyyy')}{' '}
                {resolvedRecommended.attendees.length}
                {totalAttendees ? ` of ${totalAttendees}` : ''}{' '}
                {resolvedRecommended.attendees.length === 1 ? 'person' : 'people'} can make every day (
                {resolvedRecommended.attendees.join(', ')})
              </div>
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-gray-500">We will highlight the best overlap once everyone has shared their dates.</p>
          )}
        </div>

        {!isSingleMonth && (
          <div className="flex items-center gap-2">
            <button
              className={`px-3 py-1.5 rounded border text-sm ${
                canPrev ? 'text-blue-700 border-blue-300 hover:bg-blue-50' : 'text-gray-400 border-gray-200 cursor-not-allowed'
              }`}
              onClick={() => canPrev && setMonthIdx((i) => i - 1)}
              disabled={!canPrev}
            >
              Prev
            </button>
            <div className="text-sm text-gray-700 w-40 text-center truncate">
              {format(visibleMonths[0], 'LLLL yyyy')}
              {visibleMonths[1] ? ` & ${format(visibleMonths[1], 'LLLL yyyy')}` : ''}
            </div>
            <button
              className={`px-3 py-1.5 rounded border text-sm ${
                canNext ? 'text-blue-700 border-blue-300 hover:bg-blue-50' : 'text-gray-400 border-gray-200 cursor-not-allowed'
              }`}
              onClick={() => canNext && setMonthIdx((i) => i + 1)}
              disabled={!canNext}
            >
              Next
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row md:justify-center md:space-x-6 space-y-6 md:space-y-0">
        {visibleMonths.map(renderMonthGrid)}
      </div>
    </div>
  );
}

/* -------------------- server: poll only -------------------- */
export async function getServerSideProps(context) {
  const { id } = context.params;

  const { getFirestore } = await import('@/lib/firebaseAdmin');
  const adminDb = getFirestore();

  const pollSnap = await adminDb.collection('polls').doc(id).get();
  if (!pollSnap.exists) return { notFound: true };

  const poll = serializeValue(pollSnap.data());

  if (poll.eventType !== 'holiday') {
    return { redirect: { destination: `/results/${id}`, permanent: false } };
  }

  return { props: { poll, id } };
}

/* -------------------- page -------------------- */
export default function TripResultsPage({ poll, id }) {
  const organiser = poll.organiserFirstName || 'Someone';
  const eventTitle = poll.eventTitle || 'Trip';
  const location = poll.location || 'somewhere';
  const isProPoll = poll.planType === 'pro' || poll.unlocked || poll.eventType === 'holiday';

  const [votesRaw, setVotesRaw] = useState([]);
  const [votesLoading, setVotesLoading] = useState(true);
  const [votesError, setVotesError] = useState('');

  // IMPORTANT: Firebase client SDK imports happen only in the browser
  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        setVotesLoading(true);
        setVotesError('');

        const [{ db }, firestore] = await Promise.all([import('@/lib/firebase'), import('firebase/firestore')]);

        const { collection, getDocs, limit, query } = firestore;

        const q = query(collection(db, 'polls', id, 'votes'), limit(600));
        const snap = await getDocs(q);

        if (!alive) return;

        const rows = snap.docs.map((d) => ({ id: d.id, ...serializeValue(d.data()) }));
        setVotesRaw(rows);
      } catch (e) {
        if (!alive) return;
        setVotesError(e?.message || 'Failed to load votes');
      } finally {
        if (!alive) return;
        setVotesLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [id]);

  const organiserDates = useMemo(() => {
    const arr = (poll.dates || poll.selectedDates || []).filter(Boolean);
    if (!arr.length) return null;

    const sorted = arr
      .map((d) => {
        const parsed = typeof d === 'string' ? safeParseISO(d) : d;
        return parsed ? toDay(parsed) : null;
      })
      .filter(Boolean)
      .sort((a, b) => a - b);

    if (!sorted.length) return null;
    return { start: sorted[0], end: sorted[sorted.length - 1] };
  }, [poll.dates, poll.selectedDates]);

  const votesNorm = useMemo(() => normaliseVotes(votesRaw), [votesRaw]);
  const minTripDays = useMemo(() => deriveMinTripDays(poll?.eventOptions || {}), [poll?.eventOptions]);

  const preferredModeTripDays = useMemo(() => getPreferredTripDaysMode(votesNorm), [votesNorm]);

  const organiserPreferredTripDays = useMemo(() => {
    const fromProposed = durationToNights(poll?.eventOptions?.proposedDuration);
    if (Number.isFinite(fromProposed) && fromProposed >= 0) return fromProposed + 1;

    const configuredMin = Number(poll?.eventOptions?.minTripDays ?? poll?.eventOptions?.minDays);
    if (Number.isFinite(configuredMin) && configuredMin > 0) return configuredMin;

    return null;
  }, [poll?.eventOptions?.proposedDuration, poll?.eventOptions?.minTripDays, poll?.eventOptions?.minDays]);

  const desiredTripDays = useMemo(() => {
    const maxWindow = organiserDates ? differenceInCalendarDays(organiserDates.end, organiserDates.start) + 1 : null;
    const sources = [organiserPreferredTripDays, preferredModeTripDays].filter((v) => Number.isFinite(v) && v > 0);

    if (sources.length) {
      const average = sources.reduce((sum, v) => sum + v, 0) / sources.length;
      const rounded = Math.max(2, Math.round(average));
      const bounded = maxWindow ? Math.min(rounded, maxWindow) : rounded;
      return Math.max(minTripDays || 2, bounded);
    }

    const fallbackRaw = organiserPreferredTripDays || preferredModeTripDays || minTripDays || 2;
    const fallback = Math.max(2, fallbackRaw);
    return maxWindow ? Math.min(fallback, maxWindow) : fallback;
  }, [organiserPreferredTripDays, preferredModeTripDays, minTripDays, organiserDates]);

  const countsData = useMemo(() => {
    if (!organiserDates) return { counts: new Map(), maxCount: 0 };
    const c = buildDayCounts(organiserDates.start, organiserDates.end, votesNorm);
    let max = 0;
    for (const [, v] of c) if (v.count > max) max = v.count;
    return { counts: c, maxCount: max };
  }, [organiserDates, votesNorm]);

  const totalAttendees = useMemo(() => {
    const keys = new Set();
    votesNorm.forEach((v) => keys.add(v.id || v.email || v.name || 'Unknown'));
    return keys.size;
  }, [votesNorm]);

  const recommendedWindow = useMemo(() => {
    if (!organiserDates) return null;
    const minTripDaysSafe = Math.max(2, minTripDays || 2);

    const window = chooseRecommendedWindow(
      organiserDates.start,
      organiserDates.end,
      countsData.counts,
      minTripDaysSafe,
      desiredTripDays
    );
    if (window) return window;

    const desiredLen = Math.max(2, desiredTripDays || minTripDaysSafe);
    return getBestCoverageWindow(organiserDates.start, organiserDates.end, countsData.counts, desiredLen)
      || getBestCoverageWindow(organiserDates.start, organiserDates.end, countsData.counts, 2)
      || getBestCoverageWindow(organiserDates.start, organiserDates.end, countsData.counts, 1);
  }, [organiserDates, countsData, minTripDays, desiredTripDays]);

  const recommendedDuration = useMemo(() => {
    if (!recommendedWindow) return null;
    const days = differenceInCalendarDays(recommendedWindow.end, recommendedWindow.start) + 1;
    const nights = Math.max(0, days - 1);
    return {
      days,
      nights,
      dayLabel: `${days} ${days === 1 ? 'day' : 'days'}`,
      nightLabel: nights > 0 ? `${nights} ${nights === 1 ? 'night' : 'nights'}` : null,
    };
  }, [recommendedWindow]);

  const shareUrl = 'https://setthedate.app/trip-planner';
  const shareMessage = `Help friends plan their next adventure with the Set The Date Trip Planner: ${shareUrl}`;

  const handleShare = (platform) => {
    logEventIfAvailable('trip_results_shared', { platform, pollId: id, eventTitle });
  };

  const totalDays = organiserDates ? differenceInCalendarDays(organiserDates.end, organiserDates.start) + 1 : 0;

  return (
    <>
      <Head>
        <title>{`Trip availability for ${eventTitle}`}</title>
      </Head>

      <div className="min-h-screen bg-gray-50 pt-6 pb-10 px-4">
        <div className="max-w-5xl mx-auto bg-white shadow-md rounded-2xl px-5 py-6 md:px-8 md:py-8">
          <div className="flex justify-center mb-1">
            <LogoHeader isPro={isProPoll} />
          </div>

          <div className="text-center mb-5">
            <h1 className="text-2xl font-semibold">
              Trip availability for <span className="text-blue-600">{eventTitle}</span>
            </h1>
            <p className="text-sm text-gray-600 mt-2">
              Organised by <strong>{organiser}</strong> in <strong>{location}</strong>
            </p>

            {organiserDates && (
              <p className="text-xs text-gray-500 mt-1">
                Organiser window: {format(organiserDates.start, 'EEE d MMM')} to {format(organiserDates.end, 'EEE d MMM yyyy')} - {totalDays}{' '}
                {totalDays === 1 ? 'day' : 'days'}
              </p>
            )}

            <a
              href={`/trip/${id}`}
              className="inline-flex items-center justify-center mt-3 px-4 py-2 border border-blue-400 text-blue-600 text-sm font-semibold rounded-md hover:bg-blue-50"
            >
              Add your availability for {eventTitle}
            </a>
          </div>

          {votesLoading ? (
            <div className="text-center text-sm text-gray-600 bg-gray-100 border border-gray-200 rounded-lg p-6">
              Loading attendee windows...
            </div>
          ) : votesError ? (
            <div className="text-center text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-6">
              Could not load votes: {votesError}
            </div>
          ) : !votesNorm.length ? (
            <div className="text-center text-sm text-gray-600 bg-gray-100 border border-gray-200 rounded-lg p-6">
              Waiting for the first travel window. Share the trip link to collect availability.
            </div>
          ) : (
            <>
              {recommendedWindow && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-6 text-blue-900">
                  <h2 className="text-lg font-semibold mb-2">Recommended trip window</h2>

                  <p className="text-base font-medium">
                    {format(recommendedWindow.start, 'EEE d MMM')} to {format(recommendedWindow.end, 'EEE d MMM yyyy')}
                  </p>

                  <p className="text-sm mt-1">
                    Works for <strong>{recommendedWindow.attendees.length}</strong>
                    {totalAttendees ? ` of ${totalAttendees}` : ''} {recommendedWindow.attendees.length === 1 ? 'person' : 'people'}.
                  </p>

                  {recommendedDuration && (
                    <p className="text-xs mt-2 text-blue-800">
                      Suggested stay: {recommendedDuration.dayLabel}
                      {recommendedDuration.nightLabel ? ` (${recommendedDuration.nightLabel})` : ''}
                    </p>
                  )}

                  <p className="text-xs mt-2 text-blue-800">
                    Picked automatically near the preferred trip length. Minimum trip length: {Math.max(2, minTripDays || 2)}{' '}
                    {Math.max(2, minTripDays || 2) === 1 ? 'day' : 'days'}.
                  </p>

                  <p className="text-xs mt-2 text-blue-900">Attendees: {recommendedWindow.attendees.join(', ')}</p>
                </div>
              )}

              {organiserDates && (
                <HeatMapWithPagination
                  organiserStart={organiserDates.start}
                  organiserEnd={organiserDates.end}
                  counts={countsData.counts}
                  maxCount={countsData.maxCount}
                  recommended={recommendedWindow}
                  totalAttendees={totalAttendees}
                />
              )}

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-5 mt-6">
                <h3 className="text-md font-semibold mb-3">Attendee windows</h3>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm table-fixed">
                    <thead>
                      <tr className="text-left text-gray-600">
                        <th className="pb-2 w-[15%]">Attendee</th>
                        <th className="pb-2 w-[40%]">Windows</th>
                        <th className="pb-2 w-[15%]">Preferred length</th>
                        <th className="pb-2 w-[30%]">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {votesNorm.map((v, i) => (
                        <tr key={v.id || `${v.email || v.name}-${i}`} className="border-t border-gray-200">
                          <td className="py-2 font-medium align-top w-[15%]">{v.name}</td>
                          <td className="py-2 align-top w-[40%]">
                            <div className="flex flex-wrap gap-2">
                              {v.windows.map((w, j) => (
                                <span
                                  key={`${j}-${w.start.toISOString()}`}
                                  className="inline-flex items-center px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs"
                                >
                                  {format(w.start, 'd MMM')} to {format(w.end, 'd MMM')}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2 text-xs text-gray-600 align-top w-[15%]">
                            {getHolidayDurationLabel(v.preferredDuration) ||
                              getHolidayDurationLabel(v.windows[0]?.preferredNights) ||
                              'Flexible'}
                          </td>
                          <td className="py-2 text-xs text-gray-500 whitespace-pre-wrap break-words align-top w-[30%]">
                            {cleanNote(v.message) || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {votesRaw.length >= 600 && (
                    <div className="mt-3 text-[11px] text-gray-500">
                      Showing the first 600 responses for performance. If you need more, we can add pagination.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          <div className="text-center mt-10 space-y-3">
            <a
              href={`/trip/${id}`}
              className="inline-flex justify-center px-4 py-2 border border-blue-500 text-blue-600 rounded-md font-medium hover:bg-blue-50"
            >
              View attendee calendar
            </a>

            <div>
              <a
                href={`/share/${id}`}
                className="inline-flex justify-center px-4 py-2 border border-gray-400 text-gray-700 rounded-md text-sm hover:bg-gray-100"
              >
                Share this poll again
              </a>
            </div>

            <div className="pt-3">
              <div className="rounded-lg border border-pink-200 bg-pink-50 px-6 py-6 text-center space-y-4">
                <p className="text-sm font-semibold text-pink-700 flex items-center justify-center gap-2">
                  <span role="img" aria-label="love">💗</span>
                  Love Set The Date? Share the Trip Planner with friends on Facebook, TikTok & more
                  <span role="img" aria-label="love">💗</span>
                </p>
                <div className="flex justify-center">
                  <ShareButtons shareUrl={shareUrl} shareMessage={shareMessage} onShare={handleShare} />
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

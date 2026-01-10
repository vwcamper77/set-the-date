import Head from 'next/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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
import { getHolidayDurationLabel } from '@/utils/eventOptions';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';
import CountdownTimer from '@/components/CountdownTimer';

/* -------------------- helpers -------------------- */
const serializeValue = (value) => {
  if (!value) return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serializeValue(v)]));
  }
  return value;
};

const DEFAULT_MIN_TRIP_DAYS = 2;

const toDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

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
  if (Number.isFinite(nightsFromDuration) && nightsFromDuration > 0) {
    return nightsFromDuration + 1;
  }
  return DEFAULT_MIN_TRIP_DAYS;
};

/* -------------------- server data -------------------- */
export async function getServerSideProps(context) {
  const { id } = context.params;
  const pollRef = doc(db, 'polls', id);
  const pollSnap = await getDoc(pollRef);
  if (!pollSnap.exists()) return { notFound: true };

  const pollData = serializeValue(pollSnap.data());
  if (pollData.eventType !== 'holiday') {
    return { redirect: { destination: `/results/${id}`, permanent: false } };
  }

  const votesSnap = await getDocs(collection(db, 'polls', id, 'votes'));
  const votes = votesSnap.docs.map((d) => ({ id: d.id, ...serializeValue(d.data()) }));
  return { props: { poll: pollData, votes, id } };
}

/* -------------------- data transforms -------------------- */
const normaliseVotes = (votes) =>
  votes
    .map((v) => {
      const windows = [];
      if (Array.isArray(v.holidayChoices)) {
        v.holidayChoices.forEach((c) => {
          const s = toDay(parseISO(c.start));
          const e = toDay(parseISO(c.end));
          if (s && e && s <= e) {
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
        const row = counts.get(key);
        row.voters.set(voterKey, voterLabel);
        c = addDays(c, 1);
      }
    }
  }
  for (const [, entry] of counts) {
    entry.count = entry.voters.size;
  }
  return counts;
};

const getBestCoverageWindow = (organiserStart, organiserEnd, counts, desiredLength = 1) => {
  if (!organiserStart || !organiserEnd) return null;
  const days = buildDayRange(organiserStart, organiserEnd).map((day) => {
    const key = day.getTime();
    const entry = counts.get(key);
    return {
      date: day,
      voters: entry?.voters ? new Map(entry.voters) : new Map(),
    };
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
      for (const name of voters.values()) {
        attendeeDayCounts.set(name, (attendeeDayCounts.get(name) || 0) + 1);
      }
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
      best = {
        start: slice[0].date,
        end: slice[slice.length - 1].date,
        attendees,
        score,
      };
    }
  }

  return best ? { start: best.start, end: best.end, attendees: best.attendees } : null;
};

const getRecommendedWindow = (organiserStart, organiserEnd, counts, minTripDays = 1) => {
  if (!organiserStart || !organiserEnd) return null;
  const days = buildDayRange(organiserStart, organiserEnd);
  const dayEntries = days.map((day) => {
    const key = day.getTime();
    const entry = counts.get(key);
    return {
      date: day,
      voters: entry?.voters ? new Map(entry.voters) : new Map(),
    };
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
          if (!votersMap.has(key)) {
            intersection.delete(key);
          }
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

const chooseRecommendedWindow = (organiserStart, organiserEnd, counts, minTripDays = 2, targetTripDays = null) => {
  if (!organiserStart || !organiserEnd || counts.size === 0) return null;
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

function DayDetailsModal({ open, onClose, date, count, voters, isInRecommended, isRecStart }) {
  if (!open) return null;
  const safeVoters = Array.isArray(voters) ? voters : [];
  const title = date ? format(date, 'EEE d MMM yyyy') : 'Day details';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-gray-900">{title}</div>
            <div className="text-xs text-gray-600 mt-1">
              {count ? (
                <>
                  <span className="font-semibold text-gray-800">{count}</span> {count === 1 ? 'person' : 'people'} available
                </>
              ) : (
                'No availability yet'
              )}
              {isRecStart ? <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300 text-[11px]">Suggested start</span> : null}
              {isInRecommended && !isRecStart ? <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-800 border border-yellow-200 text-[11px]">In suggested window</span> : null}
            </div>
          </div>

          <button
            onClick={onClose}
            className="shrink-0 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        {safeVoters.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-semibold text-gray-700 mb-2">Available</div>
            <div className="flex flex-wrap gap-2">
              {safeVoters.map((name, idx) => (
                <span
                  key={`${name}-${idx}`}
                  className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-100 text-xs"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HeatMapWithPagination({
  organiserStart,
  organiserEnd,
  counts,
  maxCount,
  recommended: recommendedWindow,
  totalAttendees = null,
  initialMonthIdx = 0,
  autoScrollToRecommended = true,
}) {
  const containerRef = useRef(null);
  const [dayModal, setDayModal] = useState({
    open: false,
    date: null,
    voters: [],
    count: 0,
    isInRecommended: false,
    isRecStart: false,
  });

  const resolvedRecommended = useMemo(() => {
    if (recommendedWindow) return recommendedWindow;
    if (!counts || counts.size === 0) return null;
    const fallback = getBestCoverageWindow(organiserStart, organiserEnd, counts, 2);
    return fallback || null;
  }, [recommendedWindow, counts, organiserStart, organiserEnd]);

  const months = useMemo(
    () =>
      eachMonthOfInterval({
        start: startOfMonth(organiserStart),
        end: endOfMonth(organiserEnd),
      }),
    [organiserStart, organiserEnd]
  );

  const isSingleMonth = months.length === 1;

  const [monthIdx, setMonthIdx] = useState(() => {
    if (isSingleMonth) return 0;
    const bounded = Math.min(Math.max(0, initialMonthIdx || 0), Math.max(0, months.length - 2));
    return bounded;
  });

  useEffect(() => {
    if (isSingleMonth) return;
    const bounded = Math.min(Math.max(0, initialMonthIdx || 0), Math.max(0, months.length - 2));
    setMonthIdx(bounded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMonthIdx, isSingleMonth, months.length]);

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

  const openDayModal = (date, voters, count, isInRecommended, isRecStart) => {
    // Lazily build this only on tap/click (this is the performance win on mobile)
    setDayModal({
      open: true,
      date,
      voters: Array.from(new Set(voters || [])),
      count: count || 0,
      isInRecommended: !!isInRecommended,
      isRecStart: !!isRecStart,
    });
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

            const isRecStart =
              resolvedRecommended && toDay(d).getTime() === toDay(resolvedRecommended.start).getTime();
            const inRecommendedWindow =
              resolvedRecommended &&
              toDay(d) >= toDay(resolvedRecommended.start) &&
              toDay(d) <= toDay(resolvedRecommended.end);

            const cellStyle = { backgroundColor: color.bg };
            if (inRecommendedWindow) {
              cellStyle.borderColor = 'rgba(250,204,21,0.85)';
              cellStyle.boxShadow = '0 0 0 2px rgba(250,204,21,0.35), 0 0 0 4px rgba(250,204,21,0.18)';
              cellStyle.outline = '2px solid rgba(250,204,21,0.8)';
              cellStyle.outlineOffset = '2px';
              cellStyle.backgroundImage = 'linear-gradient(135deg, rgba(250,204,21,0.18), rgba(250,204,21,0.06))';
            }

            // IMPORTANT: keep the title minimal (no long string concatenation per cell)
            const minimalTitle =
              c > 0 ? `${format(d, 'EEE d MMM')}: ${c} available` : `${format(d, 'EEE d MMM')}: No availability yet`;

            return (
              <button
                key={key}
                type="button"
                data-rec-start={isRecStart ? '1' : undefined}
                className={`h-10 relative rounded border text-xs flex items-center justify-center ${color.border} focus:outline-none focus:ring-2 focus:ring-blue-200`}
                style={cellStyle}
                title={minimalTitle}
                onClick={() => openDayModal(d, voters, c, inRecommendedWindow, isRecStart)}
              >
                <div className={`relative flex flex-col items-center gap-1 ${color.txt}`}>
                  <div className="text-[11px] font-medium">{format(d, 'd')}</div>
                  {renderAvailabilityStack(c)}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const visibleMonths = isSingleMonth ? months : months.slice(monthIdx, monthIdx + 2);

  useEffect(() => {
    if (!autoScrollToRecommended) return;
    if (!resolvedRecommended) return;
    if (!containerRef.current) return;

    const t = setTimeout(() => {
      const el = containerRef.current.querySelector('[data-rec-start="1"]');
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      }
    }, 60);

    return () => clearTimeout(t);
  }, [autoScrollToRecommended, resolvedRecommended, monthIdx]);

  return (
    <div className="mt-6" ref={containerRef}>
      <DayDetailsModal
        open={dayModal.open}
        onClose={() => setDayModal((s) => ({ ...s, open: false }))}
        date={dayModal.date}
        count={dayModal.count}
        voters={dayModal.voters}
        isInRecommended={dayModal.isInRecommended}
        isRecStart={dayModal.isRecStart}
      />

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
            <p className="mt-1 text-[11px] text-gray-500">
              We will highlight the best overlap once everyone has shared their dates.
            </p>
          )}
        </div>

        {!isSingleMonth && (
          <div className="flex items-center gap-2">
            <button
              className={`px-3 py-1.5 rounded border text-sm ${
                canPrev
                  ? 'text-blue-700 border-blue-300 hover:bg-blue-50'
                  : 'text-gray-400 border-gray-200 cursor-not-allowed'
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
                canNext
                  ? 'text-blue-700 border-blue-300 hover:bg-blue-50'
                  : 'text-gray-400 border-gray-200 cursor-not-allowed'
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

      <div className="flex flex-col gap-2 text-[11px] text-gray-500 mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span>min</span>
          <span className="h-3 w-8 rounded" style={{ backgroundColor: 'rgba(59,130,246,0.12)' }} />
          <span className="h-3 w-8 rounded" style={{ backgroundColor: 'rgba(59,130,246,0.45)' }} />
          <span className="h-3 w-8 rounded" style={{ backgroundColor: 'rgba(59,130,246,0.90)' }} />
          <span>max</span>
          <span className="ml-3 text-gray-400 whitespace-nowrap">
            ({maxCount || 0} {maxCount === 1 ? 'person' : 'people'})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {resolvedRecommended ? (
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block w-3 h-3 rounded border"
                style={{
                  borderColor: 'rgba(250,204,21,0.7)',
                  backgroundColor: 'rgba(253, 230, 138, 0.35)',
                }}
              />
              <span>Suggested trip window</span>
            </span>
          ) : (
            <span className="text-gray-400">Suggested window will appear once overlaps exist.</span>
          )}

          <span className="inline-flex items-center gap-1">
            <span className="flex items-center">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white border border-blue-200 text-blue-600 shadow-sm">
                <PersonIcon className="w-3 h-3" />
              </span>
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white border border-blue-200 text-blue-600 shadow-sm"
                style={{ marginLeft: -6 }}
              >
                <PersonIcon className="w-3 h-3" />
              </span>
            </span>
            <span>Attendee availability</span>
          </span>

          <span className="text-gray-400">Tip: tap a day to see who is available.</span>
        </div>
      </div>
    </div>
  );
}

/* -------------------- main page -------------------- */
export default function TripResultsPage({ poll, votes, id }) {
  const organiser = poll.organiserFirstName || 'Someone';
  const eventTitle = poll.eventTitle || 'Trip';
  const location = poll.location || 'somewhere';
  const isProPoll = poll.planType === 'pro' || poll.unlocked || poll.eventType === 'holiday';

  const organiserDates = useMemo(() => {
    const arr = (poll.dates || poll.selectedDates || []).filter(Boolean);
    if (!arr.length) return null;
    const sorted = arr
      .map((d) => toDay(typeof d === 'string' ? parseISO(d) : d))
      .sort((a, b) => a - b);
    return { start: sorted[0], end: sorted[sorted.length - 1] };
  }, [poll.dates, poll.selectedDates]);

  const votesNorm = useMemo(() => normaliseVotes(votes), [votes]);

  const minTripDays = useMemo(
    () => deriveMinTripDays(poll?.eventOptions || {}),
    [poll?.eventOptions?.minTripDays, poll?.eventOptions?.minDays, poll?.eventOptions?.proposedDuration]
  );

  const preferredModeTripDays = useMemo(() => getPreferredTripDaysMode(votesNorm), [votesNorm]);

  const organiserPreferredTripDays = useMemo(() => {
    const fromProposed = durationToNights(poll?.eventOptions?.proposedDuration);
    if (Number.isFinite(fromProposed) && fromProposed >= 0) return fromProposed + 1;

    const configuredMin = Number(poll?.eventOptions?.minTripDays ?? poll?.eventOptions?.minDays);
    if (Number.isFinite(configuredMin) && configuredMin > 0) return configuredMin;

    return null;
  }, [poll?.eventOptions?.proposedDuration, poll?.eventOptions?.minTripDays, poll?.eventOptions?.minDays]);

  const desiredTripDays = useMemo(() => {
    const maxWindow = organiserDates
      ? differenceInCalendarDays(organiserDates.end, organiserDates.start) + 1
      : null;

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
    votesNorm.forEach((v) => {
      const key = v.id || v.email || v.name || 'Unknown';
      keys.add(key);
    });
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
    const coveragePreferred = getBestCoverageWindow(
      organiserDates.start,
      organiserDates.end,
      countsData.counts,
      desiredLen
    );
    if (coveragePreferred) return coveragePreferred;

    const coverage2 = getBestCoverageWindow(organiserDates.start, organiserDates.end, countsData.counts, 2);
    if (coverage2) return coverage2;

    const coverage1 = getBestCoverageWindow(organiserDates.start, organiserDates.end, countsData.counts, 1);
    if (coverage1) return coverage1;

    for (const [key, entry] of countsData.counts.entries()) {
      if (entry?.voters?.size > 0) {
        const date = new Date(Number(key));
        const attendees = Array.from(new Set(entry.voters.values()));
        return { start: date, end: date, attendees };
      }
    }

    return null;
  }, [organiserDates, countsData, minTripDays, desiredTripDays]);

  const initialMonthIdx = useMemo(() => {
    if (!organiserDates || !recommendedWindow) return 0;

    const months = eachMonthOfInterval({
      start: startOfMonth(organiserDates.start),
      end: endOfMonth(organiserDates.end),
    });

    if (!months.length) return 0;

    const recMonthStart = startOfMonth(toDay(recommendedWindow.start)).getTime();
    const idx = months.findIndex((m) => startOfMonth(m).getTime() === recMonthStart);
    if (idx < 0) return 0;

    return Math.min(idx, Math.max(0, months.length - 2));
  }, [organiserDates, recommendedWindow]);

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

  const totalDays = organiserDates ? differenceInCalendarDays(organiserDates.end, organiserDates.start) + 1 : 0;

  const shareUrl = 'https://setthedate.app/trip-planner';
  const shareMessage = `Help friends plan their next adventure with the Set The Date Trip Planner: ${shareUrl}`;
  const handleShare = (platform) => {
    logEventIfAvailable('trip_results_shared', {
      platform,
      pollId: id,
      eventTitle,
    });
  };

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

          {!votesNorm.length ? (
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
                    Picked automatically as the window with the strongest overlap near the average preferred trip length
                    of ~{desiredTripDays} {desiredTripDays === 1 ? 'day' : 'days'} (based on organiser and attendee
                    preferred lengths). Everyone here can make every day of this span, even if they offered a longer
                    window for flexibility.
                  </p>

                  {organiserDates && (
                    <p className="text-xs mt-2 text-blue-800">
                      Original plan from {organiser}: {format(organiserDates.start, 'EEE d MMM yyyy')} to {format(organiserDates.end, 'EEE d MMM yyyy')}.
                      {organiserPreferredTripDays ? ` Preferred length: ~${organiserPreferredTripDays} ${organiserPreferredTripDays === 1 ? 'day' : 'days'}.` : ''}
                    </p>
                  )}

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
                  initialMonthIdx={initialMonthIdx}
                  autoScrollToRecommended={true}
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
                  <span role="img" aria-label="love">
                    💗
                  </span>
                  Love Set The Date? Share the Trip Planner with friends on Facebook, TikTok & more
                  <span role="img" aria-label="love">
                    💗
                  </span>
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

import Head from 'next/head';
import { useMemo, useState } from 'react';
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
  isSameMonth,
  differenceInCalendarDays,
} from 'date-fns';
import LogoHeader from '@/components/LogoHeader';
import ShareButtons from '@/components/ShareButtons';
import { getHolidayDurationLabel } from '@/utils/eventOptions';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';

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

const buildDayRange = (start, end) => {
  const days = [];
  let cursor = start;
  while (cursor <= end) {
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
          const s = parseISO(c.start);
          const e = parseISO(c.end);
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
  const counts = new Map();
  for (const v of votes) {
    const voterKey = v.id || v.email || v.name || 'Unknown';
    const voterLabel = v.name || v.email || 'Someone';
    for (const w of v.windows) {
      const s = isBefore(w.start, organiserStart) ? organiserStart : w.start;
      const e = isAfter(w.end, organiserEnd) ? organiserEnd : w.end;
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
    const startDelta = a.start - b.start;
    if (startDelta !== 0) return startDelta;
    const lengthDelta = a.lengthInDays - b.lengthInDays;
    if (lengthDelta !== 0) return lengthDelta;
    return a.end - b.end;
  });

  const best = candidates[0];
  return { start: best.start, end: best.end, attendees: best.attendees };
};

/* -------------------- heat map -------------------- */
const PersonIcon = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-7 2-7 4v1h14v-1c0-2-3-4-7-4Z" />
  </svg>
);

function HeatMapWithPagination({ organiserStart, organiserEnd, counts, maxCount, recommended }) {
  const months = useMemo(
    () =>
      eachMonthOfInterval({
        start: startOfMonth(organiserStart),
        end: endOfMonth(organiserEnd),
      }),
    [organiserStart, organiserEnd]
  );
  const [monthIdx, setMonthIdx] = useState(0);
  const canPrev = monthIdx > 0;
  const canNext = monthIdx < Math.max(0, months.length - 2);

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
    if (!count) {
      return <div className="flex items-center justify-center h-4" />;
    }
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
          {extra > 0 && (
            <span className="ml-1 text-[9px] font-semibold text-blue-900">+{extra}</span>
          )}
        </div>
      </div>
    );
  };

  const renderMonthGrid = (month) => {
    const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const gridDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

    return (
      <div key={month.toISOString()} className="w-full md:w-1/2">
        <div className="text-center text-sm font-semibold text-gray-800 mb-2">
          {format(month, 'LLLL yyyy')}
        </div>
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
            const isRecStart = recommended && d.getTime() === recommended.start.getTime();
            const inRecommendedWindow =
              recommended && d >= recommended.start && d <= recommended.end;
            const tooltip =
              c > 0
                ? `${format(d, 'EEE d MMM')}: ${c} available (${voters.join(', ')})`
                : `${format(d, 'EEE d MMM')}: No availability yet`;
            const cellStyle = {
              backgroundColor: color.bg,
              borderColor: inRecommendedWindow ? 'rgba(250,204,21,0.85)' : undefined,
              boxShadow: inRecommendedWindow ? '0 0 0 2px rgba(250,204,21,0.45)' : undefined,
            };
            return (
              <div
                key={key}
                className={`h-10 relative rounded border text-xs flex items-center justify-center ${color.border}`}
                style={cellStyle}
                title={tooltip}
              >
                {isRecStart && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-yellow-600 bg-yellow-100 px-1.5 py-0.5 rounded shadow-sm border border-yellow-300 z-10">
                    Suggested start
                  </div>
                )}
                <div
                  className={`relative flex flex-col items-center gap-1 ${color.txt} ${
                    isRecStart ? 'ring-2 ring-yellow-400 rounded px-1' : ''
                  }`}
                >
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

  const visibleMonths = months.slice(monthIdx, monthIdx + 2);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Availability heat map</h3>
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
      </div>

      <div className="flex flex-col md:flex-row md:space-x-6 space-y-6 md:space-y-0">
        {visibleMonths.map(renderMonthGrid)}
      </div>

      <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-3">
        <span>min</span>
        <span className="h-3 w-8 rounded" style={{ backgroundColor: 'rgba(59,130,246,0.12)' }} />
        <span className="h-3 w-8 rounded" style={{ backgroundColor: 'rgba(59,130,246,0.45)' }} />
        <span className="h-3 w-8 rounded" style={{ backgroundColor: 'rgba(59,130,246,0.90)' }} />
        <span>max</span>
        <span className="ml-3 text-gray-400">
          ({maxCount || 0} {maxCount === 1 ? 'person' : 'people'})
        </span>
        <span className="ml-4 inline-flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded border-2 border-yellow-400 bg-yellow-100" />
          <span>Suggested start</span>
        </span>
        {recommended && (
          <span className="ml-4 inline-flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded border"
              style={{ borderColor: 'rgba(250,204,21,0.7)', backgroundColor: 'rgba(253, 230, 138, 0.35)' }}
            />
            <span>Suggested trip window</span>
          </span>
        )}
        <span className="ml-4 inline-flex items-center gap-1">
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
    const sorted = arr.map(parseISO).sort((a, b) => a - b);
    return { start: sorted[0], end: sorted[sorted.length - 1] };
  }, [poll.dates, poll.selectedDates]);

  const votesNorm = useMemo(() => normaliseVotes(votes), [votes]);
  const minTripDays = useMemo(
    () => deriveMinTripDays(poll?.eventOptions || {}),
    [poll?.eventOptions?.minTripDays, poll?.eventOptions?.minDays, poll?.eventOptions?.proposedDuration]
  );

  const countsData = useMemo(() => {
    if (!organiserDates) return { counts: new Map(), maxCount: 0 };
    const c = buildDayCounts(organiserDates.start, organiserDates.end, votesNorm);
    let max = 0;
    for (const [, v] of c) if (v.count > max) max = v.count;
    return { counts: c, maxCount: max };
  }, [organiserDates, votesNorm]);
  const recommended = useMemo(() => {
    if (!organiserDates) return null;
    return getRecommendedWindow(organiserDates.start, organiserDates.end, countsData.counts, minTripDays);
  }, [organiserDates, countsData, minTripDays]);
  const recommendedDuration = useMemo(() => {
    if (!recommended) return null;
    const days = differenceInCalendarDays(recommended.end, recommended.start) + 1;
    const nights = Math.max(0, days - 1);
    return {
      days,
      nights,
      dayLabel: `${days} ${days === 1 ? 'day' : 'days'}`,
      nightLabel: nights > 0 ? `${nights} ${nights === 1 ? 'night' : 'nights'}` : null,
    };
  }, [recommended]);
  const totalDays = organiserDates
    ? differenceInCalendarDays(organiserDates.end, organiserDates.start) + 1
    : 0;

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
              {recommended && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-6 text-blue-900">
                  <h2 className="text-lg font-semibold mb-2">Recommended trip window</h2>
                  <p className="text-base font-medium">
                    {format(recommended.start, 'EEE d MMM')} to{' '}
                    {format(recommended.end, 'EEE d MMM yyyy')}
                  </p>
                  <p className="text-sm mt-1">
                    Works for <strong>{recommended.attendees.length}</strong>{' '}
                    {recommended.attendees.length === 1 ? 'person' : 'people'}.
                  </p>
                  {recommendedDuration && (
                    <p className="text-xs mt-2 text-blue-800">
                      Suggested stay: {recommendedDuration.dayLabel}
                      {recommendedDuration.nightLabel ? ` (${recommendedDuration.nightLabel})` : ''}
                    </p>
                  )}
                  {organiserDates && (
                    <p className="text-xs mt-2 text-blue-800">
                      Original plan from {organiser}: {format(organiserDates.start, 'EEE d MMM yyyy')} to{' '}
                      {format(organiserDates.end, 'EEE d MMM yyyy')}.
                    </p>
                  )}
                  <p className="text-xs mt-2 text-blue-900">
                    Attendees: {recommended.attendees.join(', ')}
                  </p>
                </div>
              )}

              {organiserDates && (
                <HeatMapWithPagination
                  organiserStart={organiserDates.start}
                  organiserEnd={organiserDates.end}
                  counts={countsData.counts}
                  maxCount={countsData.maxCount}
                  recommended={recommended}
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
                        <tr
                          key={v.id || `${v.email || v.name}-${i}`}
                          className="border-t border-gray-200"
                        >
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
                            {v.message || 'ΓÇö'}
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



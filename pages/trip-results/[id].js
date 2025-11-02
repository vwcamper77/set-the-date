import Head from 'next/head';
import { useMemo } from 'react';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { addDays, format, parseISO } from 'date-fns';
import LogoHeader from '@/components/LogoHeader';
import { getHolidayDurationLabel } from '@/utils/eventOptions';

const serializeValue = (value) => {
  if (!value) return value;
  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, serializeValue(val)])
    );
  }
  return value;
};

const buildDayRange = (start, end) => {
  const days = [];
  let cursor = start;
  while (cursor <= end) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
};

export async function getServerSideProps(context) {
  const { id } = context.params;
  const pollRef = doc(db, 'polls', id);
  const pollSnap = await getDoc(pollRef);

  if (!pollSnap.exists()) {
    return { notFound: true };
  }

  const pollData = serializeValue(pollSnap.data());

  if (pollData.eventType !== 'holiday') {
    return {
      redirect: {
        destination: `/results/${id}`,
        permanent: false,
      },
    };
  }

  const votesSnap = await getDocs(collection(db, 'polls', id, 'votes'));
  const votes = votesSnap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...serializeValue(docSnap.data()),
  }));

  return {
    props: {
      poll: pollData,
      votes,
      id,
    },
  };
}

const normaliseVotes = (votes) => {
  return votes
    .map((vote) => {
      const windows = [];

      if (Array.isArray(vote.holidayChoices) && vote.holidayChoices.length) {
        windows.push(
          ...vote.holidayChoices
            .map((choice) => ({
              start: parseISO(choice.start),
              end: parseISO(choice.end),
              preferredNights: choice.preferredNights || choice.preferredDuration || '',
            }))
            .filter((choice) => choice.start instanceof Date && choice.end instanceof Date && !Number.isNaN(choice.start) && !Number.isNaN(choice.end))
        );
      } else if (vote.holidayChoice?.start && vote.holidayChoice?.end) {
        windows.push({
          start: parseISO(vote.holidayChoice.start),
          end: parseISO(vote.holidayChoice.end),
          preferredNights: vote.holidayChoice.preferredNights || '',
        });
      } else if (vote.holidayPreferences?.earliestStart && vote.holidayPreferences?.latestEnd) {
        windows.push({
          start: parseISO(vote.holidayPreferences.earliestStart),
          end: parseISO(vote.holidayPreferences.latestEnd),
          preferredNights: vote.holidayPreferences.maxDuration || '',
        });
      }

      const cleaned = windows.filter(
        (window) =>
          window.start instanceof Date &&
          window.end instanceof Date &&
          !Number.isNaN(window.start) &&
          !Number.isNaN(window.end) &&
          window.start <= window.end
      );

      if (!cleaned.length) return null;

      return {
        name: vote.displayName || vote.name || 'Someone',
        email: vote.email || '',
        message: vote.message || '',
        preferredDuration: vote.preferredDuration || '',
        windows: cleaned,
      };
    })
    .filter(Boolean);
};

const buildHeatMapData = (organiserStart, organiserEnd, votes) => {
  const days = buildDayRange(organiserStart, organiserEnd);
  const counts = days.map((day) => {
    const count = votes.reduce((total, vote) => {
      const matches = vote.windows.some((window) => window.start <= day && window.end >= day);
      return matches ? total + 1 : total;
    }, 0);
    return { day, count };
  });

  const maxCount = counts.reduce((max, entry) => Math.max(max, entry.count), 0);
  return { days, counts, maxCount };
};

const getRecommendedWindow = (organiserStart, organiserEnd, votes) => {
  const days = buildDayRange(organiserStart, organiserEnd);

  let bestWindow = null;

  for (let startIndex = 0; startIndex < days.length; startIndex += 1) {
    for (let endIndex = startIndex; endIndex < days.length; endIndex += 1) {
      const start = days[startIndex];
      const end = days[endIndex];

      const attendees = votes
        .filter((vote) => vote.windows.some((window) => window.start <= start && window.end >= end))
        .map((vote) => vote.name);

      if (!attendees.length) continue;

      if (
        !bestWindow ||
        attendees.length > bestWindow.attendees.length ||
        (attendees.length === bestWindow.attendees.length && start < bestWindow.start) ||
        (attendees.length === bestWindow.attendees.length &&
          start.getTime() === bestWindow.start.getTime() &&
          end < bestWindow.end)
      ) {
        bestWindow = { start, end, attendees };
      }
    }
  }

  return bestWindow;
};

const HeatMap = ({ counts, maxCount, recommended }) => {
  if (!counts.length) return null;

  const getCellClass = (count) => {
    if (count === 0) return 'bg-gray-100 text-gray-400';
    if (maxCount <= 1) return 'bg-blue-200 text-blue-900';
    const intensity = Math.round((count / maxCount) * 4);
    switch (intensity) {
      case 0:
        return 'bg-blue-100 text-blue-900';
      case 1:
        return 'bg-blue-200 text-blue-900';
      case 2:
        return 'bg-blue-300 text-blue-900';
      case 3:
        return 'bg-blue-400 text-white';
      default:
        return 'bg-blue-500 text-white';
    }
  };

  const isRecommendedDay = (day) =>
    recommended && day >= recommended.start && day <= recommended.end;

  const firstOffset = counts[0].day.getDay();
  const lastOffset = (7 - ((counts[counts.length - 1].day.getDay() + 1) % 7)) % 7;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Availability heat map</h3>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-gray-100 border border-gray-200" /> 0
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-blue-300" /> mid
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-blue-500" /> max
          </span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-xs">
        {Array.from({ length: firstOffset }).map((_, index) => (
          <div key={`leading-${index}`} />
        ))}
        {counts.map(({ day, count }) => (
          <div
            key={day.toISOString()}
            className={`p-2 text-center rounded ${getCellClass(count)} ${
              isRecommendedDay(day) ? 'border-2 border-yellow-400 shadow-inner' : ''
            }`}
            title={`${format(day, 'EEE d MMM')}: ${count} available`}
          >
            <div>{format(day, 'd')}</div>
            <div className="text-[10px]">{count}</div>
          </div>
        ))}
        {Array.from({ length: lastOffset }).map((_, index) => (
          <div key={`trailing-${index}`} />
        ))}
      </div>
    </div>
  );
};

export default function TripResultsPage({ poll, votes, id }) {
  const organiser = poll.organiserFirstName || 'Someone';
  const eventTitle = poll.eventTitle || 'Trip';
  const location = poll.location || 'somewhere';

  const organiserDates = useMemo(() => {
    const selected = (poll.dates || poll.selectedDates || []).filter(Boolean);
    if (!selected.length) return null;
    const sorted = selected
      .map((iso) => parseISO(iso))
      .filter((date) => date instanceof Date && !Number.isNaN(date))
      .sort((a, b) => a - b);
    return { start: sorted[0], end: sorted[sorted.length - 1] };
  }, [poll.dates, poll.selectedDates]);

  const attendeeVotes = useMemo(() => normaliseVotes(votes), [votes]);

  const heatMap = useMemo(() => {
    if (!organiserDates || !attendeeVotes.length) return null;
    return buildHeatMapData(organiserDates.start, organiserDates.end, attendeeVotes);
  }, [organiserDates, attendeeVotes]);

  const recommended = useMemo(() => {
    if (!organiserDates || !attendeeVotes.length) return null;
    return getRecommendedWindow(organiserDates.start, organiserDates.end, attendeeVotes);
  }, [organiserDates, attendeeVotes]);

  return (
    <>
      <Head>
        <title>{`Trip availability for ${eventTitle}`}</title>
      </Head>

      <div className="min-h-screen bg-gray-50 py-10 px-4">
        <div className="max-w-5xl mx-auto bg-white shadow-md rounded-2xl p-6 md:p-10">
          <div className="flex justify-center mb-6">
            <LogoHeader />
          </div>
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold">
              Trip availability for <span className="text-blue-600">{eventTitle}</span>
            </h1>
            <p className="text-sm text-gray-600 mt-2">
              Organised by <strong>{organiser}</strong> in <strong>{location}</strong>
            </p>
            {organiserDates && (
              <p className="text-xs text-gray-500 mt-1">
                Organiser window: {format(organiserDates.start, 'EEE d MMM')} →{' '}
                {format(organiserDates.end, 'EEE d MMM yyyy')}
              </p>
            )}
          </div>

          {!attendeeVotes.length ? (
            <div className="text-center text-sm text-gray-600 bg-gray-100 border border-gray-200 rounded-lg p-6">
              Waiting for the first travel window. Share the trip link to collect availability.
            </div>
          ) : (
            <>
              {recommended && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-6 text-blue-900">
                  <h2 className="text-lg font-semibold mb-2">Recommended trip window</h2>
                  <p className="text-base font-medium">
                    {format(recommended.start, 'EEE d MMM')} → {format(recommended.end, 'EEE d MMM yyyy')}
                  </p>
                  <p className="text-sm mt-1">
                    Works for <strong>{recommended.attendees.length}</strong>{' '}
                    {recommended.attendees.length === 1 ? 'person' : 'people'}.
                  </p>
                  <p className="text-xs mt-2">Attendees: {recommended.attendees.join(', ')}</p>
                </div>
              )}

              {heatMap && (
                <HeatMap
                  counts={heatMap.counts}
                  maxCount={heatMap.maxCount}
                  recommended={recommended}
                />
              )}

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-5 mt-6">
                <h3 className="text-md font-semibold mb-3">Attendee windows</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-600">
                        <th className="pb-2">Attendee</th>
                        <th className="pb-2">Windows</th>
                        <th className="pb-2">Preferred length</th>
                        <th className="pb-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendeeVotes.map((vote) => (
                        <tr key={vote.email || vote.name} className="border-t border-gray-200">
                          <td className="py-2 font-medium">{vote.name}</td>
                          <td className="py-2">
                            <div className="flex flex-wrap gap-2">
                              {vote.windows.map((window) => (
                                <span
                                  key={`${vote.name}-${window.start.toISOString()}-${window.end.toISOString()}`}
                                  className="inline-flex items-center px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs"
                                >
                                  {format(window.start, 'd MMM')} → {format(window.end, 'd MMM')}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2 text-xs text-gray-600">
                            {getHolidayDurationLabel(vote.preferredDuration) ||
                              getHolidayDurationLabel(vote.windows[0]?.preferredNights) ||
                              'Flexible'}
                          </td>
                          <td className="py-2 text-xs text-gray-500">{vote.message || '—'}</td>
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
          </div>
        </div>
      </div>
    </>
  );
}

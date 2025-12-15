// pages/trip-results/[id].js
import Head from 'next/head';
import { useMemo, useState } from 'react';
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

/* -------------------- helpers -------------------- */
const serializeValue = (value) => {
  if (!value) return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, serializeValue(v)])
    );
  }
  return value;
};

const DEFAULT_MIN_TRIP_DAYS = 2;
const toDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const safeParseISO = (v) => {
  try {
    return typeof v === 'string' ? parseISO(v) : null;
  } catch {
    return null;
  }
};

/* -------------------- vote normalisation -------------------- */
const normaliseVotes = (votes) =>
  (votes || [])
    .map((v) => {
      const windows = [];
      (v.holidayChoices || []).forEach((c) => {
        const s = safeParseISO(c.start);
        const e = safeParseISO(c.end);
        if (s && e && s <= e) {
          windows.push({
            start: toDay(s),
            end: toDay(e),
            preferredNights: c.preferredNights || c.preferredDuration || '',
          });
        }
      });
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

/* -------------------- counts helpers -------------------- */
const buildDayCounts = (start, end, votes) => {
  const counts = new Map();
  for (const v of votes) {
    const keyBase = v.id || v.email || v.name || 'x';
    for (const w of v.windows) {
      let d = toDay(w.start);
      while (d <= w.end) {
        const k = d.getTime();
        if (!counts.has(k)) counts.set(k, { voters: new Map() });
        counts.get(k).voters.set(keyBase, v.name);
        d = addDays(d, 1);
      }
    }
  }
  for (const [, v] of counts) v.count = v.voters.size;
  return counts;
};

const countsMapToPlain = (counts) => {
  const out = {};
  for (const [k, v] of counts.entries()) {
    out[k] = { voters: Array.from(v.voters.values()), count: v.count };
  }
  return out;
};

const countsPlainToMap = (plain) => {
  const m = new Map();
  Object.entries(plain || {}).forEach(([k, v]) => {
    const voters = new Map();
    (v.voters || []).forEach((name, i) => voters.set(`${k}_${i}`, name));
    m.set(Number(k), { voters, count: voters.size });
  });
  return m;
};

/* -------------------- server -------------------- */
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

  const cacheRef = adminDb.doc(`polls/${id}/computed/tripResults`);
  const cacheSnap = await cacheRef.get();

  if (cacheSnap.exists) {
    const cached = serializeValue(cacheSnap.data() || {});
    return {
      props: {
        poll,
        id,
        votes: cached.votes || [],
        computed: cached,
        cacheStatus: 'hit',
      },
    };
  }

  const votesSnap = await adminDb.collection('polls').doc(id).collection('votes').limit(200).get();
  const votesRaw = votesSnap.docs.map((d) => ({ id: d.id, ...serializeValue(d.data()) }));
  const votesNorm = normaliseVotes(votesRaw);

  const dates = (poll.dates || poll.selectedDates || []).map(safeParseISO).filter(Boolean).map(toDay);
  if (!dates.length) {
    return { props: { poll, id, votes: votesRaw, computed: {}, cacheStatus: 'miss' } };
  }

  const organiserDates = { start: dates[0], end: dates[dates.length - 1] };
  const counts = buildDayCounts(organiserDates.start, organiserDates.end, votesNorm);
  const maxCount = Math.max(0, ...Array.from(counts.values()).map((v) => v.count));

  const computed = {
    organiserDates: {
      start: organiserDates.start.toISOString(),
      end: organiserDates.end.toISOString(),
    },
    countsPlain: countsMapToPlain(counts),
    maxCount,
    totalAttendees: votesNorm.length,
    computedAt: new Date().toISOString(),
    votes: votesRaw,
  };

  await cacheRef.set(computed, { merge: true });

  return {
    props: {
      poll,
      id,
      votes: votesRaw,
      computed,
      cacheStatus: 'miss_computed',
    },
  };
}

/* -------------------- page -------------------- */
export default function TripResultsPage({ poll, votes, id, computed }) {
  const organiserDates = useMemo(() => {
    if (!computed?.organiserDates) return null;
    const s = safeParseISO(computed.organiserDates.start);
    const e = safeParseISO(computed.organiserDates.end);
    if (!s || !e) return null;
    return { start: toDay(s), end: toDay(e) };
  }, [computed]);

  const countsData = useMemo(() => {
    return {
      counts: countsPlainToMap(computed?.countsPlain),
      maxCount: computed?.maxCount || 0,
    };
  }, [computed]);

  return (
    <>
      <Head>
        <title>Trip availability</title>
      </Head>

      <div className="min-h-screen bg-gray-50 pt-6 pb-10 px-4">
        <div className="max-w-5xl mx-auto bg-white shadow-md rounded-2xl px-5 py-6">
          <LogoHeader isPro />

          <h1 className="text-2xl font-semibold text-center mt-4">
            Trip availability
          </h1>

          {organiserDates && (
            <p className="text-center text-sm text-gray-500 mt-2">
              {format(organiserDates.start, 'EEE d MMM')} to{' '}
              {format(organiserDates.end, 'EEE d MMM yyyy')}
            </p>
          )}

          <div className="text-center mt-6">
            <a
              href={`/trip/${id}`}
              className="inline-flex px-4 py-2 border border-blue-400 text-blue-600 rounded-md"
            >
              Add your availability
            </a>
          </div>

          <div className="text-center text-[11px] text-gray-400 mt-6">
            {computed?.computedAt &&
              `Cached results updated: ${format(
                parseISO(String(computed.computedAt)),
                'EEE d MMM yyyy HH:mm'
              )}`}
          </div>
        </div>
      </div>
    </>
  );
}

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { db } from '@/lib/firebase';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';
import { doc, getDoc } from 'firebase/firestore';
import Head from 'next/head';
import { format, parseISO, isValid } from 'date-fns';
import PollVotingForm from '@/components/PollVotingForm';
import PollShareButtons from '@/components/PollShareButtons';
import CountdownTimer from '@/components/CountdownTimer';
import LogoHeader from '@/components/LogoHeader';
import VenuePollExperience from '@/components/VenuePollExperience';
import SuggestedDatesCalendar from '@/components/SuggestedDatesCalendar';
import { serializeFirestoreData } from '@/utils/serializeFirestore';
import getPartnerOgImage from '@/utils/getPartnerOgImage';
import { OG_LOGO_IMAGE } from '@/lib/brandAssets';

const PAID_MEAL_KEYS = [];
const pollUsesPaidMeals = (poll) => {
  const includesPaid = (list) =>
    Array.isArray(list) && list.some((meal) => PAID_MEAL_KEYS.includes(meal));
  if (includesPaid(poll?.eventOptions?.mealTimes)) return true;
  const perDate = poll?.eventOptions?.mealTimesPerDate;
  if (perDate && typeof perDate === 'object') {
    return Object.values(perDate).some((value) => includesPaid(value));
  }
  return false;
};

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'evening'];
const DEFAULT_MEAL_KEYS = ['lunch', 'dinner'];
const MEAL_MESSAGE_LABELS = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  evening: 'drinks',
};

const formatMealList = (keys = []) => {
  const labels = keys
    .map((key) => MEAL_MESSAGE_LABELS[key] || key)
    .filter(Boolean);
  if (!labels.length) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, or ${labels[labels.length - 1]}`;
};

const pluralise = (count, singular, pluralOverride) => {
  const plural = pluralOverride || `${singular}s`;
  return `${count} ${count === 1 ? singular : plural}`;
};

export async function getServerSideProps(context) {
  const { id } = context.params;
  const pollRef = doc(db, 'polls', id);
  const pollSnap = await getDoc(pollRef);

  if (!pollSnap.exists()) {
    return { notFound: true };
  }

  const rawData = pollSnap.data() || {};
  const data = serializeFirestoreData(rawData) || {};
  const { lastClosingSoonReminder, lastPostDeadlineReminder, ...safeData } = data;

  const poll = {
    ...safeData,
    createdAt: safeData.createdAt || null,
    updatedAt: safeData.updatedAt || null,
    deadline: safeData.deadline || null,
    finalDate: safeData.finalDate || null,
    selectedDates: safeData.dates || safeData.selectedDates || [],
  };

  const partnerSlug = safeData.partnerSlug;

  let partner = null;
  if (partnerSlug) {
    try {
      const partnerRef = doc(db, 'partners', partnerSlug);
      const partnerSnap = await getDoc(partnerRef);
      if (partnerSnap.exists()) {
        partner = serializeFirestoreData({
          ...partnerSnap.data(),
          slug: partnerSnap.id,
        });
      }
    } catch (error) {
      console.error('poll partner fetch failed', error);
    }
  }

  let topPickSummary = null;
  try {
    const { db: adminDb } = await import('@/lib/firebaseAdmin');
    const adminPollRef = adminDb.collection('polls').doc(id);
    const votesSnap = await adminPollRef.collection('votes').get();
    if (!votesSnap.empty && Array.isArray(poll.selectedDates) && poll.selectedDates.length) {
      const normalizeTimestamp = (value) => {
        if (!value) return null;
        if (typeof value === 'string') return value;
        if (value instanceof Date) return value.toISOString();
        if (typeof value.toDate === 'function') {
          try {
            return value.toDate().toISOString();
          } catch {
            return null;
          }
        }
        return null;
      };

      const dedup = new Map();
      votesSnap.forEach((docSnap) => {
        const payload = docSnap.data() || {};
        const rawName = (payload.displayName || payload.name || '').trim();
        const key = rawName.toLowerCase();
        const updatedAt = normalizeTimestamp(payload.updatedAt);
        const createdAt = normalizeTimestamp(payload.createdAt);
        const timestamp = new Date(updatedAt || createdAt || 0).getTime() || 0;
        const entry = {
          ...payload,
          displayName: rawName || payload.displayName || payload.name || 'Someone',
          timestamp,
        };

        if (!key) {
          dedup.set(`${docSnap.id}-${timestamp}`, entry);
          return;
        }

        const existing = dedup.get(key);
        if (!existing || timestamp > existing.timestamp) {
          dedup.set(key, entry);
        }
      });

      const votes = Array.from(dedup.values());
      const summaries = poll.selectedDates.map((date) => {
        const yes = [];
        const maybe = [];
        const no = [];
        votes.forEach((vote) => {
          const response = vote.votes?.[date];
          const label = vote.displayName || vote.name || 'Someone';
          if (response === 'yes') {
            if (!yes.includes(label)) yes.push(label);
          } else if (response === 'maybe') {
            if (!maybe.includes(label)) maybe.push(label);
          } else if (response === 'no') {
            if (!no.includes(label)) no.push(label);
          }
        });
        return { date, yes, maybe, no };
      });

      const scored = summaries
        .map((summary) => {
          const yesCount = summary.yes.length;
          const maybeCount = summary.maybe.length;
          const noCount = summary.no.length;
          const total = yesCount + maybeCount + noCount;
          const score =
            total < 6 ? yesCount * 2 + maybeCount : yesCount * 2 + maybeCount - noCount;
          return { ...summary, yesCount, maybeCount, noCount, total, score };
        })
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (a.noCount !== b.noCount) return a.noCount - b.noCount;
          return new Date(a.date) - new Date(b.date);
        });

      if (scored[0] && scored[0].total > 0) {
        topPickSummary = {
          date: scored[0].date,
          yesCount: scored[0].yesCount,
          maybeCount: scored[0].maybeCount,
          noCount: scored[0].noCount,
          total: scored[0].total,
        };
      }
    }
  } catch (error) {
    console.error('poll top pick summary failed', error);
  }

  return {
    props: {
      poll,
      id,
      partner,
      topPickSummary: topPickSummary ? JSON.parse(JSON.stringify(topPickSummary)) : null,
    },
  };
}

const DEFAULT_OG_IMAGE = OG_LOGO_IMAGE;

const normalisePollDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return isValid(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsedIso = parseISO(value);
    if (isValid(parsedIso)) return parsedIso;
    const fallback = new Date(value);
    return isValid(fallback) ? fallback : null;
  }
  if (typeof value.toDate === 'function') {
    try {
      const candidate = value.toDate();
      return isValid(candidate) ? candidate : null;
    } catch {
      return null;
    }
  }
  return null;
};

const ensureIsoString = (value, parsedDate) => {
  if (typeof value === 'string') return value;
  if (parsedDate instanceof Date) return parsedDate.toISOString();
  return '';
};

export default function PollPage({ poll, id, partner, topPickSummary }) {
  const router = useRouter();

  useEffect(() => {
    logEventIfAvailable('vote_started', {
      pollId: id,
      eventTitle: poll?.eventTitle || 'Unknown'
    });
  }, [id, poll?.eventTitle]);

  const sortedDates = (poll?.selectedDates || [])
    .map((entry) => {
      const parsedDate = normalisePollDate(entry);
      if (!parsedDate) return null;
      return {
        raw: ensureIsoString(entry, parsedDate),
        date: parsedDate,
        formatted: format(parsedDate, 'EEEE do MMMM yyyy'),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date - b.date);

  const organiser = poll?.organiserFirstName || 'Someone';
  const eventTitle = poll?.eventTitle || 'an event';
  const location = poll?.location || 'somewhere';
  const finalDate = poll?.finalDate;
  const pollEventType = poll?.eventType || 'general';
  const isProPoll =
    poll?.planType === 'pro' ||
    poll?.organiserPlanType === 'pro' ||
    poll?.unlocked ||
    poll?.organiserUnlocked ||
    pollUsesPaidMeals(poll);
  const hasLocation = Boolean(location && location !== 'somewhere');
  const mapEmbedUrl = hasLocation
    ? `https://www.google.com/maps?q=${encodeURIComponent(location)}&output=embed`
    : null;
  const mapExternalUrl = hasLocation
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
    : null;
  const mealOptionsOffered = (() => {
    if (pollEventType !== 'meal') return [];
    const allowed = new Set();
    const addKey = (key) => {
      if (!key || !MEAL_ORDER.includes(key)) return;
      if (!isProPoll && PAID_MEAL_KEYS.includes(key)) return;
      allowed.add(key);
    };
    const globalTimes = poll?.eventOptions?.mealTimes;
    if (Array.isArray(globalTimes) && globalTimes.length) {
      globalTimes.forEach(addKey);
    }
    const perDate = poll?.eventOptions?.mealTimesPerDate;
    if (perDate && typeof perDate === 'object') {
      Object.values(perDate).forEach((value) => {
        if (Array.isArray(value)) value.forEach(addKey);
      });
    }
    if (!allowed.size) {
      DEFAULT_MEAL_KEYS.forEach(addKey);
    }
    return MEAL_ORDER.filter((key) => allowed.has(key));
  })();
  const mealSummaryText = formatMealList(mealOptionsOffered);
  const mealMessageBody = mealSummaryText || 'the available meal slots';
  const mealMessageVerb =
    mealSummaryText && mealOptionsOffered.length === 1
      ? mealOptionsOffered[0] === 'evening'
        ? 'work'
        : 'works'
      : 'work';
  const isVenuePoll = Boolean(partner?.slug);
  const pollDatesForCalendar = sortedDates.map((d) => d.raw).filter(Boolean);
  const topPickDateISO = topPickSummary?.date || null;
  const hasTopPickVotes = Boolean(topPickSummary?.total);
  const topPickFormattedDate = topPickDateISO ? format(parseISO(topPickDateISO), 'EEEE do MMMM yyyy') : null;
  const topPickCountsLine = hasTopPickVotes
    ? [
        pluralise(topPickSummary.yesCount, 'going', 'going'),
        pluralise(topPickSummary.maybeCount, 'maybe'),
        pluralise(topPickSummary.noCount, "can't make it", "can't make it"),
      ].join(' · ')
    : '';
  useEffect(() => {
    if (pollEventType === 'holiday') {
      router.replace(`/trip/${id}`);
    }
  }, [pollEventType, id, router]);
  if (pollEventType === 'holiday') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading trip calendar…
      </div>
    );
  }
  const holidayWindowStart = pollEventType === 'holiday' && sortedDates.length ? sortedDates[0].formatted : '';
  const holidayWindowEnd = pollEventType === 'holiday' && sortedDates.length ? sortedDates[sortedDates.length - 1].formatted : '';
  const holidayProposedDuration = pollEventType === 'holiday' ? getHolidayDurationLabel(poll?.eventOptions?.proposedDuration) : '';


  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://plan.setthedate.app';
  const pollUrl = `${baseUrl}/poll/${id}`;
  const deadlineDate = poll?.deadline ? new Date(poll.deadline) : null;
  const deadlineSummary =
    deadlineDate && !Number.isNaN(deadlineDate.getTime())
      ? format(deadlineDate, 'EEE d MMM yyyy, h:mm a')
      : '';

  const now = new Date();
  const deadline = deadlineDate && !Number.isNaN(deadlineDate.getTime()) ? deadlineDate : null;
  const isPollExpired = deadline ? now > deadline : false;

  const handleResultsClick = () => {
    logEventIfAvailable('see_results_clicked', {
      pollId: id,
      eventTitle: poll?.eventTitle || 'Unknown'
    });
    router.push(`/results/${id}`);
  };

  const handleSuggestClick = () => {
    logEventIfAvailable('suggest_change_clicked', { pollId: id });
  };

  const handleShare = (platform) =>
    logEventIfAvailable('attendee_shared_poll', {
      platform,
      pollId: id,
      eventTitle: poll?.eventTitle || 'Unknown',
    });

  const ogImage = getPartnerOgImage(partner, DEFAULT_OG_IMAGE);
  const pageHead = (
    <Head>
      <title>{`${organiser} is planning ${eventTitle} in ${location}`}</title>
      <meta property="og:title" content={`${organiser} is planning ${eventTitle} in ${location}`} />
      <meta property="og:description" content={`Vote now to help choose a date for ${eventTitle}`} />
      <meta property="og:image" content={OG_LOGO_IMAGE} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:url" content={pollUrl} />
      <meta property="og:type" content="website" />
      <meta name="twitter:image" content={OG_LOGO_IMAGE} />
    </Head>
  );

  if (isVenuePoll) {
    return (
      <>
        {pageHead}
        <VenuePollExperience
          partner={partner}
          poll={poll}
          pollId={id}
          pollUrl={pollUrl}
          pollDates={pollDatesForCalendar}
          organiser={organiser}
          eventTitle={eventTitle}
          location={location}
          mealMessageBody={mealMessageBody}
          mealMessageVerb={mealMessageVerb}
          pollEventType={pollEventType}
          finalDate={finalDate}
          isPollExpired={Boolean(isPollExpired)}
          pollDeadline={poll?.deadline || null}
          deadlineSummary={deadlineSummary}
          onResultsClick={handleResultsClick}
          onSuggestClick={handleSuggestClick}
          onShare={handleShare}
        />
      </>
    );
  }

  return (
    <>
      {pageHead}

      <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-6 sm:max-w-2xl lg:max-w-3xl">
        <LogoHeader isPro={isProPoll} />

        <div className="bg-yellow-100 border border-yellow-300 text-yellow-800 p-3 mb-4 rounded text-center font-semibold">
          🎉 {organiser} is planning {eventTitle} — add which dates work for you!
        </div>

        <div className="flex items-center justify-center gap-2 mb-3 text-sm text-gray-700 font-medium">
          <img
            src="https://cdn-icons-png.flaticon.com/512/684/684908.png"
            alt="Location Icon"
            className="w-4 h-4"
          />
          <span>{location}</span>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm mb-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Location map</p>
            {mapExternalUrl ? (
              <a
                href={mapExternalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline decoration-dotted"
              >
                Open map
              </a>
            ) : null}
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 sm:items-stretch">
            <div className="min-w-0 sm:h-full">
              {mapEmbedUrl ? (
                <iframe
                  title={`Map for ${eventTitle || 'event location'}`}
                  src={mapEmbedUrl}
                  className="h-56 w-full rounded-2xl border border-slate-100 sm:h-full sm:min-h-[14rem]"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              ) : (
                <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-500 sm:h-full sm:min-h-[14rem]">
                  Add a location to preview it on the map.
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm min-w-0">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Calendar</p>
              <p className="text-[11px] text-slate-500">Highlighted days show the options you&apos;re picking between.</p>
              <SuggestedDatesCalendar
                dates={pollDatesForCalendar}
                showIntro={false}
                className="mt-3 w-full border-0 shadow-none p-0 bg-transparent"
                featuredDate={topPickDateISO}
              />
            </div>
          </div>
        </div>

        {hasTopPickVotes && topPickFormattedDate && (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm mb-4">
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-700">Top pick so far</p>
            <p className="text-lg font-semibold text-emerald-900">{topPickFormattedDate}</p>
            <p className="text-sm text-emerald-800">{topPickCountsLine}</p>
          </div>
        )}

        {hasTopPickVotes && (
          <div className="mb-4 rounded-3xl border border-emerald-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-700">See results</p>
                <p className="text-sm text-emerald-800">Check who has voted and which dates they can make.</p>
              </div>
              <button
                type="button"
                onClick={handleResultsClick}
                className="inline-flex items-center justify-center rounded-full border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                See who&apos;s voted
              </button>
            </div>
          </div>
        )}

        {pollEventType === 'meal' && (
          <div className="text-sm text-green-800 bg-green-50 border border-green-200 rounded p-3 mb-4 text-center">
            Let {organiser} know if {mealMessageBody} {mealMessageVerb} each day you can make it.
          </div>
        )}

        {pollEventType === 'holiday' && (
          <div className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded p-3 mb-4 text-center space-y-1">
            <p>Tell {organiser} your earliest start, latest end, and how many days you can travel so they can pick the best window.</p>
            {holidayWindowStart && holidayWindowEnd && (
              <p className="font-semibold">Window: {holidayWindowStart} to {holidayWindowEnd}</p>
            )}
            {holidayProposedDuration && (
              <p className="text-xs">Suggested trip length: {holidayProposedDuration}</p>
            )}
          </div>
        )}

        {finalDate && (
          <div className="text-center bg-green-100 border border-green-300 text-green-800 font-medium p-3 rounded mb-4">
            ✅ Final Date Locked In: {format(new Date(finalDate), 'EEEE do MMMM yyyy')}
          </div>
        )}

        {deadline && <CountdownTimer deadline={deadline} />}

        {isPollExpired && (
          <div className="text-center text-red-600 font-semibold mt-6 mb-4">
            ⏳ Voting has closed — but you can still share your availability and leave a message for the organiser.
          </div>
        )}

        <PollVotingForm
          poll={{
            ...poll,
            dates: sortedDates.map(d => d.raw), // force sorted order
            selectedDates: sortedDates.map(d => d.raw), // just in case other components use it
          }}
          pollId={id}
          organiser={organiser}
          eventTitle={eventTitle}
          fullWidth
          topPickDate={topPickDateISO}
        />



        <button
          onClick={handleResultsClick}
          className="mt-4 border border-black text-black px-4 py-2 rounded w-full font-semibold"
        >
          See Results
        </button>

        <div className="mt-6 flex justify-center">
          <a
            href={`/suggest/${id}`}
            onClick={handleSuggestClick}
            className="inline-flex items-center gap-2 px-4 py-2 border border-blue-500 text-blue-600 rounded-md font-medium hover:bg-blue-50"
          >
            <img
              src="https://cdn-icons-png.flaticon.com/512/1827/1827344.png"
              alt="Message Icon"
              className="w-5 h-5"
            />
            Suggest a change to the organiser
          </a>
        </div>

        <PollShareButtons
          pollUrl={pollUrl}
          organiser={organiser}
          eventTitle={eventTitle}
          location={location}
          onShare={handleShare}
        />

        <div className="text-center mt-6">
          <a
            href="/"
            className="inline-flex items-center text-blue-600 font-semibold hover:underline"
          >
            <img
              src="https://cdn-icons-png.flaticon.com/512/747/747310.png"
              alt="Calendar"
              className="w-5 h-5 mr-2"
            />
            Create Your Own Event
          </a>
        </div>

        <div className="text-center mt-10">
          <a
            href="https://buymeacoffee.com/setthedate"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block"
          >
            <img
              src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
              alt="Buy Me a Coffee"
              className="h-12 mx-auto"
            />
          </a>
        </div>
      </div>
    </>
  );
}

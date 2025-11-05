import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { db } from '@/lib/firebase';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';
import { doc, getDoc } from 'firebase/firestore';
import Head from 'next/head';
import { format } from 'date-fns';
import PollVotingForm from '@/components/PollVotingForm';
import PollShareButtons from '@/components/PollShareButtons';
import CountdownTimer from '@/components/CountdownTimer';
import LogoHeader from '@/components/LogoHeader';

const pollUsesPaidMeals = (poll) => {
  const includesEvening = (list) =>
    Array.isArray(list) && list.includes('evening');
  if (includesEvening(poll?.eventOptions?.mealTimes)) return true;
  const perDate = poll?.eventOptions?.mealTimesPerDate;
  if (perDate && typeof perDate === 'object') {
    return Object.values(perDate).some((value) => includesEvening(value));
  }
  return false;
};

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'evening'];
const PAID_MEAL_KEYS = ['evening'];
const DEFAULT_MEAL_KEYS = ['lunch', 'dinner'];
const MEAL_MESSAGE_LABELS = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  evening: 'an evening out',
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

export async function getServerSideProps(context) {
  const { id } = context.params;
  const pollRef = doc(db, 'polls', id);
  const pollSnap = await getDoc(pollRef);

  if (!pollSnap.exists()) {
    return { notFound: true };
  }

  const data = pollSnap.data();

  const poll = {
    ...data,
    createdAt: data.createdAt?.toDate().toISOString() || null,
    updatedAt: data.updatedAt?.toDate().toISOString() || null,
    deadline: data.deadline?.toDate().toISOString() || null,
    finalDate: data.finalDate || null,
    selectedDates: data.dates || data.selectedDates || [],
  };

  return {
    props: { poll, id },
  };
}

export default function PollPage({ poll, id }) {
  const router = useRouter();

  useEffect(() => {
    logEventIfAvailable('vote_started', {
      pollId: id,
      eventTitle: poll?.eventTitle || 'Unknown'
    });
  }, [id, poll?.eventTitle]);

  const sortedDates = (poll?.selectedDates || [])
    .map(dateStr => {
      if (!dateStr || typeof dateStr !== 'string') return null;

      const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
      const jsDate = new Date(year, month - 1, day);

      return {
        raw: dateStr,
        date: jsDate,
        formatted: format(jsDate, 'EEEE do MMMM yyyy')
      };
    })
    .filter(d => d?.date instanceof Date && !isNaN(d.date))
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
    mealSummaryText && mealOptionsOffered.length === 1 ? 'works' : 'work';
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

  const now = new Date();
  const deadline = poll?.deadline ? new Date(poll.deadline) : null;
  const isPollExpired = deadline && now > deadline;

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


  return (
    <>
      <Head>
        <title>{`${organiser} is planning ${eventTitle} in ${location}`}</title>
        <meta property="og:title" content={`${organiser} is planning ${eventTitle} in ${location}`} />
        <meta property="og:description" content={`Vote now to help choose a date for ${eventTitle}`} />
        <meta property="og:image" content="https://plan.setthedate.app/logo.png" />
        <meta property="og:url" content={pollUrl} />
        <meta property="og:type" content="website" />
      </Head>

      <div className="max-w-md mx-auto p-4">
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

        {poll?.deadline && <CountdownTimer deadline={poll.deadline} />}

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
          onShare={(platform) =>
            logEventIfAvailable('attendee_shared_poll', {
              platform,
              pollId: id,
              eventTitle: poll?.eventTitle || 'Unknown'
            })
          }
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

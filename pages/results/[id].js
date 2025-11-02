// pages/results/[id].js
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import confetti from 'canvas-confetti';
import Head from 'next/head';
import ShareButtons from '@/components/ShareButtons';
import CountdownTimer from '@/components/CountdownTimer';
import FinalisePollActions from '@/components/FinalisePollActions';

const ALL_MEALS = ['breakfast', 'lunch', 'dinner'];

/* ---------------- Scoring ---------------- */
function getSmartScoredDates(voteSummary) {
  return voteSummary
    .map(date => {
      const yesCount = date.yes.length;
      const maybeCount = date.maybe.length;
      const noCount = date.no.length;
      const totalVoters = yesCount + maybeCount + noCount;

      const score =
        totalVoters < 6
          ? yesCount * 2 + maybeCount * 1
          : yesCount * 2 + maybeCount * 1 - noCount * 1;

      return { ...date, score, totalVoters };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.no.length !== b.no.length) return a.no.length - b.no.length;
      return new Date(a.date) - new Date(b.date);
    });
}

function toTitleCase(name) {
  return name
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/* ------------- Meal helpers -------------- */

// Enabled meals for a specific date: per-date override → global → default to all
function enabledMealsForDate(poll, dateISO) {
  const perDate = poll?.eventOptions?.mealTimesPerDate?.[dateISO];
  if (Array.isArray(perDate) && perDate.length) {
    return ALL_MEALS.filter(m => perDate.includes(m));
  }
  const global =
    Array.isArray(poll?.eventOptions?.mealTimes) && poll.eventOptions.mealTimes.length
      ? poll.eventOptions.mealTimes
      : ALL_MEALS;
  return ALL_MEALS.filter(m => global.includes(m));
}

// Build per-date meal summary from all votes (breakfast + lunch + dinner + either)
function buildMealSummary(poll, votes) {
  const out = {};
  (poll?.dates || []).forEach(d => {
    out[d] = { breakfast: [], lunch: [], dinner: [], either: [] };
  });
  votes.forEach(v => {
    const prefs = v.mealPreferences || {};
    const display = v.displayName || v.name || 'Someone';
    Object.keys(out).forEach(date => {
      const pref = prefs[date];
      if (!pref || !out[date][pref]) return;
      if (!out[date][pref].includes(display)) out[date][pref].push(display);
    });
  });
  return out;
}

// Decide the meal for a date.
// Pick the largest among breakfast/lunch/dinner.
// If all three are 0 but "either" has votes, return "either".
// For ties, prefer dinner → lunch → breakfast.
function pickMealForDate(mealSummaryForDate) {
  if (!mealSummaryForDate) return null;
  const b = mealSummaryForDate.breakfast?.length || 0;
  const l = mealSummaryForDate.lunch?.length || 0;
  const d = mealSummaryForDate.dinner?.length || 0;
  const e = mealSummaryForDate.either?.length || 0;

  const max = Math.max(b, l, d);
  if (max === 0) return e > 0 ? 'either' : null;

  // Tie-breaker: dinner > lunch > breakfast
  const candidates = [];
  if (d === max) candidates.push('dinner');
  if (l === max) candidates.push('lunch');
  if (b === max) candidates.push('breakfast');
  return ['dinner', 'lunch', 'breakfast'].find(x => candidates.includes(x)) || candidates[0];
}

const mealChoiceLabels = {
  breakfast: 'Breakfast works best',
  lunch: 'Lunch works best',
  dinner: 'Dinner works best',
  either: 'Either works',
};

/* --------------- Component --------------- */
export default function ResultsPage() {
  const router = useRouter();
  const { id } = router.query;

  const [poll, setPoll] = useState(null);
  const [votes, setVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const hasFiredConfetti = useRef(false);
  const [isOrganiser, setIsOrganiser] = useState(false);

  useEffect(() => {
    if (!router.isReady || !id) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        // Poll
        const pollRef = doc(db, 'polls', id);
        const pollSnap = await getDoc(pollRef);
        if (!pollSnap.exists()) {
          setLoading(false);
          return;
        }
        const pollData = { ...pollSnap.data(), id };
        setPoll(pollData);

        // Redirect holiday polls
        if (pollData.eventType === 'holiday') {
          router.replace(`/trip-results/${id}`);
          return;
        }

        // Votes
        const votesSnap = await getDocs(collection(db, 'polls', id, 'votes'));
        const allVotes = votesSnap.docs.map(d => d.data());

        // Deduplicate by display/name, keep most recent (uses createdAt.seconds fallback)
        const deduped = {};
        allVotes.forEach(vote => {
          const rawName = (vote.displayName || vote.name || '').trim();
          const key = rawName.toLowerCase();
          if (!key) return;
          const ts = vote.updatedAt?.seconds || vote.createdAt?.seconds || 0;
          const exTs = deduped[key]?.updatedAt?.seconds || deduped[key]?.createdAt?.seconds || 0;
          if (!deduped[key] || ts > exTs) {
            deduped[key] = { ...vote, displayName: toTitleCase(rawName) };
          }
        });

        setVotes(Object.values(deduped));

        // Identify organiser
        if (router.query.token && pollData.editToken) {
          setIsOrganiser(router.query.token === pollData.editToken);
        }
      } catch (error) {
        console.error('Error fetching poll data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router.isReady, id, router]);

  const handleReveal = () => {
    setRevealed(true);
    if (!hasFiredConfetti.current) {
      hasFiredConfetti.current = true;
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
  };

  if (loading) return <p className="p-4">Loading...</p>;
  if (!poll) return <p className="p-4">Poll not found.</p>;

  // Vote summary per date
  const voteSummary = (poll.dates || []).map(date => {
    const yes = [];
    const maybe = [];
    const no = [];
    votes.forEach(v => {
      const res = v.votes?.[date];
      const display = v.displayName || v.name || 'Someone';
      if (res === 'yes' && !yes.includes(display)) yes.push(display);
      else if (res === 'maybe' && !maybe.includes(display)) maybe.push(display);
      else if (res === 'no' && !no.includes(display)) no.push(display);
    });
    return { date, yes, maybe, no };
  });

  const sortedByScore = getSmartScoredDates(voteSummary);
  const suggested = sortedByScore[0];

  const voteSummaryChrono = [...voteSummary].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  const organiser = poll.organiserFirstName || 'Someone';
  const eventTitle = poll.eventTitle || 'an event';
  const location = poll.location || 'somewhere';
  const pollUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/poll/${id}` : '';

  const attendeeMessages = votes.filter(v => v.message?.trim());

  const deadlineISO = poll?.deadline?.toDate ? poll.deadline.toDate().toISOString() : null;
  const votingClosed = deadlineISO && new Date() > new Date(deadlineISO);
  const winningDate = suggested?.date
    ? format(parseISO(suggested.date), 'EEEE do MMMM yyyy')
    : null;

  // Meal summaries and winner meal
  const isMealEvent = (poll.eventType || 'general') === 'meal';
  const mealSummaryByDate = isMealEvent ? buildMealSummary(poll, votes) : {};
  let winnerMeal = null;
  if (isMealEvent && suggested?.date) {
    winnerMeal = pickMealForDate(mealSummaryByDate[suggested.date]);
  }

  // Share message
  const shareMessage =
    votingClosed && winningDate
      ? `🎉 The date is set! "${eventTitle}" is happening on ${winningDate}${winnerMeal && winnerMeal !== 'either' ? ` - ${winnerMeal}` : ''} in ${location}. See who’s coming 👉 ${pollUrl}`
      : `Help choose the best date for "${eventTitle}" in ${location}. Cast your vote 👉 ${pollUrl}`;

  const emailSubject = votingClosed
    ? `Final Date Set for ${eventTitle}`
    : `Vote on Dates for ${eventTitle}`;

  const deadlinePassed = new Date(poll.deadline?.toDate?.()) < new Date();
  const hasFinalDate = Boolean(poll.finalDate);
  const suggestedDate = suggested?.date;

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <Head>
        <title>{organiser}'s {eventTitle} in {location}</title>
        <meta property="og:title" content={`Results for ${eventTitle}`} />
        <meta property="og:description" content={`See the final date for ${eventTitle} on Set The Date`} />
        <meta property="og:image" content="https://plan.setthedate.app/logo.png" />
        <meta property="og:url" content={pollUrl} />
      </Head>

      <img src="/images/setthedate-logo.png" alt="Set The Date Logo" className="h-32 mx-auto mb-6" />

      <h1 className="text-2xl font-bold text-center mb-2">Suggested {eventTitle} Date</h1>
      <p className="text-center text-gray-600 mb-1">📍 {location}</p>
      {deadlineISO && <p className="text-center text-blue-600 font-medium"><CountdownTimer deadline={deadlineISO} /></p>}

      {!revealed && (
        <div onClick={handleReveal} className="mt-4 p-3 bg-green-100 text-green-800 border border-green-300 text-center rounded font-semibold cursor-pointer hover:bg-green-200">
          🎉 Tap to reveal the current winning date
        </div>
      )}

      {revealed && suggested && (() => {
        let mealBit = '';
        if (isMealEvent) {
          if (winnerMeal === 'dinner') mealBit = ' - dinner';
          else if (winnerMeal === 'lunch') mealBit = ' - lunch';
          else if (winnerMeal === 'breakfast') mealBit = ' - breakfast';
          else if (winnerMeal === 'either') mealBit = ' - any meal works';
        }
        return (
          <div className="mt-4 p-4 bg-green-100 border border-green-300 text-green-800 text-center rounded font-semibold text-lg animate-pulse">
            🎉 Your event date is set for {winningDate}{mealBit}!
          </div>
        );
      })()}

      {hasFinalDate ? (
        <div className="bg-green-100 border border-green-300 text-green-800 p-3 mb-4 rounded text-center font-semibold">
          ✅ {poll.eventTitle} is scheduled for {format(parseISO(poll.finalDate), 'EEEE do MMMM yyyy')} in {poll.location}.
        </div>
      ) : deadlinePassed ? (
        isOrganiser ? (
          <FinalisePollActions poll={poll} suggestedDate={suggestedDate} />
        ) : (
          <div className="text-center text-gray-600 mb-4">
            ⏳ Voting has closed. The final date will be announced soon.
          </div>
        )
      ) : null}

      {voteSummaryChrono.map(day => {
        // Per-date enabled meals and display options
        const enabled = isMealEvent ? enabledMealsForDate(poll, day.date) : [];
        const mealOptionsForDate = isMealEvent
          ? (enabled.length > 1 ? [...enabled, 'either'] : enabled)
          : [];

        return (
          <div key={day.date} className="border p-4 mt-4 rounded shadow-sm">
            <h3 className="font-semibold mb-2">{format(parseISO(day.date), 'EEEE do MMMM yyyy')}</h3>

            <div className="grid grid-cols-3 text-center text-sm">
              <div>✅ Can Attend<br />{day.yes.length}<br /><span className="text-xs">{day.yes.join(', ') || '-'}</span></div>
              <div>🤔 Maybe<br />{day.maybe.length}<br /><span className="text-xs">{day.maybe.join(', ') || '-'}</span></div>
              <div>❌ No<br />{day.no.length}<br /><span className="text-xs">{day.no.join(', ') || '-'}</span></div>
            </div>

            {/* Meal preferences: hide rows that have zero responses */}
            {isMealEvent && mealOptionsForDate.length > 0 && (() => {
              const summary = mealSummaryByDate[day.date] || { breakfast: [], lunch: [], dinner: [], either: [] };
              const rows = mealOptionsForDate
                .map(opt => ({ opt, list: summary[opt] || [] }))
                .filter(({ list }) => (list?.length || 0) > 0);

              if (rows.length === 0) return null;

              return (
                <div className="mt-3 bg-green-50 border border-green-200 rounded p-3 text-xs text-left">
                  <p className="font-semibold text-green-800 mb-2">Meal preferences</p>
                  <div className="space-y-1">
                    {rows.map(({ opt, list }) => (
                      <div key={`${day.date}-${opt}`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                        <span className="font-medium">{mealChoiceLabels[opt] || opt}</span>
                        <span className="text-green-900">{`${list.length} — ${list.join(', ')}`}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })}

      {attendeeMessages.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-3">💬 Messages from attendees</h2>
          <ul className="space-y-3">
            {attendeeMessages.map((v, i) => (
              <li key={i} className="border p-3 rounded bg-gray-50 text-sm">
                <strong>{v.displayName || v.name || 'Someone'}:</strong><br />
                <span>{v.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-10 p-6 bg-yellow-50 border border-yellow-300 rounded-lg text-center">
        <h2 className="text-xl font-semibold mb-3">📢 Share the Final Plan</h2>
        <p className="text-gray-700 text-base mb-4 max-w-sm mx-auto">
          {votingClosed
            ? `Let friends know ${organiser} set the date for "${eventTitle}" in ${location}.`
            : `Spread the word, there is still time to vote on "${eventTitle}" in ${location}!`}
        </p>
        <ShareButtons shareUrl={pollUrl} shareMessage={shareMessage} />
      </div>

      <div className="text-center mt-8 space-y-4">
        <a href={`/poll/${id}`} className="inline-block bg-white text-blue-600 font-medium border border-blue-600 rounded px-4 py-2 text-sm hover:bg-blue-50">
          ← Back to voting page
        </a>

        <div>
          <a href="/" className="inline-flex items-center text-blue-600 font-semibold hover:underline">
            <img src="https://cdn-icons-png.flaticon.com/512/747/747310.png" alt="Calendar icon" className="w-5 h-5 mr-2" />
            Create Your Own Event
          </a>
        </div>

        <div>
          <a href="https://buymeacoffee.com/eveningout" target="_blank" rel="noopener noreferrer">
            <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" className="h-12 mx-auto" />
          </a>
        </div>
      </div>
    </div>
  );
}

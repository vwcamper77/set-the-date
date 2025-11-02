// pages/results/[id].js
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { format, parseISO } from "date-fns";
import confetti from "canvas-confetti";
import Head from "next/head";
import ShareButtons from "@/components/ShareButtons";
import CountdownTimer from "@/components/CountdownTimer";
import FinalisePollActions from "@/components/FinalisePollActions";

const KNOWN_MEALS = ["breakfast", "lunch", "dinner"];
const DEFAULT_MEALS = ["lunch", "dinner"];
const MEAL_PRIORITY = { breakfast: 1, lunch: 2, dinner: 3 };

const mealNameLabels = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

function dayKey(iso) {
  return (iso || "").slice(0, 10);
}

function toTitleCase(name = "") {
  return name
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/* ----------- SCORE ------------ */
function getSmartScoredDates(voteSummary) {
  return voteSummary
    .map((date) => {
      const yesCount = date.yes.length;
      const maybeCount = date.maybe.length;
      const noCount = date.no.length;
      const totalVoters = yesCount + maybeCount + noCount;
      const score =
        totalVoters < 6
          ? yesCount * 2 + maybeCount
          : yesCount * 2 + maybeCount - noCount;
      return { ...date, score, totalVoters };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.no.length !== b.no.length) return a.no.length - b.no.length;
      return new Date(a.date) - new Date(b.date);
    });
}

/* ----------- MEALS ------------ */
function enabledMealsForDate(poll, dateISO) {
  const key = dayKey(dateISO);
  const perDate = poll?.eventOptions?.mealTimesPerDate?.[key];
  if (Array.isArray(perDate) && perDate.length) {
    return KNOWN_MEALS.filter((m) => perDate.includes(m));
  }
  const global =
    Array.isArray(poll?.eventOptions?.mealTimes) &&
    poll.eventOptions.mealTimes.length
      ? poll.eventOptions.mealTimes
      : DEFAULT_MEALS;
  return KNOWN_MEALS.filter((m) => global.includes(m));
}

/** Build summary of meal choices per date, and attach the voter's availability vote for that date.
 *  Output shape: { [dateISO]: { breakfast: [{name, vote}], lunch: [...], dinner: [...] } }
 */
function buildMealSummary(poll, votes) {
  const out = {};
  (poll?.dates || []).forEach((d) => {
    out[d] = { breakfast: [], lunch: [], dinner: [] };
  });

  votes.forEach((v) => {
    const prefs = v.mealPreferences || {};
    const display = v.displayName || v.name || "Someone";
    Object.keys(out).forEach((date) => {
      const raw = prefs[date];
      const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
      const availability = v.votes?.[date] || "yes"; // yes/maybe/no
      arr.forEach((meal) => {
        if (!out[date][meal]) return;
        out[date][meal].push({ name: display, vote: availability });
      });
    });
  });

  return out;
}

// choose winner meal for date: dinner > lunch > breakfast for tie
function pickMealForDate(summaryForDate) {
  if (!summaryForDate) return null;
  let best = null;
  KNOWN_MEALS.forEach((meal) => {
    const count = summaryForDate[meal]?.length || 0;
    if (!count) return;
    if (
      !best ||
      count > best.count ||
      (count === best.count && MEAL_PRIORITY[meal] > MEAL_PRIORITY[best.meal])
    ) {
      best = { meal, count };
    }
  });
  return best?.meal || null;
}

function suggestedMealFromEnabled(enabled) {
  if (enabled.includes("dinner")) return "dinner";
  if (enabled.includes("lunch")) return "lunch";
  if (enabled.includes("breakfast")) return "breakfast";
  return null;
}

const mealChoiceLabels = {
  breakfast: "Breakfast works best",
  lunch: "Lunch works best",
  dinner: "Dinner works best",
};

function normalizeMealValue(meal) {
  if (!meal) return null;
  return KNOWN_MEALS.includes(meal) ? meal : null;
}

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
        const pollRef = doc(db, "polls", id);
        const pollSnap = await getDoc(pollRef);
        if (!pollSnap.exists()) {
          setLoading(false);
          return;
        }
        const pollData = { ...pollSnap.data(), id };
        setPoll(pollData);
        if (pollData.eventType === "holiday") {
          router.replace(`/trip-results/${id}`);
          return;
        }

        const votesSnap = await getDocs(collection(db, "polls", id, "votes"));
        const allVotes = votesSnap.docs.map((d) => d.data());
        const dedup = {};
        allVotes.forEach((v) => {
          const raw = (v.displayName || v.name || "").trim();
          const key = raw.toLowerCase();
          if (!key) return;
          const ts = v.updatedAt?.seconds || v.createdAt?.seconds || 0;
          const exTs =
            dedup[key]?.updatedAt?.seconds || dedup[key]?.createdAt?.seconds || 0;
          if (!dedup[key] || ts > exTs) {
            dedup[key] = { ...v, displayName: toTitleCase(raw) };
          }
        });
        setVotes(Object.values(dedup));

        if (router.query.token && pollData.editToken) {
          setIsOrganiser(router.query.token === pollData.editToken);
        }
      } catch (e) {
        console.error(e);
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

  const voteSummary = (poll.dates || []).map((date) => {
    const yes = [];
    const maybe = [];
    const no = [];
    votes.forEach((v) => {
      const res = v.votes?.[date];
      const display = v.displayName || v.name || "Someone";
      if (res === "yes" && !yes.includes(display)) yes.push(display);
      else if (res === "maybe" && !maybe.includes(display)) maybe.push(display);
      else if (res === "no" && !no.includes(display)) no.push(display);
    });
    return { date, yes, maybe, no };
  });

  const sortedByScore = getSmartScoredDates(voteSummary);
  const suggested = sortedByScore[0] || null;
  const voteSummaryChrono = [...voteSummary].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  const organiser = poll.organiserFirstName || "Someone";
  const eventTitle = poll.eventTitle || "an event";
  const location = poll.location || "somewhere";
  const mealMode =
    poll.eventType === "meal" &&
    (poll.eventOptions?.mealMode === "BLD" ||
      (Array.isArray(poll?.eventOptions?.mealTimes) &&
        poll.eventOptions.mealTimes.includes("breakfast")))
      ? "BLD"
      : "LD";

  // Build the poll URL (SSR-safe)
  const pollUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/poll/${id}`
      : (process.env.NEXT_PUBLIC_APP_URL
          ? `${process.env.NEXT_PUBLIC_APP_URL}/poll/${id}`
          : `/poll/${id}`);

  const attendeeMessages = votes.filter((v) => v.message?.trim());
  const deadlineISO = poll?.deadline?.toDate
    ? poll.deadline.toDate().toISOString()
    : null;
  const votingClosed = deadlineISO && new Date() > new Date(deadlineISO);
  const hasFinalDate = Boolean(poll.finalDate);
  const winningDateHuman = (hasFinalDate ? poll.finalDate : suggested?.date)
    ? format(
        parseISO(hasFinalDate ? poll.finalDate : suggested?.date),
        "EEEE do MMMM yyyy"
      )
    : null;

  const isMealEvent = (poll.eventType || "general") === "meal";
  const mealSummaryByDate = isMealEvent ? buildMealSummary(poll, votes) : {};
  let displayMeal = null;
  let suggestedMeal = null;
  if (isMealEvent) {
    if (hasFinalDate) {
      displayMeal = normalizeMealValue(poll.finalMeal);
    }

    if (!displayMeal && suggested?.date) {
      const enabled = enabledMealsForDate(poll, suggested.date);
      const winnerMeal = normalizeMealValue(
        pickMealForDate(mealSummaryByDate[suggested.date])
      );
      const fallbackMeal = normalizeMealValue(suggestedMealFromEnabled(enabled));
      suggestedMeal = winnerMeal || fallbackMeal;
      displayMeal = suggestedMeal || null;
    }
  }

  const displayMealName = displayMeal
    ? mealNameLabels[displayMeal] || toTitleCase(displayMeal)
    : null;

  const shareMessage =
    hasFinalDate && winningDateHuman
      ? `🎉 The date is set! "${eventTitle}" is happening on ${winningDateHuman}${
          isMealEvent && displayMealName ? ` - ${displayMealName}` : ""
        } in ${location}. See who's coming 👉 ${pollUrl}`
      : `Help choose the best date for "${eventTitle}" in ${location}. Cast your vote here 👉 ${pollUrl}`;

  const deadlinePassed = new Date(poll.deadline?.toDate?.()) < new Date();

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <Head>
        <title>
          {organiser}'s {eventTitle} in {location}
        </title>
      </Head>

      <img
        src="/images/setthedate-logo.png"
        alt="Set The Date Logo"
        className="h-32 mx-auto mb-6"
      />

      <h1 className="text-2xl font-bold text-center mb-2">
        Suggested {eventTitle} Date
      </h1>
      <p className="text-center text-gray-600 mb-1">📍 {location}</p>
      {deadlineISO && (
        <p className="text-center text-blue-600 font-medium">
          <CountdownTimer deadline={deadlineISO} />
        </p>
      )}

      {!revealed && suggested && (
        <div
          onClick={handleReveal}
          className="mt-4 p-3 bg-green-100 text-green-800 border border-green-300 text-center rounded font-semibold cursor-pointer hover:bg-green-200"
        >
          🎉 Tap to reveal the current winning date
        </div>
      )}

      {revealed && winningDateHuman && (
        <div className="mt-4 p-4 bg-green-100 border border-green-300 text-green-800 text-center rounded font-semibold text-lg animate-pulse">
          🎉 Your event date is set for {winningDateHuman}
          {isMealEvent && displayMealName ? ` - ${displayMealName}` : ""}!
        </div>
      )}

      {hasFinalDate ? (
        <div className="bg-green-100 border border-green-300 text-green-800 p-3 mb-4 rounded text-center font-semibold">
          ✅ {poll.eventTitle} is scheduled for{" "}
          {format(parseISO(poll.finalDate), "EEEE do MMMM yyyy")} in{" "}
          {poll.location}
          {isMealEvent && displayMealName ? ` - ${displayMealName}` : ""}.
        </div>
      ) : deadlinePassed ? (
        isOrganiser ? (
          <FinalisePollActions
            poll={poll}
            suggestedDate={suggested?.date || null}
            suggestedMeal={suggestedMeal || null}
            onFinalised={() => window.location.reload()}
          />
        ) : (
          <div className="text-center text-gray-600 mb-4">
            ⏳ Voting has closed. The final date will be announced soon.
          </div>
        )
      ) : null}

      {/* ---- Day summaries ---- */}
      {voteSummaryChrono.map((day) => {
        const enabled = isMealEvent ? enabledMealsForDate(poll, day.date) : [];
        const summary = isMealEvent ? mealSummaryByDate[day.date] || {} : {};
        const rows = isMealEvent
          ? enabled
              .map((opt) => ({ opt, list: summary[opt] || [] }))
              .filter(({ list }) => (list?.length || 0) > 0)
          : [];

        return (
          <div key={day.date} className="border p-4 mt-4 rounded shadow-sm">
            <h3 className="font-semibold mb-2">
              {format(parseISO(day.date), "EEEE do MMMM yyyy")}
            </h3>

            <div className="grid grid-cols-3 text-center text-sm">
              <div>
                ✅ Can Attend
                <br />
                {day.yes.length}
                <br />
                <span className="text-xs">{day.yes.join(", ") || "-"}</span>
              </div>
              <div>
                🤔 Maybe
                <br />
                {day.maybe.length}
                <br />
                <span className="text-xs">{day.maybe.join(", ") || "-"}</span>
              </div>
              <div>
                ❌ No
                <br />
                {day.no.length}
                <br />
                <span className="text-xs">{day.no.join(", ") || "-"}</span>
              </div>
            </div>

            {isMealEvent && rows.length > 0 && (
              <div className="mt-3 bg-green-50 border border-green-200 rounded p-3 text-xs text-left">
                <p className="font-semibold text-green-800 mb-2">
                  {mealMode === "BLD"
                    ? "Breakfast, lunch, or dinner votes"
                    : "Lunch or dinner votes"}
                </p>
                <div className="space-y-1">
                  {rows.map(({ opt, list }) => {
                    const label =
                      mealChoiceLabels[opt]
                        ? mealChoiceLabels[opt].replace("works best", "votes")
                        : `${toTitleCase(opt)} votes`;

                    const namesWithIcons = list
                      .map((p) => `${p.vote === "maybe" ? "🤔" : "✅"} ${p.name}`)
                      .join(", ");

                    return (
                      <div
                        key={`${day.date}-${opt}`}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
                      >
                        <span className="font-medium">{label}</span>
                        <span className="text-green-900">
                          {`${list.length} - ${namesWithIcons}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {attendeeMessages.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-3">
            💬 Messages from attendees
          </h2>
          <ul className="space-y-3">
            {attendeeMessages.map((v, i) => (
              <li key={i} className="border p-3 rounded bg-gray-50 text-sm">
                <strong>{v.displayName || v.name || "Someone"}:</strong>
                <br />
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
            : `Spread the word - there is still time to vote on "${eventTitle}" in ${location}!`}
        </p>
        <ShareButtons shareUrl={pollUrl} shareMessage={shareMessage} />
      </div>

      <div className="text-center mt-8 space-y-4">
        <a
          href={`/poll/${id}`}
          className="inline-block bg-white text-blue-600 font-medium border border-blue-600 rounded px-4 py-2 text-sm hover:bg-blue-50"
        >
          ← Back to voting page
        </a>
      </div>
    </div>
  );
}

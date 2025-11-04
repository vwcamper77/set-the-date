// pages/results/[id].js
import { useState, useRef } from "react";
import { format, parseISO } from "date-fns";
import confetti from "canvas-confetti";
import Head from "next/head";
import ShareButtons from "@/components/ShareButtons";
import CountdownTimer from "@/components/CountdownTimer";
import FinalisePollActions from "@/components/FinalisePollActions";
import LogoHeader from "@/components/LogoHeader";

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

function normaliseMealPreference(raw, allowedMeals = KNOWN_MEALS) {
  const allowed = Array.isArray(allowedMeals) ? allowedMeals.filter(Boolean) : [];
  if (!allowed.length) return { yes: [], maybe: [] };

  const yesSet = new Set();
  const maybeSet = new Set();

  const collect = (input, targetSet) => {
    if (Array.isArray(input)) {
      input.forEach((meal) => {
        if (allowed.includes(meal)) targetSet.add(meal);
      });
      return;
    }
    if (typeof input === "string" && allowed.includes(input)) {
      targetSet.add(input);
    }
  };

  if (Array.isArray(raw)) {
    collect(raw, yesSet);
  } else if (raw && typeof raw === "object") {
    collect(raw.yes ?? raw.definite ?? [], yesSet);
    collect(raw.maybe ?? raw.tentative ?? [], maybeSet);
  }

  const yes = allowed.filter((meal) => yesSet.has(meal));
  const maybe = allowed.filter((meal) => maybeSet.has(meal) && !yesSet.has(meal));

  return { yes, maybe };
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
      const allowed = enabledMealsForDate(poll, date);
      const selection = normaliseMealPreference(prefs[date], allowed);
      const availability = v.votes?.[date] || "yes"; // yes/maybe/no

      const pushEntry = (meal, state) => {
        if (!out[date][meal]) return;
        if (availability === "no") return;
        let voteState = state;
        if (availability === "maybe" && state === "yes") {
          voteState = "maybe";
        }
        out[date][meal].push({ name: display, vote: voteState, availability });
      };

      selection.yes.forEach((meal) => pushEntry(meal, "yes"));
      selection.maybe.forEach((meal) => pushEntry(meal, "maybe"));
    });
  });

  return out;
}

// choose winner meal for date: dinner > lunch > breakfast for tie
function pickMealForDate(summaryForDate) {
  if (!summaryForDate) return null;
  let best = null;
  KNOWN_MEALS.forEach((meal) => {
    const entries = summaryForDate[meal] || [];
    if (!entries.length) return;
    const yesVotes = entries.filter((p) => p.vote === "yes").length;
    const maybeVotes = entries.filter((p) => p.vote === "maybe").length;
    const score = yesVotes * 2 + maybeVotes;
    if (
      !best ||
      score > best.score ||
      (score === best.score &&
        (yesVotes > best.yes ||
          (yesVotes === best.yes &&
            MEAL_PRIORITY[meal] > MEAL_PRIORITY[best.meal])))
    ) {
      best = { meal, score, yes: yesVotes, maybe: maybeVotes };
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

const pluralise = (count, singular, pluralOverride) => {
  const plural = pluralOverride || `${singular}s`;
  return `${count} ${count === 1 ? singular : plural}`;
};

const formatNameList = (names = []) => {
  const filtered = names.filter(Boolean);
  if (!filtered.length) return "";
  if (filtered.length === 1) return filtered[0];
  if (filtered.length === 2) return `${filtered[0]} and ${filtered[1]}`;
  return `${filtered.slice(0, -1).join(", ")}, and ${filtered.slice(-1)}`;
};

export default function ResultsPage({ poll, votes, isOrganiser, pollId }) {
  const [revealed, setRevealed] = useState(false);
  const hasFiredConfetti = useRef(false);
  const id = pollId;

  const handleReveal = () => {
    setRevealed(true);
    if (!hasFiredConfetti.current) {
      hasFiredConfetti.current = true;
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
  };

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
  const isProPoll = poll.planType === "pro" || poll.unlocked;
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
      : `${process.env.NEXT_PUBLIC_APP_URL || ""}/poll/${id}`;

  const attendeeMessages = votes.filter((v) => v.message?.trim());
  const deadlineISO =
    typeof poll?.deadline === "string" && poll.deadline
      ? poll.deadline
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

  const deadlinePassed = deadlineISO
    ? new Date(deadlineISO) < new Date()
    : false;

  const suggestedSummaryLines = [];
  if (suggested) {
    const dateSummary = voteSummary.find((d) => d.date === suggested.date);
    if (dateSummary) {
      const yesCount = dateSummary.yes.length;
      const maybeCount = dateSummary.maybe.length;
      const noCount = dateSummary.no.length;
      const yesNames = dateSummary.yes;
      const maybeNames = dateSummary.maybe;

      const summaryParts = [];
      if (yesCount) summaryParts.push(`${pluralise(yesCount, "definite RSVP")}${yesNames.length ? ` (${formatNameList(yesNames)})` : ""}`);
      if (maybeCount) summaryParts.push(`${pluralise(maybeCount, "maybe")}${maybeNames.length ? ` (${formatNameList(maybeNames)})` : ""}`);
      if (!noCount) summaryParts.push("no declines");
      else summaryParts.push(`${pluralise(noCount, "decline")}`);
      suggestedSummaryLines.push(
        `${winningDateHuman || format(parseISO(suggested.date), "EEEE do MMMM yyyy")} has ${summaryParts.join(", ")}.`
      );

      const runnerUp = sortedByScore.find((d) => d.date !== suggested.date);
      if (runnerUp) {
        const runnerYes = runnerUp.yes.length;
        const runnerMaybe = runnerUp.maybe.length;
        const runnerNo = runnerUp.no.length;
        suggestedSummaryLines.push(
          `The next best date ${format(parseISO(runnerUp.date), "EEE d MMM")} only has ${pluralise(
            runnerYes,
            "definite"
          )} and ${pluralise(runnerNo, "decline")}${runnerMaybe ? `, plus ${pluralise(runnerMaybe, "maybe")}` : ""}.`
        );
      }

      if (isMealEvent && (displayMeal || suggestedMeal)) {
        const mealKey = displayMeal || suggestedMeal;
        const mealEntries = mealSummaryByDate[suggested.date]?.[mealKey] || [];
        const mealYes = mealEntries.filter((p) => p.vote === "yes").map((p) => p.name);
        const mealMaybe = mealEntries.filter((p) => p.vote === "maybe").map((p) => p.name);
        const mealParts = [];
        if (mealYes.length) {
          mealParts.push(`✅ ${pluralise(mealYes.length, "definite")}${mealYes.length ? ` (${formatNameList(mealYes)})` : ""}`);
        }
        if (mealMaybe.length) {
          mealParts.push(`🤔 ${pluralise(mealMaybe.length, "maybe")}${mealMaybe.length ? ` (${formatNameList(mealMaybe)})` : ""}`);
        }
        if (!mealParts.length) {
          mealParts.push("no meal votes yet");
        }
        suggestedSummaryLines.push(
          `${displayMealName || toTitleCase(mealKey)} leads the meal choices with ${mealParts.join(" and ")}.`
        );
      }
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <Head>
        <title>
          {organiser}'s {eventTitle} in {location}
        </title>
      </Head>

      <LogoHeader isPro={isProPoll} />

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

      {suggestedSummaryLines.length > 0 && (
        <div className="mt-4 bg-blue-50 border border-blue-200 text-blue-900 rounded p-3 text-sm space-y-2">
          <p className="font-semibold">Why this date and meal?</p>
          <ul className="list-disc pl-5 space-y-1">
            {suggestedSummaryLines.map((line, idx) => (
              <li key={`suggested-summary-${idx}`}>{line}</li>
            ))}
          </ul>
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

                    const yesNames = list
                      .filter((p) => p.vote === "yes")
                      .map((p) => p.name);
                    const maybeNames = list
                      .filter((p) => p.vote === "maybe")
                      .map((p) => p.name);

                    const parts = [];
                    if (yesNames.length) {
                      parts.push(
                        `✅ ${yesNames.length} ${yesNames.length === 1 ? "definite" : "definites"}: ${yesNames.join(
                          ", "
                        )}`
                      );
                    }
                    if (maybeNames.length) {
                      parts.push(
                        `🤔 ${maybeNames.length} ${maybeNames.length === 1 ? "maybe" : "maybes"}: ${maybeNames.join(
                          ", "
                        )}`
                      );
                    }
                    const summaryText = parts.length ? parts.join(" • ") : "No one yet";

                    return (
                      <div
                        key={`${day.date}-${opt}`}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
                      >
                        <span className="font-medium">{label}</span>
                        <span className="text-green-900">{summaryText}</span>
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

export async function getServerSideProps({ params, query }) {
  const { id } = params;

  try {
    const { db: adminDb } = await import("@/lib/firebaseAdmin");
    const pollRef = adminDb.collection("polls").doc(id);
    const pollSnap = await pollRef.get();

    if (!pollSnap.exists) {
      return { notFound: true };
    }

    const pollData = pollSnap.data();

    if (pollData.eventType === "holiday") {
      return {
        redirect: {
          destination: `/trip-results/${id}`,
          permanent: false,
        },
      };
    }

    const normalizeTimestamp = (value) => {
      if (!value) return null;
      if (typeof value === "string") return value;
      if (typeof value.toDate === "function") {
        return value.toDate().toISOString();
      }
      return value;
    };

    const votesSnap = await pollRef.collection("votes").get();
    const dedup = new Map();

    votesSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const rawName = (data.displayName || data.name || "").trim();
      const key = rawName.toLowerCase();
      const updatedAt = normalizeTimestamp(data.updatedAt);
      const createdAt = normalizeTimestamp(data.createdAt);
      const timestamp = new Date(updatedAt || createdAt || 0).getTime() || 0;

      const entry = {
        ...data,
        displayName: rawName
          ? toTitleCase(rawName)
          : data.displayName || data.name || "Someone",
        createdAt,
        updatedAt,
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

    const votes = Array.from(dedup.values()).map(({ timestamp, ...rest }) => rest);

    const normalizedPoll = {
      ...pollData,
      id,
      createdAt: normalizeTimestamp(pollData.createdAt),
      updatedAt: normalizeTimestamp(pollData.updatedAt),
      deadline: normalizeTimestamp(pollData.deadline),
      finalDate: normalizeTimestamp(pollData.finalDate),
    };

    const organiserView =
      query?.token && pollData.editToken
        ? query.token === pollData.editToken
        : false;

    return {
      props: {
        poll: JSON.parse(JSON.stringify(normalizedPoll)),
        votes: JSON.parse(JSON.stringify(votes)),
        isOrganiser: organiserView,
        pollId: id,
      },
    };
  } catch (error) {
    console.error("results/[id] getServerSideProps error", error);
    return { notFound: true };
  }
}

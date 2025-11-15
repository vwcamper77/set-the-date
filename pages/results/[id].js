// pages/results/[id].js
import { useState, useRef } from "react";
import { format, parseISO } from "date-fns";
import confetti from "canvas-confetti";
import Head from "next/head";
import Link from "next/link";
import ShareButtons from "@/components/ShareButtons";
import CountdownTimer from "@/components/CountdownTimer";
import FinalisePollActions from "@/components/FinalisePollActions";
import LogoHeader from "@/components/LogoHeader";
import VenueResultsExperience from "@/components/VenueResultsExperience";
import AddToCalendar from "@/components/AddToCalendar";
import SuggestedDatesCalendar from "@/components/SuggestedDatesCalendar";
import { serializeFirestoreData } from "@/utils/serializeFirestore";

const KNOWN_MEALS = [
  "breakfast",
  "brunch",
  "coffee",
  "lunch",
  "lunch_drinks",
  "afternoon_tea",
  "dinner",
  "evening",
];
const PAID_MEAL_KEYS = [];
const DEFAULT_MEALS = ["lunch", "dinner"];
const MEAL_PRIORITY = KNOWN_MEALS.reduce((acc, meal, index) => {
  acc[meal] = index + 1;
  return acc;
}, {});
const MEAL_SELECTION_PRIORITY = [
  "evening",
  "dinner",
  "afternoon_tea",
  "lunch_drinks",
  "lunch",
  "brunch",
  "coffee",
  "breakfast",
];

const mealNameLabels = {
  breakfast: "Breakfast",
  brunch: "Brunch",
  coffee: "Coffee",
  lunch: "Lunch",
  lunch_drinks: "Lunch drinks",
  afternoon_tea: "Afternoon tea",
  dinner: "Dinner",
  evening: "Evening out",
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
const pollUsesPaidMeals = (poll) => {
  const includesPaid = (list) =>
    Array.isArray(list) && list.some((meal) => PAID_MEAL_KEYS.includes(meal));
  if (includesPaid(poll?.eventOptions?.mealTimes)) return true;
  const perDate = poll?.eventOptions?.mealTimesPerDate;
  if (perDate && typeof perDate === "object") {
    return Object.values(perDate).some((value) => includesPaid(value));
  }
  return false;
};

const isProPoll = (poll) =>
  poll?.planType === "pro" ||
  poll?.organiserPlanType === "pro" ||
  poll?.unlocked ||
  poll?.organiserUnlocked ||
  pollUsesPaidMeals(poll);

function enabledMealsForDate(poll, dateISO) {
  const key = dayKey(dateISO);
  const perDate = poll?.eventOptions?.mealTimesPerDate?.[key];
  const allowedMealKeys = isProPoll(poll)
    ? KNOWN_MEALS
    : KNOWN_MEALS.filter((meal) => !PAID_MEAL_KEYS.includes(meal));
  if (Array.isArray(perDate) && perDate.length) {
    return allowedMealKeys.filter((m) => perDate.includes(m));
  }
  const global =
    Array.isArray(poll?.eventOptions?.mealTimes) &&
    poll.eventOptions.mealTimes.length
      ? poll.eventOptions.mealTimes
      : DEFAULT_MEALS;
  return allowedMealKeys.filter((m) => global.includes(m));
}

function normaliseMealPreference(raw, allowedMeals = KNOWN_MEALS) {
  const allowed = Array.isArray(allowedMeals) ? allowedMeals.filter(Boolean) : [];
  const base = allowed.reduce((acc, meal) => {
    acc[meal] = "no";
    return acc;
  }, {});
  if (!allowed.length || !raw) return base;

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

  const directObject =
    raw && typeof raw === "object" && !Array.isArray(raw) && !Array.isArray(raw?.yes);

  if (directObject) {
    allowed.forEach((meal) => {
      const value = raw[meal];
      if (value === "yes" || value === "maybe" || value === "no") {
        base[meal] = value;
      }
    });
    return base;
  }

  allowed.forEach((meal) => {
    if (yesSet.has(meal)) base[meal] = "yes";
    else if (maybeSet.has(meal)) base[meal] = "maybe";
  });

  return base;
}

/** Build summary of meal choices per date, and attach the voter's availability vote for that date.
 *  Output shape: { [dateISO]: { breakfast: [{name, vote}], lunch: [...], dinner: [...] } }
 */
function buildMealSummary(poll, votes) {
  const template = KNOWN_MEALS.reduce((acc, meal) => {
    acc[meal] = { yes: [], maybe: [], no: [] };
    return acc;
  }, {});

  const out = {};
  (poll?.dates || []).forEach((d) => {
    out[d] = JSON.parse(JSON.stringify(template));
  });

  votes.forEach((v) => {
    const prefs = v.mealPreferences || {};
    const display = v.displayName || v.name || "Someone";
    Object.keys(out).forEach((date) => {
      const allowed = enabledMealsForDate(poll, date);
      const selection = normaliseMealPreference(prefs[date], allowed);
      const availability = v.votes?.[date] || "yes"; // yes/maybe/no

      allowed.forEach((meal) => {
        if (!out[date][meal]) return;
        const state = selection[meal] || "no";
        if (availability === "no" && state === "no") {
          out[date][meal].no.push(display);
          return;
        }
        const effective =
          availability === "maybe" && state === "yes" ? "maybe" : state;
        if (effective === "yes" || effective === "maybe") {
          out[date][meal][effective].push(display);
        } else {
          out[date][meal].no.push(display);
        }
      });
    });
  });

  return out;
}

// choose winner meal for date with weighted tie-break using MEAL_PRIORITY order
function pickMealForDate(summaryForDate) {
  if (!summaryForDate) return null;
  let best = null;
  KNOWN_MEALS.forEach((meal) => {
    const entries = summaryForDate[meal] || { yes: [], maybe: [], no: [] };
    const yesVotes = entries.yes?.length || 0;
    const maybeVotes = entries.maybe?.length || 0;
    const noVotes = entries.no?.length || 0;
    if (!yesVotes && !maybeVotes) return;
    const score = yesVotes * 2 + maybeVotes - noVotes;
    if (
      !best ||
      score > best.score ||
      (score === best.score &&
        (yesVotes > best.yes ||
          (yesVotes === best.yes &&
            MEAL_PRIORITY[meal] > MEAL_PRIORITY[best.meal])))
    ) {
      best = { meal, score, yes: yesVotes, maybe: maybeVotes, no: noVotes };
    }
  });
  return best?.meal || null;
}

function suggestedMealFromEnabled(enabled) {
  for (const option of MEAL_SELECTION_PRIORITY) {
    if (enabled.includes(option)) return option;
  }
  return null;
}

const mealChoiceLabels = {
  breakfast: "Breakfast",
  brunch: "Brunch",
  coffee: "Coffee",
  lunch: "Lunch",
  lunch_drinks: "Lunch drinks",
  afternoon_tea: "Afternoon tea",
  dinner: "Dinner",
  evening: "Evening out",
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

export default function ResultsPage({ poll, votes, isOrganiser, pollId, partner }) {
  const [revealed, setRevealed] = useState(false);
  const hasFiredConfetti = useRef(false);
  const venueContentRef = useRef(null);
  const id = pollId;

  const handleReveal = () => {
    setRevealed(true);
    if (!hasFiredConfetti.current) {
      hasFiredConfetti.current = true;
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
  };

  const handleHeroCta = () => {
    if (venueContentRef.current) {
      venueContentRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (!poll) return <p className="p-4">Poll not found.</p>;

  const isVenuePoll = Boolean(poll.partnerSlug && partner?.slug);

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
  const calendarDates = voteSummaryChrono.map((day) => day.date).filter(Boolean);

  const organiser = poll.organiserFirstName || "Someone";
  const eventTitle = poll.eventTitle || "an event";
  const location = poll.location || "somewhere";
  const pollIsPro = isProPoll(poll);
  const mapEmbedUrl = location
    ? `https://www.google.com/maps?q=${encodeURIComponent(location)}&output=embed`
    : null;
  const mapExternalUrl = location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
    : null;
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

  const earliestPlannedDateISO = Array.isArray(poll?.dates) && poll.dates.length
    ? [...poll.dates]
        .map((d) => (typeof d === "string" ? d : new Date(d).toISOString()))
        .filter(Boolean)
        .sort((a, b) => new Date(a) - new Date(b))[0]
    : null;

  const plannedDatePassed = earliestPlannedDateISO
    ? new Date(earliestPlannedDateISO) < new Date()
    : false;

  const votingClosed = deadlineISO
    ? new Date() > new Date(deadlineISO)
    : plannedDatePassed;

  const shareMessage =
    hasFinalDate && winningDateHuman
      ? `The date is set! "${eventTitle}" is happening on ${winningDateHuman}${
          isMealEvent && displayMealName ? ` - ${displayMealName}` : ""
        } in ${location}. See who's coming: ${pollUrl}`
      : `Help choose the best date for "${eventTitle}" in ${location}. Cast your vote here: ${pollUrl}`;

  const shareHeading = hasFinalDate
    ? "Share the final plan"
    : votingClosed
    ? "Share the results"
    : "Share the poll";

  const shareDescription = hasFinalDate
    ? `Let friends know ${organiser} has locked in "${eventTitle}" in ${location}.`
    : votingClosed
    ? `Voting has ended - pass this link along so anyone who missed it can still see how things landed.`
    : `Share the poll so a second wave of attendees can cast their vote for "${eventTitle}" in ${location}.`;

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
        const mealBucket =
          mealSummaryByDate[suggested.date]?.[mealKey] || { yes: [], maybe: [], no: [] };
        const mealYes = Array.isArray(mealBucket.yes) ? mealBucket.yes : [];
        const mealMaybe = Array.isArray(mealBucket.maybe) ? mealBucket.maybe : [];
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

  if (isVenuePoll) {
    return (
      <>
        <Head>
          <title>
            {organiser}'s {eventTitle} in {location}
          </title>
        </Head>
        <VenueResultsExperience
          partner={partner}
          organiser={organiser}
          eventTitle={eventTitle}
          location={location}
          winningDateHuman={winningDateHuman}
          displayMealName={displayMealName}
          suggestedSummaryLines={suggestedSummaryLines}
          hasFinalDate={hasFinalDate}
          poll={poll}
          pollId={pollId}
          suggestedDate={suggested?.date || null}
          suggestedMeal={suggestedMeal || null}
          isOrganiser={isOrganiser}
          voteSummaryChrono={voteSummaryChrono}
          isMealEvent={isMealEvent}
          mealSummaryByDate={mealSummaryByDate}
          enabledMealsForDate={enabledMealsForDate}
          mealChoiceLabels={mealChoiceLabels}
          mealNameLabels={mealNameLabels}
          attendeeMessages={attendeeMessages}
          pollUrl={pollUrl}
          shareMessage={shareMessage}
          votingClosed={votingClosed}
          deadlineISO={deadlineISO}
          revealed={revealed}
          onReveal={handleReveal}
          suggested={suggested}
        />
      </>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-6 sm:max-w-2xl lg:max-w-3xl">
      <Head>
        <title>
          {organiser}'s {eventTitle} in {location}
        </title>
      </Head>

      <LogoHeader isPro={pollIsPro} />

      <section className="space-y-3 rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm">
        <p className="text-xs uppercase tracking-[0.4em] text-slate-500 text-center">Location</p>
        <p className="text-lg font-semibold text-slate-900 text-center">📍 {location}</p>
        {deadlineISO && (
          <CountdownTimer deadline={deadlineISO} className="mx-auto" />
        )}
        {!revealed && suggested && (
          <button
            type="button"
            onClick={handleReveal}
            className="w-full rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm hover:-translate-y-0.5 transition"
          >
            🎉 Tap to reveal the current winning date
          </button>
        )}
        {revealed && winningDateHuman && (
          <>
            <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-sm font-semibold text-emerald-900 shadow-sm">
              <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-700">
                  Top pick
                </span>
                <span className="text-[13px] sm:text-sm">
                  🎉 Your event date is set for {winningDateHuman}
                  {isMealEvent && displayMealName ? ` - ${displayMealName}` : ""}!
                </span>
              </div>
            </div>
            {suggested?.date && (
              <div className="mt-3">
                <AddToCalendar
                  eventDate={suggested.date}
                  eventTitle={poll.eventTitle}
                  eventLocation={poll.location}
                  introText="Add the current leading date to your calendar"
                  className="mx-auto max-w-lg"
                />
              </div>
            )}
          </>
        )}
      </section>

      <div className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Location map</p>
          {mapExternalUrl ? (
            <a
              href={mapExternalUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline decoration-dotted"
            >
              Open map
            </a>
          ) : null}
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            {mapEmbedUrl ? (
              <iframe
                title={`Map for ${eventTitle || "event location"}`}
                src={mapEmbedUrl}
                className="h-56 w-full rounded-2xl border border-slate-100"
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-500">
                Add a location to preview it on the map.
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm min-w-0">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Calendar</p>
            <p className="text-[11px] text-slate-500">Highlighted days show every option voters responded to.</p>
            <div className="mt-3 overflow-x-auto pb-2">
              <SuggestedDatesCalendar
                dates={calendarDates}
                showIntro={false}
                className="h-full min-w-[360px] border-0 shadow-none p-0 bg-transparent"
              />
            </div>
          </div>
        </div>
      </div>

      {suggestedSummaryLines.length > 0 && (
        <div className="space-y-2 rounded-3xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 shadow-sm">
          <p className="font-semibold flex items-center gap-2">
            <span role="img" aria-label="Calendar">
              📌
            </span>
            Why this date?
          </p>
          <ul className="list-disc pl-5 space-y-1">
            {suggestedSummaryLines.map((line, idx) => (
              <li key={`suggested-summary-${idx}`}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {!partner && (
        <div className="space-y-3 rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">Need to add more options?</p>
            <p className="text-sm text-slate-600">Jump back to the voter view to add fresh dates or start a brand new event.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/poll/${id}`}
              className="flex-1 min-w-[160px] rounded-full border border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900 text-center hover:bg-slate-900 hover:text-white transition"
            >
              Add your own dates
            </Link>
            <Link
              href="/"
              className="flex-1 min-w-[160px] rounded-full border border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900 text-center hover:bg-slate-900 hover:text-white transition"
            >
              Create your own event
            </Link>
          </div>
        </div>
      )}

      {hasFinalDate ? (
        <>
          <div className="bg-green-100 border border-green-300 text-green-800 p-3 mb-4 rounded text-center font-semibold">
            ✅ {poll.eventTitle} is scheduled for{" "}
            {format(parseISO(poll.finalDate), "EEEE do MMMM yyyy")} in{" "}
            {poll.location}
            {isMealEvent && displayMealName ? ` - ${displayMealName}` : ""}.
          </div>
          <div className="mb-4">
            <AddToCalendar
              eventDate={poll.finalDate}
              eventTitle={poll.eventTitle}
              eventLocation={poll.location}
              introText="Add the finalised date to your calendar"
              className="mx-auto max-w-lg"
            />
          </div>
        </>
      ) : votingClosed ? (
        isOrganiser ? (
          <FinalisePollActions
            poll={poll}
            pollId={pollId}
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
      <section className="space-y-5">
        {voteSummaryChrono.map((day) => {
        const enabled = isMealEvent ? enabledMealsForDate(poll, day.date) : [];
        const summary = isMealEvent ? mealSummaryByDate[day.date] || {} : {};
        const rows = isMealEvent
          ? enabled
              .map((opt) => {
                const bucket = summary[opt] || { yes: [], maybe: [], no: [] };
                const yes = Array.isArray(bucket.yes) ? bucket.yes : [];
                const maybe = Array.isArray(bucket.maybe) ? bucket.maybe : [];
                const no = Array.isArray(bucket.no) ? bucket.no : [];
                const score = yes.length * 3 + maybe.length * 2 - no.length;
                return { opt, bucket, yes, maybe, no, score };
              })
              .filter(({ yes, maybe, no }) => yes.length + maybe.length + no.length > 0)
          : [];

        const totalVotes = day.yes.length + day.maybe.length + day.no.length;
        const isSuggestedDate = suggested?.date === day.date;

        return (
          <div
            key={day.date}
            className="space-y-3 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-sm shadow-slate-200/70"
          >
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Date option</p>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-semibold text-slate-900">{format(parseISO(day.date), "EEEE do MMMM yyyy")}</p>
                {isSuggestedDate && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.4em] text-emerald-700">
                    Top pick
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">{totalVotes} {totalVotes === 1 ? "vote" : "votes"}</p>
            </div>

            {!isMealEvent && (
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                {[
                  { key: "yes", label: "Can attend", icon: "✅", data: day.yes, tone: "border-emerald-200 bg-emerald-50 text-emerald-800" },
                  { key: "maybe", label: "Maybe", icon: "🤔", data: day.maybe, tone: "border-amber-200 bg-amber-50 text-amber-800" },
                  { key: "no", label: "Can't make it", icon: "✕", data: day.no, tone: "border-slate-200 bg-slate-50 text-slate-600" },
                ].map((bucket) => (
                  <div
                    key={`${day.date}-${bucket.key}`}
                    className={`rounded-2xl border px-3 py-3 text-xs font-semibold shadow-inner ${bucket.tone}`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-lg" aria-hidden="true">
                        {bucket.icon}
                      </span>
                      <span>{bucket.label}</span>
                      <span className="text-base">{bucket.data.length}</span>
                      <span className="text-[11px] font-normal text-slate-600">
                        {bucket.data.length ? bucket.data.join(", ") : "No names yet"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isMealEvent && rows.length > 0 && (
              <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-xs text-left">
                {rows.map(({ opt, yes, maybe, no }) => {
                  const label = mealChoiceLabels[opt] || `${toTitleCase(opt)} votes`;
                  const blocks = [
                    { key: "yes", names: yes, icon: "✅", title: "definites", tone: "border-emerald-200 bg-white text-emerald-800" },
                    { key: "maybe", names: maybe, icon: "🤔", title: "maybes", tone: "border-amber-200 bg-white text-amber-800" },
                    { key: "no", names: no, icon: "✕", title: "declines", tone: "border-slate-200 bg-white text-slate-600" },
                  ];

                  return (
                    <div
                      key={`${day.date}-${opt}`}
                      className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 shadow-sm"
                    >
                      <p className="text-xs font-semibold text-slate-800 mb-2">{label}</p>
                      <div className="grid grid-cols-3 gap-2">
                        {blocks.map((block) => (
                          <div
                            key={`${opt}-${block.key}`}
                            className={`flex h-full flex-col items-center gap-1 rounded-2xl border px-2.5 py-3 text-center ${block.tone}`}
                          >
                            <div className="flex items-center justify-center gap-1 text-xs font-semibold">
                              <span aria-hidden="true">{block.icon}</span>
                              <span>{block.title}</span>
                            </div>
                            <div className="text-lg font-semibold">{block.names.length}</div>
                            <div className="text-[11px] text-slate-600 break-words">
                              {block.names.length ? block.names.join(", ") : "No votes yet"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
        })}
      </section>

      <div className="text-center mt-8 space-y-4">
        <a
          href={`/poll/${id}`}
          className="inline-block bg-white text-blue-600 font-medium border border-blue-600 rounded px-4 py-2 text-sm hover:bg-blue-50"
        >
          Back to voting page
        </a>
      </div>

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

      <div className="mt-6 p-6 bg-white border border-gray-200 rounded-lg text-center">
        <h2 className="text-lg font-semibold mb-2">Create your own event</h2>
        <p className="text-sm text-gray-600 mb-4">
          Start a poll and let your friends vote on the best date in minutes.
        </p>
        <a
          href="/"
          className="inline-block bg-blue-600 text-white font-medium rounded px-4 py-2 text-sm hover:bg-blue-700"
        >
          Build a poll
        </a>
      </div>

      <div className="mt-10 p-6 bg-yellow-50 border border-yellow-300 rounded-lg text-center">
        <h2 className="text-xl font-semibold mb-3">{shareHeading}</h2>
        <p className="text-gray-700 text-base mb-4 max-w-sm mx-auto">{shareDescription}</p>
        <ShareButtons shareUrl={pollUrl} shareMessage={shareMessage} />
      </div>

      <div className="mt-6 text-center">
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-full border border-slate-900 px-6 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-900 hover:text-white transition"
        >
          Create your own event
        </Link>
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

    let partner = null;
    if (pollData.partnerSlug) {
      const partnerSnap = await adminDb.collection("partners").doc(pollData.partnerSlug).get();
      if (partnerSnap.exists) {
        partner = serializeFirestoreData({
          ...partnerSnap.data(),
          slug: partnerSnap.id,
        });
      }
    }

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
        partner: partner ? JSON.parse(JSON.stringify(partner)) : null,
      },
    };
  } catch (error) {
    console.error("results/[id] getServerSideProps error", error);
    return { notFound: true };
  }
}



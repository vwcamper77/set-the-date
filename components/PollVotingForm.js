import { useState, useEffect, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import {
  collection,
  setDoc,
  getDocs,
  doc,
  serverTimestamp,
  updateDoc,
  arrayUnion
} from 'firebase/firestore';
import { useRouter } from 'next/router';
import { db } from '@/lib/firebase';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';

const ORGANISER_DETAILS_STORAGE_KEY = 'std_last_organiser_details';

const KNOWN_MEALS = [
  'breakfast',
  'brunch',
  'coffee',
  'lunch',
  'lunch_drinks',
  'afternoon_tea',
  'dinner',
  'evening',
];
const PAID_MEAL_KEYS = [];
const DEFAULT_MEALS = ['lunch', 'dinner']; // fallback when organiser didn't set options
const MEAL_LABELS = {
  breakfast: 'Breakfast',
  brunch: 'Brunch',
  coffee: 'Coffee',
  lunch: 'Lunch',
  lunch_drinks: 'Lunch drinks',
  afternoon_tea: 'Afternoon tea',
  dinner: 'Dinner',
  evening: 'Drinks',
};
const MEAL_STATE_OPTIONS = ['yes', 'maybe', 'no'];
const MEAL_STATE_DISPLAY = {
  yes: { label: 'Yes', helper: 'Works for me', icon: '✅' },
  maybe: { label: 'Maybe', helper: 'If needed', icon: '🤔' },
  no: { label: 'No', helper: 'Can\'t do it', icon: '✕' },
};
const GENERIC_VOTE_OPTIONS = [
  { value: 'yes', label: 'Can attend', helper: 'Lock it in', icon: '✅' },
  { value: 'maybe', label: 'Maybe', helper: 'If plans change', icon: '🤔' },
  { value: 'no', label: 'Can\'t make it', helper: 'Send regrets', icon: '✕' },
];

const dayKey = (iso) => (iso || '').slice(0, 10);

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

const isProPoll = (poll) =>
  poll?.planType === 'pro' ||
  poll?.organiserPlanType === 'pro' ||
  poll?.unlocked ||
  poll?.organiserUnlocked ||
  pollUsesPaidMeals(poll);

function enabledMealsForDate(poll, dateISO) {
  const key = dayKey(dateISO);
  const allowedMealKeys = isProPoll(poll)
    ? KNOWN_MEALS
    : KNOWN_MEALS.filter((meal) => !PAID_MEAL_KEYS.includes(meal));

  const perDate = poll?.eventOptions?.mealTimesPerDate?.[key];
  if (Array.isArray(perDate) && perDate.length) {
    return perDate.filter((meal) => allowedMealKeys.includes(meal));
  }
  const globalSource =
    Array.isArray(poll?.eventOptions?.mealTimes) && poll.eventOptions.mealTimes.length
      ? poll.eventOptions.mealTimes
      : DEFAULT_MEALS;
  return globalSource.filter((meal) => allowedMealKeys.includes(meal));
}

const buildEmptyMealState = (allowed = []) =>
  allowed.reduce((acc, meal) => {
    acc[meal] = 'no';
    return acc;
  }, {});

const buildYesMealState = (allowed = []) =>
  allowed.reduce((acc, meal) => {
    acc[meal] = 'yes';
    return acc;
  }, {});

function normaliseMealState(raw, allowedMeals = KNOWN_MEALS) {
  const allowed = Array.isArray(allowedMeals) ? allowedMeals.filter(Boolean) : [];
  const base = buildEmptyMealState(allowed);
  if (!allowed.length || !raw) return base;

  const isLegacyArray =
    Array.isArray(raw) ||
    (typeof raw === 'object' && (Array.isArray(raw?.yes) || Array.isArray(raw?.maybe)));

  if (isLegacyArray) {
    const yesSet = new Set();
    const maybeSet = new Set();

    const collect = (input, targetSet) => {
      if (Array.isArray(input)) {
        input.forEach((meal) => {
          if (allowed.includes(meal)) targetSet.add(meal);
        });
      }
    };

    if (Array.isArray(raw)) {
      collect(raw, yesSet);
    } else {
      collect(raw.yes ?? raw.definite ?? [], yesSet);
      collect(raw.maybe ?? raw.tentative ?? [], maybeSet);
    }

    allowed.forEach((meal) => {
      if (yesSet.has(meal)) base[meal] = 'yes';
      else if (maybeSet.has(meal)) base[meal] = 'maybe';
    });
    return base;
  }

  if (raw && typeof raw === 'object') {
    allowed.forEach((meal) => {
      const value = raw[meal];
      if (value === 'yes' || value === 'maybe' || value === 'no') {
        base[meal] = value;
      }
    });
  }

  return base;
}

function deriveVoteFromMealState(mealState = {}) {
  const statuses = Object.values(mealState);
  if (statuses.some((status) => status === 'yes')) return 'yes';
  if (statuses.some((status) => status === 'maybe')) return 'maybe';
  return 'no';
}

const mealStateEquals = (a = {}, b = {}) => {
  const keysA = Object.keys(a || {});
  const keysB = Object.keys(b || {});
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
};

const hasPositiveMealSelection = (mealState = {}) =>
  Object.values(mealState).some((value) => value === 'yes' || value === 'maybe');

export default function PollVotingForm({ poll, pollId, organiser, eventTitle }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [votes, setVotes] = useState({});
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState('');
  const [existingVotes, setExistingVotes] = useState([]);
  const [nameWarning, setNameWarning] = useState('');
  const [mealPreferences, setMealPreferences] = useState({});
  const [unavailableDates, setUnavailableDates] = useState({});
  const [holidayEarliest, setHolidayEarliest] = useState('');
  const [holidayLatest, setHolidayLatest] = useState('');
  const [holidayDuration, setHolidayDuration] = useState('');
  const hasPrefilledExistingVote = useRef(false);
  const hasHydratedContactDetails = useRef(false);

  const eventType = poll?.eventType || 'general';

  useEffect(() => {
    const fetchExistingVotes = async () => {
      const voteSnap = await getDocs(collection(db, 'polls', pollId, 'votes'));
      const allVotes = voteSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setExistingVotes(allVotes);
    };
    fetchExistingVotes();
  }, [pollId]);

  useEffect(() => {
    if (hasHydratedContactDetails.current || typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(ORGANISER_DETAILS_STORAGE_KEY);
      if (!raw) {
        hasHydratedContactDetails.current = true;
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed?.name && !name) setName(parsed.name);
      if (parsed?.email && !email) setEmail(parsed.email);
    } catch (err) {
      console.error('organiser details load failed', err);
    } finally {
      hasHydratedContactDetails.current = true;
    }
  }, [name, email]);

  useEffect(() => {
    if (!poll?.dates) return;
    setVotes(prev => {
      let changed = false;
      const next = { ...prev };
      poll.dates.forEach(date => {
        if (!next[date]) {
          next[date] = 'yes';
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [poll?.dates]);

  useEffect(() => {
    const normalized = name.trim().toLowerCase();
    const nameExists = existingVotes.some(v => v.name?.trim().toLowerCase() === normalized);
    if (!email && normalized && nameExists) {
      setNameWarning(
        `⚠️ Someone has already voted as "${name}". If that’s not you, add an initial.<br /><span class='text-green-600 font-semibold'>If it is you, please go ahead and make a change — your previous vote will be updated.</span>`
      );
    } else {
      setNameWarning('');
    }
  }, [name, email, existingVotes]);

  useEffect(() => {
    const normalizedName = name.trim().toLowerCase();
    const existingVote = existingVotes.find(v =>
      v.email?.toLowerCase() === email.trim().toLowerCase() ||
      (!email && v.name?.trim().toLowerCase() === normalizedName)
    );
    if (existingVote && !email) {
      setMessage('');
      setVotes({});
      setMealPreferences({});
      setUnavailableDates({});
      setHolidayEarliest('');
      setHolidayLatest('');
      setHolidayDuration('');
    }
  }, [email, name, existingVotes]);

  // Keep meal selections aligned with organiser's options.
  useEffect(() => {
    if (eventType !== 'meal' || !poll?.dates?.length) return;

    setMealPreferences(prev => {
      let changed = false;
      const next = { ...prev };

      Object.keys(next).forEach(dateKey => {
        if (!poll.dates.includes(dateKey)) {
          delete next[dateKey];
          changed = true;
        }
      });

      (poll.dates || []).forEach(date => {
        const allowed = enabledMealsForDate(poll, date);
        const existing = next[date];
        const isUnavailable = unavailableDates[date];
        let normalised = normaliseMealState(existing, allowed);
        if ((!existing || !hasPositiveMealSelection(existing)) && allowed.length && !isUnavailable) {
          normalised = buildYesMealState(allowed);
        }
        if (!existing || !mealStateEquals(existing, normalised)) {
          next[date] = normalised;
          changed = true;
        }
      });

      return changed ? next : prev;
    });

    setUnavailableDates(prev => {
      let changed = false;
      const next = { ...prev };
      Object.keys(next).forEach(dateKey => {
        if (!poll.dates.includes(dateKey)) {
          delete next[dateKey];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [
    eventType,
    poll?.dates,
    poll?.eventOptions?.mealTimes,
    poll?.eventOptions?.mealTimesPerDate,
    unavailableDates,
  ]);

  useEffect(() => {
    if (eventType !== 'meal') return;
    setVotes(prev => {
      const next = { ...prev };
      let changed = false;
      (poll?.dates || []).forEach(date => {
        const mealState = mealPreferences[date] || {};
        const desired = unavailableDates[date] ? 'no' : deriveVoteFromMealState(mealState);
        if (next[date] !== desired) {
          next[date] = desired;
          changed = true;
        }
      });
      // clean up removed dates
      Object.keys(next).forEach(dateKey => {
        if (poll?.dates && !poll.dates.includes(dateKey)) {
          delete next[dateKey];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [eventType, poll?.dates, mealPreferences, unavailableDates]);

  useEffect(() => {
    if (eventType !== 'holiday' || !poll?.dates?.length) return;
    setHolidayEarliest(prev => prev || poll.dates[0]);
    setHolidayLatest(prev => prev || poll.dates[poll.dates.length - 1]);
  }, [eventType, poll?.dates]);

  useEffect(() => {
    hasPrefilledExistingVote.current = false;
  }, [email]);

  useEffect(() => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || hasPrefilledExistingVote.current) return;
    const matched = existingVotes.find(v => v.email?.trim().toLowerCase() === normalizedEmail);
    if (!matched) return;

    if (matched.votes && eventType !== 'meal') {
      setVotes(prev => ({ ...prev, ...matched.votes }));
    }
    if (matched.message) setMessage(matched.message);
    if (eventType === 'meal') {
      const normalisedMeals = {};
      (poll?.dates || []).forEach(date => {
        const allowed = enabledMealsForDate(poll, date);
        const raw = matched.mealPreferences?.[date];
        const selection = normaliseMealState(raw, allowed);
        normalisedMeals[date] = selection;
      });
      if (Object.keys(normalisedMeals).length) {
        setMealPreferences(normalisedMeals);
      }

      if (matched.votes) {
        setVotes(prev => ({ ...prev, ...matched.votes }));
        const unavailable = {};
        Object.entries(matched.votes).forEach(([date, value]) => {
          if (value === 'no') {
            const mealState = normalisedMeals[date] || {};
            if (!hasPositiveMealSelection(mealState)) {
              unavailable[date] = true;
            }
          }
        });
        if (Object.keys(unavailable).length) {
          setUnavailableDates(prev => ({ ...prev, ...unavailable }));
        }
      }
    }
    if (eventType === 'holiday' && matched.holidayPreferences) {
      setHolidayEarliest(matched.holidayPreferences.earliestStart || '');
      setHolidayLatest(matched.holidayPreferences.latestEnd || '');
      setHolidayDuration(
        matched.holidayPreferences.maxDuration
          ? String(matched.holidayPreferences.maxDuration)
          : ''
      );
    }

    hasPrefilledExistingVote.current = true;
  }, [email, existingVotes, eventType]);

  const toggleDateUnavailable = (date, makeUnavailable, allowedMeals = []) => {
    const allowed = allowedMeals.length ? allowedMeals : enabledMealsForDate(poll, date);

    setUnavailableDates(prev => {
      const next = { ...prev };
      if (makeUnavailable) {
        next[date] = true;
      } else {
        delete next[date];
      }
      return next;
    });

    setMealPreferences(prev => {
      const current = normaliseMealState(prev[date], allowed);
      if (makeUnavailable) {
        return {
          ...prev,
          [date]: buildEmptyMealState(allowed),
        };
      }

      const nextState = { ...current };
      if (!hasPositiveMealSelection(nextState)) {
        allowed.forEach((meal) => {
          nextState[meal] = 'yes';
        });
      }
      return {
        ...prev,
        [date]: nextState,
      };
    });
  };

  const updateMealResponse = (date, meal, state, allowedMeals = []) => {
    if (!MEAL_STATE_OPTIONS.includes(state)) return;
    const allowed = allowedMeals.length ? allowedMeals : enabledMealsForDate(poll, date);
    if (!allowed.includes(meal)) return;
    if (unavailableDates[date]) return;

    const currentState = normaliseMealState(mealPreferences[date], allowed);
    const nextState = { ...currentState, [meal]: state };
    const hasPositiveSelection = hasPositiveMealSelection(nextState);
    const noCount = allowed.reduce(
      (total, key) => (nextState[key] === 'no' ? total + 1 : total),
      0
    );
    const shouldAutoMarkUnavailable =
      allowed.length >= 2 && !hasPositiveSelection && noCount >= 2;

    setMealPreferences(prev => {
      const current = normaliseMealState(prev[date], allowed);
      if (current[meal] === state) return prev;
      const nextMealState = { ...current, [meal]: state };
      return {
        ...prev,
        [date]: nextMealState,
      };
    });

    setUnavailableDates(prev => {
      const alreadyUnavailable = !!prev[date];
      if (shouldAutoMarkUnavailable && !alreadyUnavailable) {
        return { ...prev, [date]: true };
      }
      if (!shouldAutoMarkUnavailable && alreadyUnavailable) {
        const next = { ...prev };
        delete next[date];
        return next;
      }
      return prev;
    });
  };

  const handleGenericVoteChange = (date, value) => {
    setVotes(prev => ({ ...prev, [date]: value }));
  };

  const handleHolidayEarliestChange = value => {
    setHolidayEarliest(value);
    if (holidayLatest && new Date(value) > new Date(holidayLatest)) {
      setHolidayLatest(value);
    }
  };

  const handleHolidayLatestChange = value => {
    setHolidayLatest(value);
    if (holidayEarliest && new Date(value) < new Date(holidayEarliest)) {
      setHolidayEarliest(value);
    }
  };

  const setAllVotesForValue = value => {
    if (!poll?.dates?.length) return;
    const updated = {};
    poll.dates.forEach(date => {
      updated[date] = value;
    });
    setVotes(updated);
  };

  const toTitleCase = str =>
    str
      .toLowerCase()
      .split(' ')
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      alert('Please enter your name.');
      return;
    }

    const normalizedName = trimmedName.toLowerCase();
    const titleCaseName = toTitleCase(trimmedName);
    const nameExists = existingVotes.some(v => v.name?.trim().toLowerCase() === normalizedName);

    if (nameExists && !email.trim()) {
      alert('Please provide your email to confirm vote update.');
      return;
    }

    if (!email.trim()) {
      alert('Please enter your email. This helps us send you updates and lets you change your vote later!');
      setIsSubmitting(false);
      return;
    }

    const missingVotes = poll.dates.filter(date => !votes[date]);
    if (missingVotes.length > 0) {
      alert('Please select your availability for all dates.');
      return;
    }

    let normalizedMealPrefs = mealPreferences;
    if (eventType === 'meal') {
      const nextPrefs = {};
      for (const date of poll.dates) {
        const allowed = enabledMealsForDate(poll, date);
        const isUnavailable = Boolean(unavailableDates[date]);
        const state = normaliseMealState(mealPreferences[date], allowed);

        if (!allowed.length || isUnavailable) {
          nextPrefs[date] = buildEmptyMealState(allowed);
          continue;
        }

        if (!hasPositiveMealSelection(state)) {
          const niceDate = format(parseISO(date), 'EEE d MMM yyyy');
          alert(`Please mark at least one meal as ✅ or 🤔 for ${niceDate}, or tick "I can't make this date".`);
          return;
        }

        nextPrefs[date] = state;
      }
      normalizedMealPrefs = nextPrefs;
    }

    let parsedHolidayDuration = null;
    if (eventType === 'holiday') {
      if (!holidayEarliest || !holidayLatest) {
        alert('Please choose your earliest start and latest end dates.');
        return;
      }
      if (new Date(holidayEarliest) > new Date(holidayLatest)) {
        alert('Your latest end date needs to be on or after your earliest start date.');
        return;
      }
      parsedHolidayDuration = Number(holidayDuration);
      if (!parsedHolidayDuration || parsedHolidayDuration <= 0) {
        alert('Please let the organiser know how many days you can travel.');
        return;
      }
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    const voteData = {
      displayName: titleCaseName,
      name: normalizedName,
      email,
      votes,
      message,
      createdAt: serverTimestamp(),
      eventType,
      mealPreferences: eventType === 'meal' ? normalizedMealPrefs : null,
      holidayPreferences:
        eventType === 'holiday'
          ? {
              earliestStart: holidayEarliest,
              latestEnd: holidayLatest,
              maxDuration: parsedHolidayDuration,
            }
          : null,
    };

    try {
      const existingVote = existingVotes.find(v =>
        email
          ? v.email?.trim().toLowerCase() === email.trim().toLowerCase()
          : v.name?.trim().toLowerCase() === normalizedName
      );

      const docId = email.trim().toLowerCase();
      const voteRef = doc(db, 'polls', pollId, 'votes', docId);

      if (existingVote) {
        await updateDoc(voteRef, {
          ...voteData,
          history: arrayUnion({
            updatedAt: new Date().toISOString(),
            previousVotes: existingVote.votes || null,
            previousMessage: existingVote.message || null,
            previousMealPreferences: existingVote.mealPreferences || null,
            previousHolidayPreferences: existingVote.holidayPreferences || null,
          }),
        });
      } else {
        await setDoc(voteRef, voteData);
      }

      const bestCount = Object.values(votes).filter(v => v === 'yes').length;
      const maybeCount = Object.values(votes).filter(v => v === 'maybe').length;

      logEventIfAvailable('vote_submitted', {
        pollId,
        name: titleCaseName,
        bestCount,
        maybeCount,
        attendeeMessage: message || '',
        eventType,
        mealPreferences: eventType === 'meal' ? normalizedMealPrefs : undefined,
        holidayPreferences:
          eventType === 'holiday'
            ? {
                earliestStart: holidayEarliest,
                latestEnd: holidayLatest,
                maxDuration: parsedHolidayDuration,
              }
            : undefined,
      });

      await fetch('/api/notifyOrganiserOnVote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organiserEmail: poll.organiserEmail,
          organiserName: organiser,
          eventTitle,
          pollId,
          voterName: titleCaseName,
          votes,
          message,
          eventType,
          mealPreferences: eventType === 'meal' ? normalizedMealPrefs : undefined,
          holidayPreferences:
            eventType === 'holiday'
              ? {
                  earliestStart: holidayEarliest,
                  latestEnd: holidayLatest,
                  maxDuration: parsedHolidayDuration,
                }
              : undefined,
        }),
      });

      await fetch('/api/addAttendeeToBrevo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, firstName: titleCaseName, lastName: '' }),
      });

      await fetch('/api/sendAttendeeEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, firstName: titleCaseName, eventTitle, pollId }),
      });

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(
            ORGANISER_DETAILS_STORAGE_KEY,
            JSON.stringify({ name: titleCaseName, email: email.trim() })
          );
        } catch (err) {
          console.error('organiser details persist failed', err);
        }
      }

      setStatus('✅ Your vote has been submitted successfully!');
      setName('');
      setEmail('');
      setMessage('');
      setVotes({});
      setMealPreferences({});
      setUnavailableDates({});
      setHolidayEarliest('');
      setHolidayLatest('');
      setHolidayDuration('');
      hasPrefilledExistingVote.current = false;
      router.replace(`/results/${pollId}`);
    } catch (err) {
      console.error('❌ Failed to submit vote:', err);
      setStatus('❌ Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const showBulkActions = eventType !== 'meal' && poll?.dates?.length > 5;

  return (
    <div className="space-y-6">
      {showBulkActions && (
        <div className="sticky top-0 z-20">
          <div className="rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Quick fill
              </p>
              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAllVotesForValue('yes')}
                  disabled={isSubmitting}
                  className={`flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm ${
                    isSubmitting ? 'cursor-not-allowed opacity-50' : 'transition hover:-translate-y-0.5'
                  }`}
                >
                  <span aria-hidden="true" className="text-base">{'\u2705'}</span>
                  <span>All yes</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAllVotesForValue('maybe')}
                  disabled={isSubmitting}
                  className={`flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 shadow-sm ${
                    isSubmitting ? 'cursor-not-allowed opacity-50' : 'transition hover:-translate-y-0.5'
                  }`}
                >
                  <span aria-hidden="true" className="text-base">{'\u2754'}</span>
                  <span>All maybe</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAllVotesForValue('no')}
                  disabled={isSubmitting}
                  className={`flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm ${
                    isSubmitting ? 'cursor-not-allowed opacity-50' : 'transition hover:-translate-y-0.5'
                  }`}
                >
                  <span aria-hidden="true" className="text-base">{'\u274c'}</span>
                  <span>All no</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-5">
        {poll.dates.map(date => {
          const enabledMeals = eventType === 'meal' ? enabledMealsForDate(poll, date) : [];
          const mealState = eventType === 'meal' ? normaliseMealState(mealPreferences[date], enabledMeals) : null;
          const isDateUnavailable = eventType === 'meal' ? Boolean(unavailableDates[date]) : false;
          const parsedDate = parseISO(date);
          const formattedDate = format(parsedDate, 'EEEE do MMMM yyyy');
          const isWeekend = [0, 6].includes(parsedDate.getDay());
          const currentChoice = votes[date];
          const currentOption =
            eventType !== 'meal' ? GENERIC_VOTE_OPTIONS.find(option => option.value === currentChoice) : null;

          return (
            <div
              key={date}
              className="space-y-4 rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm shadow-slate-200/70"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Date option</p>
                  <p className="text-lg font-semibold text-slate-900 truncate">{formattedDate}</p>
                  {isWeekend && (
                    <p className="text-xs font-semibold text-blue-600">Weekend pick</p>
                  )}
                </div>
                {eventType !== 'meal' && (
                  <span
                    className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold shadow-inner ${
                      currentOption
                        ? currentOption.value === 'yes'
                          ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                          : currentOption.value === 'maybe'
                          ? 'border border-amber-200 bg-amber-50 text-amber-700'
                          : 'border border-slate-200 bg-slate-50 text-slate-600'
                        : 'border border-slate-200 bg-slate-50 text-slate-400'
                    }`}
                  >
                    {currentOption ? `Selected: ${currentOption.label}` : 'Awaiting response'}
                  </span>
                )}
              </div>

              {eventType !== 'meal' && (
                <div className="grid gap-3 sm:grid-cols-3">
                  {GENERIC_VOTE_OPTIONS.map(option => {
                    const active = currentChoice === option.value;
                    const toneClasses =
                      option.value === 'yes'
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                        : option.value === 'maybe'
                        ? 'border-amber-300 bg-amber-50 text-amber-900'
                        : 'border-slate-200 bg-white text-slate-700';
                    const idleClasses = 'border-slate-200 bg-white text-slate-600 hover:border-slate-300';

                    return (
                      <label
                        key={option.value}
                        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border px-4 py-4 text-center text-sm font-semibold shadow-sm focus-within:ring-2 focus-within:ring-slate-900/10 ${
                          isSubmitting ? 'opacity-60 cursor-not-allowed' : 'transition hover:-translate-y-0.5'
                        } ${active ? toneClasses : idleClasses}`}
                      >
                        <input
                          type="radio"
                          name={date}
                          value={option.value}
                          className="sr-only"
                          checked={currentChoice === option.value}
                          onChange={() => handleGenericVoteChange(date, option.value)}
                          disabled={isSubmitting}
                        />
                        <span className="text-2xl" aria-hidden="true">
                          {option.icon}
                        </span>
                        <span className="text-sm">{option.label}</span>
                        <span className="text-xs font-normal text-slate-500">{option.helper}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {eventType === 'meal' && (
                <div className="space-y-4">
                  <label
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium ${
                      isDateUnavailable
                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                        : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                        checked={isDateUnavailable}
                        onChange={(e) => toggleDateUnavailable(date, e.target.checked, enabledMeals)}
                        disabled={isSubmitting}
                      />
                      <span>{isDateUnavailable ? 'Marked as unavailable' : "I can't make this date"}</span>
                    </span>
                    {isDateUnavailable && <span className="text-xs font-semibold">Skipped</span>}
                  </label>

                  {enabledMeals.length === 0 ? (
                    <p className="text-xs text-slate-500">No meal slots configured for this date.</p>
                  ) : (
                    <div className={isDateUnavailable ? 'opacity-60 pointer-events-none' : 'space-y-3'}>
                      <p className="text-xs text-slate-500">
                        Rate each slot so {organiser || 'the organiser'} knows what works best.
                      </p>
                      {enabledMeals.map(meal => {
                        const currentState = mealState[meal] || 'no';
                        return (
                          <div
                            key={`${date}-${meal}`}
                            className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3 shadow-inner shadow-white/60"
                          >
                            <div className="text-sm font-semibold text-slate-900">{MEAL_LABELS[meal] || meal}</div>
                            <div className="mt-3 grid grid-cols-3 gap-2">
                              {MEAL_STATE_OPTIONS.map(option => {
                                const active = currentState === option;
                                const display = MEAL_STATE_DISPLAY[option];
                                const toneClasses =
                                  option === 'yes'
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                                    : option === 'maybe'
                                    ? 'border-amber-300 bg-amber-50 text-amber-900'
                                    : 'border-rose-300 bg-rose-50 text-rose-900';
                                return (
                                  <button
                                    type="button"
                                    key={`${date}-${meal}-${option}`}
                                    className={`flex flex-col items-center rounded-2xl border px-3 py-2 text-center text-xs font-semibold shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/10 ${
                                      isSubmitting ? 'cursor-not-allowed opacity-60' : 'transition hover:-translate-y-0.5'
                                    } ${active ? toneClasses : 'border-slate-200 bg-white text-slate-500'}`}
                                    onClick={() => updateMealResponse(date, meal, option, enabledMeals)}
                                    disabled={isSubmitting || isDateUnavailable}
                                  >
                                    <span className="text-lg">{display?.icon}</span>
                                    <span>{display?.label || option}</span>
                                    <span className="text-[10px] font-normal text-slate-500">
                                      {display?.helper || ''}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!isDateUnavailable && enabledMeals.length > 0 && !hasPositiveMealSelection(mealState) && (
                    <p className="text-xs text-amber-700">
                      Choose at least one slot as Yes or Maybe so we can count your availability.
                    </p>
                  )}
                  {isDateUnavailable && (
                    <p className="text-[11px] text-slate-500">
                      You've marked this date as unavailable. Untick above to share meal availability.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {eventType === 'holiday' && (
        <div className="space-y-4 rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-blue-100 p-5 text-sm shadow-sm">
          <p className="text-blue-900 font-semibold">Tell {organiser} your ideal travel window:</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.25em] text-blue-700">
                Earliest you could start
              </label>
              <select
                className="mt-1 w-full rounded-2xl border border-blue-200 bg-white px-4 py-2.5 text-sm text-blue-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                value={holidayEarliest}
                onChange={(e) => handleHolidayEarliestChange(e.target.value)}
              >
                <option value="">Select a start date</option>
                {poll.dates.map(d => (
                  <option key={`start-${d}`} value={d}>
                    {format(parseISO(d), 'EEE d MMM yyyy')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.25em] text-blue-700">
                Latest you could finish
              </label>
              <select
                className="mt-1 w-full rounded-2xl border border-blue-200 bg-white px-4 py-2.5 text-sm text-blue-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                value={holidayLatest}
                onChange={(e) => handleHolidayLatestChange(e.target.value)}
              >
                <option value="">Select an end date</option>
                {poll.dates.map(d => (
                  <option key={`end-${d}`} value={d}>
                    {format(parseISO(d), 'EEE d MMM yyyy')}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.25em] text-blue-700">
              How many days can you go for?
            </label>
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-2xl border border-blue-200 bg-white px-4 py-2.5 text-sm text-blue-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              value={holidayDuration}
              onChange={(e) => setHolidayDuration(e.target.value)}
              placeholder="e.g. 5"
            />
          </div>
          <p className="text-xs text-blue-700">
            We'll use this alongside your dates to suggest the best start and end for the group.
          </p>
        </div>
      )}

      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm shadow-slate-200/70">
        <div>
          <label htmlFor="poll-name" className="text-sm font-semibold text-slate-700">
            Your nickname or first name
          </label>
          <input
            id="poll-name"
            type="text"
            placeholder="Add the name everyone knows you by"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            required
          />
          {nameWarning && (
            <p className="mt-1 text-xs text-rose-600" dangerouslySetInnerHTML={{ __html: nameWarning }} />
          )}
        </div>

        <div>
          <label htmlFor="poll-email" className="text-sm font-semibold text-slate-700">
            Email (required)
          </label>
          <input
            id="poll-email"
            type="email"
            required
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />
          <p className="mt-1 text-xs text-slate-500">
            Add your email to get a vote confirmation, reminders, and easy updates. We'll never spam you or share your address.
          </p>
        </div>

        <div>
          <label htmlFor="poll-message" className="text-sm font-semibold text-slate-700">
            Optional message to {organiser}
          </label>
          <textarea
            id="poll-message"
            className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            rows={3}
            placeholder={`Share extra context with ${organiser}`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className={`w-full rounded-full bg-slate-900 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-slate-900/20 ${
            isSubmitting ? 'cursor-not-allowed opacity-60' : 'transition hover:-translate-y-0.5'
          }`}
        >
          {isSubmitting ? 'Submitting...' : 'Submit vote'}
        </button>

        {status && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-sm font-semibold text-emerald-800">
            {status}
          </div>
        )}
      </div>
    </div>
  );
}

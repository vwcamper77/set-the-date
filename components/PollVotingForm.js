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
  evening: 'Evening out',
};
const MEAL_STATE_OPTIONS = ['yes', 'maybe', 'no'];
const MEAL_STATE_ICONS = {
  yes: '✅',
  maybe: '🤔',
  no: '⬜️',
};

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
    <>
      {showBulkActions && (
        <div className="sticky top-0 z-20 bg-white pt-2 pb-2 mb-4 border-b border-gray-200">
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm md:text-base text-center font-semibold">
            <button
              type="button"
              onClick={() => setAllVotesForValue('yes')}
              disabled={isSubmitting}
              className={`flex items-center gap-1 border border-green-500 bg-green-50 px-3 py-1.5 rounded-md whitespace-nowrap ${
                isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-green-100'
              }`}
            >
              ✅ Select All Yes
            </button>
            <button
              type="button"
              onClick={() => setAllVotesForValue('maybe')}
              disabled={isSubmitting}
              className={`flex items-center gap-1 border border-yellow-500 bg-yellow-50 px-3 py-1.5 rounded-md whitespace-nowrap ${
                isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-yellow-100'
              }`}
            >
              🤔 Select All Maybe
            </button>
            <button
              type="button"
              onClick={() => setAllVotesForValue('no')}
              disabled={isSubmitting}
              className={`flex items-center gap-1 border border-red-500 bg-red-50 px-3 py-1.5 rounded-md whitespace-nowrap ${
                isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-100'
              }`}
            >
              ❌ Select All No
            </button>
          </div>
        </div>
      )}

      {poll.dates.map(date => {
        const enabledMeals = eventType === 'meal' ? enabledMealsForDate(poll, date) : [];
        const mealState = eventType === 'meal' ? normaliseMealState(mealPreferences[date], enabledMeals) : null;
        const isDateUnavailable = eventType === 'meal' ? Boolean(unavailableDates[date]) : false;

        return (
          <div key={date} className="border p-4 mb-4 rounded">
            <div className="font-semibold mb-2">
              {format(parseISO(date), 'EEEE do MMMM yyyy')}
            </div>

            {eventType !== 'meal' && (
              <div className="flex justify-between items-center text-sm">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name={date}
                    value="yes"
                    checked={votes[date] === 'yes'}
                    onChange={() => handleGenericVoteChange(date, 'yes')}
                  /> ✅ Can attend
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name={date}
                    value="maybe"
                    checked={votes[date] === 'maybe'}
                    onChange={() => handleGenericVoteChange(date, 'maybe')}
                  /> 🤔 Maybe
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name={date}
                    value="no"
                    checked={votes[date] === 'no'}
                    onChange={() => handleGenericVoteChange(date, 'no')}
                  /> ❌ No
                </label>
              </div>
            )}

            {eventType === 'meal' && (
              <div className="space-y-3">
                <label className="inline-flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={isDateUnavailable}
                    onChange={(e) => toggleDateUnavailable(date, e.target.checked, enabledMeals)}
                    disabled={isSubmitting}
                  />
                  <span>I can't make this date</span>
                </label>

                {enabledMeals.length === 0 ? (
                  <p className="text-xs text-gray-500">No meal slots configured for this date.</p>
                ) : (
                  <>
                    <p className="text-xs text-gray-600">
                      Rate each meal slot so {organiser || 'the organiser'} knows if it works for you.
                    </p>
                    <div className={isDateUnavailable ? 'opacity-60 pointer-events-none' : ''}>
                      <div className="space-y-3">
                        {enabledMeals.map(meal => {
                          const currentState = mealState[meal] || 'no';
                          return (
                            <div key={`${date}-${meal}`} className="border border-gray-200 rounded p-2">
                              <div className="text-sm font-semibold text-gray-800">
                                {MEAL_LABELS[meal] || meal}
                              </div>
                              <div className="grid grid-cols-3 gap-2 mt-2">
                                {MEAL_STATE_OPTIONS.map(option => {
                                  const active = currentState === option;
                                  const buttonClasses = [
                                    'px-3 py-1.5 rounded border flex items-center justify-center gap-1 text-sm font-medium transition',
                                    isSubmitting ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                                    active
                                      ? option === 'yes'
                                        ? 'bg-green-100 border-green-400 text-green-800'
                                        : option === 'maybe'
                                        ? 'bg-amber-100 border-amber-400 text-amber-900'
                                        : 'bg-red-100 border-red-300 text-red-700'
                                      : option === 'no'
                                      ? 'border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700'
                                      : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800',
                                  ].join(' ');
                                  return (
                                    <button
                                      type="button"
                                      key={`${date}-${meal}-${option}`}
                                      className={buttonClasses}
                                      onClick={() => updateMealResponse(date, meal, option, enabledMeals)}
                                      disabled={isSubmitting || isDateUnavailable}
                                    >
                                      <span>{MEAL_STATE_ICONS[option]}</span>
                                      <span>{option === 'yes' ? 'Yes' : option === 'maybe' ? 'Maybe' : 'No'}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {!isDateUnavailable && enabledMeals.length > 0 && !hasPositiveMealSelection(mealState) && (
                  <p className="text-xs text-amber-700">
                    Choose at least one slot as ✅ or 🤔 so we can count your availability.
                  </p>
                )}
                {isDateUnavailable && (
                  <p className="text-[11px] text-gray-500">
                    You’ve marked this date as unavailable. Untick above to share meal availability.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
      {eventType === 'holiday' && (
        <div className="border border-blue-200 bg-blue-50 rounded p-4 mb-4 text-sm">
          <p className="text-blue-800 font-semibold mb-3">Tell {organiser} your ideal travel window:</p>
          <label className="block font-medium text-blue-900 mb-1">Earliest you could start</label>
          <select
            className="w-full border rounded px-3 py-2 mb-3"
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

          <label className="block font-medium text-blue-900 mb-1">Latest you could finish</label>
          <select
            className="w-full border rounded px-3 py-2 mb-3"
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

          <label className="block font-medium text-blue-900 mb-1">How many days can you go for?</label>
          <input
            type="number"
            min={1}
            className="w-full border rounded px-3 py-2"
            value={holidayDuration}
            onChange={(e) => setHolidayDuration(e.target.value)}
            placeholder="e.g. 5"
          />
          <p className="mt-2 text-xs text-blue-700">
            We'll use this alongside your dates to suggest the best start and end for the group.
          </p>
        </div>
      )}

      <input
        type="text"
        placeholder="Your Nickname or First Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full mb-1 p-2 border rounded"
        required
      />
      {nameWarning && (
        <p className="text-sm text-red-600 mb-2" dangerouslySetInnerHTML={{ __html: nameWarning }} />
      )}

      <input
        type="email"
        required
        placeholder="Your email (required)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full mb-1 p-2 border rounded"
      />
      <p className="text-xs text-gray-500 mb-3">
        Add your email to get a vote confirmation, reminders, and easy updates. We’ll never spam you or share your address.
      </p>

      <textarea
        className="w-full border rounded p-2 mb-3 text-sm"
        rows={3}
        placeholder={`Optional message to ${organiser}`}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className={`bg-black text-white px-4 py-2 rounded w-full font-semibold ${
          isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        {isSubmitting ? 'Submitting...' : 'Submit Vote'}
      </button>

      {status && <p className="mt-4 text-center text-green-600">{status}</p>}
    </>
  );
}

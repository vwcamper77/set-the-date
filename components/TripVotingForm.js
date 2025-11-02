import { useEffect, useMemo, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { parseISO, format, eachDayOfInterval, addDays, differenceInCalendarDays } from 'date-fns';
import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';
import { HOLIDAY_DURATION_OPTIONS } from '@/utils/eventOptions';

const durationFallback = HOLIDAY_DURATION_OPTIONS[3]?.value || '5_nights';
const DEFAULT_FLEX_PADDING_DAYS = 2;

const toTitleCase = (str = '') =>
  str
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const buildDaysBetween = (from, to) =>
  eachDayOfInterval({ start: from, end: to }).map((day) => day.getTime());

const pluralise = (value, singular) => (value === 1 ? singular : `${singular}s`);

const durationToNights = (value) => {
  if (!value) return null;
  if (value.endsWith('_nights')) {
    const parsed = parseInt(value.split('_')[0], 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  switch (value) {
    case '1_week':
      return 7;
    case '10_nights':
      return 10;
    case '2_weeks':
      return 14;
    case 'unlimited':
      return null;
    default:
      return null;
  }
};

const getRangeLength = (start, end) => {
  if (!start || !end) {
    return { days: 0, nights: 0 };
  }
  const days = Math.max(0, differenceInCalendarDays(end, start) + 1);
  return {
    days,
    nights: days > 0 ? days - 1 : 0,
  };
};

export default function TripVotingForm({ poll, pollId, organiser, eventTitle, onSubmitted }) {
  const [currentRange, setCurrentRange] = useState({ from: undefined, to: undefined });
  const [savedRanges, setSavedRanges] = useState([]);
  const [preferredDuration, setPreferredDuration] = useState(durationFallback);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState('');
  const [rangeFeedback, setRangeFeedback] = useState(null);

  // Minimum trip length comes from organiser settings
  const minTripDays = useMemo(() => {
    const fromPoll =
      Number(poll?.eventOptions?.minTripDays ?? poll?.eventOptions?.minDays);
    if (Number.isFinite(fromPoll) && fromPoll > 0) return fromPoll;

    // Fallback: infer from proposedDuration if it implies a minimum
    const nightsFromDuration = durationToNights(poll?.eventOptions?.proposedDuration);
    if (Number.isFinite(nightsFromDuration) && nightsFromDuration > 0) {
      // days = nights + 1
      return nightsFromDuration + 1;
    }
    // Final fallback: 2 days as a sensible minimum
    return 2;
  }, [poll?.eventOptions?.minTripDays, poll?.eventOptions?.minDays, poll?.eventOptions?.proposedDuration]);

  const flexPaddingDays = useMemo(() => {
    const raw = poll?.eventOptions?.flexiblePaddingDays;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
      return Math.min(raw, 14);
    }
    return DEFAULT_FLEX_PADDING_DAYS;
  }, [poll?.eventOptions?.flexiblePaddingDays]);

  const proposedDurationLabel = useMemo(() => {
    const proposed = poll?.eventOptions?.proposedDuration;
    if (!proposed) return '';
    const match = HOLIDAY_DURATION_OPTIONS.find((option) => option.value === proposed);
    return match?.label || '';
  }, [poll?.eventOptions?.proposedDuration]);

  const { minDate, maxDate, flexMinDate, flexMaxDate, formattedWindow, organiserWindowDays } = useMemo(() => {
    const selectedDates = (poll?.selectedDates || poll?.dates || []).filter(Boolean);
    if (!selectedDates.length) {
      return {
        minDate: null,
        maxDate: null,
        flexMinDate: null,
        flexMaxDate: null,
        formattedWindow: '',
        organiserWindowDays: 0,
      };
    }

    const sorted = selectedDates
      .map((isoDate) => parseISO(isoDate))
      .filter((date) => date instanceof Date && !Number.isNaN(date))
      .sort((a, b) => a - b);

    const start = sorted[0];
    const end = sorted[sorted.length - 1];
    return {
      minDate: start,
      maxDate: end,
      flexMinDate: addDays(start, -flexPaddingDays),
      flexMaxDate: addDays(end, flexPaddingDays),
      formattedWindow: `${format(start, 'EEE d MMM yyyy')} → ${format(end, 'EEE d MMM yyyy')}`,
      organiserWindowDays: differenceInCalendarDays(end, start) + 1,
    };
  }, [poll?.selectedDates, poll?.dates, flexPaddingDays]);

  const savedDays = useMemo(() => {
    if (!savedRanges.length) return [];
    return savedRanges.flatMap((range) => buildDaysBetween(range.from, range.to));
  }, [savedRanges]);

  useEffect(() => {
    if (poll?.eventOptions?.proposedDuration) {
      setPreferredDuration(poll.eventOptions.proposedDuration);
    }
  }, [poll?.eventOptions?.proposedDuration]);

  const currentSelectionDetails = useMemo(() => {
    if (!currentRange?.from) return null;
    const start = currentRange.from;
    const end = currentRange.to;
    const { days, nights } = getRangeLength(start, end);
    return { start, end, days, nights };
  }, [currentRange]);

  const clampRange = (range) => {
    if (!range?.from || !range?.to) return null;
    const clampedStart = flexMinDate && range.from < flexMinDate ? flexMinDate : range.from;
    const clampedEnd = flexMaxDate && range.to > flexMaxDate ? flexMaxDate : range.to;
    if (clampedStart > clampedEnd) return null;
    return { from: clampedStart, to: clampedEnd };
  };

  const registerRange = (range) => {
    if (!minDate || !maxDate) {
      setRangeFeedback({
        type: 'error',
        message: 'This trip does not have a valid organiser window yet.',
      });
      return false;
    }
    if (!range?.from || !range?.to) {
      return false;
    }

    const clamped = clampRange(range);
    if (!clamped) {
      setRangeFeedback({
        type: 'error',
        message: 'That selection is not valid. Try picking the dates again.',
      });
      return false;
    }

    const { days } = getRangeLength(clamped.from, clamped.to);

    if (days < minTripDays) {
      setRangeFeedback({
        type: 'error',
        message: `Trip windows must be at least ${minTripDays} ${pluralise(
          minTripDays,
          'day',
        )}. You currently have ${days} ${pluralise(days, 'day')}.`,
      });
      return false;
    }

    const key = `${clamped.from.toISOString()}_${clamped.to.toISOString()}`;
    if (savedRanges.some((saved) => saved.key === key)) {
      setRangeFeedback({
        type: 'info',
        message: 'You already saved that window.',
      });
      setCurrentRange({ from: undefined, to: undefined });
      return false;
    }

    setSavedRanges((prev) => [...prev, { key, ...clamped }]);
    setCurrentRange({ from: undefined, to: undefined });
    setRangeFeedback({
      type: 'success',
      message: `Saved ${format(clamped.from, 'EEE d MMM yyyy')} → ${format(
        clamped.to,
        'EEE d MMM yyyy',
      )}.`,
    });
    return true;
  };

  const handleRangeSelect = (range) => {
    setCurrentRange(range || { from: undefined, to: undefined });
    setRangeFeedback(null);
  };

  const handleSaveCurrentRange = () => {
    if (currentRange?.from && currentRange?.to) {
      registerRange(currentRange);
    }
  };

  const clearCurrentRange = () => {
    setCurrentRange({ from: undefined, to: undefined });
    setRangeFeedback(null);
  };

  const addWholeWindow = () => {
    if (!minDate || !maxDate) return;
    registerRange({ from: minDate, to: maxDate });
  };

  const handleRemoveRange = (key) => {
    setSavedRanges((prev) => prev.filter((range) => range.key !== key));
    setRangeFeedback({
      type: 'info',
      message: 'Removed that window.',
    });
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName || !trimmedEmail) {
      alert('Please provide both your name and email.');
      return;
    }
    if (!savedRanges.length) {
      alert('Add at least one window that suits you.');
      return;
    }
    if (!minDate || !maxDate) {
      alert('This trip does not have a valid organiser range yet.');
      return;
    }

    setIsSubmitting(true);
    setStatus('');

    const titleCaseName = toTitleCase(trimmedName);
    const docId = trimmedEmail;

    const holidayChoices = savedRanges.map((range) => ({
      start: range.from.toISOString(),
      end: range.to.toISOString(),
      preferredNights: preferredDuration,
    }));

    const payload = {
      displayName: titleCaseName,
      name: trimmedName.toLowerCase(),
      email: trimmedEmail,
      message,
      eventType: 'holiday',
      holidayChoices,
      preferredDuration,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    };

    try {
      const voteRef = doc(collection(db, 'polls', pollId, 'votes'), docId);
      await setDoc(voteRef, payload, { merge: true });

      logEventIfAvailable('holiday_vote_submitted', {
        pollId,
        name: titleCaseName,
        windowCount: holidayChoices.length,
        preferredNights: preferredDuration,
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
          votes: {
            holidayRanges: holidayChoices,
          },
          message,
        }),
      });

      await fetch('/api/addAttendeeToBrevo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          firstName: titleCaseName,
          lastName: '',
        }),
      });

      await fetch('/api/sendAttendeeEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pollId,
          email: trimmedEmail,
          firstName: titleCaseName,
          eventTitle,
        }),
      });

      setStatus('Thanks! Your travel windows have been saved.');
      setSavedRanges([]);
      setCurrentRange({ from: undefined, to: undefined });
      setRangeFeedback(null);
      if (typeof onSubmitted === 'function') {
        onSubmitted();
      }
    } catch (error) {
      console.error('Failed to submit holiday availability:', error);
      setStatus('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const savedModifier = (date) => savedDays.includes(date.getTime());
  const organiserModifier = (date) =>
    Boolean(minDate && maxDate && date >= minDate && date <= maxDate);

  const currentRangeDays = currentSelectionDetails?.days || 0;
  const currentRangeHasEnd = Boolean(currentSelectionDetails?.end);
  const canSaveCurrentRange =
    currentRangeHasEnd && currentRangeDays >= minTripDays;
  const currentRangeTooShort =
    currentRangeHasEnd && currentRangeDays > 0 && currentRangeDays < minTripDays;

  return (
    <div className="w-full">
      <div className="text-center mb-6">
        <p className="text-sm text-gray-600">Suggested window from {organiser}:</p>
        <p className="text-lg font-semibold text-blue-700">{formattedWindow || 'TBC'}</p>
        {minDate && maxDate && (
          <p className="text-xs text-gray-500 mt-1">
            {`This spans ${organiserWindowDays} ${pluralise(organiserWindowDays, 'day')}.`}
            {flexPaddingDays
              ? ` You can start up to ${flexPaddingDays} ${pluralise(
                  flexPaddingDays,
                  'day',
                )} earlier or finish up to ${flexPaddingDays} ${pluralise(
                  flexPaddingDays,
                  'day',
                )} later if that helps.`
              : ''}
          </p>
        )}
        {proposedDurationLabel && (
          <p className="text-xs text-gray-500 mt-1">
            Ideal trip length: {proposedDurationLabel}
          </p>
        )}
        <p className="text-xs text-gray-600 mt-2 font-medium">
          {`Each window you add must be at least ${minTripDays} ${pluralise(
            minTripDays,
            'day',
          )}.`}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Drag across the calendar to choose start and finish dates, then save the window below.
        </p>
        {minDate && maxDate && (
          <button
            type="button"
            onClick={addWholeWindow}
            className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded border border-blue-400 text-blue-600 hover:bg-blue-50"
          >
            Use whole organiser window
          </button>
        )}
      </div>

      <div className="flex justify-center mb-4">
        <DayPicker
          mode="range"
          selected={currentRange}
          onSelect={handleRangeSelect}
          disabled={{
            before: flexMinDate || undefined,
            after: flexMaxDate || undefined,
          }}
          numberOfMonths={
            minDate && maxDate && minDate.getMonth() === maxDate.getMonth() ? 1 : 2
          }
          fromMonth={flexMinDate || minDate || undefined}
          toMonth={flexMaxDate || maxDate || undefined}
          modifiers={{ saved: savedModifier, organiser: organiserModifier }}
          modifiersClassNames={{
            saved: 'bg-blue-100 text-blue-800 font-semibold',
            organiser: 'bg-blue-50 text-blue-900',
          }}
        />
      </div>

      {currentSelectionDetails && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-blue-900">Selected window</p>
              <p>
                {format(currentSelectionDetails.start, 'EEE d MMM yyyy')} →{' '}
                {currentSelectionDetails.end
                  ? format(currentSelectionDetails.end, 'EEE d MMM yyyy')
                  : 'Pick an end date'}
              </p>
              {currentSelectionDetails.end ? (
                <p
                  className={`mt-1 text-xs ${
                    currentRangeTooShort ? 'text-red-600' : 'text-blue-800'
                  }`}
                >
                  {currentRangeTooShort
                    ? `Trips need to be at least ${minTripDays} ${pluralise(
                        minTripDays,
                        'day',
                      )}. You currently have ${currentRangeDays} ${pluralise(
                        currentRangeDays,
                        'day',
                      )}.`
                    : `${currentRangeDays} ${pluralise(
                        currentRangeDays,
                        'day',
                      )} (${currentSelectionDetails.nights} ${pluralise(
                        currentSelectionDetails.nights,
                        'night',
                      )}) selected.`}
                </p>
              ) : (
                <p className="mt-1 text-xs text-blue-800">
                  Select an end date to see the trip length.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearCurrentRange}
                className="text-xs text-blue-700 hover:text-blue-900 underline"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleSaveCurrentRange}
                disabled={!canSaveCurrentRange}
                className={`inline-flex items-center rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  canSaveCurrentRange
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
              >
                Save window
              </button>
            </div>
          </div>
        </div>
      )}

      {rangeFeedback && (
        <div
          className={`mb-4 text-sm text-center ${
            rangeFeedback.type === 'error'
              ? 'text-red-600'
              : rangeFeedback.type === 'success'
              ? 'text-blue-700'
              : 'text-blue-600'
          }`}
        >
          {rangeFeedback.message}
        </div>
      )}

      {savedRanges.length === 0 && (
        <div className="mb-6 rounded border border-dashed border-blue-300 bg-blue-50/50 px-4 py-5 text-center text-xs text-blue-700">
          Add each start and finish that works for you. Saved windows will appear here.
        </div>
      )}

      {savedRanges.length > 0 && (
        <div className="mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-2">
            Your travel windows
          </p>
          <p className="text-xs text-gray-500 mb-3">
            Add as many options as you can. Organisers will see them all.
          </p>
          <div className="space-y-3">
            {savedRanges.map((range) => {
              const { days, nights } = getRangeLength(range.from, range.to);
              return (
                <div
                  key={range.key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:gap-6">
                    <div>
                      <span className="block text-xs uppercase tracking-wide text-blue-600">
                        Start
                      </span>
                      <span className="font-semibold">
                        {format(range.from, 'EEE d MMM yyyy')}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs uppercase tracking-wide text-blue-600">
                        Finish
                      </span>
                      <span className="font-semibold">
                        {format(range.to, 'EEE d MMM yyyy')}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs sm:text-sm text-blue-800">
                    {days} {pluralise(days, 'day')} / {nights} {pluralise(nights, 'night')}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveRange(range.key)}
                    className="text-xs font-semibold uppercase tracking-wide text-blue-700 hover:text-blue-900"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium mb-1">Your name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="Jamie"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Your email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="you@example.com"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium mb-1">Ideal trip length</label>
        <select
          value={preferredDuration}
          onChange={(e) => setPreferredDuration(e.target.value)}
          className="w-full border rounded px-3 py-2"
        >
          {HOLIDAY_DURATION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium mb-1">
          Message for {organiser}{' '}
          <span className="text-xs text-gray-400">(optional)</span>
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="w-full border rounded px-3 py-2"
          placeholder="Anything they should know?"
        />
      </div>

      <button
        type="button"
        disabled={isSubmitting}
        onClick={handleSubmit}
        className={`w-full mt-6 py-3 rounded font-semibold text-white transition ${
          isSubmitting ? 'bg-gray-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {isSubmitting ? 'Saving…' : 'Save my availability'}
      </button>

      {status && <p className="mt-4 text-center text-sm text-blue-700">{status}</p>}
    </div>
  );
}

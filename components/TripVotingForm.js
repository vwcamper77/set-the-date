import { useEffect, useMemo, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { parseISO, format, eachDayOfInterval } from 'date-fns';
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

const toTitleCase = (str = '') =>
  str
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const buildDaysBetween = (from, to) =>
  eachDayOfInterval({ start: from, end: to }).map((day) => day.getTime());

export default function TripVotingForm({ poll, pollId, organiser, eventTitle, onSubmitted }) {
  const [currentRange, setCurrentRange] = useState({ from: undefined, to: undefined });
  const [savedRanges, setSavedRanges] = useState([]);
  const [preferredDuration, setPreferredDuration] = useState(durationFallback);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState('');

  const { minDate, maxDate, formattedWindow } = useMemo(() => {
    const selectedDates = (poll?.selectedDates || poll?.dates || []).filter(Boolean);
    if (!selectedDates.length) return { minDate: null, maxDate: null, formattedWindow: '' };

    const sorted = selectedDates
      .map((isoDate) => parseISO(isoDate))
      .filter((date) => date instanceof Date && !Number.isNaN(date))
      .sort((a, b) => a - b);

    const start = sorted[0];
    const end = sorted[sorted.length - 1];
    return {
      minDate: start,
      maxDate: end,
      formattedWindow: `${format(start, 'EEE d MMM yyyy')} → ${format(end, 'EEE d MMM yyyy')}`,
    };
  }, [poll?.selectedDates, poll?.dates]);

  const savedDays = useMemo(() => {
    if (!savedRanges.length) return [];
    return savedRanges.flatMap((range) => buildDaysBetween(range.from, range.to));
  }, [savedRanges]);

  useEffect(() => {
    if (poll?.eventOptions?.proposedDuration) {
      setPreferredDuration(poll.eventOptions.proposedDuration);
    }
  }, [poll?.eventOptions?.proposedDuration]);  const clampRange = (range) => {
    if (!range?.from || !range?.to) return null;
    const clampedStart = minDate && range.from < minDate ? minDate : range.from;
    const clampedEnd = maxDate && range.to > maxDate ? maxDate : range.to;
    return { from: clampedStart, to: clampedEnd };
  };

  const registerRange = (range) => {
    if (!minDate || !maxDate) return false;
    const clamped = clampRange(range);
    if (!clamped) return false;
    const key = `${clamped.from.toISOString()}_${clamped.to.toISOString()}`;
    if (savedRanges.some((saved) => saved.key === key)) {
      return false;
    }
    setSavedRanges((prev) => [...prev, { key, ...clamped }]);
    setCurrentRange({ from: undefined, to: undefined });
    return true;
  };

  const handleRangeSelect = (range) => {
    if (!range) {
      setCurrentRange({ from: undefined, to: undefined });
      return;
    }
    setCurrentRange(range);
    if (range.from && range.to) {
      registerRange(range);
    }
  };

  const addWholeWindow = () => {
    if (!minDate || !maxDate) return;
    registerRange({ from: minDate, to: maxDate });
  };

  const handleRemoveRange = (key) => {
    setSavedRanges((prev) => prev.filter((range) => range.key !== key));
  };

 (key) => {
    setSavedRanges((prev) => prev.filter((range) => range.key !== key));
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

  return (
    <div className="w-full">
      <div className="text-center mb-6">
        <p className="text-sm text-gray-600">Suggested window from {organiser}:</p>
        <p className="text-lg font-semibold text-blue-700">{formattedWindow || 'TBC'}</p>
        <p className="text-xs text-gray-500 mt-1">
          Drag across the calendar to create travel windows. Each selection saves automatically — remove any you don’t need below.
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
          onSelect={(range) => setCurrentRange(range || { from: undefined, to: undefined })}
          disabled={{
            before: minDate || undefined,
            after: maxDate || undefined,
          }}
          numberOfMonths={minDate && maxDate && minDate.getMonth() === maxDate.getMonth() ? 1 : 2}
          fromMonth={minDate || undefined}
          toMonth={maxDate || undefined}
          modifiers={{ saved: savedModifier }}
          modifiersClassNames={{ saved: 'bg-blue-100 text-blue-800 font-semibold' }}
        />
      </div>

      {currentRange?.from && !currentRange?.to && (
        <div className="mb-4 text-sm text-blue-700 text-center">
          Pick the end date for your window.
        </div>
      )}

      {savedRanges.length === 0 && (
        <div className="mb-6 rounded border border-dashed border-blue-300 bg-blue-50/50 px-4 py-5 text-center text-xs text-blue-700">
          Drag across the calendar to add windows. They'll appear here once saved, and you can remove any before submitting.
        </div>
      )}

      {savedRanges.length > 0 && (
        <div className="mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-2">Your travel windows</p>
          <div className="flex flex-wrap gap-2">
            {savedRanges.map((range) => (
              <span
                key={range.key}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-xs md:text-sm"
              >
                {format(range.from, 'd MMM')} → {format(range.to, 'd MMM')}
                <button
                  type="button"
                  onClick={() => handleRemoveRange(range.key)}
                  className="text-blue-700 hover:text-blue-900"
                >
                  ×
                </button>
              </span>
            ))}
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


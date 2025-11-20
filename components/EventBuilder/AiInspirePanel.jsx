import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';

const DATE_PRESETS = [
  { key: 'this_week', label: 'This week' },
  { key: 'next_week', label: 'Next week' },
  { key: 'this_month', label: 'This month' },
  { key: 'next_month', label: 'Next month' },
  { key: 'specific', label: 'Specific dates' },
];

const VIBE_CHIPS = [
  'Chilled drinks',
  'Big night out',
  'Dinner',
  'Games night',
  'Live music',
  'Outdoors',
  'Family friendly',
];

const EVENT_TYPE_OPTIONS = [
  { label: 'Not sure yet', value: 'Not sure yet' },
  { label: 'Meal or drinks', value: 'Meal or drinks' },
  { label: 'Day out', value: 'Day out' },
  { label: 'Night out', value: 'Night out' },
  { label: 'Trip or weekend away', value: 'Trip or weekend away' },
  { label: 'Activity (eg darts, bowling, escape room)', value: 'Activity' },
];

const BUDGET_OPTIONS = ['Low', 'Medium', 'High', 'Not sure'];

function SuggestionCard({ suggestion, onUse }) {
  const whyText =
    suggestion.whySuitable && !['OPERATIONAL', 'FLAGGED', 'UNKNOWN'].includes(suggestion.whySuitable?.toUpperCase())
      ? suggestion.whySuitable
      : '';
  const dateFitText =
    suggestion.dateFitSummary && suggestion.dateFitSummary.toLowerCase() === 'this week'
      ? 'Good for your chosen dates'
      : suggestion.dateFitSummary;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{suggestion.title}</h3>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            {suggestion.category || suggestion.type || 'Idea'}
          </p>
        </div>
        {suggestion.roughPrice && (
          <span className="text-xs font-semibold bg-gray-100 px-2 py-1 rounded-full text-gray-700">
            {suggestion.roughPrice}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-700">
        {suggestion.location?.address || suggestion.location?.name || 'Nearby'}
      </p>
      {dateFitText && <p className="text-xs text-gray-600">{dateFitText}</p>}
      {suggestion.groupFitSummary && <p className="text-xs text-gray-600">{suggestion.groupFitSummary}</p>}
      {whyText && (
        <p className="text-sm text-gray-800 border-l-4 border-gray-200 pl-3">
          {whyText}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        {suggestion.external?.url && (
          <a
            className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 underline-offset-2 hover:underline"
            href={suggestion.external.url}
            target="_blank"
            rel="noreferrer"
          >
            View website
        </a>
      )}
        <button
          type="button"
          onClick={() => onUse?.(suggestion)}
          className="ml-auto rounded bg-gray-900 text-white px-4 py-2 text-sm font-semibold transition hover:bg-gray-800"
        >
          Use this to plan
        </button>
      </div>
    </div>
  );
}

export default function AiInspirePanel({ onUseSuggestion, defaultLocation = '' }) {
  const [groupSize, setGroupSize] = useState('');
  const [location, setLocation] = useState(defaultLocation);
  const [datePreset, setDatePreset] = useState('this_week');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [vibe, setVibe] = useState('');
  const [eventType, setEventType] = useState('Not sure yet');
  const [budgetLevel, setBudgetLevel] = useState('');
  const [needsStepFree, setNeedsStepFree] = useState(false);
  const [ageRangeHint, setAgeRangeHint] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [hasRequested, setHasRequested] = useState(false);
  const defaultLocationAppliedRef = useRef(false);

  useEffect(() => {
    if (defaultLocation && !location && !defaultLocationAppliedRef.current) {
      setLocation(defaultLocation);
      defaultLocationAppliedRef.current = true;
    }
  }, [defaultLocation, location]);

  const dateRangePayload = useMemo(() => {
    if (datePreset === 'specific') {
      return {
        mode: 'explicit',
        label: 'Specific dates',
        startDate: startDate || null,
        endDate: endDate || null,
      };
    }
    const labelLookup = {
      this_week: 'This week',
      next_week: 'Next week',
      this_month: 'This month',
      next_month: 'Next month',
    };
    return {
      mode: 'relative',
      label: labelLookup[datePreset] || 'This month',
    };
  }, [datePreset, startDate, endDate]);

  const canSubmit = useMemo(() => {
    const numericSize = Number(groupSize);
    if (!Number.isFinite(numericSize) || numericSize < 1) return false;
    if (!location || !vibe || !eventType) return false;
    if (datePreset === 'specific' && (!startDate || !endDate)) return false;
    return true;
  }, [groupSize, location, vibe, eventType, datePreset, startDate, endDate]);

  const handleChip = (chip) => setVibe((prev) => (prev ? `${prev}, ${chip}` : chip));

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (!canSubmit) return;
      setLoading(true);
      setError('');
      setHasRequested(true);
      const numericSize = Math.max(1, Number(groupSize) || 1);
      logEventIfAvailable('ai_inspire_submitted', {
        hasVibe: Boolean(vibe),
        preset: datePreset,
        eventType,
      });
      try {
        const resp = await fetch('/api/ai-inspire', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupSize: numericSize,
            location,
            dateRange: dateRangePayload,
            vibe,
            eventType,
            budgetLevel: budgetLevel || undefined,
            accessibility: { needsStepFree },
            ageRangeHint: ageRangeHint || undefined,
          }),
        });
        if (!resp.ok) {
          throw new Error(`Service returned ${resp.status}`);
        }
        const data = await resp.json();
        const list = Array.isArray(data?.suggestions) ? data.suggestions : [];
        setSuggestions(list);
        logEventIfAvailable('ai_inspire_results_shown', {
          resultCount: list.length,
          success: true,
        });
      } catch (err) {
        console.error('AI Inspire fetch failed', err);
        setError('Our AI helper is having a moment. Try again soon or plan manually.');
        logEventIfAvailable('ai_inspire_results_shown', { resultCount: 0, success: false });
      } finally {
        setLoading(false);
      }
    },
    [canSubmit, groupSize, location, dateRangePayload, vibe, eventType, budgetLevel, needsStepFree, ageRangeHint, datePreset]
  );

  const handleUseSuggestion = useCallback(
    (suggestion) => {
      logEventIfAvailable('ai_inspire_suggestion_selected', {
        flow: suggestion?.recommendedFlow || 'general',
        hasLink: Boolean(suggestion?.external?.url),
      });
      onUseSuggestion?.(suggestion);
    },
    [onUseSuggestion]
  );

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Tell us what you need</h2>
        <p className="text-sm text-gray-600">We will suggest events and venues near you.</p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <label className="block text-sm font-medium text-gray-800">
            How many people are you organising for?
            <input
              type="number"
              min={1}
              value={groupSize}
              onChange={(e) => setGroupSize(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 p-2"
            />
          </label>

          <div className="block text-sm font-medium text-gray-800">
            <div className="flex items-center justify-between">
              <span>Where will you meet?</span>
              {location ? (
                <button
                  type="button"
                  className="text-xs font-semibold text-blue-600 underline-offset-2 hover:underline"
                  onClick={() => {
                    setLocation('');
                    defaultLocationAppliedRef.current = true; // stop reapplying default after clear
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
            <input
              type="text"
              value={location}
              placeholder="City, town or postcode"
              onChange={(e) => setLocation(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 p-2"
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-800">When roughly?</p>
            <div className="flex flex-wrap gap-2">
              {DATE_PRESETS.map((preset) => {
                const selected = preset.key === datePreset;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => setDatePreset(preset.key)}
                    className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
                      selected ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            {datePreset === 'specific' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-sm text-gray-700">
                  Start date
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 p-2"
                  />
                </label>
                <label className="text-sm text-gray-700">
                  End date
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 p-2"
                  />
                </label>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-800">
              What kind of event are you in the mood for?
              <input
                type="text"
                value={vibe}
                onChange={(e) => setVibe(e.target.value)}
                placeholder="Fishing, bottomless brunch, cosy bar, board games..."
                className="mt-1 w-full rounded border border-gray-300 p-2"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {VIBE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleChip(chip)}
                  className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-200"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          <label className="block text-sm font-medium text-gray-800">
            Event type
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 p-2"
            >
              {EVENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-gray-800">
              Budget (optional)
              <select
                value={budgetLevel}
                onChange={(e) => setBudgetLevel(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 p-2"
              >
                <option value="">Not sure</option>
                {BUDGET_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-gray-800">
              Any age range or notes? (optional)
              <input
                type="text"
                value={ageRangeHint}
                onChange={(e) => setAgeRangeHint(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 p-2"
              />
            </label>
          </div>

          <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-800">
            <input
              type="checkbox"
              checked={needsStepFree}
              onChange={(e) => setNeedsStepFree(e.target.checked)}
            />
            Need step free access
          </label>

          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="w-full rounded bg-gray-900 text-white px-4 py-3 font-semibold transition hover:bg-gray-800 disabled:opacity-70"
          >
            {loading ? 'Finding ideas...' : 'Get ideas'}
          </button>
          {loading && (
            <p className="text-sm text-center text-gray-600">
              Finding ideas near you. This can take a few seconds.
            </p>
          )}
          {error && <p className="text-sm text-center text-red-600">{error}</p>}
        </form>
      </div>

      {hasRequested && !loading && suggestions.length === 0 && !error && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-center text-sm text-gray-700">
          We could not find good matches right now. Try widening the date range or changing the vibe, or pick your own
          venue and we will still handle the date poll.
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-3">
          {suggestions.map((suggestion) => (
            <SuggestionCard key={suggestion.id} suggestion={suggestion} onUse={handleUseSuggestion} />
          ))}
        </div>
      )}
    </div>
  );
}

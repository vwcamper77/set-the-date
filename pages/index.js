import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import { db } from '@/lib/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import Script from 'next/script';
import { nanoid } from 'nanoid';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';

const DateSelector = dynamic(() => import('@/components/DateSelector'), { ssr: false });
const MapboxAutocomplete = dynamic(() => import('@/components/MapboxAutocomplete'), { ssr: false });

import ShareButtons from '@/components/ShareButtons';
import BuyMeACoffee from '@/components/BuyMeACoffee';
import LogoHeader from '@/components/LogoHeader';
import { HOLIDAY_DURATION_OPTIONS } from '@/utils/eventOptions';
import UpgradeModal from '@/components/UpgradeModal';

/* ---------- small inline components ---------- */
const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
const FREE_POLL_LIMIT = 1;
const FREE_DATE_LIMIT = 3;
const VALID_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const DEFAULT_ORGANISER_STATUS = {
  planType: 'free',
  pollsCreatedCount: 0,
  pendingStripeSessionId: null,
  stripeCustomerId: null,
};

const UPGRADE_COPY = {
  poll_limit: "You're already using your free poll. Upgrade once for £5 to create unlimited events and unlock meal options.",
  date_limit: 'Free organisers can propose up to 3 dates. Upgrade for £5 to add unlimited options plus meal times.',
  meal_limit: 'Breakfast and per-meal options are Pro-only. Upgrade for £5 to unlock them instantly.',
};

function FixedMealChips() {
  return (
    <div className="text-sm">
      <span className="inline-block px-2 py-1 rounded bg-gray-200 mr-2">Lunch</span>
      <span className="inline-block px-2 py-1 rounded bg-gray-200">Dinner</span>
    </div>
  );
}

function PerDateMealSelector({ allowed, value = [], onChange, disabled = false }) {
  const toggle = (k) => {
    // Only allow toggling keys in the allowed set
    if (disabled || !allowed.includes(k)) return;
    const set = new Set(value);
    set.has(k) ? set.delete(k) : set.add(k);
    // Keep order as breakfast, lunch, dinner
    const order = ['breakfast', 'lunch', 'dinner'];
    onChange(Array.from(set).sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      {allowed.map((k) => (
        <label key={k} className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.includes(k)}
            onChange={() => toggle(k)}
            disabled={disabled}
          />
          <span>{MEAL_LABELS[k]}</span>
        </label>
      ))}
    </div>
  );
}
/* -------------------------------------------- */

export default function Home() {
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [selectedDates, setSelectedDates] = useState([]); // Date objects
  const [eventType, setEventType] = useState('general');

  // Global rule: either LD or BLD
  const [includeBreakfast, setIncludeBreakfast] = useState(false);
  const globalMeals = includeBreakfast ? ['breakfast', 'lunch', 'dinner'] : ['lunch', 'dinner'];

  // Per-date overrides: { 'YYYY-MM-DD': ['lunch'] }
  const [mealTimesPerDate, setMealTimesPerDate] = useState({});

  const [holidayDuration, setHolidayDuration] = useState(HOLIDAY_DURATION_OPTIONS[3]?.value || '5_nights');
  const [deadlineHours, setDeadlineHours] = useState(168);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [entrySource, setEntrySource] = useState('unknown');
  const [votingDeadlineDate, setVotingDeadlineDate] = useState('');
  const [organiserStatus, setOrganiserStatus] = useState(DEFAULT_ORGANISER_STATUS);
  const [organiserStatusLoading, setOrganiserStatusLoading] = useState(false);
  const [organiserStatusError, setOrganiserStatusError] = useState('');
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const router = useRouter();
  const sessionIdFromQuery = router?.query?.session_id;

  const emailIsValid = useMemo(() => VALID_EMAIL_REGEX.test(email), [email]);
  const isPro = useMemo(() => organiserStatus.planType === 'pro', [organiserStatus.planType]);
  const canCreateAnotherPoll = isPro || organiserStatus.pollsCreatedCount < FREE_POLL_LIMIT;
  const selectedDateLimit = isPro ? null : FREE_DATE_LIMIT;

  const loadOrganiserStatus = useCallback(
    async (targetEmail) => {
      if (!targetEmail || !VALID_EMAIL_REGEX.test(targetEmail)) {
        setOrganiserStatus(DEFAULT_ORGANISER_STATUS);
        setOrganiserStatusError('');
        return;
      }

      setOrganiserStatusLoading(true);
      setOrganiserStatusError('');

      try {
        const response = await fetch('/api/organiser/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: targetEmail }),
        });

        if (!response.ok) {
          throw new Error(`Status request failed: ${response.status}`);
        }

        const data = await response.json();
        setOrganiserStatus({
          planType: data.planType || 'free',
          pollsCreatedCount: data.pollsCreatedCount || 0,
          pendingStripeSessionId: data.pendingStripeSessionId || null,
          stripeCustomerId: data.stripeCustomerId || null,
        });
      } catch (err) {
        console.error('organiser status fetch failed', err);
        setOrganiserStatus(DEFAULT_ORGANISER_STATUS);
        setOrganiserStatusError('Unable to verify organiser status right now. You can still continue, but limits may apply.');
      } finally {
        setOrganiserStatusLoading(false);
      }
    },
    []
  );

  const openUpgradeModal = useCallback((reason) => {
    setUpgradeReason(reason);
    setUpgradeModalOpen(true);
  }, []);

  const closeUpgradeModal = useCallback(() => {
    setUpgradeModalOpen(false);
    setUpgradeReason(null);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get('source');
    if (source) {
      sessionStorage.setItem('entrySource', source);
      setEntrySource(source);
    } else {
      const stored = sessionStorage.getItem('entrySource');
      if (stored) setEntrySource(stored);
    }
  }, []);

  useEffect(() => {
    if (!email) {
      setOrganiserStatus(DEFAULT_ORGANISER_STATUS);
      setOrganiserStatusError('');
      return;
    }

    const timer = setTimeout(() => {
      if (emailIsValid) {
        loadOrganiserStatus(email);
      } else {
        setOrganiserStatus(DEFAULT_ORGANISER_STATUS);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [email, emailIsValid, loadOrganiserStatus]);

  useEffect(() => {
    if (!router.isReady || !sessionIdFromQuery) return;

    const confirmUpgrade = async () => {
      setUpgradeLoading(true);
      try {
        await fetch('/api/upgradeToPro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdFromQuery }),
        });

        if (emailIsValid) {
          await loadOrganiserStatus(email);
        }
        closeUpgradeModal();
      } catch (err) {
        console.error('upgrade confirmation failed', err);
      } finally {
        setUpgradeLoading(false);
        const { session_id, ...rest } = router.query;
        router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
      }
    };

    confirmUpgrade();
  }, [router, router.isReady, sessionIdFromQuery, email, emailIsValid, loadOrganiserStatus, closeUpgradeModal]);

  useEffect(() => {
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + deadlineHours);
    setVotingDeadlineDate(format(deadline, 'EEEE d MMMM yyyy, h:mm a'));
  }, [deadlineHours]);

  // Drop overrides for dates that are no longer selected
  useEffect(() => {
    setMealTimesPerDate((prev) => {
      const keep = {};
      const keys = new Set(selectedDates.map((d) => d.toISOString().slice(0, 10)));
      Object.entries(prev).forEach(([k, v]) => {
        if (keys.has(k)) keep[k] = v;
      });
      return keep;
    });
  }, [selectedDates]);

  // Ensure overrides remain a subset of the current global rule
  useEffect(() => {
    setMealTimesPerDate((prev) => {
      const next = {};
      Object.entries(prev).forEach(([k, arr]) => {
        const subset = (arr || []).filter((m) => globalMeals.includes(m));
        next[k] = subset.length ? subset : globalMeals;
      });
      return next;
    });
  }, [includeBreakfast]); // global change from LD to BLD or back

  const setPerDateMeals = (dateISO, nextArray) => {
    if (!isPro) {
      openUpgradeModal('meal_limit');
      return;
    }
    // prune to allowed
    const allowed = globalMeals;
    const clean = Array.from(new Set(nextArray)).filter((m) => allowed.includes(m));
    setMealTimesPerDate((prev) => ({ ...prev, [dateISO]: clean.length ? clean : allowed }));
  };

  const handleIncludeBreakfastChange = (checked) => {
    if (!isPro) {
      openUpgradeModal('meal_limit');
      return;
    }
    setIncludeBreakfast(checked);
  };

  const handleUpgradeClick = useCallback(async () => {
    if (!emailIsValid) {
      alert('Add a valid organiser email so we can unlock your upgrade.');
      return;
    }

    if (typeof window === 'undefined') return;

    setUpgradeLoading(true);

    try {
      const params = new URLSearchParams(router.query);
      params.delete('session_id');
      const queryString = params.toString();
      const basePath = `${window.location.origin}${router.pathname}`;
      const successUrl = `${basePath}${queryString ? `?${queryString}&` : '?'}session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${basePath}${queryString ? `?${queryString}` : ''}`;

      const response = await fetch('/api/billing/createCheckoutSession', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          priceType: 'one_time',
          successUrl,
          cancelUrl,
        }),
      });

      if (!response.ok) {
        throw new Error(`Checkout session error: ${response.status}`);
      }

      const data = await response.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        alert('Upgrade link unavailable. Please try again.');
      }
    } catch (err) {
      console.error('upgrade checkout failed', err);
      alert('Upgrade could not be started. Please try again.');
    } finally {
      setUpgradeLoading(false);
    }
  }, [email, emailIsValid, router, setUpgradeLoading]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!firstName || !email || !title || !location) {
      alert('Please fill in all fields.');
      return;
    }

    if (!emailIsValid) {
      alert('Please enter a valid organiser email.');
      return;
    }

    if (selectedDates.length === 0) {
      alert(eventType === 'holiday' ? 'Please select a date range for your trip.' : 'Please select at least one date.');
      return;
    }

    if (!canCreateAnotherPoll) {
      openUpgradeModal('poll_limit');
      return;
    }

    if (!isPro && selectedDates.length > FREE_DATE_LIMIT) {
      openUpgradeModal('date_limit');
      return;
    }

    if (!isPro && eventType === 'meal' && includeBreakfast) {
      openUpgradeModal('meal_limit');
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    const trimmedEmail = email.trim();
    const trimmedFirstName = firstName.trim();

    try {
      const finalLocation = location.trim();
      const formattedDates = selectedDates
        .slice()
        .sort((a, b) => a - b)
        .map((date) => date.toISOString());

      let eventOptions = null;
      if (eventType === 'meal') {
        // Build clean per-date overrides as subset of current global rule
        const cleanPerDate = {};
        formattedDates.forEach((isoFull) => {
          const iso = isoFull.slice(0, 10);
          const override = mealTimesPerDate[iso];
          if (Array.isArray(override) && override.length) {
            const pruned = Array.from(new Set(override)).filter((m) => globalMeals.includes(m));
            if (pruned.length && pruned.length !== globalMeals.length) {
              // only store when it actually differs from global
              cleanPerDate[iso] = pruned;
            }
          }
        });

        eventOptions = {
          mealTimes: globalMeals, // global rule LD or BLD
          mealTimesPerDate: cleanPerDate, // per-date subset of global
        };
      } else if (eventType === 'holiday') {
        eventOptions = { proposedDuration: holidayDuration };
      }

      const editToken = nanoid(32);
      const deadlineTimestamp = Timestamp.fromDate(new Date(Date.now() + deadlineHours * 60 * 60 * 1000));

      const pollData = {
        organiserFirstName: trimmedFirstName,
        organiserLastName: '',
        organiserEmail: trimmedEmail,
        organiserPlanType: organiserStatus.planType,
        eventTitle: title,
        location: finalLocation,
        dates: formattedDates,
        createdAt: Timestamp.now(),
        deadline: deadlineTimestamp,
        editToken,
        entrySource: entrySource || 'unknown',
        eventType,
        eventOptions,
      };

      const t0 = performance.now();
      const docRef = await addDoc(collection(db, 'polls'), pollData);
      const t1 = performance.now();
      console.log(`Firestore addDoc() took ${Math.round(t1 - t0)}ms`);

      try {
        const resp = await fetch('/api/organiser/recordPoll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: trimmedEmail }),
        });
        if (resp.ok) {
          const data = await resp.json();
          setOrganiserStatus((prev) => ({
            ...prev,
            planType: data.planType || prev.planType,
            pollsCreatedCount: data.pollsCreatedCount ?? prev.pollsCreatedCount + 1,
          }));
        }
      } catch (statErr) {
        console.error('organiser recordPoll failed', statErr);
      }

      router.replace(`/share/${docRef.id}`);

      setTimeout(() => {
        logEventIfAvailable('poll_created', {
          organiserName: trimmedFirstName,
          email: trimmedEmail,
          eventTitle: title,
          location: finalLocation,
          selectedDateCount: formattedDates.length,
          deadlineHours,
          pollId: docRef.id,
          entrySource,
          eventType,
          eventOptions,
        });

        fetch('/api/sendOrganiserEmail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: trimmedFirstName,
            email: trimmedEmail,
            pollId: docRef.id,
            editToken,
            eventTitle: title,
          }),
        });

        fetch('/api/notifyAdmin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organiserName: trimmedFirstName,
            eventTitle: title,
            location: finalLocation,
            selectedDates: formattedDates,
            pollId: docRef.id,
            pollLink: `https://plan.setthedate.app/poll/${docRef.id}`,
            eventType,
            eventOptions,
          }),
        });

        import('canvas-confetti').then((mod) => {
          mod.default({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
        });
      }, 0);
    } catch (error) {
      console.error('Error creating poll:', error);
      alert('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Set The Date - Group Planning Made Easy</title>
        <meta
          name="description"
          content="Pick a few dates, share a link, and let friends vote."
        />
      </Head>

      {process.env.NEXT_PUBLIC_GTM_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GTM_ID}`}
            strategy="afterInteractive"
          />
          <Script id="gtag-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${process.env.NEXT_PUBLIC_GTM_ID}');
            `}
          </Script>
        </>
      )}

      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="max-w-md w-full p-6">
          <LogoHeader />

          <div className="text-center mb-2">
            <h1 className="text-xl font-semibold leading-tight">
              Find the <strong>Best</strong> Date
              <br />
              for Your Next Get Together
            </h1>
            <p className="text-sm text-gray-600 italic mt-1">
              "Just like Calendly - but made for groups."
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                What kind of event are you planning?
              </label>
              <select
                value={eventType}
                onChange={(e) => {
                  const t = e.target.value;
                  setEventType(t);
                  setSelectedDates([]);
                  if (t !== 'meal') {
                    setIncludeBreakfast(false);
                    setMealTimesPerDate({});
                  }
                  if (t !== 'holiday') {
                    setHolidayDuration(HOLIDAY_DURATION_OPTIONS[3]?.value || '5_nights');
                  }
                }}
                className="w-full border p-2 rounded"
              >
                <option value="general">General get together</option>
                <option value="meal">Meal or drinks (lunch vs dinner, optional breakfast)</option>
                <option value="holiday">Trip or holiday</option>
              </select>

              {eventType === 'meal' && (
                <div className="bg-gray-100 border border-gray-200 rounded p-3 text-sm">
                  <p className="font-medium mb-2">Let guests pick the meal slot that suits them.</p>

                  {/* Global rule */}
                  <div className="flex items-center justify-between">
                    <FixedMealChips />
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={includeBreakfast}
                        onChange={(e) => handleIncludeBreakfastChange(e.target.checked)}
                        disabled={!isPro}
                      />
                      <span className={isPro ? '' : 'text-gray-400'}>Include breakfast</span>
                    </label>
                  </div>

                  {!isPro && (
                    <p className="mt-2 rounded border border-blue-200 bg-white px-3 py-2 text-xs text-blue-700">
                      Breakfast slots are a Pro feature. Upgrade to unlock breakfast plus per-date controls.
                    </p>
                  )}

                  <p className="mt-2 text-xs text-gray-600">
                    By default guests choose between lunch and dinner. Turn on breakfast to offer breakfast, lunch, and/or dinner.
                  </p>

                  {/* Per-date overrides */}
                  {selectedDates.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold mb-2">Per-date overrides (optional)</p>
                      <div className="space-y-3">
                        {selectedDates
                          .slice()
                          .sort((a, b) => a - b)
                          .map((d) => {
                            const iso = d.toISOString().slice(0, 10);
                            const current = mealTimesPerDate[iso] ?? globalMeals;
                            return (
                              <div key={iso} className="border rounded p-3 bg-white">
                                <div className="text-sm font-medium mb-2">
                                  {d.toLocaleDateString(undefined, {
                                    weekday: 'long',
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric',
                                  })}
                                </div>
                                <PerDateMealSelector
                                  allowed={globalMeals}
                                  value={current}
                                  onChange={(next) => setPerDateMeals(iso, next)}
                                  disabled={!isPro}
                                />
                                <p className="text-[11px] text-gray-500 mt-1">
                                  Uncheck a slot to disable it for this date. For example, turn off Dinner on a Sunday evening.
                                </p>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {eventType === 'holiday' && (
                <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800 space-y-2">
                  <p>Select a date range like Airbnb. Attendees will share their ideal start, end, and trip length.</p>
                  <label className="block text-xs font-semibold text-blue-900">Proposed trip length</label>
                  <select
                    value={holidayDuration}
                    onChange={(e) => setHolidayDuration(e.target.value)}
                    className="w-full border border-blue-200 rounded px-3 py-2 text-sm"
                  >
                    {HOLIDAY_DURATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="block font-semibold text-center mt-2">
                {eventType === 'holiday'
                  ? 'Choose the start and end of your ideal window'
                  : 'Pick the dates everyone should vote on'}
              </label>
              <div className="flex justify-center">
                <DateSelector
                  eventType={eventType}
                  selectedDates={selectedDates}
                  setSelectedDates={setSelectedDates}
                  maxSelectableDates={selectedDateLimit}
                  onLimitReached={selectedDateLimit ? () => openUpgradeModal('date_limit') : undefined}
                />
              </div>
              {!isPro && (
                <p className="mt-2 text-xs text-center text-gray-600">
                  Free plan tip: add up to {FREE_DATE_LIMIT} date options. Need more? Upgrade to Pro for unlimited dates.
                </p>
              )}
            </div>

            <input
              type="text"
              className="w-full border p-2 rounded"
              placeholder="Your first name (e.g. Jamie)"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
            <input
              type="email"
              className="w-full border p-2 rounded"
              placeholder="Your email (we will send you the link)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {organiserStatusLoading && (
              <p className="text-xs text-blue-600 text-center">Checking organiser plan…</p>
            )}
            {!organiserStatusLoading && organiserStatusError && (
              <p className="text-xs text-red-600 text-center">{organiserStatusError}</p>
            )}
            {!organiserStatusLoading && !organiserStatusError && emailIsValid && (
              <p className="text-xs text-gray-600 text-center">
                {isPro
                  ? 'Set The Date Pro active – unlimited polls and dates unlocked.'
                  : organiserStatus.pollsCreatedCount >= FREE_POLL_LIMIT
                    ? 'Free plan limit reached. Upgrade to create another poll.'
                    : `Free plan – ${Math.max(0, FREE_POLL_LIMIT - organiserStatus.pollsCreatedCount)} free poll remaining.`}
              </p>
            )}
            <input
              type="text"
              className="w-full border p-2 rounded"
              placeholder="Event title (e.g. Friday Drinks)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <MapboxAutocomplete setLocation={setLocation} />
            <p className="text-xs text-gray-500 italic mt-1 text-center">
              General area only - the exact venue can come later.
            </p>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">⏱ How long should voting stay open?</label>
              <select
                value={deadlineHours}
                onChange={(e) => setDeadlineHours(Number(e.target.value))}
                className="w-full border p-2 rounded"
              >
                <option value={24}>1 day</option>
                <option value={48}>2 days</option>
                <option value={72}>3 days</option>
                <option value={168}>1 week (default)</option>
                <option value={336}>2 weeks</option>
              </select>
              <p className="text-xs text-gray-500 mt-1 italic text-center">
                Voting closes on <strong>{votingDeadlineDate}</strong>
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-black text-white font-semibold py-3 mt-4 rounded hover:bg-gray-800 transition"
            >
              {isSubmitting ? 'Creating...' : 'Start Planning'}
            </button>
          </form>

          <div className="mt-10 text-center">
            <h2 className="text-xl font-semibold mb-3">Share Set The Date</h2>
            <p className="text-sm text-gray-600 mb-4">Let your friends know they can use Set The Date too!</p>
            <ShareButtons onShare={() => logEventIfAvailable('organiser_shared_poll')} />
          </div>

          <BuyMeACoffee />
        </div>
      </div>

      <UpgradeModal
        open={upgradeModalOpen}
        onClose={closeUpgradeModal}
        onUpgrade={handleUpgradeClick}
        upgrading={upgradeLoading}
        description={(upgradeReason && UPGRADE_COPY[upgradeReason]) || UPGRADE_COPY.poll_limit}
      />
    </>
  );
}

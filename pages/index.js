import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', evening: 'Evening out' };
const BASE_MEALS = ['lunch', 'dinner'];
const FREE_POLL_LIMIT = 1;
const FREE_DATE_LIMIT = 3;
const VALID_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const DEFAULT_ORGANISER_STATUS = {
  planType: 'free',
  pollsCreatedCount: 0,
  stripeCustomerId: null,
  unlocked: false,
};

const FORM_STORAGE_KEY = 'std_form_state_v1';
const UPGRADE_COPY = {
  poll_limit:
    'Pay once to unlock unlimited events and a hosted page you can share with your group.',
  date_limit:
    'Unlock unlimited date options plus a hosted event page with a one-time $3 payment.',
  meal_limit:
    'Unlock unlimited date options plus a hosted event page with a one-time $3 payment.',
  holiday_limit:
    'Longer trip windows are a Pro feature. Pay once to plan holidays longer than 10 days.',
  info:
    'Pay once to unlock unlimited date options and get a beautiful, hosted page for your event. No subscriptions.',
};

function FixedMealChips({
  active = BASE_MEALS,
  onToggle,
  allowEvening = false,
  onRequestUpgrade,
}) {
  const options = [...BASE_MEALS, 'evening'];
  return (
    <div className="flex items-center gap-2 text-sm">
      {options.map((meal) => {
        const isEvening = meal === 'evening';
        const disabled = isEvening && !allowEvening;
        const selected = active.includes(meal);
        const label =
          disabled && isEvening ? `${MEAL_LABELS[meal]} (Pro)` : MEAL_LABELS[meal];
        const baseClasses =
          'rounded-full px-3 py-1 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400';
        const visualClasses = disabled
          ? 'border border-dashed border-gray-300 bg-white text-gray-400 cursor-not-allowed'
          : selected
          ? 'bg-gray-900 text-white'
          : 'bg-gray-200 text-gray-700 hover:bg-gray-300';
        return (
          <button
            key={meal}
            type="button"
            onClick={() => {
              if (disabled) {
                onRequestUpgrade?.();
                return;
              }
              onToggle?.(meal);
            }}
            className={`${baseClasses} ${visualClasses}`}
            disabled={disabled}
            aria-disabled={disabled}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function PerDateMealSelector({ allowed, value = [], onChange, disabled = false }) {
  const toggle = (k) => {
    // Only allow toggling keys in the allowed set
    if (disabled || !allowed.includes(k)) return;
    const set = new Set(value);
    set.has(k) ? set.delete(k) : set.add(k);
    // Keep order as breakfast, lunch, dinner, evening
    const order = ['breakfast', 'lunch', 'dinner', 'evening'];
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
  const [baseMealsSelected, setBaseMealsSelected] = useState(BASE_MEALS);
  const globalMeals = includeBreakfast
    ? ['breakfast', ...baseMealsSelected]
    : baseMealsSelected;

  // Per-date overrides: { 'YYYY-MM-DD': ['lunch'] }
  const [mealTimesPerDate, setMealTimesPerDate] = useState({});

  const [holidayDuration, setHolidayDuration] = useState(HOLIDAY_DURATION_OPTIONS[3]?.value || '5_nights');
  const [deadlineHours, setDeadlineHours] = useState(168);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [entrySource, setEntrySource] = useState('unknown');
  const [votingDeadlineDate, setVotingDeadlineDate] = useState('');
  const [organiserStatus, setOrganiserStatus] = useState(DEFAULT_ORGANISER_STATUS);
  const [organiserStatusLoading, setOrganiserStatusLoading] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeEmail, setUpgradeEmail] = useState('');
  const [upgradeEmailError, setUpgradeEmailError] = useState('');
  const hasHydratedFormRef = useRef(false);
  const skipPersistRef = useRef(false);
  const handleUpgradeEmailInput = useCallback(
    (value) => {
      setUpgradeEmail(value);
      setEmail(value);
    },
    []
  );
  const router = useRouter();

  const emailIsValid = useMemo(() => VALID_EMAIL_REGEX.test(email), [email]);
  const isUnlocked = useMemo(
    () => organiserStatus.unlocked || organiserStatus.planType === 'pro',
    [organiserStatus.unlocked, organiserStatus.planType]
  );
  const gatingEnabled = process.env.NEXT_PUBLIC_PRO_GATING === 'true';
  const isPro = gatingEnabled ? isUnlocked : true;
  const canCreateAnotherPoll = gatingEnabled
    ? isPro || organiserStatus.pollsCreatedCount < FREE_POLL_LIMIT
    : true;
  const selectedDateLimit = gatingEnabled && !isPro ? FREE_DATE_LIMIT : null;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let parsed = null;
    try {
      const raw = localStorage.getItem(FORM_STORAGE_KEY);
      if (raw) {
        parsed = JSON.parse(raw);
      }
    } catch (err) {
      console.warn('Failed to read saved event form state', err);
    }

    if (parsed) {
      if (typeof parsed.firstName === 'string') setFirstName(parsed.firstName);
      if (typeof parsed.email === 'string') setEmail(parsed.email);
      if (typeof parsed.title === 'string') setTitle(parsed.title);
      if (typeof parsed.location === 'string') setLocation(parsed.location);
      if (typeof parsed.eventType === 'string') setEventType(parsed.eventType);
      if (Array.isArray(parsed.selectedDates)) {
        const hydratedDates = parsed.selectedDates
          .map((iso) => {
            const date = new Date(iso);
            return Number.isNaN(date.getTime()) ? null : date;
          })
          .filter(Boolean);
        if (hydratedDates.length) setSelectedDates(hydratedDates);
      }
      if (typeof parsed.includeBreakfast === 'boolean') {
        setIncludeBreakfast(parsed.includeBreakfast);
      }
      if (Array.isArray(parsed.baseMealsSelected) && parsed.baseMealsSelected.length) {
        setBaseMealsSelected(parsed.baseMealsSelected);
      }
      if (parsed.mealTimesPerDate && typeof parsed.mealTimesPerDate === 'object') {
        setMealTimesPerDate(parsed.mealTimesPerDate);
      }
      if (typeof parsed.holidayDuration === 'string') {
        setHolidayDuration(parsed.holidayDuration);
      }
      if (typeof parsed.deadlineHours === 'number') {
        setDeadlineHours(parsed.deadlineHours);
      }
    }

    hasHydratedFormRef.current = true;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !hasHydratedFormRef.current) return;
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }
    const payload = {
      firstName,
      email,
      title,
      location,
      eventType,
      includeBreakfast,
      baseMealsSelected,
      mealTimesPerDate,
      selectedDates: selectedDates.map((date) => date.toISOString()),
      holidayDuration,
      deadlineHours,
    };
    try {
      localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn('Failed to persist event form state', err);
    }
  }, [
    firstName,
    email,
    title,
    location,
    eventType,
    includeBreakfast,
    baseMealsSelected,
    mealTimesPerDate,
    selectedDates,
    holidayDuration,
    deadlineHours,
  ]);

  const loadOrganiserStatus = useCallback(
    async (targetEmail, { createIfMissing = true, skipStateUpdate = false } = {}) => {
      if (!targetEmail || !VALID_EMAIL_REGEX.test(targetEmail)) {
        if (!skipStateUpdate) {
          setOrganiserStatus(DEFAULT_ORGANISER_STATUS);
        }
        return DEFAULT_ORGANISER_STATUS;
      }

      setOrganiserStatusLoading(true);

      try {
        const response = await fetch('/api/organiser/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: targetEmail, createIfMissing }),
        });

        if (!response.ok) {
          throw new Error(`Status request failed: ${response.status}`);
        }

        const data = await response.json();
        const nextStatus = {
          planType: data.planType || 'free',
          pollsCreatedCount: data.pollsCreatedCount || 0,
          stripeCustomerId: data.stripeCustomerId || null,
          unlocked: data.unlocked || data.planType === 'pro' || false,
        };
        if (!skipStateUpdate) {
          setOrganiserStatus(nextStatus);
        }
        return nextStatus;
      } catch (err) {
        console.error('organiser status fetch failed', err);
        if (!skipStateUpdate) {
          setOrganiserStatus(DEFAULT_ORGANISER_STATUS);
        }
        return DEFAULT_ORGANISER_STATUS;
      } finally {
        setOrganiserStatusLoading(false);
      }
    },
    []
  );

  const openUpgradeModal = useCallback(
    (reason) => {
      setUpgradeReason(reason);
      const trimmed = (email || '').trim();
      setUpgradeEmail((prev) => (trimmed ? trimmed : prev));
      setUpgradeEmailError('');
      setUpgradeModalOpen(true);
    },
    [email]
  );

  const closeUpgradeModal = useCallback(() => {
    setUpgradeModalOpen(false);
    setUpgradeReason(null);
    setUpgradeEmailError('');
  }, []);

  const resetFormAfterCreation = useCallback(
    (emailToKeep) => {
      skipPersistRef.current = true;
      setFirstName('');
      setTitle('');
      setLocation('');
      setSelectedDates([]);
      setEventType('general');
      setIncludeBreakfast(false);
      setBaseMealsSelected(BASE_MEALS);
      setMealTimesPerDate({});
      setHolidayDuration(HOLIDAY_DURATION_OPTIONS[3]?.value || '5_nights');
      setDeadlineHours(168);
      setVotingDeadlineDate('');
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify({ email: emailToKeep }));
        } catch (err) {
          console.warn('Failed to persist organiser email only', err);
        }
      }
    },
    []
  );

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
    if (!router.isReady) return;
    const querySessionId = router.query?.session_id;
    const storedSessionId = !querySessionId ? getStoredPendingSession() : null;
    const sessionIdToConfirm = querySessionId || storedSessionId;
    if (!sessionIdToConfirm) return;

    const confirmUpgrade = async () => {
      setUpgradeLoading(true);
      try {
        await fetch('/api/upgradeToPro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdToConfirm }),
        });

        consumePendingSession();

        if (emailIsValid) {
          await loadOrganiserStatus(email);
        }
        closeUpgradeModal();
      } catch (err) {
        console.error('upgrade confirmation failed', err);
      } finally {
        setUpgradeLoading(false);
        if (querySessionId) {
          const { session_id, ...rest } = router.query;
          router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
        }
      }
    };

    confirmUpgrade();
  }, [router, router.isReady, router.query, email, emailIsValid, loadOrganiserStatus, closeUpgradeModal]);

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
  }, [includeBreakfast, baseMealsSelected]); // global change when meal slots shift

  const setPerDateMeals = (dateISO, nextArray) => {
    // prune to allowed
    const allowed = globalMeals;
    const clean = Array.from(new Set(nextArray)).filter((m) => allowed.includes(m));
    setMealTimesPerDate((prev) => ({ ...prev, [dateISO]: clean.length ? clean : allowed }));
  };

  const toggleBaseMeal = (mealKey) => {
    setBaseMealsSelected((prev) => {
      if (!isPro && mealKey === 'evening') return prev;
      if (prev.includes(mealKey)) {
        if (prev.length === 1) return prev; // keep at least one slot
        return prev.filter((item) => item !== mealKey);
      }
      return [...prev, mealKey];
    });
  };

  const handleIncludeBreakfastChange = (checked) => {
    if (!isPro) return;
    setIncludeBreakfast(checked);
  };

  useEffect(() => {
    if (isPro) return;
    setBaseMealsSelected((prev) => prev.filter((meal) => meal !== 'evening'));
    setMealTimesPerDate((prev) => {
      let changed = false;
      const next = {};
      Object.entries(prev).forEach(([key, arr]) => {
        const filtered = (arr || []).filter((meal) => meal !== 'evening');
        if (filtered.length !== (arr || []).length) {
          changed = true;
        }
        next[key] = filtered;
      });
      return changed ? next : prev;
    });
  }, [isPro]);

  const PENDING_SESSION_KEY = 'std_pending_session';

  const storePendingSession = (sessionId, organiserEmail) => {
    if (typeof window === 'undefined' || !sessionId) return;
    try {
      localStorage.setItem(
        PENDING_SESSION_KEY,
        JSON.stringify({ sessionId, organiserEmail, storedAt: Date.now() })
      );
    } catch (err) {
      console.warn('Unable to store pending checkout session', err);
    }
  };

  const getStoredPendingSession = () => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(PENDING_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.sessionId || null;
    } catch (err) {
      console.warn('Unable to read pending checkout session', err);
      return null;
    }
  };

  const consumePendingSession = () => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(PENDING_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      localStorage.removeItem(PENDING_SESSION_KEY);
      return parsed?.sessionId || null;
    } catch (err) {
      console.warn('Unable to read pending checkout session', err);
      return null;
    }
  };

  const handleUpgradeClick = useCallback(async () => {
    if (typeof window === 'undefined') return;

    const preferredEmail = (upgradeEmail || email || '').trim();
    if (!VALID_EMAIL_REGEX.test(preferredEmail)) {
      setUpgradeEmailError('Enter a valid organiser email to unlock Pro.');
      return;
    }
    setUpgradeEmailError('');

    if (email !== preferredEmail) {
      setEmail(preferredEmail);
    }
    setUpgradeEmail(preferredEmail);

    setUpgradeLoading(true);

    try {
      const existingStatus = await loadOrganiserStatus(preferredEmail, {
        createIfMissing: false,
      });
      if (existingStatus?.unlocked || existingStatus?.planType === 'pro') {
        setUpgradeLoading(false);
        alert('Looks like this organiser email already has Set The Date Pro unlocked.');
        closeUpgradeModal();
        return;
      }

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
          email: preferredEmail,
          successUrl,
          cancelUrl,
        }),
      });

      if (!response.ok) {
        throw new Error(`Checkout session error: ${response.status}`);
      }

      const data = await response.json();
      if (data?.url) {
        if (data.sessionId) {
          storePendingSession(data.sessionId, preferredEmail);
        }
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
  }, [email, upgradeEmail, router, loadOrganiserStatus, closeUpgradeModal]);

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

    if (gatingEnabled && !canCreateAnotherPoll) {
      openUpgradeModal('poll_limit');
      return;
    }

    if (gatingEnabled && !isPro && selectedDates.length > FREE_DATE_LIMIT) {
      openUpgradeModal('date_limit');
      return;
    }

    if (gatingEnabled && !isPro && eventType === 'meal' && includeBreakfast) {
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
        organiserUnlocked: isUnlocked,
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

      resetFormAfterCreation(trimmedEmail);

      void fetch('/api/organiser/recordPoll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail }),
      })
        .then(async (resp) => {
          if (!resp.ok) return null;
          try {
            return await resp.json();
          } catch (parseErr) {
            console.error('organiser recordPoll parse failed', parseErr);
            return null;
          }
        })
        .then((data) => {
          if (!data) return;
          setOrganiserStatus((prev) => ({
            ...prev,
            planType: data.planType || prev.planType,
            pollsCreatedCount: data.pollsCreatedCount ?? prev.pollsCreatedCount + 1,
            unlocked: data.unlocked ?? prev.unlocked,
          }));
        })
        .catch((statErr) => {
          console.error('organiser recordPoll failed', statErr);
        });

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
          <LogoHeader isPro={isUnlocked} />
          {isUnlocked && (
            <div className="mt-2 mb-4 flex items-center justify-center gap-2 text-sm font-semibold text-green-700">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
              Set The Date Pro active
            </div>
          )}

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
                    setBaseMealsSelected(BASE_MEALS);
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
                  <div className="flex items-center justify-between gap-3">
                    <FixedMealChips
                      active={baseMealsSelected}
                      onToggle={toggleBaseMeal}
                      allowEvening={isPro}
                      onRequestUpgrade={
                        gatingEnabled && !isPro ? () => openUpgradeModal('meal_limit') : undefined
                      }
                    />
                    {isPro ? (
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={includeBreakfast}
                          onChange={(e) => handleIncludeBreakfastChange(e.target.checked)}
                        />
                        <span>Include breakfast</span>
                      </label>
                    ) : (
                      <button
                        type="button"
                        className="text-xs font-semibold text-blue-600 underline-offset-2 hover:underline"
                        onClick={() => openUpgradeModal('meal_limit')}
                      >
                        Include breakfast + unlimited dates ($3)
                      </button>
                    )}
                  </div>

                  {!isPro && (
                    <p className="mt-2 rounded border border-blue-200 bg-white px-3 py-2 text-xs text-blue-700">
                      Breakfast and evening slots plus unlimited date options unlock with a one-time payment. Tap above to upgrade.
                    </p>
                  )}

                  <p className="mt-2 text-xs text-gray-600">
                    By default guests choose between lunch and dinner. Unlock Pro to add breakfast and evening out options, then rate each slot as yes, maybe, or no.
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
                  ? 'Choose the start and end of your ideal trip window'
                  : 'Pick the dates everyone should vote on'}
              </label>
              <div className="flex justify-center">
                <DateSelector
                  eventType={eventType}
                  selectedDates={selectedDates}
                  setSelectedDates={setSelectedDates}
                  maxSelectableDates={selectedDateLimit}
                  onLimitReached={selectedDateLimit ? () => openUpgradeModal('date_limit') : undefined}
                  holidayMaxLength={gatingEnabled && !isPro ? 10 : null}
                  onHolidayLimit={
                    gatingEnabled && !isPro ? () => openUpgradeModal('holiday_limit') : undefined
                  }
                />
              </div>
              {gatingEnabled && !isPro && eventType !== 'holiday' && (
                <p className="mt-2 text-xs text-center text-gray-600">
                  Free plan tip: add up to {FREE_DATE_LIMIT} date options. Need more? Unlock for $3 to remove the limit.
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
              <p className="text-xs text-blue-600 text-center">Checking organiser unlock…</p>
            )}
            {!organiserStatusLoading && emailIsValid && (
              <p className="text-xs text-gray-600 text-center">
                {isUnlocked
                  ? 'Lifetime unlock active – unlimited dates and hosted page ready to use.'
                  : 'Pay $3 once whenever you’re ready to unlock unlimited dates and a hosted event page.'}
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
        onEmailChange={handleUpgradeEmailInput}
        emailValue={upgradeEmail || email}
        emailError={upgradeEmailError}
        upgrading={upgradeLoading}
        description={(upgradeReason && UPGRADE_COPY[upgradeReason]) || UPGRADE_COPY.poll_limit}
        ctaLabel="Unlock for $3 one-time"
      />
    </>
  );
}

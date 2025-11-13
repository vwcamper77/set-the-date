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
const BASE_MEALS = ['dinner', 'evening'];
const MEAL_CHIP_OPTIONS = ['dinner', 'evening', 'lunch'];
const EVENT_TYPE_OPTIONS = [
  {
    id: 'general',
    label: 'Group hangout',
    helper: 'Birthdays, drinks, parties, catch ups.',
  },
  {
    id: 'meal',
    label: 'Meals & evenings',
    helper: 'Let guests choose lunch, dinner, or a night out.',
  },
  {
    id: 'holiday',
    label: 'Trip or getaway',
    helper: 'Collect travel windows and trip lengths.',
  },
];
const FREE_POLL_LIMIT = 1;
const FREE_DATE_LIMIT = 5;
const VALID_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const DEFAULT_ORGANISER_STATUS = {
  planType: 'free',
  pollsCreatedCount: 0,
  stripeCustomerId: null,
  unlocked: false,
};

const UPGRADE_COPY = {
  poll_limit:
    'Subscribe for $2.99 to unlock unlimited events for 3 months and get a hosted page you can share with your group.',
  date_limit:
    'Unlock unlimited date options plus a hosted event page with a $2.99 subscription that covers 3 months of access.',
  meal_limit:
    'Unlock unlimited date options plus a hosted event page with a $2.99 / 3-month Pro subscription.',
  holiday_limit:
    'Longer trip windows are a Pro feature. Subscribe for 3 months ($2.99) to plan holidays longer than 10 days.',
  info:
    'Subscribe for $2.99 to unlock unlimited date options and get a beautiful, hosted page for your event. Covers 3 months of access.',
};

const UPGRADE_FORM_STATE_KEY = 'std_upgrade_form_state_v1';

const persistUpgradeFormState = (payload) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(UPGRADE_FORM_STATE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to persist upgrade form state', err);
  }
};

const consumeUpgradeFormState = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(UPGRADE_FORM_STATE_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(UPGRADE_FORM_STATE_KEY);
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to read upgrade form state', err);
    return null;
  }
};

function FixedMealChips({
  active = BASE_MEALS,
  onToggle,
}) {
  const options = MEAL_CHIP_OPTIONS;
  return (
    <div className="flex items-center gap-2 text-sm">
      {options.map((meal) => {
        const selected = active.includes(meal);
        const label = MEAL_LABELS[meal];
        const baseClasses =
          'rounded-full px-3 py-1 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400';
        const visualClasses = selected
          ? 'bg-gray-900 text-white'
          : 'bg-gray-200 text-gray-700 hover:bg-gray-300';
        return (
          <button
            key={meal}
            type="button"
            onClick={() => onToggle?.(meal)}
            className={`${baseClasses} ${visualClasses}`}
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
  const [showPerDateOverrides, setShowPerDateOverrides] = useState(false);

  const [holidayDuration, setHolidayDuration] = useState(HOLIDAY_DURATION_OPTIONS[3]?.value || '5_nights');
  const [deadlineHours, setDeadlineHours] = useState(168);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [entrySource, setEntrySource] = useState('unknown');
  const [partnerPrefill, setPartnerPrefill] = useState(null);
  const [votingDeadlineDate, setVotingDeadlineDate] = useState('');
  const [organiserStatus, setOrganiserStatus] = useState(DEFAULT_ORGANISER_STATUS);
  const [organiserStatusLoading, setOrganiserStatusLoading] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeEmail, setUpgradeEmail] = useState('');
  const [upgradeEmailError, setUpgradeEmailError] = useState('');
  const partnerPrefillAppliedRef = useRef(false);
  const partnerPrefillLoggedRef = useRef(null);
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
  const hasCustomPerDateOverrides = useMemo(() => {
    const globalSet = new Set(globalMeals);
    const globalSize = globalMeals.length;
    return Object.values(mealTimesPerDate).some((arr) => {
      if (!Array.isArray(arr) || arr.length === 0) return false;
      if (arr.length !== globalSize) return true;
      return arr.some((value) => !globalSet.has(value));
    });
  }, [mealTimesPerDate, globalMeals]);

  useEffect(() => {
    const stored = consumeUpgradeFormState();
    if (!stored) return;

    if (typeof stored.firstName === 'string') setFirstName(stored.firstName);
    if (typeof stored.email === 'string') setEmail(stored.email);
    if (typeof stored.title === 'string') setTitle(stored.title);
    if (typeof stored.location === 'string') setLocation(stored.location);
    if (typeof stored.eventType === 'string') setEventType(stored.eventType);
    if (typeof stored.includeBreakfast === 'boolean') {
      setIncludeBreakfast(stored.includeBreakfast);
    }
    if (Array.isArray(stored.baseMealsSelected) && stored.baseMealsSelected.length) {
      setBaseMealsSelected(stored.baseMealsSelected);
    }
    if (stored.mealTimesPerDate && typeof stored.mealTimesPerDate === 'object') {
      setMealTimesPerDate(stored.mealTimesPerDate);
    }
    if (typeof stored.holidayDuration === 'string') {
      setHolidayDuration(stored.holidayDuration);
    }
    if (typeof stored.deadlineHours === 'number') {
      setDeadlineHours(stored.deadlineHours);
    }
    if (Array.isArray(stored.selectedDates)) {
      const hydratedDates = stored.selectedDates
        .map((iso) => {
          const date = new Date(iso);
          return Number.isNaN(date.getTime()) ? null : date;
        })
        .filter(Boolean);
      if (hydratedDates.length) setSelectedDates(hydratedDates);
    }
  }, []);

  useEffect(() => {
    if (hasCustomPerDateOverrides && !showPerDateOverrides) {
      setShowPerDateOverrides(true);
    }
  }, [hasCustomPerDateOverrides, showPerDateOverrides]);

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
    },
    []
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
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

  const partnerQuery = router.query?.partner;
  const prefillLocationQuery = router.query?.prefillLocation;

  useEffect(() => {
    if (!router.isReady) return;

    const slugParam = typeof partnerQuery === 'string' ? partnerQuery.toLowerCase() : null;
    const locationParam = typeof prefillLocationQuery === 'string' ? prefillLocationQuery : '';
    if (locationParam) {
      partnerPrefillAppliedRef.current = false;
    }

    const applyLocationFromQuery = () => {
      if (!locationParam || partnerPrefillAppliedRef.current) return;
      skipPersistRef.current = true;
      setLocation(locationParam);
      partnerPrefillAppliedRef.current = true;
    };

    if (!slugParam) {
      setPartnerPrefill(null);
      partnerPrefillLoggedRef.current = null;
      applyLocationFromQuery();
      return;
    }

    const fetchPartnerPrefill = async () => {
      try {
        const response = await fetch(`/api/partners/lookup?slug=${slugParam}`);
        if (!response.ok) {
          applyLocationFromQuery();
          return;
        }
        const data = await response.json();
        setPartnerPrefill({
          slug: data.slug || slugParam,
          venueName: data.venueName || '',
          city: data.city || '',
          bookingUrl: data.bookingUrl || '',
        });
        applyLocationFromQuery();
        if (partnerPrefillLoggedRef.current !== slugParam) {
          partnerPrefillLoggedRef.current = slugParam;
          logEventIfAvailable('create_prefilled_from_partner', { partner: slugParam });
        }
      } catch (err) {
        console.error('partner prefill failed', err);
        applyLocationFromQuery();
      }
    };

    fetchPartnerPrefill();
  }, [router.isReady, partnerQuery, prefillLocationQuery]);

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
      if (prev.includes(mealKey)) {
        if (prev.length === 1) return prev; // keep at least one slot
        return prev.filter((item) => item !== mealKey);
      }
      return [...prev, mealKey];
    });
  };

  const handleEventTypeChange = (nextType) => {
    if (!nextType || nextType === eventType) return;
    setEventType(nextType);
    setSelectedDates([]);
    if (nextType !== 'meal') {
      setIncludeBreakfast(false);
      setMealTimesPerDate({});
      setBaseMealsSelected(BASE_MEALS);
      setShowPerDateOverrides(false);
    }
    if (nextType !== 'holiday') {
      setHolidayDuration(HOLIDAY_DURATION_OPTIONS[3]?.value || '5_nights');
    }
  };

  const handleIncludeBreakfastChange = (checked) => {
    if (!isPro) return;
    setIncludeBreakfast(checked);
  };

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

    persistUpgradeFormState({
      firstName,
      email: preferredEmail,
      title,
      location,
      eventType,
      includeBreakfast,
      baseMealsSelected,
      mealTimesPerDate,
      selectedDates: selectedDates.map((date) => date.toISOString()),
      holidayDuration,
      deadlineHours,
    });

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
  }, [
    email,
    upgradeEmail,
    router,
    loadOrganiserStatus,
    closeUpgradeModal,
    firstName,
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
      const now = new Date();
      const sortedDates = selectedDates
        .slice()
        .sort((a, b) => a - b);
      const formattedDates = sortedDates.map((date) => date.toISOString());

      const earliestDate = sortedDates[0];
      const hoursUntilEarliest =
        earliestDate instanceof Date
          ? Math.floor((earliestDate.getTime() - now.getTime()) / (1000 * 60 * 60))
          : null;
      const maxVotingWindow =
        typeof hoursUntilEarliest === 'number'
          ? Math.max(1, hoursUntilEarliest)
          : deadlineHours;
      const effectiveDeadlineHours = Math.min(deadlineHours, maxVotingWindow);

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
      const deadlineTimestamp = Timestamp.fromDate(
        new Date(now.getTime() + effectiveDeadlineHours * 60 * 60 * 1000)
      );

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

      if (partnerPrefill?.slug) {
        pollData.partnerSlug = partnerPrefill.slug;
        pollData.partnerVenueName = partnerPrefill.venueName || '';
        if (partnerPrefill.bookingUrl) {
          pollData.partnerBookingUrl = partnerPrefill.bookingUrl;
        }
      }

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
          partnerSlug: partnerPrefill?.slug || null,
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
            partnerSlug: partnerPrefill?.slug || null,
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

          {partnerPrefill?.venueName && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm font-medium text-amber-900">
              Powered by {partnerPrefill.venueName}. Once your group agrees, their team will help you lock the booking.
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
                Step 1 · What kind of event are you planning?
              </label>
              <div className="grid gap-2 sm:grid-cols-3">
                {EVENT_TYPE_OPTIONS.map((option) => {
                  const selected = eventType === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleEventTypeChange(option.id)}
                      className={`rounded-lg border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                        selected
                          ? 'border-gray-900 bg-gray-900 text-white focus:ring-gray-900'
                          : 'border-gray-300 bg-white text-gray-800 hover:border-gray-500 focus:ring-gray-400'
                      }`}
                      aria-pressed={selected}
                    >
                      <span className="block text-sm font-semibold">{option.label}</span>
                      <span className={`mt-1 block text-xs ${selected ? 'text-gray-200' : 'text-gray-600'}`}>
                        {option.helper}
                      </span>
                    </button>
                  );
                })}
              </div>

              {eventType === 'meal' && (
                <div className="bg-gray-100 border border-gray-200 rounded p-3 text-sm">
                  <p className="font-medium">Step 2 · Choose which event type guests can vote on.</p>
                  <p className="text-xs text-gray-600 mb-2">
                    Dinner and Evening out are ready to go. Toggle lunch whenever you like, and add breakfast once you upgrade to Pro.
                  </p>

                  {/* Global rule */}
                  <div className="flex items-center justify-between gap-3">
                    <FixedMealChips
                      active={baseMealsSelected}
                      onToggle={toggleBaseMeal}
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
                        Include breakfast + unlimited dates ($2.99 / 3 months)
                      </button>
                    )}
                  </div>

                  <p className="mt-2 text-xs text-gray-600">
                    It's more than meals—guests can pick whichever slots you enable and rate each as yes, maybe, or no.
                  </p>

                </div>
              )}

              {eventType === 'holiday' && (
                <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800 space-y-2">
                  <p className="font-semibold text-blue-900">Step 2 · Sketch your ideal trip window.</p>
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

              {eventType === 'general' && (
                <div className="bg-white border border-dashed border-gray-300 rounded p-3 text-sm text-gray-800 space-y-1">
                  <p className="font-medium">Step 2 · Add a little context.</p>
                  <p className="text-xs text-gray-600">
                    Use the event title and location fields below to tell guests what you have in mind. You can edit these anytime.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Name your event and set an approximate location
              </label>
              <input
                type="text"
                className="w-full border p-2 rounded"
                placeholder="Event title (e.g. Friday Drinks)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
              <MapboxAutocomplete setLocation={setLocation} initialValue={location} />
              <p className="text-xs text-gray-500 italic">
                General area only – the exact venue can come later.
              </p>
              {partnerPrefill?.venueName && (
                <p className="text-xs text-amber-700">
                  Suggested by {partnerPrefill.venueName}. We will pass confirmed dates to their team.
                </p>
              )}
            </div>

            <div>
              <label className="block font-semibold text-center mt-2">
                {eventType === 'holiday'
                  ? 'Step 4 · Choose the start and end of your ideal trip window'
                  : 'Step 4 · Pick the dates everyone should vote on'}
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
                  Free plan tip: add up to {FREE_DATE_LIMIT} date options. Need more? Subscribe for $2.99 to remove the limit for 3 months.
                </p>
              )}
            </div>
            {eventType === 'meal' && selectedDates.length > 0 && (
              <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold">Per-date overrides (optional)</p>
                    <p className="text-xs text-gray-600">
                      Keep the calendar in view and only expand if some dates need different meal slots.
                    </p>
                    {hasCustomPerDateOverrides && !showPerDateOverrides && (
                      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-amber-600">
                        Custom overrides active
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPerDateOverrides((prev) => !prev)}
                    className="text-xs font-semibold text-blue-600 underline-offset-2 hover:underline"
                    aria-expanded={showPerDateOverrides}
                  >
                    {showPerDateOverrides ? 'Hide overrides' : 'Adjust per date'}
                  </button>
                </div>
                {showPerDateOverrides && (
                  <div className="mt-3 space-y-3">
                    {selectedDates
                      .slice()
                      .sort((a, b) => a - b)
                      .map((d) => {
                        const iso = d.toISOString().slice(0, 10);
                        const current = mealTimesPerDate[iso] ?? globalMeals;
                        return (
                          <div key={iso} className="border rounded bg-white p-3">
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
                )}
              </div>
            )}

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
                  ? 'Pro access active – unlimited dates and hosted page ready to use.'
                  : 'Subscribe for $2.99 to unlock unlimited dates and a hosted event page for 3 months.'}
              </p>
            )}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Step 5 · How long should voting stay open?
              </label>
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
        ctaLabel="Unlock for $2.99 / 3 months"
      />
    </>
  );
}

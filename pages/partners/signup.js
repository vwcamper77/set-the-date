import { useState, useEffect, useRef, useId, useMemo, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import PartnerNav from '@/components/PartnerNav';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';
import { storage, auth } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged, signOut, signInWithCustomToken } from 'firebase/auth';

const MEAL_TAGS = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'brunch', label: 'Brunch' },
  { id: 'coffee', label: 'Coffee' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'lunch_drinks', label: 'Lunch drinks' },
  { id: 'afternoon_tea', label: 'Afternoon tea' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'evening', label: 'Drinks' },
];

const DEFAULT_BRAND = '#0f172a';
const MAX_GALLERY_PHOTOS = 4;

const initialForm = {
  venueName: '',
  contactName: '',
  contactEmail: '',
  logoUrl: '',
  venuePhotoUrl: '',
  venuePhotos: [],
  brandColor: DEFAULT_BRAND,
  city: '',
  fullAddress: '',
  bookingUrl: '',
  venuePitch: '',
  allowedMealTags: ['breakfast', 'brunch', 'coffee', 'lunch', 'lunch_drinks', 'afternoon_tea', 'dinner', 'evening'],
};

export default function PartnerSignupPage({
  onboardingToken,
  prefillContactEmail = '',
  prefillContactName = '',
  prefillVenueName = '',
}) {
  const router = useRouter();
  const [formValues, setFormValues] = useState(() => ({
    ...initialForm,
    contactEmail: prefillContactEmail || '',
    contactName: prefillContactName || '',
    venueName: prefillVenueName || '',
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [shareUrl, setShareUrl] = useState('https://plan.setthedate.app/partners/start');
  const [copiedLink, setCopiedLink] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoMessage, setLogoMessage] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoMessage, setPhotoMessage] = useState('');
  const fileInputRef = useRef(null);
  const venuePhotoInputRef = useRef(null);
  const [venuePhotoInputValue, setVenuePhotoInputValue] = useState('');
  const [showLogoUrlInput, setShowLogoUrlInput] = useState(true);
  const [logoInputValue, setLogoInputValue] = useState('');
  const logoFileInputId = useId();
  const venuePhotoFileInputId = useId();
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [autoAuth, setAutoAuth] = useState({ attempted: false, loading: false, error: '', uid: null });
  const [claimState, setClaimState] = useState({ loading: false, portalType: null });
  const claimPollTimeoutRef = useRef(null);

  const expectedEmail = useMemo(
    () => (prefillContactEmail || '').trim().toLowerCase(),
    [prefillContactEmail]
  );

  const userEmail = useMemo(
    () => (firebaseUser?.email || '').trim().toLowerCase(),
    [firebaseUser]
  );

  const hasExpectedEmail = useMemo(
    () => !expectedEmail || expectedEmail === userEmail,
    [expectedEmail, userEmail]
  );

  const hasVenueClaim = claimState.portalType === 'venue';
  const awaitingVenueUnlock = Boolean(firebaseUser && !hasVenueClaim);
  const canAccessForm = Boolean(firebaseUser && hasVenueClaim && hasExpectedEmail);

  const loginRedirectPath = useMemo(() => {
    const path = typeof router.asPath === 'string' && router.asPath
      ? router.asPath
      : `/partners/signup?token=${onboardingToken || ''}`;
    return `/login?type=venue&redirect=${encodeURIComponent(path)}`;
  }, [router.asPath, onboardingToken]);

  const addVenuePhotoUrl = (url) => {
    if (!url) return;
    setFormValues((prev) => {
      const existing = Array.isArray(prev.venuePhotos) ? prev.venuePhotos : [];
      if (existing.length >= MAX_GALLERY_PHOTOS || existing.includes(url)) return prev;
      const nextPhotos = [...existing, url];
      return {
        ...prev,
        venuePhotos: nextPhotos,
        venuePhotoUrl: nextPhotos[0] || '',
      };
    });
  };

  const removeVenuePhotoUrl = (url) => {
    setFormValues((prev) => {
      const existing = Array.isArray(prev.venuePhotos) ? prev.venuePhotos : [];
      const nextPhotos = existing.filter((item) => item !== url);
      return {
        ...prev,
        venuePhotos: nextPhotos,
        venuePhotoUrl: nextPhotos[0] || '',
      };
    });
  };

  const handleAddVenuePhotoFromInput = () => {
    if (!venuePhotoInputValue.trim()) {
      setPhotoMessage('Paste a valid URL before adding.');
      return;
    }
    if ((formValues.venuePhotos || []).length >= MAX_GALLERY_PHOTOS) {
      setPhotoMessage(`You can upload up to ${MAX_GALLERY_PHOTOS} venue photos.`);
      return;
    }
    try {
      const validUrl = new URL(venuePhotoInputValue.trim());
      addVenuePhotoUrl(validUrl.toString());
      setVenuePhotoInputValue('');
      setPhotoMessage('Photo added.');
    } catch {
      setPhotoMessage('Please enter a valid URL.');
    }
  };

  const handleManualLogoInput = (value) => {
    setLogoInputValue(value);
    setFormValues((prev) => ({ ...prev, logoUrl: value }));
  };

  const handleGoBack = () => {
    router.push('/');
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setShareUrl(`${window.location.origin}/partners/start`);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user || null);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const fetchPortalClaim = useCallback(
    async (forceRefresh = false) => {
      const current = auth.currentUser;
      if (!current) {
        return null;
      }

      if (forceRefresh) {
        await current.getIdToken(true);
      }

      const result = await current.getIdTokenResult();
      return result?.claims?.portalType || null;
    },
    [auth]
  );

  useEffect(() => {
    let cancelled = false;
    if (!firebaseUser) {
      setClaimState({ loading: false, portalType: null });
      return () => {
        cancelled = true;
      };
    }

    setClaimState((prev) => ({ ...prev, loading: true }));

    fetchPortalClaim()
      .then((portalType) => {
        if (cancelled) return;
        setClaimState({ loading: false, portalType });
      })
      .catch((err) => {
        console.error('partner claim fetch failed', err);
        if (!cancelled) {
          setClaimState({ loading: false, portalType: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchPortalClaim, firebaseUser]);

  const runAutomaticAuth = useCallback(async () => {
    if (!onboardingToken) return;
    setAutoAuth((prev) => ({ ...prev, attempted: true, loading: true, error: '' }));
    setClaimState((prev) => ({ ...prev, loading: true }));
    try {
      const response = await fetch('/api/partners/claim-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboardingToken }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = payload?.message || 'Unable to unlock your venue access automatically.';
        throw new Error(message);
      }

      if (!payload?.token) {
        throw new Error('Missing access token.');
      }

      await signInWithCustomToken(auth, payload.token);
      let portalType = null;
      try {
        portalType = await fetchPortalClaim(true);
      } catch (claimErr) {
        console.error('partner claim refresh failed', claimErr);
      }

      setClaimState({ loading: false, portalType });
      setAutoAuth({ attempted: true, loading: false, error: '', uid: auth.currentUser?.uid || null });
    } catch (err) {
      console.error('partner auto auth failed', err);
      if (err?.code === 'auth/admin-restricted-operation') {
        try {
          const portalType = await fetchPortalClaim(true);
          setClaimState({ loading: false, portalType });
          setAutoAuth((prev) => ({
            ...prev,
            attempted: true,
            loading: false,
            error: '',
            uid: auth.currentUser?.uid || prev.uid || null,
          }));
          return;
        } catch (claimErr) {
          console.error('partner claim refresh failed', claimErr);
        }
      }

      setClaimState((prev) => ({ ...prev, loading: false }));
      setAutoAuth((prev) => ({
        ...prev,
        loading: false,
        error: err?.message || 'Unable to unlock your venue access automatically.',
        uid: prev.uid || auth.currentUser?.uid || null,
      }));
    }
  }, [auth, fetchPortalClaim, onboardingToken]);

  useEffect(() => {
    if (!onboardingToken || !authReady || autoAuth.loading) return;

    if (!firebaseUser) {
      if (autoAuth.attempted) return;
      runAutomaticAuth();
      return;
    }

    if (!hasVenueClaim && autoAuth.uid !== firebaseUser.uid) {
      runAutomaticAuth();
    }
  }, [
    autoAuth.attempted,
    autoAuth.loading,
    autoAuth.uid,
    authReady,
    firebaseUser,
    hasVenueClaim,
    onboardingToken,
    runAutomaticAuth,
  ]);

  useEffect(() => {
    if (!canAccessForm) return;
    const email = firebaseUser?.email;
    if (!email) return;
    setFormValues((prev) => {
      if (prev.contactEmail?.toLowerCase() === email.toLowerCase()) {
        return prev;
      }
      return { ...prev, contactEmail: email };
    });
  }, [canAccessForm, firebaseUser]);

  const handleChange = (field) => (event) => {
    const { value } = event.target;
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  const ensureUploadAccess = useCallback(
    async (setMessage) => {
      if (!firebaseUser) {
        setMessage('Sign in to upload your venue assets.');
        return false;
      }

      if (!hasExpectedEmail) {
        setMessage('Switch to the email you used for your free trial checkout to upload assets.');
        return false;
      }

      if (awaitingVenueUnlock) {
        setMessage('We are unlocking your venue access. Try again in a moment.');
        if (!autoAuth.loading) {
          try {
            const portalType = await fetchPortalClaim(true);
            if (portalType === 'venue') {
              setClaimState({ loading: false, portalType });
              setMessage('Venue access unlocked. Uploading now…');
              return true;
            }
          } catch (tokenErr) {
            console.error('partner upload claim refresh failed', tokenErr);
          }

          if (onboardingToken) {
            runAutomaticAuth();
          }
        }
        return false;
      }

      try {
        if (auth.currentUser) {
          await auth.currentUser.getIdToken(true);
        }
      } catch (tokenErr) {
        console.error('partner upload token refresh failed', tokenErr);
      }

      return true;
    },
    [
      auth,
      autoAuth.loading,
      awaitingVenueUnlock,
      fetchPortalClaim,
      firebaseUser,
      hasExpectedEmail,
      onboardingToken,
      runAutomaticAuth,
    ]
  );

  useEffect(() => {
    if (hasVenueClaim && claimPollTimeoutRef.current) {
      clearTimeout(claimPollTimeoutRef.current);
      claimPollTimeoutRef.current = null;
    }
  }, [hasVenueClaim]);

  useEffect(() => {
    if (!awaitingVenueUnlock || !firebaseUser) {
      if (claimPollTimeoutRef.current) {
        clearTimeout(claimPollTimeoutRef.current);
        claimPollTimeoutRef.current = null;
      }
      return undefined;
    }

    let cancelled = false;
    let attempts = 0;

    const scheduleNext = (delay) => {
      if (cancelled) return;
      claimPollTimeoutRef.current = setTimeout(async () => {
        if (cancelled) return;
        try {
          const portalType = await fetchPortalClaim(true);
          if (cancelled) return;
          if (portalType === 'venue') {
            if (claimPollTimeoutRef.current) {
              clearTimeout(claimPollTimeoutRef.current);
              claimPollTimeoutRef.current = null;
            }
            setClaimState({ loading: false, portalType });
            setAutoAuth((prev) => ({
              ...prev,
              loading: false,
              error: '',
              uid: auth.currentUser?.uid || prev.uid || null,
            }));
            return;
          }
        } catch (err) {
          console.error('partner claim poll failed', err);
        }

        attempts += 1;
        if (attempts >= 10) {
          if (claimPollTimeoutRef.current) {
            clearTimeout(claimPollTimeoutRef.current);
            claimPollTimeoutRef.current = null;
          }
          setClaimState((prev) => ({ ...prev, loading: false }));
          return;
        }

        scheduleNext(Math.min(5000, 1500 + attempts * 500));
      }, delay);
    };

    setClaimState((prev) => ({ ...prev, loading: true }));
    scheduleNext(1200);

    return () => {
      cancelled = true;
      if (claimPollTimeoutRef.current) {
        clearTimeout(claimPollTimeoutRef.current);
        claimPollTimeoutRef.current = null;
      }
    };
  }, [awaitingVenueUnlock, auth, fetchPortalClaim, firebaseUser]);

  const toggleMealTag = (tag) => {
    setFormValues((prev) => {
      const exists = prev.allowedMealTags.includes(tag);
      return {
        ...prev,
        allowedMealTags: exists
          ? prev.allowedMealTags.filter((item) => item !== tag)
          : [...prev.allowedMealTags, tag],
      };
    });
  };

  const handleColorPickerChange = (event) => {
    setFormValues((prev) => ({ ...prev, brandColor: event.target.value }));
  };

  const handleLogoFile = async (event) => {
    if (!(await ensureUploadAccess(setLogoMessage))) {
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setLogoMessage('Please upload an image file.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setLogoMessage('File too large. Keep it under 3MB.');
      return;
    }
    setUploadingLogo(true);
    setLogoMessage('Uploading logo...');
    try {
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const destination = storageRef(storage, `partner-logos/${fileName}`);
      await uploadBytes(destination, file, { contentType: file.type });
      const url = await getDownloadURL(destination);
      setFormValues((prev) => ({ ...prev, logoUrl: url }));
      setLogoInputValue('');
      setLogoMessage('Logo uploaded.');
    } catch (uploadErr) {
      console.error('logo upload failed', uploadErr);
      if (uploadErr?.code === 'storage/retry-limit-exceeded') {
        setLogoMessage('Upload timed out. Check your connection and try again.');
      } else if (uploadErr?.code === 'storage/unauthorized') {
        setLogoMessage('Upload blocked. Refresh this page or sign in again to continue.');
      } else {
        setLogoMessage('Upload failed. Please try again.');
      }
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleVenuePhotoFile = async (event) => {
    if (!(await ensureUploadAccess(setPhotoMessage))) {
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;
    if ((formValues.venuePhotos || []).length >= MAX_GALLERY_PHOTOS) {
      setPhotoMessage(`You can upload up to ${MAX_GALLERY_PHOTOS} venue photos.`);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setPhotoMessage('Please upload an image file.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setPhotoMessage('File too large. Keep it under 3MB.');
      return;
    }
    setUploadingPhoto(true);
    setPhotoMessage('Uploading photo...');
    try {
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const destination = storageRef(storage, `partner-venue-photos/${fileName}`);
      await uploadBytes(destination, file, { contentType: file.type });
      const url = await getDownloadURL(destination);
      addVenuePhotoUrl(url);
      setVenuePhotoInputValue('');
      setPhotoMessage('Photo uploaded.');
    } catch (uploadErr) {
      console.error('venue photo upload failed', uploadErr);
      if (uploadErr?.code === 'storage/retry-limit-exceeded') {
        setPhotoMessage('Upload timed out. Check your connection and try again.');
      } else if (uploadErr?.code === 'storage/unauthorized') {
        setPhotoMessage('Upload blocked. Refresh this page or sign in again to continue.');
      } else {
        setPhotoMessage('Upload failed. Please try again.');
      }
    } finally {
      setUploadingPhoto(false);
      if (venuePhotoInputRef.current) {
        venuePhotoInputRef.current.value = '';
      }
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!authReady) {
      setError('Checking your account. Please wait a moment.');
      return;
    }

    if (!firebaseUser) {
      setError('Sign in with your venue partner account to submit this form.');
      return;
    }

    if (awaitingVenueUnlock) {
      setError('We are still unlocking your venue access. Try again in a moment.');
      return;
    }

    if (!hasExpectedEmail) {
      setError('Switch to the email used for your free trial checkout to submit this form.');
      return;
    }

    if (!onboardingToken) {
      setError('Missing access token. Start from /partners/start to unlock this form.');
      return;
    }

    const signedInEmail = (firebaseUser?.email || '').trim().toLowerCase();
    if (!signedInEmail) {
      setError('Your account is missing an email address. Contact support.');
      return;
    }

    logEventIfAvailable('partner_signup_submitted', {
      venueName: formValues.venueName,
      city: formValues.city,
    });

    setSubmitting(true);
    try {
      const response = await fetch('/api/partners/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formValues,
          contactEmail: signedInEmail,
          onboardingToken,
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const message = result?.message || 'Unable to create partner profile. Please try again.';
        setError(message);
        logEventIfAvailable('partner_signup_failed', {
          venueName: formValues.venueName,
          city: formValues.city,
          reason: message,
        });
        return;
      }

      setFormValues({ ...initialForm, venuePhotos: [] });
      setVenuePhotoInputValue('');
      setLogoInputValue('');
      setLogoMessage('');
      setPhotoMessage('');
      logEventIfAvailable('partner_signup_success', { partner: result.slug });
      router.push(`/partners/thanks?slug=${result.slug}`);
    } catch (err) {
      setError('Something went wrong. Please try again.');
      logEventIfAvailable('partner_signup_failed', {
        venueName: formValues.venueName,
        city: formValues.city,
        reason: err?.message || 'unknown',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Partner signup - Set The Date</title>
        <meta
          name="description"
          content="Hotels and restaurants can create a branded Set The Date share page and ready-to-send campaign email."
        />
      </Head>

      <PartnerNav />
      <main className="min-h-screen bg-slate-100 text-slate-900 px-4 py-10 sm:py-14">
        <section className="max-w-5xl mx-auto space-y-8">
          <div className="rounded-[32px] bg-white px-6 sm:px-12 py-10 shadow-2xl shadow-slate-900/25">
            <div className="text-center space-y-4">
              <p className="uppercase tracking-[0.4em] text-xs text-slate-500">Hospitality</p>
              <h1 className="text-4xl sm:text-5xl font-semibold leading-tight text-slate-900">
                Get your tables booked the efficient way
              </h1>
              <p className="text-base sm:text-lg text-slate-600 max-w-3xl mx-auto">
                Help customers pick dates by sharing a hosted voting page tailored to your restaurant, hotel, or bar. Upload your brand assets once and Set The Date Pro spins up a public share page, email copy, and voting calendar you can send with every private dining or group stay enquiry. It turns “we’re thinking about a group booking” conversations into concrete dates, captures guest emails for re-marketing, and shows when your venue is in demand.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3 text-left text-sm mt-8">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="font-semibold text-slate-900">Branded share page</p>
                <p className="text-slate-600 mt-1">Your logo, menu highlights, and venue photos baked into every poll.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="font-semibold text-slate-900">Ready-to-send campaign</p>
                <p className="text-slate-600 mt-1">Copy-and-paste email templates for Mailchimp, Brevo, or Gmail.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="font-semibold text-slate-900">Menu-friendly polls</p>
                <p className="text-slate-600 mt-1">Breakfast through late-night slots so guests can pick what works.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 md:col-span-3">
                <p className="font-semibold text-slate-900">Why venues love it</p>
                <p className="text-slate-600 mt-1">
                  Every poll captures organiser emails, shows their group which dates work best, and sends confirmed demand back to your team.
                  Less back-and-forth, more booked covers and high-value stays.
                </p>
              </div>
            </div>
            <div className="mt-8 flex justify-center">
              <a
                href="#partner-signup-form"
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 text-white font-semibold px-6 py-3 hover:bg-slate-800 transition"
              >
                Start listing your venue
                <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>
        </section>

        <section
          id="partner-signup-form"
          className="mt-12 max-w-4xl mx-auto rounded-[32px] bg-white text-slate-900 shadow-2xl shadow-slate-900/40 px-8 py-12"
        >
          <div className="text-center mb-10">
            <p className="uppercase tracking-[0.35em] text-xs text-slate-500 mb-3">Hospitality</p>
            <h1 className="text-4xl font-semibold text-slate-900">
              Launch your venue on Set The Date
            </h1>
            <p className="text-slate-600 mt-3 max-w-2xl mx-auto">
              Add your venue details, upload your brand color, and we will spin up a public share page plus a ready-to-send campaign
              email you can paste into any ESP.
            </p>
          </div>

          {!authReady ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-8 text-center">
              <p className="text-sm font-semibold text-slate-800">Checking your account…</p>
              <p className="text-sm text-slate-600 mt-2">Hold tight while we confirm your venue partner access.</p>
            </div>
          ) : !firebaseUser ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-8 text-center space-y-4">
              {autoAuth.loading ? (
                <>
                  <p className="text-sm font-semibold text-slate-800">Unlocking your venue partner access…</p>
                  <p className="text-sm text-slate-600">
                    We&apos;re verifying your free trial and signing you in automatically so you can upload your assets.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-slate-800">Sign in to continue</p>
                  <p className="text-sm text-slate-600">
                    Uploading brand assets requires a Set The Date partner account. Use the email from your free trial checkout
                    to unlock the builder.
                  </p>
                  {autoAuth.error ? (
                    <p className="text-sm font-medium text-rose-600">{autoAuth.error}</p>
                  ) : (
                    <p className="text-xs text-slate-500">
                      We sent your partner account invitation to {prefillContactEmail || 'your checkout email'}.
                    </p>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                    <Link
                      href={loginRedirectPath}
                      className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition"
                    >
                      Sign in to your partner account
                    </Link>
                    <button
                      type="button"
                      onClick={runAutomaticAuth}
                      disabled={autoAuth.loading}
                      className="inline-flex items-center justify-center rounded-full border border-slate-300 px-6 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-900 disabled:opacity-60"
                    >
                      Retry automatic unlock
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : awaitingVenueUnlock ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-8 text-center space-y-4">
              <p className="text-sm font-semibold text-slate-800">
                {autoAuth.loading || claimState.loading
                  ? 'Finalising your venue access…'
                  : 'We are refreshing your venue access'}
              </p>
              <p className="text-sm text-slate-600">
                We found your venue partner account but still need to refresh your permissions before you can upload assets.
              </p>
              {autoAuth.error ? (
                <p className="text-sm font-medium text-rose-600">{autoAuth.error}</p>
              ) : null}
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={runAutomaticAuth}
                  disabled={autoAuth.loading}
                  className="inline-flex items-center justify-center rounded-full border border-slate-300 px-6 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-900 disabled:opacity-60"
                >
                  Retry venue access unlock
                </button>
              </div>
            </div>
          ) : !hasExpectedEmail ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50/70 p-8 text-center space-y-4">
              <p className="text-sm font-semibold text-amber-800">Switch accounts to continue</p>
              <p className="text-sm text-amber-700">
                This signup link is locked to {prefillContactEmail || 'your venue partner email'}. You are signed in as{' '}
                {firebaseUser.email || 'another account'}. Sign out and switch to the correct venue partner login.
              </p>
              <button
                type="button"
                onClick={() => signOut(auth)}
                className="inline-flex items-center justify-center rounded-full border border-amber-600 px-6 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-600 hover:text-white transition"
              >
                Sign out and switch account
              </button>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="venueName">
                  Venue name
                </label>
                <input
                  id="venueName"
                  type="text"
                  required
                  value={formValues.venueName}
                  onChange={handleChange('venueName')}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                  placeholder="e.g. Horizon Hotel Skybar"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="contactName">
                    Contact name
                  </label>
                  <input
                    id="contactName"
                    type="text"
                    required
                    value={formValues.contactName}
                    onChange={handleChange('contactName')}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="contactEmail">
                    Contact email
                  </label>
                  <input
                    id="contactEmail"
                    type="email"
                    required
                    value={formValues.contactEmail}
                    readOnly={Boolean(firebaseUser?.email)}
                    onChange={handleChange('contactEmail')}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                    placeholder="you@venue.com"
                  />
                  {firebaseUser?.email && (
                    <p className="text-xs text-slate-500 mt-1">
                      Locked to {firebaseUser.email}. Update your account email from the partner portal if it needs to change.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="logoUpload">
                  Logo
                </label>
                <input
                  id="logoUpload"
                  type="hidden"
                  value={formValues.logoUrl}
                  onChange={handleChange('logoUrl')}
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    id={logoFileInputId}
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoFile}
                    className="sr-only"
                    disabled={uploadingLogo}
                  />
                  <label
                    htmlFor={logoFileInputId}
                    role="button"
                    tabIndex={uploadingLogo ? -1 : 0}
                    aria-disabled={uploadingLogo}
                    className={`inline-flex items-center justify-center rounded-full border border-slate-900 px-4 py-2 text-sm font-semibold transition ${
                      uploadingLogo
                        ? 'cursor-not-allowed opacity-60 text-slate-500'
                        : 'cursor-pointer text-slate-900 hover:bg-slate-900 hover:text-white'
                    }`}
                  >
                    {uploadingLogo ? 'Uploading...' : 'Upload logo'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowLogoUrlInput((prev) => !prev)}
                    className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-900 hover:text-slate-900 transition"
                  >
                    {showLogoUrlInput ? 'Hide logo link field' : 'Paste logo URL instead'}
                  </button>
                </div>
                {logoMessage && <p className="text-xs text-slate-500 mt-2">{logoMessage}</p>}
                {showLogoUrlInput && (
                  <div className="mt-2">
                    <input
                      type="url"
                      value={logoInputValue}
                      onChange={(e) => handleManualLogoInput(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                      placeholder="https://your-site.com/logo.png"
                    />
                  </div>
                )}
                {formValues.logoUrl && (
                  <div className="mt-3 flex justify-center">
                    <img
                      src={formValues.logoUrl}
                      alt="Uploaded logo preview"
                      className="max-h-52 object-contain rounded-xl border border-slate-200 bg-white p-3 shadow-inner"
                      loading="lazy"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="venuePitch">
                  Tell us about your venue
                </label>
                <textarea
                  id="venuePitch"
                  required
                  value={formValues.venuePitch}
                  onChange={handleChange('venuePitch')}
                  rows={4}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                  placeholder="Describe your venue, menu highlights, and what guests love most."
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="city">
                    City
                  </label>
                  <input
                    id="city"
                    type="text"
                    required
                    value={formValues.city}
                    onChange={handleChange('city')}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                    placeholder="e.g. London"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="fullAddress">
                    Full address
                  </label>
                  <input
                    id="fullAddress"
                    type="text"
                    required
                    value={formValues.fullAddress}
                    onChange={handleChange('fullAddress')}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus-border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                    placeholder="Street, city, postcode"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="brandColor">
                  Brand color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="brandColor"
                    type="color"
                    value={formValues.brandColor}
                    onChange={handleColorPickerChange}
                    className="h-12 w-20 cursor-pointer rounded-xl border border-slate-200 bg-white"
                  />
                  <input
                    type="text"
                    value={formValues.brandColor}
                    onChange={handleChange('brandColor')}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                    placeholder="#0f172a"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="venuePhotoUpload">
                  Venue photos (up to 3)
                </label>
                <input
                  id="venuePhotoUpload"
                  type="hidden"
                  value={formValues.venuePhotoUrl}
                  onChange={handleChange('venuePhotoUrl')}
                />
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      id={venuePhotoFileInputId}
                      ref={venuePhotoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleVenuePhotoFile}
                      className="sr-only"
                      disabled={uploadingPhoto}
                    />
                    <label
                      htmlFor={venuePhotoFileInputId}
                      role="button"
                      tabIndex={uploadingPhoto ? -1 : 0}
                      aria-disabled={uploadingPhoto}
                      className={`inline-flex items-center justify-center rounded-full border border-slate-900 px-4 py-2 text-sm font-semibold transition ${
                        uploadingPhoto
                          ? 'cursor-not-allowed opacity-60 text-slate-500'
                          : 'cursor-pointer text-slate-900 hover:bg-slate-900 hover:text-white'
                      }`}
                    >
                      {uploadingPhoto ? 'Uploading...' : 'Upload photo'}
                    </label>
                    <button
                      type="button"
                      onClick={() => setPhotoMessage('')}
                      className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-900 hover:text-slate-900 transition"
                    >
                      Clear message
                    </button>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="url"
                      value={venuePhotoInputValue}
                      onChange={(event) => setVenuePhotoInputValue(event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                      placeholder="https://your-site.com/gallery.jpg"
                    />
                    <button
                      type="button"
                      onClick={handleAddVenuePhotoFromInput}
                      className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover-border-slate-900 hover:text-slate-900 transition"
                    >
                      Add photo URL
                    </button>
                  </div>
                  {photoMessage && <p className="text-xs text-slate-500">{photoMessage}</p>}
                  {!!formValues.venuePhotos?.length && (
                    <div className="grid gap-4 sm:grid-cols-3">
                      {formValues.venuePhotos.map((photo) => (
                        <div key={photo} className="relative rounded-2xl border border-slate-200 bg-white p-2">
                          <img
                            src={photo}
                            alt="Venue photo"
                            className="h-32 w-full rounded-xl object-cover"
                            loading="lazy"
                          />
                          <button
                            type="button"
                            onClick={() => removeVenuePhotoUrl(photo)}
                            className="absolute top-2 right-2 inline-flex items-center justify-center rounded-full bg-white/90 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-rose-100 hover:text-rose-700 transition"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="bookingUrl">
                  Booking URL (optional)
                </label>
                <input
                  id="bookingUrl"
                  type="url"
                  value={formValues.bookingUrl}
                  onChange={handleChange('bookingUrl')}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                  placeholder="https://book.venue.com/group"
                />
              </div>

              <div>
                <p className="text-sm font-medium text-slate-600 mb-2">Which time slots should guests see?</p>
                <div className="flex flex-wrap gap-2">
                  {MEAL_TAGS.map((tag) => {
                    const active = formValues.allowedMealTags.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleMealTag(tag.id)}
                        className={`rounded-full px-4 py-2 text-sm font-semibold border transition ${
                          active
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'border-slate-300 text-slate-600 hover:border-slate-900'
                        }`}
                      >
                        {tag.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Guests only see the time slots you select above.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="bookingUrl">
                  Booking URL (optional)
                </label>
                <input
                  id="bookingUrl"
                  type="url"
                  value={formValues.bookingUrl}
                  onChange={handleChange('bookingUrl')}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                  placeholder="https://book.venue.com/group"
                />
              </div>

              {error && <p className="text-sm text-rose-600 font-medium">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl bg-slate-900 text-white font-semibold py-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-slate-900/30"
              >
                {submitting ? 'Submitting...' : 'Create my share page'}
              </button>

              <div className="mt-10 rounded-3xl border border-slate-200 bg-white/80 p-6 text-center">
                <p className="text-sm font-semibold text-slate-800">
                  Share this page with your favourite venue so they can launch Set The Date.
                </p>
                <p className="text-sm text-slate-600 mt-1 mb-4">
                  When they go live we will unlock Set The Date Pro for three of your friends for free.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (navigator?.clipboard?.writeText) {
                      navigator.clipboard.writeText(shareUrl).then(() => {
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2500);
                      });
                    }
                  }}
                  className="inline-flex items-center justify-center rounded-full border border-slate-900 px-6 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-900 hover:text-white transition"
                >
                  {copiedLink ? 'Link copied!' : 'Copy share link'}
                </button>
              </div>
            </form>
          )}


        </section>
      </main>
    </>
  );
}

export async function getServerSideProps({ query }) {
  const token = typeof query.token === 'string' ? query.token : '';
  if (!token) {
    return {
      redirect: {
        destination: '/partners/start',
        permanent: false,
      },
    };
  }

  try {
    const { findOnboardingByToken } = await import('@/lib/partners/onboardingService');
    const record = await findOnboardingByToken(token);
    if (!record) {
      throw new Error('invalid token');
    }

    return {
      props: {
        onboardingToken: token,
        prefillContactEmail: record.data.customerEmail || '',
        prefillContactName: record.data.customerName || '',
        prefillVenueName: record.data.customerName || '',
      },
    };
  } catch (error) {
    console.error('partner signup token error', error);
    return {
      redirect: {
        destination: '/partners/start',
        permanent: false,
      },
    };
  }
}

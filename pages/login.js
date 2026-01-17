import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';
import LogoHeader from '@/components/LogoHeader';
import PortalMenu from '@/components/PortalMenu';
import PortalTopNav from '@/components/PortalTopNav';
import { auth, db } from '@/lib/firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const PORTAL_COPY = {
  pro: {
    label: 'Pro organiser',
    headline: 'Pro portal login',
    description: 'For planners managing Set The Date polls and organiser perks.',
  },
  venue: {
    label: 'Venue partner',
    headline: 'Venue partner login',
    description: 'For hotels and restaurants managing venue cards, billing, and subscriptions.',
  },
};

const normalizePortalType = (type) => (type === 'venue' ? 'venue' : 'pro');
const getPortalBase = (type) =>
  normalizePortalType(type) === 'venue' ? '/venues/portal' : '/pro/portal';

const VALID_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export default function PortalLoginPage({ portalType } = {}) {
  const router = useRouter();
  const queryType = typeof router.query?.type === 'string' ? router.query.type : null;
  const queryMode =
    router.query?.mode === 'register' || router.query?.mode === 'login'
      ? router.query.mode
      : null;
  const resolvedType = useMemo(
    () => normalizePortalType(portalType || queryType || 'pro'),
    [portalType, queryType]
  );
  const rawRedirect = typeof router.query?.redirect === 'string' ? router.query.redirect : '';
  const redirectPath = useMemo(() => {
    if (!rawRedirect) {
      return '';
    }

    let decoded = rawRedirect;
    try {
      decoded = decodeURIComponent(rawRedirect);
    } catch (decodeError) {
      decoded = rawRedirect;
    }

    if (!decoded.startsWith('/')) {
      return '';
    }

    try {
      const url = new URL(decoded, 'https://setthedate.local');
      return `${url.pathname}${url.search}${url.hash}`;
    } catch (error) {
      return '';
    }
  }, [rawRedirect]);
  const selectedType = resolvedType;
  const [mode, setMode] = useState(queryMode || 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusData, setStatusData] = useState(null);
  const [passwordResetMessage, setPasswordResetMessage] = useState('');
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [authUser, setAuthUser] = useState(() => auth?.currentUser || null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setAuthUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (queryMode) {
      setMode(queryMode);
    }
  }, [queryMode]);

  const emailIsValid = useMemo(() => VALID_EMAIL_REGEX.test(email), [email]);

  const isRecognisedPro = useMemo(
    () => Boolean(statusData && (statusData.unlocked || statusData.planType === 'pro')),
    [statusData]
  );
  const isLoggedIn = Boolean(authUser);
  const loggedInEmail = authUser?.email || '';
  const portalCopy = PORTAL_COPY[selectedType] || PORTAL_COPY.pro;

  useEffect(() => {
    if (selectedType !== 'pro' || !emailIsValid) {
      setStatusData(null);
      setStatusLoading(false);
      return;
    }

    let cancelled = false;
    setStatusLoading(true);

    fetch('/api/organiser/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, createIfMissing: false }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Status lookup failed');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setStatusData(data);
      })
      .catch(() => {
        if (!cancelled) setStatusData(null);
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [email, emailIsValid, selectedType]);

  const persistPortalProfile = async (uid, type, emailValue, statusSnapshot, existingSnapshot) => {
    const profileRef = doc(db, 'portalUsers', uid);
    let snapshot = existingSnapshot;
    if (!snapshot) {
      snapshot = await getDoc(profileRef);
    }

    const existingData = snapshot.exists() ? snapshot.data() : null;

    const payload = {
      uid,
      email: emailValue,
      type,
      planType: statusSnapshot?.planType || existingData?.planType || null,
      stripeCustomerId:
        statusSnapshot?.stripeCustomerId || existingData?.stripeCustomerId || null,
      unlocked: Boolean(
        statusSnapshot?.unlocked ||
          statusSnapshot?.planType === 'pro' ||
          existingData?.unlocked
      ),
      updatedAt: serverTimestamp(),
    };

    if (!snapshot.exists()) {
      payload.createdAt = serverTimestamp();
    }

    await setDoc(profileRef, payload, { merge: true });
  };

  const resolvePortalType = async (uid, fallbackType) => {
    const profileRef = doc(db, 'portalUsers', uid);
    const snapshot = await getDoc(profileRef);
    const storedType = snapshot.exists() ? snapshot.data()?.type : null;
    return { type: normalizePortalType(storedType || fallbackType), snapshot };
  };

  const getAuthErrorMessage = (authError, currentMode) => {
    if (!authError) {
      return 'Unable to continue right now. Try again in a moment.';
    }

    const { code } = authError;

    if (currentMode === 'register' && code === 'auth/email-already-in-use') {
      return 'Email already registered. Try logging in instead.';
    }

    switch (code) {
      case 'auth/invalid-email':
      case 'auth/missing-email':
        return 'Enter a valid email address.';
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
        return 'Email or password is incorrect. Try again or use Forgot password.';
      case 'auth/user-not-found':
        return 'No account found for this email. Register first or double-check the address.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a minute and try again.';
      default:
        return 'Unable to continue right now. Try again in a moment.';
    }
  };

  const handlePasswordReset = async () => {
    setPasswordResetMessage('');
    setError('');

    if (!emailIsValid) {
      setError('Enter your email above so we know where to send the reset link.');
      return;
    }

    setPasswordResetLoading(true);
    const trimmedEmail = email.trim().toLowerCase();

    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setPasswordResetMessage('Password reset email sent. Check your inbox for the link.');
    } catch (err) {
      console.error('portal password reset error', err);
      setError(getAuthErrorMessage(err, 'login'));
    } finally {
      setPasswordResetLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setPasswordResetMessage('');

    if (!emailIsValid || !password) {
      setError('Enter a valid email and password.');
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    setSubmitting(true);

    try {
      if (mode === 'register') {
        if (selectedType === 'pro' && !isRecognisedPro) {
          setError('This email does not have Pro access yet. Upgrade from the Pricing page or contact support.');
          setSubmitting(false);
          return;
        }

        logEventIfAvailable('portal_register_attempt', { type: selectedType });
        const credential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        await persistPortalProfile(credential.user.uid, selectedType, trimmedEmail, statusData);
        logEventIfAvailable('portal_register_success', { type: selectedType });
        router.push(redirectPath || getPortalBase(selectedType));
        return;
      }

      logEventIfAvailable('portal_login_attempt', { type: selectedType });
      const credential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      const { type, snapshot } = await resolvePortalType(credential.user.uid, selectedType);
      await persistPortalProfile(credential.user.uid, type, trimmedEmail, statusData, snapshot);
      logEventIfAvailable('portal_login_success', { type });
      router.push(redirectPath || getPortalBase(type));
    } catch (err) {
      console.error('portal auth error', err);
      setError(getAuthErrorMessage(err, mode));
      const eventName = mode === 'register' ? 'portal_register_failed' : 'portal_login_failed';
      logEventIfAvailable(eventName, {
        type: selectedType,
        reason: err?.message || 'unknown',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setError('');
    try {
      await signOut(auth);
      setAuthUser(null);
      logEventIfAvailable('portal_logout', { type: selectedType });
    } catch (err) {
      console.error('portal logout error', err);
      setError('Unable to sign out right now. Please try again in a moment.');
    }
  };

  const headerLoggedInLinks = useMemo(() => {
    const base = getPortalBase(selectedType);
    return [
      { href: base, label: 'Portal' },
      { href: `${base}#venues`, label: 'My venues', hidden: selectedType !== 'venue' },
      { href: `${base}#billing`, label: 'My account' },
    ];
  }, [selectedType]);

  return (
    <>
      <Head>
        <title>{portalCopy.headline} - Set The Date</title>
      </Head>
      <PortalTopNav
        isLoggedIn={isLoggedIn}
        portalType={selectedType}
        userEmail={loggedInEmail}
        onSignOut={isLoggedIn ? handleSignOut : undefined}
        loggedInLinks={headerLoggedInLinks}
      />
      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black px-4 py-16">
        <div className="max-w-xl mx-auto rounded-[32px] bg-white text-slate-900 shadow-2xl shadow-slate-900/30 p-10">
          <div className="flex justify-center mb-6">
            <LogoHeader isPro />
          </div>
          <div className="text-center mb-8">
            <p className="uppercase tracking-[0.35em] text-xs text-slate-500 mb-3">
              {portalCopy.label} portal
            </p>
            <h1 className="text-3xl font-semibold">Login or register</h1>
            <p className="mt-3 text-slate-600 text-sm">{portalCopy.description}</p>
            {isLoggedIn && (
              <p className="mt-3 text-sm text-emerald-600">
                You are already signed in as {loggedInEmail || 'your Set The Date account'}. Use the menu below to go back to your dashboard or sign out.
              </p>
            )}
          </div>

          <PortalMenu
            mode={mode}
            onModeChange={setMode}
            isLoggedIn={isLoggedIn}
            userEmail={loggedInEmail}
            portalType={selectedType}
          />

          {isLoggedIn && (
            <div className="flex justify-end mb-6">
              <button
                type="button"
                onClick={handleSignOut}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline underline-offset-2"
              >
                Sign out
              </button>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="text-sm font-medium text-slate-600 block mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                placeholder="you@setthedate.app"
              />
              {selectedType === 'pro' && statusLoading && (
                <p className="text-xs text-slate-500 mt-1">Checking Pro access...</p>
              )}
              {selectedType === 'pro' && !statusLoading && emailIsValid && (
                <p className={`text-xs mt-1 ${isRecognisedPro ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {isRecognisedPro
                    ? 'Pro access recognised. Use any password you set here to reach the dashboard.'
                    : 'This email does not have Pro access yet. Upgrade from Pricing to continue.'}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="text-sm font-medium text-slate-600 block mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                placeholder="••••••••"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={handlePasswordReset}
                disabled={passwordResetLoading}
                className="text-sm font-semibold text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline disabled:opacity-60"
              >
                {passwordResetLoading ? 'Sending reset link...' : 'Forgot password?'}
              </button>
            </div>

            {error && <p className="text-sm text-rose-600">{error}</p>}
            {passwordResetMessage && <p className="text-sm text-emerald-600">{passwordResetMessage}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-2xl bg-slate-900 text-white font-semibold py-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-slate-900/20"
            >
              {submitting
                ? mode === 'register'
                  ? 'Creating account...'
                  : 'Signing in...'
                : mode === 'register'
                ? 'Create account'
                : 'Login'}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}

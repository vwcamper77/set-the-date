import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';
import LogoHeader from '@/components/LogoHeader';
import PortalMenu from '@/components/PortalMenu';
import PortalTopNav from '@/components/PortalTopNav';
import { auth, db } from '@/lib/firebase';
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

const portalCopy = {
  label: 'Rental owner',
  headline: 'Rental owner login',
  description: 'For property owners managing branded listings, share tools, and trip polls.',
};

const VALID_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export default function RentalsLoginPage() {
  const router = useRouter();
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [passwordResetMessage, setPasswordResetMessage] = useState('');
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [authUser, setAuthUser] = useState(() => auth?.currentUser || null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setAuthUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  const emailIsValid = useMemo(() => VALID_EMAIL_REGEX.test(email), [email]);
  const isLoggedIn = Boolean(authUser);
  const loggedInEmail = authUser?.email || '';

  const verifyOwnerProfile = async (uid) => {
    const ownerRef = doc(db, 'rentalsOwners', uid);
    const snapshot = await getDoc(ownerRef);
    return snapshot.exists();
  };

  const getAuthErrorMessage = (authError) => {
    if (!authError) {
      return 'Unable to continue right now. Try again in a moment.';
    }

    const { code } = authError;

    switch (code) {
      case 'auth/invalid-email':
      case 'auth/missing-email':
        return 'Enter a valid email address.';
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
        return 'Email or password is incorrect. Try again or use Forgot password.';
      case 'auth/user-not-found':
        return 'No account found for this email. Start a free trial from pricing.';
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
      console.error('rentals password reset error', err);
      setError(getAuthErrorMessage(err));
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
      logEventIfAvailable('rentals_login_attempt');
      const credential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      const hasOwnerProfile = await verifyOwnerProfile(credential.user.uid);
      if (!hasOwnerProfile) {
        setError('This account is not linked to a rentals owner profile yet. Start a free trial from pricing.');
        await signOut(auth);
        setSubmitting(false);
        return;
      }
      logEventIfAvailable('rentals_login_success');
      router.push(redirectPath || '/rentals/portal');
    } catch (err) {
      const authCode = err?.code || '';
      const isExpectedAuthError =
        authCode === 'auth/invalid-credential' ||
        authCode === 'auth/wrong-password' ||
        authCode === 'auth/user-not-found' ||
        authCode === 'auth/invalid-email' ||
        authCode === 'auth/missing-email';
      if (isExpectedAuthError) {
        console.warn('rentals auth rejected', authCode);
      } else {
        console.error('rentals auth error', err);
      }
      setError(getAuthErrorMessage(err));
      logEventIfAvailable('rentals_login_failed', { reason: err?.message || 'unknown' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setError('');
    try {
      await signOut(auth);
      setAuthUser(null);
      logEventIfAvailable('rentals_logout');
    } catch (err) {
      console.error('rentals logout error', err);
      setError('Unable to sign out right now. Please try again in a moment.');
    }
  };

  const headerLoggedInLinks = useMemo(
    () => [
      { href: '/rentals/portal', label: 'Portal' },
      { href: '/rentals/portal#properties', label: 'Properties' },
      { href: '/rentals/portal#branding', label: 'Branding' },
    ],
    []
  );

  return (
    <>
      <Head>
        <title>{portalCopy.headline} - Set The Date</title>
      </Head>
      <PortalTopNav
        isLoggedIn={isLoggedIn}
        portalType="rentals"
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
            <h1 className="text-3xl font-semibold">Login</h1>
            <p className="mt-3 text-slate-600 text-sm">
              Existing rental owners sign in here. New owners can start a free trial from pricing.
            </p>
            {isLoggedIn && (
              <p className="mt-3 text-sm text-emerald-600">
                You are already signed in as {loggedInEmail || 'your Set The Date account'}. Use the menu below to go back to your dashboard or sign out.
              </p>
            )}
          </div>

          <PortalMenu
            mode="login"
            onModeChange={() => {}}
            isLoggedIn={isLoggedIn}
            userEmail={loggedInEmail}
            portalType="rentals"
            registerHref="/rentals/pricing"
            registerLabel="Start free trial"
            registerDescription="Choose a plan, start your trial, and get your portal login."
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
                placeholder="you@yourrental.com"
              />
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
                placeholder="********"
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
                ? 'Signing in...'
                : 'Login'}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}

import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import PortalTopNav from '@/components/PortalTopNav';
import LogoHeader from '@/components/LogoHeader';
import { auth } from '@/lib/firebase';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';

const MIN_PASSWORD_LENGTH = 8;

const getQueryValue = (value) => {
  if (Array.isArray(value)) return value[0] || '';
  if (typeof value === 'string') return value;
  return '';
};

const decodeValue = (value) => {
  if (!value || typeof value !== 'string') return '';
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
};

const parseContinueUrl = (value) => {
  const decoded = decodeValue(getQueryValue(value));
  if (!decoded) return null;
  try {
    return new URL(decoded, 'https://setthedate.local');
  } catch (error) {
    return null;
  }
};

const normalizePortalType = (value) => {
  if (value === 'rentals' || value === 'venue') return value;
  return 'pro';
};

const resolvePortalFromPath = (path) => {
  if (!path || typeof path !== 'string') return '';
  if (path.startsWith('/rentals')) return 'rentals';
  if (path.startsWith('/venues')) return 'venue';
  return '';
};

const getDefaultLoginPath = (portalType) => {
  if (portalType === 'rentals') return '/rentals/login';
  if (portalType === 'venue') return '/venues/login';
  return '/pro/login';
};

const getPortalLabel = (portalType) => {
  if (portalType === 'rentals') return 'Rental owner';
  if (portalType === 'venue') return 'Venue partner';
  return 'Pro organiser';
};

export default function ResetPasswordPage() {
  const router = useRouter();
  const modeValue = useMemo(() => getQueryValue(router.query.mode), [router.query.mode]);
  const oobCodeValue = useMemo(() => getQueryValue(router.query.oobCode), [router.query.oobCode]);
  const continueUrl = useMemo(
    () => parseContinueUrl(router.query.continueUrl),
    [router.query.continueUrl]
  );
  const portalValue = useMemo(() => getQueryValue(router.query.portal), [router.query.portal]);
  const returnToValue = useMemo(() => getQueryValue(router.query.returnTo), [router.query.returnTo]);
  const continuePortal = continueUrl?.searchParams?.get('portal') || '';
  const continueReturnTo = continueUrl?.searchParams?.get('returnTo') || '';
  const portalType = useMemo(() => {
    const portalFromReturn =
      resolvePortalFromPath(decodeValue(returnToValue)) ||
      resolvePortalFromPath(decodeValue(continueReturnTo));
    return normalizePortalType(portalValue || continuePortal || portalFromReturn);
  }, [portalValue, continuePortal, returnToValue, continueReturnTo]);
  const returnTo = useMemo(() => {
    const direct =
      decodeValue(returnToValue) ||
      decodeValue(continueReturnTo);
    if (direct && direct.startsWith('/')) {
      return direct;
    }
    return getDefaultLoginPath(portalType);
  }, [returnToValue, continueReturnTo, portalType]);
  const portalLabel = useMemo(() => getPortalLabel(portalType), [portalType]);

  const [status, setStatus] = useState({ loading: false, error: '', email: '' });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    if (modeValue && modeValue !== 'resetPassword') {
      setStatus({ loading: false, error: 'This link is not a password reset link.', email: '' });
      return;
    }
    if (!oobCodeValue) {
      setStatus({ loading: false, error: 'This password reset link is invalid or expired.', email: '' });
      return;
    }

    let cancelled = false;
    setStatus({ loading: true, error: '', email: '' });
    verifyPasswordResetCode(auth, oobCodeValue)
      .then((email) => {
        if (cancelled) return;
        setStatus({ loading: false, error: '', email: email || '' });
      })
      .catch(() => {
        if (cancelled) return;
        setStatus({
          loading: false,
          error: 'This password reset link is invalid or expired.',
          email: '',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [router.isReady, modeValue, oobCodeValue]);

  const passwordReady = password.length >= MIN_PASSWORD_LENGTH;
  const canSubmit = Boolean(oobCodeValue) && !status.loading && !status.error;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');

    if (!canSubmit) {
      setSubmitError('This password reset link is not valid.');
      return;
    }

    if (!passwordReady) {
      setSubmitError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCodeValue, password);
      setSuccess(true);
    } catch (error) {
      setSubmitError(error?.message || 'Unable to reset your password right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Reset password - Set The Date</title>
      </Head>
      <PortalTopNav isLoggedIn={false} portalType={portalType} />
      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black px-4 py-16">
        <div className="max-w-xl mx-auto rounded-[32px] bg-white text-slate-900 shadow-2xl shadow-slate-900/30 p-10">
          <div className="flex justify-center mb-6">
            <LogoHeader isPro />
          </div>
          <div className="text-center mb-8">
            <p className="uppercase tracking-[0.35em] text-xs text-slate-500 mb-3">
              {portalLabel} portal
            </p>
            <h1 className="text-3xl font-semibold">Reset your password</h1>
            <p className="mt-3 text-slate-600 text-sm">
              Choose a new password to access your Set The Date portal.
            </p>
          </div>

          {status.loading && (
            <p className="text-sm text-slate-500 text-center">Checking your reset link...</p>
          )}

          {status.error && (
            <div className="text-center">
              <p className="text-sm text-rose-600">{status.error}</p>
              <Link href={returnTo} className="mt-4 inline-flex text-sm font-semibold text-slate-700 underline underline-offset-2">
                Back to login
              </Link>
            </div>
          )}

          {!status.loading && !status.error && !success && (
            <form className="space-y-4" onSubmit={handleSubmit}>
              {status.email && (
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500">
                  Resetting {status.email}
                </p>
              )}
              <div>
                <label htmlFor="password" className="text-sm font-medium text-slate-600 block mb-1">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                  placeholder="Create a secure password"
                />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="text-sm font-medium text-slate-600 block mb-1">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                  placeholder="Re-enter your password"
                />
              </div>
              {submitError && <p className="text-sm text-rose-600">{submitError}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl bg-slate-900 text-white font-semibold py-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-slate-900/20"
              >
                {submitting ? 'Saving password...' : 'Reset password'}
              </button>
            </form>
          )}

          {success && (
            <div className="text-center space-y-4">
              <p className="text-sm text-emerald-600">Your password has been updated.</p>
              <Link
                href={returnTo}
                className="inline-flex items-center justify-center rounded-full bg-slate-900 text-white font-semibold px-6 py-3"
              >
                Go to login
              </Link>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

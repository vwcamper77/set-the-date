import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import PortalTopNav from '@/components/PortalTopNav';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, signInWithCustomToken, updatePassword } from 'firebase/auth';

const MIN_PASSWORD_LENGTH = 8;

export default function RentalsWelcomePage({ email, token, needsPassword }) {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authState, setAuthState] = useState({ loading: false, error: '', attempted: false });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user || null);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!token || authState.attempted || firebaseUser || !authReady) return;
    setAuthState({ loading: true, error: '', attempted: true });
    signInWithCustomToken(auth, token)
      .then(() => {
        setAuthState({ loading: false, error: '', attempted: true });
      })
      .catch((error) => {
        console.error('rentals welcome sign-in failed', error);
        setAuthState({
          loading: false,
          error: error?.message || 'Unable to sign you in right now.',
          attempted: true,
        });
      });
  }, [authReady, authState.attempted, firebaseUser, token]);

  const showPasswordForm = needsPassword;
  const canContinue = Boolean(firebaseUser);
  const passwordReady = password.length >= MIN_PASSWORD_LENGTH;

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setPasswordError('');

    if (!firebaseUser) {
      setPasswordError('We are still signing you in. Please wait a moment.');
      return;
    }

    if (!passwordReady) {
      setPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setPasswordSaving(true);
    try {
      await updatePassword(firebaseUser, password);
      router.replace('/rentals/portal');
    } catch (error) {
      console.error('rentals password update failed', error);
      setPasswordError(error?.message || 'Unable to set your password right now.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const headline = useMemo(() => {
    if (showPasswordForm) {
      return 'Create your portal password';
    }
    return 'Your rental trial is ready';
  }, [showPasswordForm]);

  return (
    <>
      <Head>
        <title>Welcome to rentals - Set The Date</title>
      </Head>
      <PortalTopNav isLoggedIn={false} portalType="rentals" />
      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black px-4 py-16">
        <div className="max-w-xl mx-auto rounded-[32px] bg-white text-slate-900 shadow-2xl shadow-slate-900/30 p-10 text-center">
          <p className="uppercase tracking-[0.35em] text-xs text-slate-500 mb-3">Rentals</p>
          <h1 className="text-3xl font-semibold">{headline}</h1>
          <p className="mt-3 text-sm text-slate-600">
            {email
              ? `We have activated your trial for ${email}.`
              : 'We have activated your rentals trial.'}
          </p>

          {authState.loading && (
            <p className="mt-4 text-sm text-slate-500">Finalising your access...</p>
          )}
          {authState.error && (
            <p className="mt-4 text-sm text-rose-600">{authState.error}</p>
          )}

          {showPasswordForm ? (
            <form className="mt-6 space-y-4 text-left" onSubmit={handlePasswordSubmit}>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-600 mb-1">
                  Password
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
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-600 mb-1">
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
              {passwordError && <p className="text-sm text-rose-600">{passwordError}</p>}
              <button
                type="submit"
                disabled={passwordSaving}
                className="w-full rounded-full bg-slate-900 text-white font-semibold py-3 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {passwordSaving ? 'Saving password...' : 'Create password and continue'}
              </button>
            </form>
          ) : (
            <div className="mt-6 space-y-3">
              <Link
                href="/rentals/portal"
                aria-disabled={!canContinue}
                className={`inline-flex items-center justify-center rounded-full bg-slate-900 text-white font-semibold px-6 py-3 ${
                  canContinue ? '' : 'pointer-events-none opacity-60'
                }`}
              >
                {canContinue ? 'Go to rentals portal' : 'Finalising access...'}
              </Link>
              <p className="text-xs text-slate-500">
                Need to manage billing or change plans? Visit your portal any time.
              </p>
            </div>
          )}

          <div className="mt-6">
            <Link href="/rentals/pricing" className="text-xs text-slate-500 underline underline-offset-2">
              Back to pricing
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

export async function getServerSideProps({ query }) {
  const sessionId = typeof query.session_id === 'string' ? query.session_id : '';
  if (!sessionId) {
    return {
      redirect: {
        destination: '/rentals/pricing',
        permanent: false,
      },
    };
  }

  try {
    const [{ stripe }, { auth: adminAuth }, { finaliseRentalsSubscriptionFromSession }] = await Promise.all([
      import('@/lib/stripe'),
      import('@/lib/firebaseAdmin'),
      import('@/lib/rentals/billing'),
    ]);

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer', 'subscription'],
    });

    if (!session || session.mode !== 'subscription') {
      return {
        redirect: {
          destination: '/rentals/pricing',
          permanent: false,
        },
      };
    }

    const paymentStatus = session.payment_status;
    if (
      session.status !== 'complete' &&
      paymentStatus !== 'paid' &&
      paymentStatus !== 'no_payment_required'
    ) {
      return {
        redirect: {
          destination: '/rentals/pricing',
          permanent: false,
        },
      };
    }

    const email =
      session.customer_details?.email ||
      session.metadata?.rentalsOwnerEmail ||
      (typeof session.customer === 'object' ? session.customer?.email : '') ||
      '';

    if (!email) {
      return {
        redirect: {
          destination: '/rentals/pricing',
          permanent: false,
        },
      };
    }

    let userRecord = null;
    let needsPassword = false;

    try {
      userRecord = await adminAuth.getUserByEmail(email);
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    if (!userRecord) {
      userRecord = await adminAuth.createUser({ email });
      needsPassword = true;
    } else {
      const hasPasswordProvider = userRecord.providerData?.some(
        (provider) => provider.providerId === 'password'
      );
      needsPassword = !hasPasswordProvider;
    }

    const sessionWithOwner = {
      ...session,
      metadata: {
        ...(session.metadata || {}),
        rentalsOwnerId: userRecord.uid,
        rentalsOwnerEmail: email,
      },
    };
    await finaliseRentalsSubscriptionFromSession(sessionWithOwner);

    const existingClaims = userRecord.customClaims || {};
    if (existingClaims.portalType !== 'rentals') {
      await adminAuth.setCustomUserClaims(userRecord.uid, {
        ...existingClaims,
        portalType: 'rentals',
      });
    }

    const customToken = await adminAuth.createCustomToken(userRecord.uid, {
      portalType: 'rentals',
    });

    return {
      props: {
        email,
        token: customToken,
        needsPassword,
      },
    };
  } catch (error) {
    console.error('rentals welcome error', error);
    return {
      redirect: {
        destination: '/rentals/pricing',
        permanent: false,
      },
    };
  }
}

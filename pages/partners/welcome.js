import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { getAuth, signInAnonymously } from 'firebase/auth';

export default function PartnerWelcomePage({ signupUrl, venueName }) {
  const router = useRouter();

  useEffect(() => {
    const ensureAuthAndRedirect = async () => {
      try {
        const auth = getAuth();
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error('anon auth failed', err);
      } finally {
        if (signupUrl) {
          router.replace(signupUrl);
        }
      }
    };
    ensureAuthAndRedirect();
  }, [router, signupUrl]);

  return (
    <>
      <Head>
        <title>Welcome partner - Set The Date</title>
      </Head>
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
        <div className="max-w-lg text-center space-y-4">
          <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Setting things up</p>
          <h1 className="text-3xl font-semibold">Welcome {venueName ? `back, ${venueName}` : 'aboard'}.</h1>
          <p className="text-slate-300">
            We&apos;re unlocking your venue builder. You&apos;ll be redirected automatically to upload your logo and
            photos.
          </p>
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
        destination: '/partners/start',
        permanent: false,
      },
    };
  }

  try {
    const [{ stripe }, { ensureOnboardingRecord }] = await Promise.all([
      import('@/lib/stripe'),
      import('@/lib/partners/onboardingService'),
    ]);

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer'],
    });

    if (!session || session.mode !== 'subscription') {
      throw new Error('Invalid session');
    }

    const stripeCustomerId =
      typeof session.customer === 'string' ? session.customer : session.customer?.id || '';

    const record = await ensureOnboardingRecord({
      sessionId,
      stripeCustomerId,
      customerEmail: session.customer_details?.email || session.customer?.email || '',
      customerName: session.customer_details?.name || session.customer?.name || '',
    });

    const signupUrl = `/partners/signup?token=${record.data.onboardingToken}`;

    return {
      props: {
        signupUrl,
        venueName: record.data.customerName || '',
      },
    };
  } catch (error) {
    console.error('welcome page error', error);
    return {
      redirect: {
        destination: '/partners/start',
        permanent: false,
      },
    };
  }
}

import { useState } from 'react';
import Head from 'next/head';
import PartnerNav from '@/components/PartnerNav';

const trialDays = Number.parseInt(process.env.NEXT_PUBLIC_PARTNER_TRIAL_DAYS || '14', 10);
const displayTrialDays = Number.isFinite(trialDays) && trialDays > 0 ? trialDays : 14;

export default function PartnerCheckoutPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStartTrial = async () => {
    setError('');
    setLoading(true);
    try {
      const origin =
        typeof window !== 'undefined' && window.location?.origin
          ? window.location.origin
          : null;
      const body = origin
        ? {
            successUrl: `${origin}/venues/welcome?session_id={CHECKOUT_SESSION_ID}`,
            cancelUrl: `${origin}/venues`,
          }
        : {};

      const response = await fetch('/api/partners/createCheckoutSession', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Unable to start checkout session');
      }

      const { url } = await response.json();
      if (url) {
        window.location.assign(url);
      } else {
        throw new Error('Checkout URL missing');
      }
    } catch (err) {
      setError(err.message || 'Unable to redirect to checkout.');
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Secure your free trial - Set The Date</title>
      </Head>
      <PartnerNav />
      <main className="min-h-screen bg-slate-100 text-slate-900 px-4 py-10 sm:py-16">
        <div className="mx-auto w-full max-w-2xl rounded-[32px] border border-slate-200 bg-white px-6 py-10 shadow-2xl shadow-slate-900/10 sm:px-8 sm:py-12">
          <p className="text-xs uppercase tracking-[0.4em] text-slate-500 mb-4">Secure checkout</p>
          <h1 className="text-3xl font-semibold mb-4 text-slate-900">
            Start your {displayTrialDays}-day Set The Date Pro trial
          </h1>
          <p className="text-slate-600 mb-6">
            You&apos;ll head to Stripe to confirm your plan. We won&apos;t charge anything until day {displayTrialDays + 1}.
            Cancel anytime inside Set The Date.
          </p>

          <ul className="space-y-3 text-sm text-slate-700 mb-10">
            <li>- Unlimited polls and guest invites</li>
            <li>- Hosted venue landing page with your branding</li>
            <li>- Ready-to-send campaign email copy</li>
            <li>- CRM alerts when guests book</li>
          </ul>

          <button
            type="button"
            onClick={handleStartTrial}
            disabled={loading}
            className="w-full rounded-full bg-slate-900 text-white font-semibold py-3 text-lg disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Redirecting to Stripe...' : 'Continue to Stripe checkout'}
          </button>
          {error && <p className="text-sm text-rose-500 mt-4">{error}</p>}

          <p className="text-xs text-slate-500 text-center mt-6">
            Powered by Stripe. Need help? Email <a href="mailto:hello@setthedate.app">hello@setthedate.app</a>.
          </p>
        </div>
      </main>
    </>
  );
}

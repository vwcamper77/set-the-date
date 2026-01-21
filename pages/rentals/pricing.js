import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LogoHeader from '@/components/LogoHeader';
import RentalsNav from '@/components/RentalsNav';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

const VALID_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const tiers = [
  {
    name: 'Solo',
    planKey: 'solo',
    price: '1 property',
    description: 'For independent owners launching their first branded property page.',
    cta: { label: 'Start free trial' },
    highlights: [
      'Branded property page with your logo, accent color, and CTA',
      'Trip poll builder that sends guests to a shareable link',
      'Copy-and-paste post-stay email + website button snippet',
    ],
  },
  {
    name: 'Small portfolio',
    planKey: 'portfolio',
    price: '2-3 properties',
    description: 'For hosts managing a small cluster of rentals.',
    cta: { label: 'Start free trial' },
    highlights: [
      'Manage multiple properties from one portal',
      'Owner-level branding defaults for faster setup',
      'Share tools for every listing',
    ],
  },
  {
    name: 'Agency',
    planKey: 'agency',
    price: '4-20 properties',
    description: 'For property managers scaling repeat bookings.',
    cta: { label: 'Start free trial' },
    highlights: [
      'Central dashboard with performance counts',
      'Bulk-ready branding defaults',
      'Attribution across campaigns and listings',
    ],
  },
  {
    name: 'Custom',
    planKey: 'custom',
    price: '20+ properties',
    description: 'Custom rollout plans for enterprise portfolios.',
    cta: { label: 'Request custom plan', href: '/rentals/contact' },
    highlights: [
      'Enterprise onboarding and rollout support',
      'Custom reporting and attribution',
      'Priority support for multi-region teams',
    ],
  },
];

const PRICE_POINTS = {
  solo: { monthly: 4, annual: 40 },
  portfolio: { monthly: 9, annual: 90 },
  agency: { monthly: 25, annual: 250 },
};

const EU_COUNTRY_CODES = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'IS',
  'LI',
  'NO',
]);

const extractRegionCode = (locale = '') => {
  const parts = locale.replace('_', '-').toUpperCase().split('-');
  for (const part of parts) {
    if (part.length === 2 && /^[A-Z]{2}$/.test(part)) {
      return part === 'UK' ? 'GB' : part;
    }
  }
  return '';
};

const detectCurrency = () => {
  if (typeof window === 'undefined') return 'USD';
  const resolvedLocale = new Intl.DateTimeFormat().resolvedOptions().locale || '';
  const localeCandidates = [
    resolvedLocale,
    ...(navigator.languages || []),
    navigator.language,
  ].filter(Boolean);

  for (const locale of localeCandidates) {
    const region = extractRegionCode(locale);
    if (region === 'GB') return 'GBP';
    if (region && EU_COUNTRY_CODES.has(region)) return 'EUR';
  }

  return 'USD';
};

const formatCurrencyAmount = (amount, currency) => {
  if (typeof amount !== 'number') return '';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
};

const faqs = [
  {
    q: 'How does the trial work?',
    a: 'Start a 14-day trial, add your brand assets, and launch your first property page. Cancel anytime before day 14.',
  },
  {
    q: 'What happens after I start a trial?',
    a: 'We create your rentals portal login, unlock your builder, and send you a ready-to-use post-stay email.',
  },
  {
    q: 'Can I add more than three properties?',
    a: 'Yes. Agency and enterprise pricing is available for portfolios, managers, and multi-region teams.',
  },
];

export default function RentalsPricingPage() {
  const [billingCadence, setBillingCadence] = useState('monthly');
  const [checkoutPlan, setCheckoutPlan] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [user, setUser] = useState(() => auth?.currentUser || null);
  const [currency, setCurrency] = useState('USD');
  const [checkoutEmail, setCheckoutEmail] = useState('');
  const [checkoutEmailError, setCheckoutEmailError] = useState('');
  const checkoutEmailWrapRef = useRef(null);
  const checkoutEmailInputRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser || null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setCurrency(detectCurrency());
  }, []);

  const handleCta = useCallback((label, meta = {}) => {
    logEventIfAvailable('rental_pricing_cta_click', { label, ...meta });
  }, []);

  const pricingLabel = useMemo(() => {
    if (billingCadence === 'annual') return 'year';
    return 'month';
  }, [billingCadence]);

  const getPlanPrice = useCallback(
    (planKey) => {
      const amount = PRICE_POINTS?.[planKey]?.[billingCadence];
      if (!amount) return '';
      const formatted = formatCurrencyAmount(amount, currency);
      return formatted ? `${formatted} / ${pricingLabel}` : '';
    },
    [billingCadence, currency, pricingLabel]
  );

  const handleCheckout = useCallback(
    async (planTier, label) => {
      if (typeof window === 'undefined') return;
      setCheckoutError('');
      setCheckoutEmailError('');
      setCheckoutPlan(planTier);
      handleCta(label, { planTier, cadence: billingCadence });

      try {
        const origin = window.location?.origin || '';
        const fallbackBase = process.env.NEXT_PUBLIC_BASE_URL || 'https://plan.setthedate.app';
        const baseUrl = origin.startsWith('http') ? origin : fallbackBase;
        const ownerEmail = (user?.email || checkoutEmail || '').trim().toLowerCase();

        if (!ownerEmail || !VALID_EMAIL_REGEX.test(ownerEmail)) {
          setCheckoutEmailError('Enter a valid email below to start your free trial.');
          setCheckoutPlan('');
          if (checkoutEmailWrapRef.current) {
            checkoutEmailWrapRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          if (checkoutEmailInputRef.current) {
            checkoutEmailInputRef.current.focus();
          }
          return;
        }

        const response = await fetch('/api/rentals/createCheckoutSession', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planTier,
            cadence: billingCadence,
            currency,
            successUrl: `${baseUrl}/rentals/welcome?session_id={CHECKOUT_SESSION_ID}`,
            cancelUrl: `${baseUrl}/rentals/pricing`,
            ownerId: user?.uid || '',
            ownerEmail,
          }),
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to start checkout session.');
        }
        if (!payload?.url) {
          throw new Error('Checkout URL missing.');
        }
        window.location.assign(payload.url);
      } catch (error) {
        console.error('rentals checkout failed', error);
        setCheckoutError(error?.message || 'Unable to start checkout session.');
        setCheckoutPlan('');
      }
    },
    [billingCadence, checkoutEmail, currency, handleCta, user?.email, user?.uid]
  );

  return (
    <>
      <Head>
        <title>Rentals Pricing - Set The Date</title>
        <meta
          name="description"
          content="Rental owner pricing for property hosts using Set The Date."
        />
      </Head>

      <RentalsNav />

      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black px-4 py-12">
        <div className="max-w-5xl mx-auto text-center mb-12 rounded-[32px] bg-white text-slate-900 shadow-2xl shadow-slate-900/30 px-8 py-12">
          <div className="flex justify-center mb-6">
            <LogoHeader />
          </div>
          <p className="uppercase tracking-[0.35em] text-xs text-slate-500 mb-4">Rentals pricing</p>
          <h1 className="text-4xl font-semibold">Rental owner plans for property teams.</h1>
          <p className="mt-4 text-slate-600 max-w-2xl mx-auto">
            Turn past guests into repeat bookings with branded property pages, trip polls, and share-ready campaigns.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => handleCheckout('solo', 'Hero CTA')}
              className="inline-flex items-center justify-center rounded-full bg-slate-900 text-white font-semibold px-6 py-3"
            >
              Start free trial
            </button>
            <Link
              href="/rentals/login"
              onClick={() => handleCta('Owner portal login')}
              className="inline-flex items-center justify-center rounded-full border border-slate-900 text-slate-900 font-semibold px-6 py-3"
            >
              Owner portal login
            </Link>
          </div>
        </div>

        <div className="max-w-5xl mx-auto flex flex-col items-center mb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-3">Billing cadence</p>
          <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setBillingCadence('monthly')}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                billingCadence === 'monthly'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingCadence('annual')}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                billingCadence === 'annual'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Annual
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-3">
            {billingCadence === 'annual' ? 'Billed annually.' : 'Billed monthly.'}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Prices shown in your local currency. Billing handled securely by Stripe.
          </p>
          {!user?.email && (
            <div
              ref={checkoutEmailWrapRef}
              className={`mt-6 w-full max-w-md rounded-2xl border bg-white px-4 py-4 text-left ${
                checkoutEmailError ? 'border-rose-300' : 'border-slate-200'
              }`}
            >
              <label htmlFor="checkoutEmail" className="block text-xs font-semibold text-slate-600 mb-2">
                Billing email
              </label>
              <input
                id="checkoutEmail"
                type="email"
                ref={checkoutEmailInputRef}
                value={checkoutEmail}
                onChange={(event) => {
                  setCheckoutEmail(event.target.value);
                  if (checkoutEmailError) {
                    setCheckoutEmailError('');
                  }
                }}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                placeholder="you@yourrental.com"
              />
              <p className="text-xs text-slate-500 mt-2">
                We will use this email for your portal access and billing receipts.
              </p>
              {checkoutEmailError && (
                <p className="text-xs font-semibold text-rose-600 mt-2">{checkoutEmailError}</p>
              )}
            </div>
          )}
        </div>

        <div className="max-w-5xl mx-auto grid gap-6 md:grid-cols-2">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className="rounded-3xl border p-6 flex flex-col bg-white text-slate-900 shadow-2xl shadow-slate-900/20"
            >
              <div className="mb-4">
                <p className="text-sm uppercase tracking-[0.2em] text-slate-500">{tier.name}</p>
                <p className="text-3xl font-semibold text-slate-900">{tier.price}</p>
                {tier.planKey !== 'custom' && (
                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    {getPlanPrice(tier.planKey)}
                  </p>
                )}
                <p className="mt-2 text-sm text-slate-600">{tier.description}</p>
              </div>
              <ul className="space-y-2 text-sm text-slate-700 flex-1">
                {tier.highlights.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-900" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              {tier.planKey === 'custom' ? (
                <Link
                  href={tier.cta.href}
                  onClick={() => handleCta(tier.name)}
                  className="mt-6 inline-flex items-center justify-center rounded-full px-5 py-3 font-semibold border border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white transition"
                >
                  {tier.cta.label}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => handleCheckout(tier.planKey, tier.name)}
                  disabled={checkoutPlan === tier.planKey}
                  className="mt-6 inline-flex items-center justify-center rounded-full px-5 py-3 font-semibold border border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {checkoutPlan === tier.planKey ? 'Redirecting...' : tier.cta.label}
                </button>
              )}
            </div>
          ))}
        </div>
        {checkoutError && (
          <div className="max-w-4xl mx-auto mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 text-center">
            {checkoutError}
          </div>
        )}

        <div className="max-w-5xl mx-auto mt-16 rounded-[40px] bg-white text-slate-900 border border-white/60 px-10 py-14 shadow-2xl shadow-slate-900/30">
          <div className="text-center mb-8">
            <p className="uppercase tracking-[0.35em] text-xs text-slate-500">FAQ</p>
            <h2 className="text-4xl font-semibold">Rental owner questions</h2>
          </div>
          <div className="space-y-8 text-left text-lg leading-relaxed">
            {faqs.map((item) => (
              <div key={item.q}>
                <h3 className="text-2xl font-semibold text-slate-900 mb-2">{item.q}</h3>
                <p className="text-slate-600">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}

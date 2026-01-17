import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import LogoHeader from '@/components/LogoHeader';
import PartnerNav from '@/components/PartnerNav';
import UpgradeModal from '@/components/UpgradeModal';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';

const VALID_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const tiers = [
  {
    name: 'Free',
    price: '$0',
    description: 'Plan the occasional night out with friends. No logins, no ads.',
    cta: { label: 'Start planning', href: '/' },
    highlights: [
      '1 live poll at a time',
      'Up to 3 date options per poll',
      'Share page with WhatsApp, SMS, and email templates',
    ],
  },
  {
    name: 'Pro Unlock',
    price: '$2.99 / 3 months',
    description:
      'Power users get unlimited polls, unlimited dates, and organiser perks with a 3-month subscription.',
    featured: true,
    cta: { label: 'Unlock Pro', action: 'upgrade' },
    highlights: [
      'Unlimited polls & date options',
      'Hosted landing page for every event',
      'Priority notification emails + reminders',
    ],
  },
];

const faqs = [
  {
    q: 'How does the subscription work?',
    a: 'Pro organisers subscribe for $2.99 every 3 months once they hit free limits. Cancel anytime.',
  },
  {
    q: 'Do guests ever have to pay or log in?',
    a: 'Never. Voting stays free with no login. You only share the poll link and guests pick Best/Maybe/No.',
  },
  {
    q: 'What happens when I upgrade to Pro?',
    a: 'You immediately unlock unlimited polls, unlimited dates, and the Pro organiser dashboard for your account.',
  },
];

export default function PricingPage() {
  const router = useRouter();
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeEmail, setUpgradeEmail] = useState('');
  const [upgradeEmailError, setUpgradeEmailError] = useState('');
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  const handleCta = useCallback((label) => {
    logEventIfAvailable('pricing_cta_click', { label });
  }, []);

  const openUpgradeModal = useCallback(() => {
    setUpgradeEmailError('');
    setUpgradeModalOpen(true);
  }, []);

  const closeUpgradeModal = useCallback(() => {
    setUpgradeModalOpen(false);
    setUpgradeEmailError('');
  }, []);

  const handleUpgradeEmailChange = useCallback(
    (value) => {
      setUpgradeEmail(value);
      if (upgradeEmailError) {
        setUpgradeEmailError('');
      }
    },
    [upgradeEmailError]
  );

  const handleUpgradeClick = useCallback(async () => {
    if (typeof window === 'undefined') return;

    const trimmedEmail = upgradeEmail.trim();
    if (!VALID_EMAIL_REGEX.test(trimmedEmail)) {
      setUpgradeEmailError('Enter a valid organiser email to continue.');
      return;
    }

    setUpgradeEmailError('');
    setUpgradeLoading(true);

    try {
      const origin = window.location.origin;
      const fallbackBase =
        process.env.NEXT_PUBLIC_BASE_URL || 'https://plan.setthedate.app';
      const baseUrl = origin.startsWith('https://') ? origin : fallbackBase;
      const response = await fetch('/api/billing/createCheckoutSession', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          successUrl: `${baseUrl}/pro/pricing?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${baseUrl}/pro/pricing`,
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
    } catch (err) {
      console.error('pricing checkout failed', err);
      setUpgradeEmailError('Unable to start checkout. Please try again.');
      setUpgradeLoading(false);
    }
  }, [upgradeEmail]);

  const handleUpgradeCta = useCallback(
    (label) => {
      handleCta(label);
      openUpgradeModal();
    },
    [handleCta, openUpgradeModal]
  );

  useEffect(() => {
    if (!router.isReady) return;
    const sessionId = typeof router.query?.session_id === 'string' ? router.query.session_id : '';
    if (!sessionId) return;

    let cancelled = false;

    const confirmUpgrade = async () => {
      setUpgradeLoading(true);
      try {
        await fetch('/api/upgradeToPro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
      } catch (err) {
        console.error('pricing upgrade confirmation failed', err);
      } finally {
        if (cancelled) return;
        setUpgradeLoading(false);
        const { session_id, ...rest } = router.query;
        router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
      }
    };

    confirmUpgrade();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <>
      <Head>
        <title>Pricing - Set The Date</title>
        <meta name="description" content="Simple pricing for Pro organisers using Set The Date." />
      </Head>

      <PartnerNav defaultPortalType="pro" />

      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black px-4 py-12">
        <div className="max-w-5xl mx-auto text-center mb-12 rounded-[32px] bg-white text-slate-900 shadow-2xl shadow-slate-900/30 px-8 py-12">
          <div className="flex justify-center mb-6">
            <LogoHeader isPro />
          </div>
          <p className="uppercase tracking-[0.35em] text-xs text-slate-500 mb-4">Pricing</p>
          <h1 className="text-4xl font-semibold">Pro pricing for organisers.</h1>
          <p className="mt-4 text-slate-600 max-w-2xl mx-auto">
            Start free and unlock unlimited planning for $2.99 with a 3-month access pass when you need it.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/pro/login"
              onClick={() => handleCta('Pro portal')}
              className="inline-flex items-center justify-center rounded-full bg-slate-900 text-white font-semibold px-6 py-3"
            >
              Pro portal login
            </Link>
            <Link
              href="/"
              onClick={() => handleCta('Start planning')}
              className="inline-flex items-center justify-center rounded-full border border-slate-900 text-slate-900 font-semibold px-6 py-3"
            >
              Start planning
            </Link>
          </div>
        </div>

        <div className="max-w-6xl mx-auto grid gap-6 md:grid-cols-2">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-3xl border p-6 flex flex-col bg-white text-slate-900 shadow-2xl shadow-slate-900/20 ${
                tier.featured ? '' : 'opacity-95'
              }`}
            >
              <div className="mb-4">
                <p className="text-sm uppercase tracking-[0.2em] text-slate-500">{tier.name}</p>
                <p className="text-3xl font-semibold text-slate-900">{tier.price}</p>
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
              {tier.cta.action === 'upgrade' ? (
                <button
                  type="button"
                  onClick={() => handleUpgradeCta(tier.name)}
                  className="mt-6 inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-3 font-semibold text-white"
                >
                  {tier.cta.label}
                </button>
              ) : (
                <Link
                  href={tier.cta.href}
                  onClick={() => handleCta(tier.name)}
                  className="mt-6 inline-flex items-center justify-center rounded-full border border-slate-900 px-5 py-3 font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white"
                >
                  {tier.cta.label}
                </Link>
              )}
            </div>
          ))}
        </div>

        <div className="max-w-5xl mx-auto mt-16 rounded-[40px] bg-white text-slate-900 border border-white/60 px-10 py-14 shadow-2xl shadow-slate-900/30">
          <div className="text-center mb-8">
            <p className="uppercase tracking-[0.35em] text-xs text-slate-500">FAQ</p>
            <h2 className="text-4xl font-semibold">Still deciding?</h2>
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

      <UpgradeModal
        open={upgradeModalOpen}
        onClose={closeUpgradeModal}
        onUpgrade={handleUpgradeClick}
        onEmailChange={handleUpgradeEmailChange}
        emailValue={upgradeEmail}
        emailError={upgradeEmailError}
        upgrading={upgradeLoading}
      />
    </>
  );
}

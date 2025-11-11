import Head from 'next/head';
import Link from 'next/link';
import { useCallback } from 'react';
import LogoHeader from '@/components/LogoHeader';
import PartnerNav from '@/components/PartnerNav';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';

const tiers = [
  {
    name: 'Free',
    price: '$0',
    description: 'Plan the occasional night out with friends. No logins, no ads.'
,    cta: { label: 'Start planning', href: '/' },
    highlights: [
      '1 live poll at a time',
      'Up to 3 date options per poll',
      'Share page with WhatsApp, SMS, and email templates',
    ],
  },
  {
    name: 'Pro Unlock',
    price: '$2.99 / 3 months',
    description: 'Power users get unlimited polls, unlimited dates, and organiser perks with a 3-month subscription.',
    featured: true,
    cta: { label: 'Unlock Pro', href: '/' },
    highlights: [
      'Unlimited polls & date options',
      'Hosted landing page for every event',
      'Priority notification emails + reminders',
    ],
  },
  {
    name: 'Venue Partner',
    price: '14-day free trial ? $19/mo (1-3 venues)',
    description: 'Hotels and restaurants get a branded share page, campaign email pack, and attribution. Enterprise pricing on request.',
    cta: { label: 'Apply now', href: '/partners/signup' },
    highlights: [
      'Branded mini-site with your logo, brand colour, and CTA',
      'Ready-to-send outreach email plus a QR code image for menus or signage',
      'Organiser flow auto-tags your venue with analytics + follow-ups',
    ],
  },
];

const faqs = [
  {
    q: 'How does the subscription work?',
    a: 'Organisers subscribe for $2.99 every 3 months once they hit free limits. Cancel anytime. Venue partners are invite-only during the MVP.',
  },
  {
    q: 'Do guests ever have to pay or log in?',
    a: 'Never. Voting stays free with no login. You only share the poll link and guests pick Best/Maybe/No.',
  },
  {
    q: 'What happens after a venue partner signup?',
    a: 'We spin up a public landing page, email you a campaign template, and wire the create flow to show “Powered by” messaging for your organisers.',
  },
];

export default function PricingPage() {
  const handleCta = useCallback((label) => {
    logEventIfAvailable('pricing_cta_click', { label });
  }, []);

  return (
    <>
      <Head>
        <title>Pricing - Set The Date</title>
        <meta
          name="description"
          content="Simple pricing for organisers and venues using Set The Date."
        />
      </Head>

      <PartnerNav />

      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black px-4 py-12">
        <div className="max-w-5xl mx-auto text-center mb-12 rounded-[32px] bg-white text-slate-900 shadow-2xl shadow-slate-900/30 px-8 py-12">
          <div className="flex justify-center mb-6">
            <LogoHeader isPro />
          </div>
          <p className="uppercase tracking-[0.35em] text-xs text-slate-500 mb-4">Pricing</p>
          <h1 className="text-4xl font-semibold">One flow for organisers, another for venues.</h1>
          <p className="mt-4 text-slate-600 max-w-2xl mx-auto">
            Start free, unlock unlimited planning for $2.99 with a 3-month access pass when you need it, or onboard your venue team to the partner program.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/login?type=pro"
              onClick={() => handleCta('Pro portal')}
              className="inline-flex items-center justify-center rounded-full bg-slate-900 text-white font-semibold px-6 py-3"
            >
              Pro portal login
            </Link>
            <Link
              href="/login?type=venue"
              onClick={() => handleCta('Venue portal')}
              className="inline-flex items-center justify-center rounded-full border border-slate-900 text-slate-900 font-semibold px-6 py-3"
            >
              Venue partner login
            </Link>
          </div>
        </div>

        <div className="max-w-6xl mx-auto grid gap-6 md:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-3xl border p-6 flex flex-col bg-white text-slate-900 shadow-2xl shadow-slate-900/20 ${
                tier.featured ? '' : 'opacity-95'
              }`}
            >
              <div className="mb-4">
                <p className="text-sm uppercase tracking-[0.2em] text-slate-500">
                  {tier.name}
                </p>
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
              <Link
                href={tier.cta.href}
                onClick={() => handleCta(tier.name)}
                className={`mt-6 inline-flex items-center justify-center rounded-full px-5 py-3 font-semibold ${
                  tier.name === 'Pro Unlock'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white transition'
                }`}
              >
                {tier.cta.label}
              </Link>
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
    </>
  );
}


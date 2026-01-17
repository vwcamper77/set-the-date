import Head from 'next/head';
import Link from 'next/link';
import { useCallback } from 'react';
import LogoHeader from '@/components/LogoHeader';
import PartnerNav from '@/components/PartnerNav';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';

const tier = {
  name: 'Venue Partner',
  price: '14-day free trial then $19/mo (1-3 venues)',
  description:
    'Hotels and restaurants get a branded share page, campaign email pack, and attribution. Enterprise pricing on request.',
  cta: { label: 'Start free trial', href: '/venues/checkout' },
  highlights: [
    'Branded mini-site with your logo, brand colour, and CTA',
    'Ready-to-send outreach email plus a QR code image for menus or signage',
    'Organiser flow auto-tags your venue with analytics + follow-ups',
  ],
};

const faqs = [
  {
    q: 'How does the trial work?',
    a: 'Start a 14-day trial, add your brand assets, and launch your venue page. Cancel anytime before day 14.',
  },
  {
    q: 'What happens after I start a trial?',
    a: 'We create your venue portal login, unlock your builder, and send you a ready-to-use campaign email.',
  },
  {
    q: 'Can I add more than three venues?',
    a: 'Yes. Enterprise pricing is available for groups, multi-site operators, and agencies.',
  },
];

export default function VenuePricingPage() {
  const handleCta = useCallback((label) => {
    logEventIfAvailable('venue_pricing_cta_click', { label });
  }, []);

  return (
    <>
      <Head>
        <title>Venue Pricing - Set The Date</title>
        <meta
          name="description"
          content="Venue partner pricing for hotels and restaurants using Set The Date."
        />
      </Head>

      <PartnerNav defaultPortalType="venue" />

      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black px-4 py-12">
        <div className="max-w-5xl mx-auto text-center mb-12 rounded-[32px] bg-white text-slate-900 shadow-2xl shadow-slate-900/30 px-8 py-12">
          <div className="flex justify-center mb-6">
            <LogoHeader />
          </div>
          <p className="uppercase tracking-[0.35em] text-xs text-slate-500 mb-4">Venue pricing</p>
          <h1 className="text-4xl font-semibold">Venue partner plans for hospitality teams.</h1>
          <p className="mt-4 text-slate-600 max-w-2xl mx-auto">
            Turn your email list into group bookings with branded venue pages, campaign templates, and attribution.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/venues/checkout"
              onClick={() => handleCta('Start free trial')}
              className="inline-flex items-center justify-center rounded-full bg-slate-900 text-white font-semibold px-6 py-3"
            >
              Start free trial
            </Link>
            <Link
              href="/venues/login"
              onClick={() => handleCta('Venue portal login')}
              className="inline-flex items-center justify-center rounded-full border border-slate-900 text-slate-900 font-semibold px-6 py-3"
            >
              Venue portal login
            </Link>
          </div>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="rounded-3xl border p-6 flex flex-col bg-white text-slate-900 shadow-2xl shadow-slate-900/20">
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
            <Link
              href={tier.cta.href}
              onClick={() => handleCta(tier.name)}
              className="mt-6 inline-flex items-center justify-center rounded-full px-5 py-3 font-semibold border border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white transition"
            >
              {tier.cta.label}
            </Link>
          </div>
        </div>

        <div className="max-w-5xl mx-auto mt-16 rounded-[40px] bg-white text-slate-900 border border-white/60 px-10 py-14 shadow-2xl shadow-slate-900/30">
          <div className="text-center mb-8">
            <p className="uppercase tracking-[0.35em] text-xs text-slate-500">FAQ</p>
            <h2 className="text-4xl font-semibold">Venue partner questions</h2>
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

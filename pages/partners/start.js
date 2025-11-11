import Head from 'next/head';
import Link from 'next/link';
import PartnerNav from '@/components/PartnerNav';

const steps = [
  {
    title: 'Start your trial',
    body: 'Secure a 14-day Set The Date Pro trial powered by Stripe. Cancel anytime before day 14.',
  },
  {
    title: 'Upload brand assets',
    body: 'Add your logo, brand color, and up to three venue photos. We generate a polished landing page instantly.',
  },
  {
    title: 'Share your page',
    body: 'Get a ready-to-send campaign email plus a public link guests can use to start planning.',
  },
];

export default function PartnerStartPage() {
  return (
    <>
      <Head>
        <title>Launch your venue page - Set The Date</title>
      </Head>
      <PartnerNav />
      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white">
        <section className="px-4 pt-10 pb-12 sm:pt-16 sm:pb-16">
          <div className="mx-auto max-w-5xl rounded-[32px] bg-white px-6 py-12 text-center text-slate-900 shadow-2xl shadow-slate-900/30 sm:px-10">
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Venue partners</p>
            <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">Launch a Set The Date page in minutes</h1>
            <p className="mt-4 text-lg text-slate-600">
              Start a 14-day Pro trial, upload your brand assets, and unlock a public share page plus campaign copy
              tailored for your guests.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-4 sm:flex-row">
              <Link
                href="/partners/checkout"
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-8 py-3 font-semibold text-white shadow-lg shadow-slate-900/30"
              >
                Start free trial
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center rounded-full border border-slate-300 px-8 py-3 font-semibold text-slate-900 hover:border-slate-900"
              >
                See how it works
              </a>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="bg-white text-slate-900 rounded-t-[40px] px-6 py-16">
          <div className="max-w-5xl mx-auto grid gap-6 md:grid-cols-3">
            {steps.map((step, idx) => (
              <div key={step.title} className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
                <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Step {idx + 1}</p>
                <h3 className="text-xl font-semibold mt-3">{step.title}</h3>
                <p className="text-slate-600 mt-2 leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>

          <div className="max-w-3xl mx-auto text-center mt-16">
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-[0.4em]">Need a hand?</p>
            <p className="text-lg text-slate-600 mt-3">
              Reply to any Set The Date email or message @setthedateapp on Instagram and we&apos;ll walk you through the
              setup live.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}

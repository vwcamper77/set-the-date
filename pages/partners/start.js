import Head from 'next/head';
import Link from 'next/link';
import PartnerNav from '@/components/PartnerNav';

const steps = [
  {
    title: 'Start your trial',
    body: 'Secure a 14-day Venue Partner trial powered by Stripe. Cancel anytime before day 14.',
  },
  {
    title: 'Upload brand assets',
    body: 'Add your logo, brand color, and up to four venue photos. We generate a polished landing page instantly.',
  },
  {
    title: 'Share your page',
    body: 'Use the email pack and unique link to get guests planning their next visit with friends.',
  },
];

const reasons = [
  {
    title: 'Turn one visit into the next one',
    intro: [
      'Instead of hoping guests come back, give them a simple way to plan their next visit before the buzz wears off.',
      'A guest clicks your link, creates an invite, and starts a group poll for dates. When they confirm, the whole group is now planning a visit to your venue.',
    ],
  },
  {
    title: 'Make it easy for customers to organise their friends',
    intro: ['No logins, no apps to download, no spreadsheets.'],
    listHeading: 'Your guest:',
    bullets: ['Opens your branded landing page', 'Picks a few dates and hits send', 'Shares a link in WhatsApp, email or SMS'],
    outro: 'Their friends vote Best / Maybe / No in seconds. You stay top of mind throughout.',
  },
  {
    title: 'Profit from the list you already own',
    intro: [
      'You have thousands of people on your email list who like your venue.',
      'Set The Date gives you a clear offer for them: "Plan your next night here. Click once, invite your friends, and we will do the rest."',
      'Every campaign includes trackable links, so you can see how many events and guests came from each email.',
    ],
  },
  {
    title: 'Measurable, attribution friendly',
    intro: [
      'Organiser journeys are tagged with your venue from start to finish.',
      'You see how many events were started from your venue page, how many guests voted and confirmed, and which campaigns and QR codes generated the most group bookings.',
    ],
  },
];

const whatYouGet = [
  {
    title: 'Branded mini-site for your venue',
    description: 'Your Set The Date page carries your brand from top to bottom.',
    points: [
      'Your logo, brand colour and photography',
      'Your primary call to action, such as Book now or Call to reserve',
      'A friendly, prewritten intro explaining how guests can plan their next visit with friends',
    ],
  },
  {
    title: 'Ready to send campaign email pack',
    description: 'Copy-and-paste templates you can drop into Mailchimp, Brevo or your CRM.',
    points: [
      'Subject lines proven to get clicks',
      'Body copy that explains the "Plan your next night here" idea',
      'A clear button that links guests to your Set The Date page',
    ],
  },
  {
    title: 'Print ready QR code image',
    description: 'High quality QR codes for menus, tent cards, posters and receipts.',
    points: ['Guests scan at the table or bar and start planning their next visit while they are still with you'],
  },
  {
    title: 'Organiser flow that auto-tags your venue',
    description: 'Every event started from your page is tagged with your venue.',
    points: [
      'Analytics show the number of events, voters and confirmed dates',
      'Optional follow up emails encourage organisers to finalise their booking and share updates with guests',
    ],
  },
];

const pricingDetails = [
  '14-day free trial',
  'Then $19 per month for 1-3 venues on the same account',
  'Cancel any time before day 14 and you will not be charged',
  'For hotel groups, multi-site operators or marketing agencies, enterprise pricing is available on request.',
];

const howItWorks = [
  {
    title: 'You send a campaign to your list',
    body: 'Use our email pack to invite past guests to "Plan their next get together at [Your Venue]".',
  },
  {
    title: 'Guests land on your branded Set The Date page',
    body: 'They pick a few possible dates and share the invite with their friends.',
  },
  {
    title: 'Their friends vote and confirm a date',
    body: 'The organiser gets reminders to finalise. You receive attribution that this event came from your venue.',
  },
  {
    title: 'Your diary fills with high quality group bookings',
    body: 'No discounts, no last minute panic. Just more groups choosing your venue for their next night out.',
  },
];

const whoFor = [
  'Independent restaurants that want more repeat group bookings',
  'Hotels with bars, restaurants or lounges that need bums on seats midweek',
  'Marketing teams that want a clear, measurable campaign idea for their house list',
];

export default function PartnerStartPage() {
  return (
    <>
      <Head>
        <title>Venue Partners - Set The Date</title>
      </Head>
      <PartnerNav />
      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white">
        <section id="top" className="px-4 pt-10 pb-12 sm:pt-16 sm:pb-16">
          <div className="mx-auto max-w-5xl rounded-[32px] bg-white px-6 py-12 text-center text-slate-900 shadow-2xl shadow-slate-900/30 sm:px-10">
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Venue partners</p>
            <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">Turn your email list into booked tables</h1>
            <p className="mt-4 text-lg text-slate-600">
              You already have a list of past guests. Set The Date turns that list into repeat visits by making it effortless
              for your customers to organise their friends and set a date to come back.
            </p>
            <p className="mt-3 text-lg text-slate-600">
              Guests land on your branded Set The Date page, choose a few dates, and send an invite to their group in one
              click. You get credit for every booking that started on your page.
            </p>
            <p className="mt-5 text-base font-semibold text-slate-800">
              14-day free trial then $19/mo for 1-3 venues. Enterprise and group pricing available on request.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-4 sm:flex-row">
              <Link
                href="/venues/checkout"
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-8 py-3 font-semibold text-white shadow-lg shadow-slate-900/30"
              >
                Start free trial
              </Link>
              <a
                href="#why-venues"
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

          <div id="why-venues" className="mt-20 space-y-16">
            <div>
              <div className="text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.4em] text-slate-500">Why venues use Set The Date</p>
                <h2 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Give guests a reason to come back</h2>
              </div>
              <div className="mt-10 grid gap-6 md:grid-cols-2">
                {reasons.map((reason, idx) => (
                  <div key={reason.title} className="rounded-3xl border border-slate-200 p-6 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Reason {idx + 1}</p>
                    <h3 className="mt-3 text-2xl font-semibold text-slate-900">{reason.title}</h3>
                    {reason.intro.map((paragraph) => (
                      <p key={paragraph} className="mt-3 text-slate-600 leading-relaxed">
                        {paragraph}
                      </p>
                    ))}
                    {reason.bullets && (
                      <div className="mt-4">
                        {reason.listHeading && (
                          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">{reason.listHeading}</p>
                        )}
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
                          {reason.bullets.map((bullet) => (
                            <li key={bullet}>{bullet}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {reason.outro && <p className="mt-3 text-slate-600 leading-relaxed">{reason.outro}</p>}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-10">
              <div className="text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.4em] text-slate-500">What you get</p>
                <h2 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">A launch kit built for venues</h2>
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                {whatYouGet.map((item) => (
                  <div key={item.title} className="rounded-3xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="text-2xl font-semibold text-slate-900">{item.title}</h3>
                    {item.description && <p className="mt-3 text-slate-600">{item.description}</p>}
                    <ul className="mt-4 list-disc space-y-2 pl-5 text-slate-600">
                      {item.points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-3xl border border-slate-200 p-6 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.4em] text-slate-500">Simple pricing</p>
                <h2 className="mt-4 text-3xl font-semibold text-slate-900">Venue Partner plan</h2>
                <ul className="mt-6 space-y-3 text-slate-600">
                  {pricingDetails.map((detail) => (
                    <li key={detail} className="flex items-start gap-3">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-900" />
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-3xl border border-slate-200 p-6 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.4em] text-slate-500">No setup fee</p>
                <h3 className="mt-4 text-2xl font-semibold text-slate-900">Cancel anytime before day 14</h3>
                <p className="mt-4 text-slate-600 leading-relaxed">
                  Start a free 14-day trial, upload your brand assets and launch your first campaign in under an hour. Upgrade,
                  pause or cancel whenever you like.
                </p>
                <Link
                  href="/venues/checkout"
                  className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-8 py-3 font-semibold text-white shadow-lg shadow-slate-900/30"
                >
                  Start free trial
                </Link>
              </div>
            </div>

            <div>
              <div className="text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.4em] text-slate-500">How it works in practice</p>
                <h2 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">From campaign to booked tables</h2>
              </div>
              <div className="mt-10 grid gap-6 md:grid-cols-2">
                {howItWorks.map((item, idx) => (
                  <div key={item.title} className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Stage {idx + 1}</p>
                    <h3 className="mt-3 text-2xl font-semibold text-slate-900">{item.title}</h3>
                    <p className="mt-3 text-slate-600 leading-relaxed">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[32px] bg-slate-50 p-8 shadow-inner">
              <div className="text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.4em] text-slate-500">Who Set The Date is for</p>
                <h2 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Teams who need measurable repeat business</h2>
              </div>
              <ul className="mx-auto mt-6 max-w-3xl list-disc space-y-2 pl-5 text-slate-600">
                {whoFor.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-6 text-center text-slate-600">
                If your guests say "We should do this again sometime", Set The Date helps them actually do it, with you, and
                gives you the numbers to prove it worked.
              </p>
            </div>

            <div className="text-center">
              <h2 className="text-3xl font-semibold text-slate-900 sm:text-4xl">Ready to turn your email list into bookings?</h2>
              <p className="mt-4 text-lg text-slate-600">
                Start a free 14-day trial, upload your brand assets and launch your first campaign in under an hour. No setup
                fee. Cancel any time before day 14.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
                <Link
                  href="/venues/checkout"
                  className="inline-flex items-center justify-center rounded-full bg-slate-900 px-8 py-3 font-semibold text-white shadow-lg shadow-slate-900/30"
                >
                  Start free trial
                </Link>
                <a
                  href="#top"
                  className="inline-flex items-center justify-center rounded-full border border-slate-300 px-8 py-3 font-semibold text-slate-900 hover:border-slate-900"
                >
                  See how it works
                </a>
              </div>
            </div>
          </div>

          <div className="max-w-3xl mx-auto text-center mt-16">
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-[0.4em]">Need a hand?</p>
            <p className="text-lg text-slate-600 mt-3">
              Reply to any Set The Date email or message @setthedateapp on Instagram and we&apos;ll walk you through the setup
              live.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}

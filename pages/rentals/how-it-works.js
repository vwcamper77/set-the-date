import Head from 'next/head';
import Link from 'next/link';
import RentalsNav from '@/components/RentalsNav';

const steps = [
  {
    title: 'Start your trial',
    body: 'Activate a 14-day Rentals Owner trial. Cancel anytime before day 14.',
  },
  {
    title: 'Upload property assets',
    body: 'Add your logo, accent color, and up to four property images. We generate a polished landing page instantly.',
  },
  {
    title: 'Share your page',
    body: 'Use the email pack and unique link to get guests planning their next stay with friends.',
  },
];

const reasons = [
  {
    title: 'Turn one stay into the next one',
    intro: [
      'Instead of hoping guests return, give them a simple way to plan their next trip while the memory is fresh.',
      'A guest clicks your link, creates a trip poll, and starts a group conversation about dates. When they confirm, the whole group is now planning a stay at your property.',
    ],
  },
  {
    title: 'Make it easy for guests to organise their group',
    intro: ['No logins, no apps to download, no spreadsheets.'],
    listHeading: 'Your guest:',
    bullets: [
      'Opens your branded property page',
      'Picks a travel window and hits send',
      'Shares a link in WhatsApp, email or SMS',
    ],
    outro: 'Their friends vote on dates in seconds. You stay top of mind throughout.',
  },
  {
    title: 'Profit from the list you already own',
    intro: [
      'You have past guests who loved their stay.',
      'Set The Date gives you a clear offer for them: "Plan your next trip here. Click once, invite your friends, and we will do the rest."',
      'Every campaign includes trackable links, so you can see how many trips and guests came from each message.',
    ],
  },
  {
    title: 'Measurable, attribution friendly',
    intro: [
      'Trip journeys are tagged with your property from start to finish.',
      'You see how many polls were started from your property page, how many guests voted, and which campaigns generated the most booking-ready groups.',
    ],
  },
];

const whatYouGet = [
  {
    title: 'Branded mini-site for your property',
    description: 'Your Set The Date page carries your brand from top to bottom.',
    points: [
      'Your logo, accent color, and photography',
      'A bold booking call to action, such as Book now',
      'A friendly intro explaining how guests can plan their next stay with friends',
    ],
  },
  {
    title: 'Ready-to-send post-stay email pack',
    description: 'Copy-and-paste templates you can drop into Mailchimp, Brevo or your CRM.',
    points: [
      'Subject lines proven to get clicks',
      'Body copy that explains the "Plan your next trip here" idea',
      'A clear button that links guests to your Set The Date property page',
    ],
  },
  {
    title: 'Shareable link + WhatsApp button',
    description: 'Give guests a fast way to plan their next stay together.',
    points: [
      'WhatsApp share links for group chats',
      'SMS and email options for every guest type',
    ],
  },
  {
    title: 'Trip flow that auto-tags your property',
    description: 'Every trip poll started from your page is tagged with your property.',
    points: [
      'Analytics show the number of trips, voters and confirmed windows',
      'Optional follow-up emails encourage organisers to finalise bookings',
    ],
  },
];

const pricingDetails = [
  'Flexible plans based on property count',
  'Solo, Small, Agency tiers, plus custom for 20+ properties',
  'Cancel any time before day 14 and you will not be charged',
  'Group and enterprise pricing available on request',
];

const howItWorks = [
  {
    title: 'You send a post-stay email or website link',
    body: 'Use our email pack to invite past guests to plan their next trip at your property.',
  },
  {
    title: 'Guests land on your branded property page',
    body: 'They choose a travel window and share the invite with their group.',
  },
  {
    title: 'Their friends vote and confirm a window',
    body: 'The organiser gets reminders to finalise. You receive attribution that this trip came from your property.',
  },
  {
    title: 'Your calendar fills with group-ready bookings',
    body: 'No discounts, no last minute panic. Just more groups choosing your property for their next getaway.',
  },
];

const whoFor = [
  'Independent rental owners who want more repeat bookings',
  'Property managers with multiple listings and seasonal demand',
  'Hospitality teams who want a measurable campaign for past guests',
];

export default function RentalsHowItWorksPage() {
  return (
    <>
      <Head>
        <title>Rentals Owners - Set The Date</title>
      </Head>
      <RentalsNav />
      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white">
        <section id="top" className="px-4 pt-10 pb-12 sm:pt-16 sm:pb-16">
          <div className="mx-auto max-w-5xl rounded-[32px] bg-white px-6 py-12 text-center text-slate-900 shadow-2xl shadow-slate-900/30 sm:px-10">
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Rentals owners</p>
            <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">Turn past guests into repeat bookings</h1>
            <p className="mt-4 text-lg text-slate-600">
              You already have a list of past guests. Set The Date turns that list into repeat stays by making it effortless
              for your guests to organise their friends and set a trip window to come back.
            </p>
            <p className="mt-3 text-lg text-slate-600">
              Guests land on your branded Set The Date page, pick a travel window, and send an invite to their group in one
              click. You get credit for every booking that started on your page.
            </p>
            <p className="mt-5 text-base font-semibold text-slate-800">
              14-day free trial, then plans scale with your property count. Enterprise pricing available on request.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-4 sm:flex-row">
              <Link
                href="/rentals/signup"
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-8 py-3 font-semibold text-white shadow-lg shadow-slate-900/30"
              >
                Start free trial
              </Link>
              <a
                href="#why-rentals"
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

          <div id="why-rentals" className="mt-20 space-y-16">
            <div>
              <div className="text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.4em] text-slate-500">
                  Why rentals owners use Set The Date
                </p>
                <h2 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">
                  Give guests a reason to come back
                </h2>
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
                          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
                            {reason.listHeading}
                          </p>
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
                <h2 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">A launch kit built for rentals</h2>
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
                <h2 className="mt-4 text-3xl font-semibold text-slate-900">Rentals owner plans</h2>
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
                  href="/rentals/signup"
                  className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-8 py-3 font-semibold text-white shadow-lg shadow-slate-900/30"
                >
                  Start free trial
                </Link>
              </div>
            </div>

            <div>
              <div className="text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.4em] text-slate-500">How it works in practice</p>
                <h2 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">
                  From post-stay email to booking-ready trips
                </h2>
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
                <h2 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">
                  Teams who need measurable repeat stays
                </h2>
              </div>
              <ul className="mx-auto mt-6 max-w-3xl list-disc space-y-2 pl-5 text-slate-600">
                {whoFor.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-6 text-center text-slate-600">
                If guests say "We should do this again sometime", Set The Date helps them actually do it, with you, and gives
                you the numbers to prove it worked.
              </p>
            </div>

            <div className="text-center">
              <h2 className="text-3xl font-semibold text-slate-900 sm:text-4xl">Ready to drive repeat bookings?</h2>
              <p className="mt-4 text-lg text-slate-600">
                Start a free 14-day trial, upload your brand assets and launch your first campaign in under an hour. No setup
                fee. Cancel any time before day 14.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
                <Link
                  href="/rentals/signup"
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

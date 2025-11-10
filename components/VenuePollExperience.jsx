import { useMemo, useRef } from 'react';
import { format } from 'date-fns';
import PartnerBrandFrame from '@/components/PartnerBrandFrame';
import SuggestedDatesCalendar from '@/components/SuggestedDatesCalendar';
import PollVotingForm from '@/components/PollVotingForm';
import PollShareButtons from '@/components/PollShareButtons';
import CountdownTimer from '@/components/CountdownTimer';
import VenueHero from '@/components/VenueHero';

export default function VenuePollExperience({
  partner,
  poll,
  pollId,
  pollUrl,
  pollDates,
  organiser,
  eventTitle,
  location,
  mealMessageBody,
  mealMessageVerb,
  pollEventType,
  finalDate,
  isPollExpired,
  pollDeadline,
  deadlineSummary,
  onResultsClick,
  onSuggestClick,
  onShare,
}) {
  const pollSectionRef = useRef(null);

  const scrollToPoll = () => {
    if (pollSectionRef.current) {
      pollSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const pollForForm = useMemo(
    () => ({
      ...poll,
      dates: pollDates,
      selectedDates: pollDates,
    }),
    [poll, pollDates]
  );

  return (
    <PartnerBrandFrame partner={partner} showLogoAtTop={false}>
      <div className="space-y-10 text-slate-900">
        <VenueHero
          partner={partner}
          primaryCtaLabel="Jump to the poll"
          onPrimaryCta={scrollToPoll}
        />

        <section
          id="partner-poll-section"
          ref={pollSectionRef}
          className="rounded-[32px] border border-slate-200 bg-white shadow p-6 lg:p-10 space-y-8"
        >
          <div className="flex justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Hosted by</p>
              <p className="text-lg font-semibold text-slate-900">{organiser}</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500">
              <img
                src="/images/setthedate-logo.png"
                alt="Set The Date Pro"
                className="h-6 w-6 rounded-md border border-slate-200"
              />
              Powered by Set The Date
            </div>
          </div>

          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="flex-1 space-y-4">
              <h2 className="text-3xl font-semibold leading-tight">
                Tell {organiser} what works
              </h2>
              <p className="text-slate-600">
                {pollEventType === 'meal'
                  ? `Let ${organiser} know if ${mealMessageBody} ${mealMessageVerb} each day you can make it.`
                  : `Choose every date you can make it so ${organiser} can lock the best option with ${partner?.venueName}.`}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Location</p>
                  <p className="text-base font-semibold text-slate-900">{location}</p>
                </div>
                {deadlineSummary && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Voting closes</p>
                    <p className="text-base font-semibold text-slate-900">{deadlineSummary}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="lg:w-[320px]">
              <SuggestedDatesCalendar dates={pollDates} />
            </div>
          </div>

          {pollDeadline && <CountdownTimer deadline={pollDeadline} />}

          {finalDate && (
            <div className="text-center bg-green-100 border border-green-300 text-green-800 font-medium p-3 rounded">
              Final Date Locked In: {format(new Date(finalDate), 'EEEE do MMMM yyyy')}
            </div>
          )}

          {isPollExpired && (
            <div className="text-center text-red-600 font-semibold">
              Voting has closed, but you can still share your availability and leave a message for the organiser.
            </div>
          )}

          <PollVotingForm
            poll={pollForForm}
            pollId={pollId}
            organiser={organiser}
            eventTitle={eventTitle}
          />

          <div className="flex flex-col gap-3 lg:flex-row">
            <button
              type="button"
              onClick={onResultsClick}
              className="rounded-full border border-slate-900 text-slate-900 px-6 py-3 font-semibold hover:bg-slate-900 hover:text-white transition"
            >
              See live results
            </button>
            <a
              href={`/suggest/${pollId}`}
              onClick={onSuggestClick}
              className="rounded-full border border-blue-500 text-blue-600 px-6 py-3 font-semibold text-center hover:bg-blue-50 transition"
            >
              Suggest a change
            </a>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-base font-semibold text-slate-900 mb-2">Share this poll</h3>
            <PollShareButtons
              pollUrl={pollUrl}
              organiser={organiser}
              eventTitle={eventTitle}
              location={location}
              onShare={onShare}
            />
          </div>

          <div className="text-center text-sm text-slate-600">
            Want to plan another night?{' '}
            <a href="/" className="font-semibold text-slate-900 underline">
              Create your own event
            </a>
          </div>

          <div className="text-center">
            <a
              href="https://buymeacoffee.com/setthedate"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block"
            >
              <img
                src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
                alt="Buy Me a Coffee"
                className="h-12 mx-auto"
              />
            </a>
          </div>
        </section>
      </div>
    </PartnerBrandFrame>
  );
}

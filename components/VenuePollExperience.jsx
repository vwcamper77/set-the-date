import { useMemo, useRef } from 'react';
import { format } from 'date-fns';
import PartnerBrandFrame from '@/components/PartnerBrandFrame';
import PoweredByBadge from '@/components/PoweredByBadge';
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
          showMap={false}
          showBookingCta={false}
          showBadge={false}
        />

        <section
          id="partner-poll-section"
          ref={pollSectionRef}
          className="rounded-[32px] border border-slate-200 bg-white shadow p-6 lg:p-10 space-y-8 overflow-hidden"
        >
          <div className="flex justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Hosted by</p>
              <p className="text-lg font-semibold text-slate-900">{organiser}</p>
            </div>
          </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex-1 space-y-3">
            <h2 className="text-3xl font-semibold leading-tight">
              This event is hosted by {organiser}
            </h2>
            <div className="space-y-3 text-slate-700">
              <p>
                {organiser || 'The host'} is planning a visit to {partner?.venueName || 'this venue'} and wants to find a date that works for everyone. Use the calendar on the right to show when you can come.
              </p>
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">How to reply</p>
                <ol className="list-decimal pl-5 space-y-1 text-slate-700">
                  <li>
                    For each date, tap <span className="font-semibold">Best</span>, <span className="font-semibold">Maybe</span> or <span className="font-semibold">No</span>.
                  </li>
                  {pollEventType === 'meal' && (
                    <li>Pick the meal slots that work for you on each date.</li>
                  )}
                  <li>If anything needs explaining, add a short note at the bottom.</li>
                  <li>
                    Hit <span className="font-semibold">Send your votes</span> so {organiser || 'the host'} gets your response.
                  </li>
                </ol>
              </div>
              <p className="text-sm text-slate-500">
                You do not need to create an account. Your details are only used to share your replies with {organiser || 'the host'}.
              </p>
            </div>
            {deadlineSummary && (
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800">
                <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Voting closes</span>
                <span>{deadlineSummary}</span>
              </div>
            )}
          </div>
          <div className="lg:w-[320px] w-full">
            <SuggestedDatesCalendar
              dates={pollDates}
              introText={`Highlighted days show the dates ${organiser || 'the host'} proposed.`}
            />
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

          <div className="flex flex-col sm:flex-row justify-center gap-3">
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

          <div className="flex justify-center">
            <PoweredByBadge className="bg-white shadow-md shadow-slate-900/15" logoAlt="Set The Date" />
          </div>
        </section>
      </div>
    </PartnerBrandFrame>
  );
}

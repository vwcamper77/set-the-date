import { useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import PartnerBrandFrame from '@/components/PartnerBrandFrame';
import PoweredByBadge from '@/components/PoweredByBadge';
import SuggestedDatesCalendar from '@/components/SuggestedDatesCalendar';
import PollVotingForm from '@/components/PollVotingForm';
import PollShareButtons from '@/components/PollShareButtons';
import CountdownTimer from '@/components/CountdownTimer';
import VenueHero from '@/components/VenueHero';

const FEATURED_DESCRIPTION_PREVIEW_LIMIT = 500;
const normaliseDeadline = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === 'function') {
    try {
      const converted = value.toDate();
      return Number.isNaN(converted?.getTime()) ? null : converted;
    } catch {
      return null;
    }
  }
  if (value?.seconds) {
    const dateFromSeconds = new Date(value.seconds * 1000);
    return Number.isNaN(dateFromSeconds.getTime()) ? null : dateFromSeconds;
  }
  const candidate = new Date(value);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
};

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
  featuredEventTitle,
  featuredEventDescription,
  organiserNotes,
  onResultsClick,
  onSuggestClick,
  onShare,
}) {
  const pollSectionRef = useRef(null);
  const resolvedDeadline = normaliseDeadline(pollDeadline);
  const [showFullFeaturedDescription, setShowFullFeaturedDescription] = useState(false);

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

  const featuredDescriptionForDisplay = useMemo(() => {
    if (!featuredEventDescription) return { text: '', truncated: false, isExpanded: false };
    const truncated = featuredEventDescription.length > FEATURED_DESCRIPTION_PREVIEW_LIMIT;
    if (!truncated || showFullFeaturedDescription) {
      return { text: featuredEventDescription, truncated, isExpanded: showFullFeaturedDescription };
    }
    return {
      text: `${featuredEventDescription.slice(0, FEATURED_DESCRIPTION_PREVIEW_LIMIT)}...`,
      truncated: true,
      isExpanded: false,
    };
  }, [featuredEventDescription, showFullFeaturedDescription]);

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
            {resolvedDeadline ? (
              <CountdownTimer deadline={resolvedDeadline} className="my-0" />
            ) : null}
          </div>

          {(featuredEventTitle || featuredEventDescription) && (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 shadow-sm space-y-1">
              <p className="text-[11px] uppercase tracking-[0.35em] text-amber-700">Featured event</p>
              {featuredEventTitle ? (
                <p className="text-sm font-semibold text-slate-900">{featuredEventTitle}</p>
              ) : null}
              {featuredEventDescription ? (
                <div className="space-y-1">
                  <p className="text-sm text-slate-700 whitespace-pre-line">
                    {featuredDescriptionForDisplay.text}
                  </p>
                  {featuredDescriptionForDisplay.truncated && (
                    <button
                      type="button"
                      onClick={() => setShowFullFeaturedDescription((prev) => !prev)}
                      className="text-xs font-semibold text-amber-700 underline"
                    >
                      {featuredDescriptionForDisplay.isExpanded ? 'Show less' : 'Show full details'}
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {organiserNotes ? (
            <div className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm space-y-1">
              <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Host notes</p>
              <p className="text-sm text-slate-700 whitespace-pre-line">{organiserNotes}</p>
            </div>
          ) : null}

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

          {resolvedDeadline && <CountdownTimer deadline={resolvedDeadline} />}

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
            <PoweredByBadge
              className="bg-white shadow-md shadow-slate-900/15"
              logoAlt="Set The Date"
              href="https://setthedate.app"
              ariaLabel="Visit Set The Date"
            />
          </div>
        </section>
      </div>
    </PartnerBrandFrame>
  );
}

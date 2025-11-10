import { useRef } from 'react';
import { format, parseISO } from 'date-fns';
import PartnerBrandFrame from '@/components/PartnerBrandFrame';
import VenueHero from '@/components/VenueHero';
import FinalisePollActions from '@/components/FinalisePollActions';
import ShareButtons from '@/components/ShareButtons';
import CountdownTimer from '@/components/CountdownTimer';

export default function VenueResultsExperience({
  partner,
  organiser,
  eventTitle,
  location,
  winningDateHuman,
  displayMealName,
  suggestedSummaryLines,
  hasFinalDate,
  poll,
  pollId,
  suggestedDate,
  suggestedMeal,
  isOrganiser,
  deadlinePassed,
  plannedDatePassed,
  voteSummaryChrono,
  isMealEvent,
  mealSummaryByDate,
  enabledMealsForDate,
  mealChoiceLabels,
  mealNameLabels,
  attendeeMessages,
  pollUrl,
  shareMessage,
  votingClosed,
  deadlineISO,
  revealed,
  onReveal,
  suggested,
}) {
  const contentRef = useRef(null);

  const handleHeroCta = () => {
    if (contentRef.current) {
      contentRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <PartnerBrandFrame partner={partner} showLogoAtTop={false}>
      <div className="space-y-10 text-slate-900">
        <VenueHero
          partner={partner}
          primaryCtaLabel="Jump to poll summary"
          onPrimaryCta={handleHeroCta}
        />

        <section
          ref={contentRef}
          className="rounded-[32px] border border-slate-200 bg-white shadow p-6 lg:p-10 space-y-10"
        >
          <div className="space-y-4 text-center">
            <h1 className="text-3xl font-semibold">Review poll results</h1>
            <p className="text-slate-600">{organiser} asked friends to pick the best date for {eventTitle} in {location}.</p>
            {deadlineISO && <CountdownTimer deadline={deadlineISO} />}
          </div>

          {!revealed && suggested && (
            <button
              type="button"
              onClick={onReveal}
              className="w-full rounded-3xl border border-green-200 bg-green-50 px-4 py-3 text-green-800 font-semibold hover:bg-green-100"
            >
              Reveal the current winning date
            </button>
          )}

          {revealed && winningDateHuman && (
            <div className="rounded-3xl border border-green-300 bg-green-50 px-4 py-3 text-green-900 text-center font-semibold text-lg">
              {eventTitle} is tracking for {winningDateHuman}
              {isMealEvent && displayMealName ? ` - ${displayMealName}` : ''}.
            </div>
          )}

          {suggestedSummaryLines.length > 0 && (
            <div className="rounded-3xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-900 mb-2">Why this date?</p>
              <ul className="list-disc pl-5 space-y-1 text-sm text-blue-800 text-left">
                {suggestedSummaryLines.map((line, idx) => (
                  <li key={`venue-summary-${idx}`}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          {hasFinalDate ? (
            <div className="rounded-3xl border border-emerald-300 bg-emerald-50 p-4 text-center font-semibold text-emerald-900">
              Final date locked: {format(parseISO(poll.finalDate), 'EEEE do MMMM yyyy')} in {location}
              {isMealEvent && displayMealName ? ` - ${displayMealName}` : ''}.
            </div>
          ) : deadlinePassed || plannedDatePassed ? (
            isOrganiser ? (
              <FinalisePollActions
                poll={poll}
                pollId={pollId}
                suggestedDate={suggestedDate}
                suggestedMeal={suggestedMeal}
                onFinalised={() => window.location.reload()}
              />
            ) : (
              <div className="text-center text-slate-600">
                Voting closed. Waiting for {organiser} to confirm the final plan.
              </div>
            )
          ) : null}

          <div className="space-y-4">
            {voteSummaryChrono.map((day) => {
              const enabled = isMealEvent ? enabledMealsForDate(poll, day.date) : [];
              const summary = isMealEvent ? mealSummaryByDate[day.date] || {} : {};
              const rows = isMealEvent
                ? enabled
                    .map((opt) => {
                      const bucket = summary[opt] || { yes: [], maybe: [], no: [] };
                      const yes = Array.isArray(bucket.yes) ? bucket.yes : [];
                      const maybe = Array.isArray(bucket.maybe) ? bucket.maybe : [];
                      const no = Array.isArray(bucket.no) ? bucket.no : [];
                      const score = yes.length * 3 + maybe.length * 2 - no.length;
                      return { opt, bucket, yes, maybe, no, score };
                    })
                    .filter(({ yes, maybe, no }) => yes.length + maybe.length + no.length > 0)
                : [];

              return (
                <div key={day.date} className="rounded-3xl border border-slate-200 p-4 shadow-sm">
                  <h3 className="font-semibold text-lg mb-3">
                    {format(parseISO(day.date), 'EEEE do MMMM yyyy')}
                  </h3>

                  {!isMealEvent && (
                    <div className="grid grid-cols-3 text-center gap-2 text-sm">
                      <div className="rounded-2xl bg-emerald-50 p-2">
                        <p className="font-semibold text-emerald-700">�o. Can attend</p>
                        <p className="text-xl font-bold">{day.yes.length}</p>
                        <p className="text-xs text-emerald-700">{day.yes.join(', ') || '—'}</p>
                      </div>
                      <div className="rounded-2xl bg-amber-50 p-2">
                        <p className="font-semibold text-amber-700">dY" Maybe</p>
                        <p className="text-xl font-bold">{day.maybe.length}</p>
                        <p className="text-xs text-amber-700">{day.maybe.join(', ') || '—'}</p>
                      </div>
                      <div className="rounded-2xl bg-rose-50 p-2">
                        <p className="font-semibold text-rose-700">�?O No</p>
                        <p className="text-xl font-bold">{day.no.length}</p>
                        <p className="text-xs text-rose-700">{day.no.join(', ') || '—'}</p>
                      </div>
                    </div>
                  )}

                  {isMealEvent && rows.length > 0 && (
                    <div className="space-y-3">
                      {rows
                        .sort((a, b) => b.score - a.score)
                        .map(({ opt, bucket }) => (
                          <div key={opt} className="rounded-2xl border border-slate-200 p-3 bg-slate-50">
                            <p className="font-semibold">
                              {mealChoiceLabels[opt] || mealNameLabels[opt] || opt}
                            </p>
                            <p className="text-xs text-emerald-700">
                              �o. Yes ({bucket.yes.length}): {bucket.yes.join(', ') || '—'}
                            </p>
                            <p className="text-xs text-amber-700">
                              dY" Maybe ({bucket.maybe.length}): {bucket.maybe.join(', ') || '—'}
                            </p>
                            <p className="text-xs text-rose-700">
                              �?O No ({bucket.no.length}): {bucket.no.join(', ') || '—'}
                            </p>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {attendeeMessages.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Messages from attendees</h2>
              {attendeeMessages.map((msg, idx) => (
                <div key={`venue-message-${idx}`} className="rounded-2xl border border-slate-200 p-3 bg-white shadow-sm">
                  <p className="text-sm text-slate-800 whitespace-pre-line">{msg.message}</p>
                  <p className="text-xs text-slate-500 mt-1">— {msg.displayName || 'Someone'}</p>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-3xl border border-yellow-200 bg-yellow-50 p-4 text-center">
            <h2 className="text-xl font-semibold mb-2">dY"� Share the final plan</h2>
            <p className="text-slate-700 mb-3">
              {votingClosed
                ? `Let friends know ${organiser} set the date for "${eventTitle}" in ${location}.`
                : `Spread the word – there’s still time to vote on "${eventTitle}" in ${location}!`}
            </p>
            <ShareButtons shareUrl={pollUrl} shareMessage={shareMessage} />
          </div>
        </section>
      </div>
    </PartnerBrandFrame>
  );
}

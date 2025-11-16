import { useRef } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import PartnerBrandFrame from '@/components/PartnerBrandFrame';
import VenueHero from '@/components/VenueHero';
import FinalisePollActions from '@/components/FinalisePollActions';
import AddToCalendar from '@/components/AddToCalendar';
import ShareButtons from '@/components/ShareButtons';
import CountdownTimer from '@/components/CountdownTimer';

const NeedExtraDateBar = ({ pollId }) => (
  <div className="rounded-3xl border border-slate-200 bg-white p-3 sm:p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
    <div>
      <p className="text-sm font-semibold text-slate-900">Need an extra date?</p>
      <p className="text-sm text-slate-600">
        Hop back to the poll or start a brand new event for another plan.
      </p>
    </div>
    <div className="flex flex-col gap-1 sm:flex-row sm:gap-2">
      <Link
        href={`/poll/${pollId}`}
        className="inline-flex w-full sm:w-auto items-center justify-center rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 hover:bg-slate-800 transition"
      >
        Add your own dates
      </Link>
      <Link
        href="/"
        className="inline-flex w-full sm:w-auto items-center justify-center rounded-full border border-slate-900 px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-900 hover:text-white transition"
      >
        Create your own event
      </Link>
    </div>
  </div>
);

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
  voteSummaryChrono,
  isMealEvent,
  mealSummaryByDate,
  enabledMealsForDate,
  mealChoiceLabels,
  mealNameLabels,
  attendeeMessages,
  shareUrl,
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
      <div className="space-y-6 md:space-y-10 text-slate-900">
        <VenueHero
          partner={partner}
          primaryCtaLabel="Jump to poll summary"
          onPrimaryCta={handleHeroCta}
          showMap={false}
          badgeHref="https://setthedate.app"
          badgeAriaLabel="Visit the Set The Date homepage"
        />

        <section
          ref={contentRef}
          className="rounded-[32px] border border-slate-200 bg-white shadow p-4 md:p-6 lg:p-10 space-y-6 md:space-y-10"
        >
          <div className="space-y-2 text-center sm:space-y-4">
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
            <div className="rounded-3xl border border-blue-200 bg-blue-50 p-3 sm:p-4">
              <p className="text-sm font-semibold text-blue-900 mb-2">Why this date?</p>
              <ul className="list-disc pl-5 space-y-1 text-sm text-blue-800 text-left">
                {suggestedSummaryLines.map((line, idx) => (
                  <li key={`venue-summary-${idx}`}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          <NeedExtraDateBar pollId={pollId} />

          {hasFinalDate ? (
            <>
              <div className="rounded-3xl border border-emerald-300 bg-emerald-50 p-3 sm:p-4 text-center font-semibold text-emerald-900">
                Final date locked: {format(parseISO(poll.finalDate), 'EEEE do MMMM yyyy')} in {location}
                {isMealEvent && displayMealName ? ` - ${displayMealName}` : ''}.
              </div>
              <div className="mt-2 sm:mt-3">
                <AddToCalendar
                  eventDate={poll.finalDate}
                  eventTitle={eventTitle}
                  eventLocation={location}
                  introText="Add the confirmed date to your calendar"
                  className="mx-auto max-w-lg"
                />
              </div>
            </>
          ) : votingClosed ? (
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

          <div className="space-y-3 sm:space-y-4">
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

              const isSuggestedDate = suggested?.date === day.date;
              const suggestedMealForDay = isSuggestedDate ? suggestedMeal : null;

              return (
                <div key={day.date} className="rounded-3xl border border-slate-200 p-3 sm:p-4 shadow-sm">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-lg m-0">
                      {format(parseISO(day.date), 'EEEE do MMMM yyyy')}
                    </h3>
                    {isSuggestedDate && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        Top pick
                      </span>
                    )}
                  </div>

                  {!isMealEvent && (
                    <div className="grid grid-cols-3 text-center gap-2 text-sm">
                      <div className="rounded-2xl bg-emerald-50 p-2">
                        <p className="font-semibold text-emerald-700">✅ Can attend</p>
                        <p className="text-xl font-bold">{day.yes.length}</p>
                        <p className="text-xs text-emerald-700">{day.yes.join(', ') || '—'}</p>
                      </div>
                      <div className="rounded-2xl bg-amber-50 p-2">
                        <p className="font-semibold text-amber-700">🤔 Maybe</p>
                        <p className="text-xl font-bold">{day.maybe.length}</p>
                        <p className="text-xs text-amber-700">{day.maybe.join(', ') || '—'}</p>
                      </div>
                      <div className="rounded-2xl bg-rose-50 p-2">
                        <p className="font-semibold text-rose-700">❌ No</p>
                        <p className="text-xl font-bold">{day.no.length}</p>
                        <p className="text-xs text-rose-700">{day.no.join(', ') || '—'}</p>
                      </div>
                    </div>
                  )}

                  {isMealEvent && rows.length > 0 && (() => {
                    const orderedRows = rows.slice().sort((a, b) => b.score - a.score);
                    const topScore = orderedRows.length ? orderedRows[0].score : null;
                    const secondScore =
                      orderedRows.length > 1 ? orderedRows[1].score : null;

                    const toneClasses = {
                      yes: {
                        filled: 'border-emerald-200 bg-emerald-50 text-emerald-800',
                        empty: 'border border-dashed border-emerald-100 bg-white text-emerald-400',
                      },
                      maybe: {
                        filled: 'border-orange-200 bg-orange-50 text-orange-900',
                        empty: 'border border-dashed border-orange-100 bg-orange-50/50 text-orange-400',
                      },
                      no: {
                        filled: 'border-rose-200 bg-rose-50 text-rose-800',
                        empty: 'border border-dashed border-rose-100 bg-white text-rose-400',
                      },
                    };

                    return (
                      <div className="space-y-2 sm:space-y-3">
                        {orderedRows.map(({ opt, yes, maybe, no }, index) => {
                          const yesCount = yes.length;
                          const maybeCount = maybe.length;
                          const noCount = no.length;
                          const totalVotes = yesCount + maybeCount + noCount;
                          const maxCount = Math.max(yesCount, maybeCount, noCount);
                          const isTopChoice =
                            isSuggestedDate &&
                            totalVotes > 0 &&
                            (suggestedMealForDay
                              ? opt === suggestedMealForDay
                              : index === 0 &&
                                topScore !== null &&
                                (secondScore === null || topScore > secondScore));
                          const rawLabel = mealChoiceLabels[opt] || mealNameLabels[opt] || opt;
                          const label =
                            rawLabel.replace(/works best/gi, '').trim() || rawLabel;

                          const blocks = [
                            { key: 'yes', label: 'Yes', icon: '✅', count: yesCount, names: yes },
                            { key: 'maybe', label: 'Maybe', icon: '🤔', count: maybeCount, names: maybe },
                            { key: 'no', label: 'Decline', icon: '❌', count: noCount, names: no },
                          ];

                          return (
                            <div
                              key={opt}
                              className={`rounded-2xl border ${
                                isTopChoice
                                  ? 'border-emerald-200 bg-emerald-50'
                                  : 'border-slate-100 bg-slate-50'
                              } p-3 space-y-2`}
                            >
                              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                                <span>{label}</span>
                                {isTopChoice && (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                                    Top pick
                                  </span>
                                )}
                              </div>

                              <div className="grid gap-4 sm:gap-6 sm:grid-cols-3 text-xs">
                                {blocks.map(({ key, label: blockLabel, icon, count, names }) => {
                                  const tone = toneClasses[key];
                                  const isPrimary = count > 0 && count === maxCount;
                                  const blockClass = count
                                    ? `${tone.filled} ${isPrimary ? 'ring-1 ring-current/30 shadow-sm' : ''}`
                                    : tone.empty;

                                  return (
                                      <div
                                        key={`${opt}-${key}`}
                                        className={`relative rounded-xl px-1.5 py-1 text-center font-semibold flex flex-col gap-1 ${blockClass} ${key === 'maybe' ? 'ring ring-orange-200 ring-offset-1 ring-offset-white/80' : ''}`}
                                      >
                                      <p className="text-sm flex items-center justify-center gap-1 leading-tight">
                                        <span aria-hidden="true">{icon}</span>
                                        {blockLabel} ({count})
                                      </p>
                                      <p className="text-[11px] font-normal leading-tight">
                                        {count ? names.join(', ') : 'No votes yet'}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>

          {attendeeMessages.length > 0 && (
            <div className="space-y-1 sm:space-y-2">
              <h2 className="text-lg font-semibold">Messages from attendees</h2>
              {attendeeMessages.map((msg, idx) => (
                <div key={`venue-message-${idx}`} className="rounded-2xl border border-slate-200 p-2 sm:p-3 bg-white shadow-sm">
                  <p className="text-sm text-slate-800 whitespace-pre-line">{msg.message}</p>
                  <p className="text-xs text-slate-500 mt-1">— {msg.displayName || 'Someone'}</p>
                </div>
              ))}
            </div>
          )}

          {revealed && !hasFinalDate && suggested?.date && (
            <div className="mt-4 sm:mt-6">
              <AddToCalendar
                eventDate={suggested.date}
                eventTitle={eventTitle}
                eventLocation={location}
                introText="Add the current leading date to your calendar"
                className="mx-auto max-w-lg"
              />
            </div>
          )}

          <div className="rounded-3xl border border-yellow-200 bg-yellow-50 p-3 sm:p-4 text-center">
            <h2 className="text-xl font-semibold mb-2">📣 Share the final plan</h2>
            <p className="text-slate-700 mb-3">
              {votingClosed
                ? `Let friends know ${organiser} set the date for "${eventTitle}" in ${location}.`
                : `Spread the word – there’s still time to vote on "${eventTitle}" in ${location}!`}
            </p>
            <ShareButtons shareUrl={shareUrl} shareMessage={shareMessage} />
          </div>
        </section>
      </div>
    </PartnerBrandFrame>
  );
}

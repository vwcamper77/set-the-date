// pages/share/[id].js
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { format, parseISO } from 'date-fns';
import Head from "next/head";
import LogoHeader from '../../components/LogoHeader';
import ShareButtonsLayout from '../../components/ShareButtonsLayout';
import PartnerBrandFrame from '@/components/PartnerBrandFrame';
import PoweredByBadge from '@/components/PoweredByBadge';
import SuggestedDatesCalendar from '@/components/SuggestedDatesCalendar';

import { getHolidayDurationLabel } from '@/utils/eventOptions';
import getPartnerOgImage from '@/utils/getPartnerOgImage';

const PAID_MEAL_KEYS = [];
const pollUsesPaidMeals = (poll) => {
  const includesPaid = (list) =>
    Array.isArray(list) && list.some((meal) => PAID_MEAL_KEYS.includes(meal));
  if (includesPaid(poll?.eventOptions?.mealTimes)) return true;
  const perDate = poll?.eventOptions?.mealTimesPerDate;
  if (perDate && typeof perDate === 'object') {
    return Object.values(perDate).some((value) => includesPaid(value));
  }
  return false;
};

const MapPreview = ({ location, eventTitle }) => {
  const hasLocation = Boolean(location);
  const embedSrc = hasLocation
    ? `https://www.google.com/maps?q=${encodeURIComponent(location)}&output=embed`
    : null;
  const externalHref = hasLocation
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
    : null;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Location map</p>
        {externalHref ? (
          <a
            href={externalHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline decoration-dotted"
          >
            Open map
          </a>
        ) : null}
      </div>
      <div className="mt-3 flex-1">
        {embedSrc ? (
          <iframe
            title={`Map for ${eventTitle || 'event location'}`}
            src={embedSrc}
            className="h-full min-h-[220px] w-full rounded-xl border border-slate-100"
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <div className="flex h-full min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-200 text-center text-sm text-slate-500">
            Add a location to preview it on the map.
          </div>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-slate-500">
        Exact location TBC - we&apos;ll confirm once the venue is locked.
      </p>
    </div>
  );
};

const ShareActionTooltip = ({ organiserName, stepNumber = 2 }) => (
  <div className="relative my-8" role="alert" aria-live="polite">
    <div className="rounded-3xl bg-gradient-to-r from-emerald-500 to-green-600 p-6 text-white shadow-xl">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.45em] text-emerald-100">
        Step {stepNumber}: Share it now
      </p>
      <p className="mt-2 text-lg font-semibold">
        {organiserName ? `${organiserName}` : 'You'} need votes to lift this event off the runway.
      </p>
      <p className="mt-2 text-sm text-emerald-50/90">
        Fire off the invites right away - no shares means no votes and the event will stall.
      </p>
      <ul className="mt-4 space-y-2 text-sm text-emerald-50">
        <li className="flex items-start gap-3">
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-white/50 text-[0.65rem] font-bold leading-none">
            1
          </span>
          Hit WhatsApp or SMS first for instant replies.
        </li>
        <li className="flex items-start gap-3">
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-white/50 text-[0.65rem] font-bold leading-none">
            2
          </span>
          Then follow up via Email, Discord or Slack so nobody misses the link.
        </li>
      </ul>
    </div>
    <div
      className="absolute left-1/2 -bottom-3 h-6 w-6 -translate-x-1/2 rotate-45 rounded border border-emerald-400/70 bg-emerald-500 shadow-lg"
      aria-hidden="true"
    />
  </div>
);
export default function SharePage() {
  const router = useRouter();
  const { id } = router.query;
  const [poll, setPoll] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const [partnerData, setPartnerData] = useState(null);
  const [partnerLoading, setPartnerLoading] = useState(false);
  const [photoLightboxUrl, setPhotoLightboxUrl] = useState(null);
  const partnerGallery = useMemo(() => {
    if (Array.isArray(partnerData?.venuePhotoGallery) && partnerData.venuePhotoGallery.length) {
      return partnerData.venuePhotoGallery;
    }
    return partnerData?.venuePhotoUrl ? [partnerData.venuePhotoUrl] : [];
  }, [partnerData?.venuePhotoGallery, partnerData?.venuePhotoUrl]);

  const planBaseURL = "https://plan.setthedate.app";
  const OG_IMAGE_DEFAULT = `${planBaseURL}/logo.png`;
  const OG_IMAGE_TRIP = "https://setthedate.app/wp-content/uploads/2025/11/set_the_date_icon_under_100kb.png";
  const capitalise = (s) => s?.charAt(0).toUpperCase() + s.slice(1);
  const eventType = poll?.eventType || 'general';
  const isProPoll =
    poll?.planType === 'pro' || poll?.unlocked || pollUsesPaidMeals(poll);
  const isHolidayEvent = eventType === 'holiday';
  const shareDestination = id ? (isHolidayEvent ? `trip/${id}?view=calendar` : `poll/${id}`) : '';
  const attendeePagePath = shareDestination ? `/${shareDestination}` : null;
  const productionShareLink = shareDestination ? `${planBaseURL}/${shareDestination}` : planBaseURL;
  const shareOgImage = useMemo(() => {
    if (isHolidayEvent) return OG_IMAGE_TRIP;
    return getPartnerOgImage(partnerData, OG_IMAGE_DEFAULT);
  }, [isHolidayEvent, partnerData]);
  const sharePageUrl = id ? `${planBaseURL}/share/${id}` : planBaseURL;
  const editPageBasePath = id ? `/edit/${id}` : null;
  const rawDateValues = (() => {
    if (Array.isArray(poll?.dates) && poll.dates.length > 0) return poll.dates;
    if (Array.isArray(poll?.selectedDates) && poll.selectedDates.length > 0) return poll.selectedDates;
    return [];
  })();

  const normalisedDateEntries = rawDateValues
    .map((value) => {
      if (!value) return null;

      if (typeof value === 'string') {
        const parsed = parseISO(value);
        if (!(parsed instanceof Date) || Number.isNaN(parsed)) return null;
        return { iso: value, date: parsed };
      }

      if (value instanceof Date) {
        const iso = value.toISOString();
        return { iso, date: value };
      }

      if (typeof value.toDate === 'function') {
        try {
          const date = value.toDate();
          if (!(date instanceof Date) || Number.isNaN(date)) return null;
          return { iso: date.toISOString(), date };
        } catch {
          return null;
        }
      }

      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date - b.date);

  const sortedDates = normalisedDateEntries.map((entry) => entry.iso);
  const holidayStart =
    isHolidayEvent && normalisedDateEntries.length ? normalisedDateEntries[0].date : null;
  const holidayEnd =
    isHolidayEvent && normalisedDateEntries.length
      ? normalisedDateEntries[normalisedDateEntries.length - 1].date
      : null;
  const formattedHolidayStart = holidayStart ? format(holidayStart, 'EEEE do MMMM yyyy') : '';
  const formattedHolidayEnd = holidayEnd ? format(holidayEnd, 'EEEE do MMMM yyyy') : '';
  const proposedDurationLabel = isHolidayEvent ? getHolidayDurationLabel(poll?.eventOptions?.proposedDuration) : '';


  useEffect(() => {
    if (!id) return;
    const fetchPoll = async () => {
      const docRef = doc(db, 'polls', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) setPoll(docSnap.data());
      else console.error("Poll not found");
    };
    fetchPoll();
  }, [id]);

  useEffect(() => {
    if (!poll || !id) return;
    const notifyAdminOnce = async () => {
      try {
        if (poll.adminNotified) return; // ✅ Prevent repeated emails

        const payload = {
          organiserName: poll.organiserFirstName || "Unknown",
          eventTitle: poll.eventTitle || poll.title || "Untitled Event",
          location: poll.location || "Unspecified",
          selectedDates: sortedDates,
          pollId: id,
          pollLink: productionShareLink,
          eventType: poll.eventType || 'general',
          eventOptions: poll.eventOptions || null
        };

        await fetch('/api/notifyAdmin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        // ✅ Mark as notified
        const docRef = doc(db, 'polls', id);
        await updateDoc(docRef, { adminNotified: true });
      } catch (err) {
        console.error("❌ Admin notify error:", err);
      }
    };
    notifyAdminOnce();
  }, [poll, id, productionShareLink]);

  useEffect(() => {
    let cancelled = false;
    if (!poll?.partnerSlug) {
      setPartnerData(null);
      return;
    }

    setPartnerLoading(true);
    const partnerRef = doc(db, 'partners', poll.partnerSlug);
    getDoc(partnerRef)
      .then((snap) => {
        if (!cancelled) {
          setPartnerData(snap.exists() ? { ...snap.data(), slug: poll.partnerSlug } : null);
        }
      })
      .catch((err) => {
        console.error('partner fetch failed', err);
        if (!cancelled) setPartnerData(null);
      })
      .finally(() => {
        if (!cancelled) setPartnerLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [poll?.partnerSlug]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 2500);
  };

  const share = (platform) => {
    const pollLink = productionShareLink;
    const organiser = poll.organiserFirstName || "someone";
    const eventTitle = capitalise(poll.eventTitle || poll.title || "an event");
    const location = poll.location || "somewhere";
    const shareMessage = isHolidayEvent && holidayStart && holidayEnd
      ? `Hey, you're invited to ${eventTitle} in ${location}. Proposed trip window ${formattedHolidayStart} to ${formattedHolidayEnd}${proposedDurationLabel ? ` (${proposedDurationLabel})` : ''}. Vote on what suits you: ${pollLink} - ${organiser}`
      : `Hey, you're invited to ${eventTitle} in ${location}. Vote on what day suits you now: ${pollLink} - hope to see you there! - ${organiser}`;

    if (platform === "whatsapp") {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareMessage)}`, "_blank");
    } else if (platform === "email") {
      const subject = encodeURIComponent(`${organiser} invites you to ${eventTitle} in ${location}`);
      const body = encodeURIComponent(shareMessage);
      window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
    } else if (platform === "sms") {
      window.open(`sms:?&body=${encodeURIComponent(shareMessage)}`, "_blank");
    } else if (platform === "copy") {
      navigator.clipboard.writeText(pollLink);
      showToast("🔗 Link copied to clipboard!");
    } else if (platform === "discord" || platform === "slack") {
      navigator.clipboard.writeText(pollLink);
      const platformName = platform === 'discord' ? 'Discord' : 'Slack';
      showToast(`🔗 Link copied! Paste it in ${platformName}.`);
    } else if (pollLink) {
      window.open(pollLink, "_blank");
    }
  };

  const organiser = poll?.organiserFirstName || "someone";
  const eventTitle = capitalise(poll?.eventTitle || poll?.title || "an event");
  const pollLocation = poll?.location || "somewhere";

  const sortedDatesSignature = sortedDates.join('|');

  useEffect(() => {
    if (typeof window === 'undefined' || !poll) return;
    try {
      const payload = {
        name: poll.organiserFirstName || '',
        email: poll.organiserEmail || '',
        dates: sortedDates,
      };
      localStorage.setItem('std_last_organiser_details', JSON.stringify(payload));
    } catch (err) {
      console.error('organiser details persist failed', err);
    }
  }, [poll?.organiserFirstName, poll?.organiserEmail, sortedDatesSignature]);

  const organiserLinkIsVenue = Boolean(partnerData?.slug);
  const organiserVenueLink = organiserLinkIsVenue ? `/p/${partnerData.slug}` : null;

  const editToken = poll?.editToken || null;
  const editPageHref =
    editPageBasePath && editToken
      ? { pathname: editPageBasePath, query: { token: editToken } }
      : editPageBasePath;

  const renderQuickEditCta = () => {
    if (!editPageHref || organiserLinkIsVenue) return null;
    return (
      <div className="mb-4 rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm text-rose-900 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.45em] text-rose-500">Something off?</p>
            <p className="mt-1 text-base font-semibold text-rose-900">Fix the poll before sharing.</p>
            <p className="text-xs text-rose-700">
              Spot a typo or a wrong date? Jump into edit mode, tweak it, then come straight back to send the updated link.
            </p>
          </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <Link
                  href={editPageHref}
                  className="inline-flex items-center justify-center rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
                >
                  Open edit page
                </Link>
                {attendeePagePath && (
                  <Link
                    href={attendeePagePath}
                    className="inline-flex items-center justify-center rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:border-rose-500 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-100"
                  >
                    Preview attendee view
                  </Link>
                )}
              </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (!attendeePagePath || typeof router?.prefetch !== 'function') return;
    router.prefetch(attendeePagePath);
  }, [attendeePagePath, router]);

  const renderOrganiserReturnCta = () => {
    if (!organiserLinkIsVenue || (!attendeePagePath && !organiserVenueLink)) return null;
    return (
      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 flex flex-col gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Need to tweak your dates?</p>
          <p className="text-sm text-slate-500">
            Jump to your venue organiser page to adjust details or open the poll again to add extra options, then come
            back here.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {attendeePagePath && (
            <Link
              href={attendeePagePath}
              className="inline-flex w-full sm:w-auto items-center justify-center rounded-full bg-slate-900 text-white px-5 py-2 text-sm font-semibold shadow-lg shadow-slate-900/20 hover:bg-slate-800 transition"
            >
              Add your own dates
            </Link>
          )}
          {organiserVenueLink && (
            <Link
              href={organiserVenueLink}
              className="inline-flex w-full sm:w-auto items-center justify-center rounded-full border border-slate-900 px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-900 hover:text-white transition"
            >
              Go back to organiser page
            </Link>
          )}
        </div>
      </div>
    );
  };

  if (!poll) {
    return (
      <>
        <Head>
          <title>Share your poll</title>
        </Head>
        <div className="text-center mt-8">Loading...</div>
      </>
    );
  }

  const isVenueShare = Boolean(partnerData);

  const renderVenueShare = () => {
    return (
      <PartnerBrandFrame partner={partnerData}>
        <div className="space-y-6 text-slate-900">
          <div className="flex justify-end">
            <PoweredByBadge />
          </div>
          {partnerGallery.length > 0 && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setPhotoLightboxUrl(partnerGallery[0])}
                className="w-full rounded-[24px] overflow-hidden border border-slate-200 shadow focus:outline-none focus:ring-2 focus:ring-slate-900/30"
              >
                <img
                  src={partnerGallery[0]}
                  alt={`${partnerData?.venueName || 'Venue'} photo`}
                  className="w-full h-64 object-cover transition hover:scale-[1.005]"
                  loading="lazy"
                />
              </button>
              {partnerGallery.length > 1 && (
                <div className="grid gap-3 sm:grid-cols-3">
                  {partnerGallery.slice(1).map((photo) => (
                    <button
                      type="button"
                      key={photo}
                      onClick={() => setPhotoLightboxUrl(photo)}
                      className="rounded-2xl overflow-hidden border border-slate-200 shadow focus:outline-none focus:ring-2 focus:ring-slate-900/30"
                    >
                      <img
                        src={photo}
                        alt="Venue gallery"
                        className="w-full h-28 object-cover"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <h1 className="text-3xl font-semibold text-center">Share this poll with your group</h1>
          <p className="text-center text-slate-600">
            Invite friends and family to vote on {partnerData?.venueName}&apos;s dates. Use the buttons below or copy the link into any chat.
          </p>

          <div className="rounded-3xl border border-slate-200 bg-white shadow p-6 space-y-6">
            <div className="flex flex-col gap-6 lg:flex-row">
              <div className="flex-1 space-y-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-2">Event</p>
                  <p className="text-xl font-semibold">
                    {eventTitle} at {partnerData?.venueName}
                  </p>
                  <p className="text-slate-500">{pollLocation}</p>
                  <p className="text-sm text-slate-500 mt-1">Hosted by {organiser}</p>
                  {partnerData?.venuePitch && (
                    <p className="text-sm text-slate-600 mt-2">{partnerData.venuePitch}</p>
                  )}
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-2">Dates to vote on</p>
                  {sortedDates.length ? (
                    <ul className="space-y-1 text-slate-900 font-medium">
                      {sortedDates.map((date, index) => (
                        <li key={index}>{format(parseISO(date), 'EEEE do MMMM yyyy')}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500">Add a few dates so everyone can vote.</p>
                  )}
                </div>
              </div>

              <div className="lg:w-[320px]">
                <SuggestedDatesCalendar dates={sortedDates} />
              </div>
            </div>

            {renderOrganiserReturnCta()}

            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-2">Share link</p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => share('copy')}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-900"
                >
                  Copy poll link
                </button>
                <div className="grid md:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => share('whatsapp')}
                    className="rounded-full bg-green-500 text-white text-sm font-semibold px-4 py-2 hover:bg-green-600"
                  >
                    Share via WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => share('email')}
                    className="rounded-full bg-blue-600 text-white text-sm font-semibold px-4 py-2 hover:bg-blue-700"
                  >
                    Share via Email
                  </button>
                </div>
              </div>
            </div>

            <div className="text-center text-sm text-slate-600">
              Want to plan something else?{' '}
              <Link href="/" className="font-semibold text-slate-900 underline">
                Create your own event
              </Link>
            </div>
          </div>
        </div>
      </PartnerBrandFrame>
    );
  };

  return (
    <>
      <Head>
        <title>Share Your Set The Date Poll</title>
        <meta property="og:title" content={`${organiser} is planning ${eventTitle} in ${pollLocation}`} />
        <meta property="og:description" content="Vote now to help choose a date!" />
        <meta property="og:image" content={shareOgImage} />
        <meta property="og:url" content={sharePageUrl} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={shareOgImage} />
      </Head>

      {isVenueShare ? (
        renderVenueShare()
      ) : (
        <div className="mx-auto w-full max-w-2xl p-4">
          <LogoHeader isPro={isProPoll} compact />
  
          <h1 className="text-2xl font-bold text-center mb-2">Share Your Set The Date Poll</h1>
  
          <div
            className="mb-4 rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900 shadow-sm"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.45em] text-emerald-600">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-emerald-200 text-center text-[0.65rem] leading-none text-emerald-700">
                1
              </span>
              Step 1: Check your inbox
            </div>
            <p className="mt-2 text-base font-semibold text-emerald-900">Find the organiser email.</p>
            <p className="mt-1 text-emerald-800">
              We&apos;ve emailed you your unique organiser link - if you don&apos;t see it, check your spam or junk folder
              and mark Set The Date as safe so nothing gets missed.
            </p>
          </div>
  
          <div className="bg-yellow-100 border border-yellow-300 text-yellow-800 p-3 mb-4 rounded text-center font-semibold">
            🎉 {organiser} is planning a {eventTitle} event!
          </div>
  
          <div className="flex items-center justify-center gap-2 mb-6 text-sm text-gray-700 font-medium">
            <img src="https://cdn-icons-png.flaticon.com/512/684/684908.png" alt="Location Icon" className="w-4 h-4" />
            <span>{poll.location}</span>
          </div>
  
          <div className="mb-6 rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm space-y-6">
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-3">Event snapshot</p>
              {isHolidayEvent ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-4 text-blue-900 space-y-2">
                  <p className="text-base font-semibold">Proposed travel window</p>
                  {holidayStart && holidayEnd ? (
                    <p className="text-lg font-semibold">{formattedHolidayStart} to {formattedHolidayEnd}</p>
                  ) : (
                    <p className="text-sm">Add a range so everyone knows when to travel.</p>
                  )}
                  {proposedDurationLabel && (
                    <p className="text-sm">Ideal trip length: {proposedDurationLabel}</p>
                  )}
                </div>
              ) : sortedDates.length > 0 ? (
                <ul className="space-y-1 text-lg font-semibold text-slate-900">
                  {sortedDates.map((date, index) => (
                    <li key={index}>{format(parseISO(date), 'EEEE do MMMM yyyy')}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">Add a few dates so friends can vote.</p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <MapPreview location={poll.location} eventTitle={eventTitle} />
              <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Calendar</p>
                <p className="text-xs text-slate-500">Highlighted days show the options you picked.</p>
                <div className="mt-3 flex-1">
                  <SuggestedDatesCalendar dates={sortedDates} showIntro={false} className="h-full border-0 shadow-none p-0 bg-transparent" />
                </div>
              </div>
            </div>
          </div>

          {renderQuickEditCta()}
          {renderOrganiserReturnCta()}

          <ShareActionTooltip organiserName={organiser} />

          <h2 className="text-xl font-semibold mb-4 text-center">Share Event with Friends</h2>
          <ShareButtonsLayout onShare={share} />
  
          {attendeePagePath && (
            <div className="mt-10 rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-emerald-100/50">
              <div className="flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.45em] text-slate-500">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-center text-[0.65rem] leading-none text-slate-700">
                  3
                </span>
                Step 3: Add your own date preferences
              </div>
              <p className="mt-2 text-lg font-semibold text-slate-900">Give everyone at least two dates to react to.</p>
              <p className="mt-2 text-sm text-slate-600">
                Drop in any dates you can do now and update them later if needed. Voters will only act once they see the
                options.
              </p>
              <Link
                href={attendeePagePath}
                className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-base font-semibold text-white shadow hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                prefetch
              >
                Add Your Own Date Preferences
              </Link>
            </div>
          )}
  
          <div className="text-center mt-10">
            <a href="https://buymeacoffee.com/setthedate" target="_blank" rel="noopener noreferrer" className="inline-block">
              <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" className="h-12 mx-auto" />
            </a>
          </div>
        </div>
      )}

      {photoLightboxUrl && (
        <div className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative max-w-3xl w-full">
            <button
              type="button"
              onClick={() => setPhotoLightboxUrl(null)}
              className="absolute -top-3 -right-3 bg-white text-slate-900 rounded-full w-8 h-8 flex items-center justify-center shadow"
            >
              ×
            </button>
            <img
              src={photoLightboxUrl}
              alt="Venue full-size"
              className="w-full max-h-[80vh] object-contain rounded-2xl border border-slate-200 bg-white"
            />
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white text-black text-base font-medium px-6 py-3 rounded-xl shadow-xl z-50 border border-gray-300 animate-fade-in-out"
             style={{ WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', fontWeight: 500 }}>
          {toastMessage}
        </div>
      )}

      <style jsx>{`
        @keyframes fadeInOut {
          0%, 100% { opacity: 0; transform: scale(0.95); }
          10%, 90% { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in-out {
          animation: fadeInOut 2.5s ease-in-out;
        }
      `}</style>
    </>
  );
}







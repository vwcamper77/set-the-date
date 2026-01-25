// pages/share/[id].js
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { format, parseISO, eachDayOfInterval } from 'date-fns';
import Head from 'next/head';
import LogoHeader from '../../components/LogoHeader';
import ShareButtonsLayout from '../../components/ShareButtonsLayout';
import PartnerBrandFrame from '@/components/PartnerBrandFrame';
import SuggestedDatesCalendar from '@/components/SuggestedDatesCalendar';
import ImageLightbox from '@/components/ImageLightbox';

import { getHolidayDurationLabel } from '@/utils/eventOptions';
import getPartnerOgImage from '@/utils/getPartnerOgImage';
import { OG_LOGO_IMAGE, SHARE_BASE_URL } from '@/lib/brandAssets';

const FEATURED_DESCRIPTION_PREVIEW_LIMIT = 500;

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
    <div className="flex h-full flex-col w-full min-w-0 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
          {hasLocation ? 'Location map' : 'Location'}
        </p>
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
          <div className="flex h-full min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center">
            <div className="px-4">
              <p className="text-sm font-semibold text-slate-700">Location: TBC</p>
              <p className="mt-1 text-xs text-slate-500">
                Add it later on the edit page if you want.
              </p>
            </div>
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-slate-500">
        Exact location TBC. We’ll confirm once the venue is locked.
      </p>
    </div>
  );
};

const PrimaryShareButtons = ({ onShare }) => (
  <div className="flex flex-col gap-2">
    <button
      type="button"
      onClick={() => onShare('whatsapp')}
      className="rounded-full bg-green-600 text-white text-base font-semibold px-5 py-3 hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-200"
    >
      Share on WhatsApp
    </button>

    <button
      type="button"
      onClick={() => onShare('copy')}
      className="rounded-full border border-slate-300 bg-white text-slate-800 text-base font-semibold px-5 py-3 hover:border-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
    >
      Copy link
    </button>

    <p className="text-xs text-slate-500 text-center">
      Share first. If you need to change anything later, you can edit it.
    </p>
  </div>
);

const CompactDatesList = ({ dates = [], limit = 6 }) => {
  const [showAll, setShowAll] = useState(false);

  if (!Array.isArray(dates) || dates.length === 0) {
    return <p className="text-sm text-slate-500">No dates added yet.</p>;
  }

  const displayDates = showAll ? dates : dates.slice(0, limit);
  const hasMore = dates.length > limit;

  return (
    <div className="space-y-2">
      <ul className="space-y-1 text-slate-900 font-semibold">
        {displayDates.map((date, idx) => (
          <li key={`${date}-${idx}`}>{format(parseISO(date), 'EEEE do MMMM yyyy')}</li>
        ))}
      </ul>

      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-xs font-semibold text-slate-700 underline decoration-dotted hover:text-slate-900"
        >
          {showAll ? 'Show fewer dates' : `Show all dates (${dates.length})`}
        </button>
      )}
    </div>
  );
};

export default function SharePage({ initialPoll = null, initialPartner = null, shareId = null }) {
  const router = useRouter();
  const routeId = typeof router.query.id === 'string' ? router.query.id : null;
  const id = routeId || shareId || null;

  const [poll, setPoll] = useState(initialPoll);
  const [toastMessage, setToastMessage] = useState('');
  const [partnerData, setPartnerData] = useState(initialPartner);
  const [partnerLoading, setPartnerLoading] = useState(false);
  const [photoLightboxIndex, setPhotoLightboxIndex] = useState(null);

  // Must be declared before any conditional returns
  const [showFullFeaturedDescription, setShowFullFeaturedDescription] = useState(false);

  const partnerGallery = useMemo(() => {
    if (Array.isArray(partnerData?.venuePhotoGallery) && partnerData.venuePhotoGallery.length) {
      return partnerData.venuePhotoGallery.filter(Boolean);
    }
    return partnerData?.venuePhotoUrl ? [partnerData.venuePhotoUrl] : [];
  }, [partnerData?.venuePhotoGallery, partnerData?.venuePhotoUrl]);

  const openPhotoLightbox = (index = 0) => {
    if (!partnerGallery.length) return;
    const clamped = Math.min(Math.max(index, 0), partnerGallery.length - 1);
    setPhotoLightboxIndex(clamped);
  };

  const closePhotoLightbox = () => setPhotoLightboxIndex(null);

  useEffect(() => {
    if (photoLightboxIndex === null) return;
    if (!partnerGallery.length) {
      setPhotoLightboxIndex(null);
      return;
    }
    if (photoLightboxIndex > partnerGallery.length - 1) {
      setPhotoLightboxIndex(partnerGallery.length - 1);
    }
  }, [partnerGallery.length, photoLightboxIndex]);

  const planBaseURL = SHARE_BASE_URL;
  const OG_IMAGE_DEFAULT = OG_LOGO_IMAGE;
  const capitalise = (s) => s?.charAt(0).toUpperCase() + s.slice(1);

  const eventType = poll?.eventType || 'general';
  const isProPoll = poll?.planType === 'pro' || poll?.unlocked || pollUsesPaidMeals(poll);
  const isHolidayEvent = eventType === 'holiday';

  const shareDestination = id ? (isHolidayEvent ? `trip/${id}?view=calendar` : `poll/${id}`) : '';
  const attendeePagePath = shareDestination ? `/${shareDestination}` : null;
  const productionShareLink = shareDestination ? `${planBaseURL}/${shareDestination}` : planBaseURL;

  const eventSnapshotOgImage = id ? `${planBaseURL}/api/share/event-snapshot/${id}` : null;
  const shareOgImage = useMemo(() => {
    if (eventSnapshotOgImage) return eventSnapshotOgImage;
    return getPartnerOgImage(partnerData, OG_IMAGE_DEFAULT);
  }, [eventSnapshotOgImage, partnerData]);

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

  const holidayStart = isHolidayEvent && normalisedDateEntries.length ? normalisedDateEntries[0].date : null;
  const holidayEnd =
    isHolidayEvent && normalisedDateEntries.length
      ? normalisedDateEntries[normalisedDateEntries.length - 1].date
      : null;

  const formattedHolidayStart = holidayStart ? format(holidayStart, 'EEEE do MMMM yyyy') : '';
  const formattedHolidayEnd = holidayEnd ? format(holidayEnd, 'EEEE do MMMM yyyy') : '';
  const proposedDurationLabel = isHolidayEvent
    ? getHolidayDurationLabel(poll?.eventOptions?.proposedDuration)
    : '';

  const calendarDates =
    isHolidayEvent && holidayStart && holidayEnd
      ? eachDayOfInterval({ start: holidayStart, end: holidayEnd }).map((date) => date.toISOString())
      : sortedDates;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const fetchPoll = async () => {
      try {
        const resp = await fetch(`/api/polls/publicSnapshot?id=${encodeURIComponent(id)}`);
        if (!resp.ok) {
          throw new Error(`Snapshot request failed: ${resp.status}`);
        }
        const data = await resp.json();
        if (!cancelled) setPoll(data);
      } catch (err) {
        console.error('Poll snapshot fetch failed', err);
      }
    };

    fetchPoll();
    return () => {
      cancelled = true;
    };
  }, [id]);

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
    setTimeout(() => setToastMessage(''), 2500);
  };

  const share = (platform) => {
    const pollLink = productionShareLink;

    const organiserName = poll?.organiserFirstName || 'Someone';
    const eventTitle = capitalise(poll?.eventTitle || poll?.title || 'an event');
    const location = poll?.location || 'TBC';

    const baseMessage = isHolidayEvent && holidayStart && holidayEnd
      ? `Quick vote for ${eventTitle} (${location}). Window: ${formattedHolidayStart} to ${formattedHolidayEnd}${proposedDurationLabel ? ` (${proposedDurationLabel})` : ''}. Best/Maybe/No: ${pollLink}`
      : `Quick vote for ${eventTitle} (${location}). Best/Maybe/No: ${pollLink}`;

    const shareMessage = `${baseMessage}\nOrganiser: ${organiserName}`;

    if (platform === 'whatsapp') {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareMessage)}`, '_blank');
      return;
    }

    if (platform === 'email') {
      const subject = encodeURIComponent(`Vote on dates: ${eventTitle}`);
      const body = encodeURIComponent(shareMessage);
      window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
      return;
    }

    if (platform === 'sms') {
      window.open(`sms:?&body=${encodeURIComponent(shareMessage)}`, '_blank');
      return;
    }

    if (platform === 'copy') {
      navigator.clipboard.writeText(pollLink);
      showToast('Link copied to clipboard');
      return;
    }

    if (platform === 'discord' || platform === 'slack') {
      navigator.clipboard.writeText(pollLink);
      const platformName = platform === 'discord' ? 'Discord' : 'Slack';
      showToast(`Link copied. Paste it in ${platformName}.`);
      return;
    }

    if (pollLink) {
      window.open(pollLink, '_blank');
    }
  };

  const organiser = poll?.organiserFirstName || 'Someone';
  const eventTitle = capitalise(poll?.eventTitle || poll?.title || 'an event');
  const pollLocation = poll?.location || 'TBC';

  const organiserLinkIsVenue = Boolean(partnerData?.slug);
  const organiserVenueLink = organiserLinkIsVenue ? `/p/${partnerData.slug}` : null;

  const editToken = poll?.editToken || null;
  const editPageHref =
    editPageBasePath && editToken
      ? { pathname: editPageBasePath, query: { token: editToken } }
      : null;

  useEffect(() => {
    if (!attendeePagePath || typeof router?.prefetch !== 'function') return;
    router.prefetch(attendeePagePath);
  }, [attendeePagePath, router]);

  const featuredEventTitle = poll?.featuredEventTitle || null;
  const featuredEventDescription = poll?.featuredEventDescription || null;

  const featuredDescriptionForDisplay = useMemo(() => {
    if (!featuredEventDescription) {
      return { text: '', truncated: false, isExpanded: false };
    }
    const truncated = featuredEventDescription.length > FEATURED_DESCRIPTION_PREVIEW_LIMIT;
    if (!truncated || showFullFeaturedDescription) {
      return { text: featuredEventDescription, truncated, isExpanded: showFullFeaturedDescription };
    }
    return {
      text: `${featuredEventDescription.slice(0, FEATURED_DESCRIPTION_PREVIEW_LIMIT)}...`,
      truncated: true,
      isExpanded: false
    };
  }, [featuredEventDescription, showFullFeaturedDescription]);

  const organiserNotes = poll?.organiserNotes || poll?.notes || '';

  const renderEditSafetyCta = () => {
    if (!editPageHref || organiserLinkIsVenue) return null;
    return (
      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-900 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.45em] text-slate-500">
              Need to tweak anything?
            </p>
            <p className="mt-1 text-base font-semibold text-slate-900">Edit later if you need to.</p>
            <p className="text-xs text-slate-600">
              Share first to get momentum. If a date is wrong, you can edit afterwards.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Link
              href={editPageHref}
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              Edit poll
            </Link>
            {attendeePagePath && (
              <Link
                href={attendeePagePath}
                className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:border-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
                target="_blank"
                rel="noopener noreferrer"
              >
                Preview attendee view
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderOrganiserReturnCta = () => {
    if (!organiserLinkIsVenue || (!attendeePagePath && !organiserVenueLink)) return null;
    return (
      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 flex flex-col gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Need to adjust details?</p>
          <p className="text-sm text-slate-500">
            Jump to your organiser page, tweak details, then come back here to share.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {attendeePagePath && (
            <Link
              href={attendeePagePath}
              className="inline-flex w-full sm:w-auto items-center justify-center rounded-full bg-slate-900 text-white px-5 py-2 text-sm font-semibold shadow-lg shadow-slate-900/20 hover:bg-slate-800 transition"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open voting page
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
          {partnerGallery.length > 0 && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => openPhotoLightbox(0)}
                className="w-full rounded-[24px] overflow-hidden border border-slate-200 shadow focus:outline-none focus:ring-2 focus:ring-slate-900/30"
              >
                <img
                  src={partnerGallery[0]}
                  alt={`${partnerData?.venueName || 'Venue'} photo`}
                  className="w-full h-64 object-cover transition hover:scale-[1.005]"
                  loading="lazy"
                />
              </button>
            </div>
          )}

          <div className="text-center space-y-2">
            <h1 className="text-3xl font-semibold">Your poll is live</h1>
            <p className="text-slate-600">
              Share it now to get replies. You can edit later if you need to.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white shadow p-6 space-y-6">
            <PrimaryShareButtons onShare={share} />

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <p className="text-xs uppercase tracking-[0.35em] font-semibold text-amber-700">Event snapshot</p>
              <p className="mt-2 text-base font-semibold">
                {eventTitle}{partnerData?.venueName ? ` at ${partnerData.venueName}` : ''}
              </p>
              <p className="text-sm text-amber-800 mt-1">{pollLocation}</p>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-2">Dates to vote on</p>
                {isHolidayEvent ? (
                  <div className="space-y-1">
                    {holidayStart && holidayEnd ? (
                      <p className="text-sm font-semibold text-slate-900">
                        {formattedHolidayStart} to {formattedHolidayEnd}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-500">Add a range so everyone knows the window.</p>
                    )}
                    {proposedDurationLabel ? (
                      <p className="text-xs text-slate-600">Ideal trip length: {proposedDurationLabel}</p>
                    ) : null}
                  </div>
                ) : (
                  <CompactDatesList dates={sortedDates} limit={6} />
                )}

                {(organiserNotes || featuredEventTitle || featuredEventDescription) && (
                  <div className="mt-4 space-y-3">
                    {featuredEventTitle && (
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Featured</p>
                        <p className="text-sm font-semibold text-slate-900">{featuredEventTitle}</p>
                      </div>
                    )}

                    {featuredEventDescription && (
                      <div className="space-y-1">
                        <p className="text-sm text-slate-700 whitespace-pre-line">
                          {featuredDescriptionForDisplay.text}
                        </p>
                        {featuredDescriptionForDisplay.truncated && (
                          <button
                            type="button"
                            onClick={() => setShowFullFeaturedDescription((prev) => !prev)}
                            className="text-xs font-semibold text-slate-700 underline decoration-dotted hover:text-slate-900"
                          >
                            {featuredDescriptionForDisplay.isExpanded ? 'Show less' : 'Show full details'}
                          </button>
                        )}
                      </div>
                    )}

                    {organiserNotes && (
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Notes</p>
                        <p className="text-sm text-slate-700 whitespace-pre-line">{organiserNotes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                <MapPreview location={poll?.location || ''} eventTitle={eventTitle} />
                <div className="flex h-full flex-col w-full min-w-0 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Calendar</p>
                  <p className="text-xs text-slate-500">Highlighted days show the options you picked.</p>
                  <div className="mt-3 flex-1 min-w-0">
                    <SuggestedDatesCalendar
                      dates={calendarDates}
                      showIntro={false}
                      className="h-full border-0 shadow-none p-0 bg-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>

            {renderOrganiserReturnCta()}

            <details className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                More ways to share
              </summary>
              <div className="mt-3">
                <ShareButtonsLayout onShare={share} />
              </div>
            </details>

            <div className="text-center text-sm text-slate-600">
              Want to plan something else?{' '}
              <Link href="/" className="font-semibold text-slate-900 underline decoration-dotted">
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
        <meta property="og:title" content={`${eventTitle} | Vote on dates`} />
        <meta property="og:description" content="Quick vote: Best / Maybe / No. No sign-up needed." />
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

          <div className="text-center space-y-2 mb-5">
            <h1 className="text-2xl font-bold">Your poll is live</h1>
            <p className="text-slate-600">
              Quick check the dates, then share it. You can edit later if you need to.
            </p>
          </div>

          {/* Share first */}
          <div className="mb-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <PrimaryShareButtons onShare={share} />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-center">
              {attendeePagePath && (
                <Link
                  href={attendeePagePath}
                  className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                  target="_blank"
                  rel="noopener noreferrer"
                  prefetch
                >
                  Open voting page
                </Link>
              )}

              {editPageHref && (
                <Link
                  href={editPageHref}
                  className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:border-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
                >
                  Edit details
                </Link>
              )}
            </div>

            <details className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                More ways to share
              </summary>
              <div className="mt-3">
                <ShareButtonsLayout onShare={share} />
              </div>
            </details>
          </div>

          {/* Snapshot */}
          <div className="mb-6 rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm space-y-6">
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-3">Event snapshot</p>

              {isHolidayEvent ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-4 text-blue-900 space-y-2">
                  <p className="text-base font-semibold">Proposed travel window</p>
                  {holidayStart && holidayEnd ? (
                    <p className="text-lg font-semibold">
                      {formattedHolidayStart} to {formattedHolidayEnd}
                    </p>
                  ) : (
                    <p className="text-sm">Add a range so everyone knows when to travel.</p>
                  )}
                  {proposedDurationLabel && (
                    <p className="text-sm">Ideal trip length: {proposedDurationLabel}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">{eventTitle}</p>
                  <p className="text-xs text-slate-500">{pollLocation}</p>
                  <CompactDatesList dates={sortedDates} limit={6} />
                </div>
              )}
            </div>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <MapPreview location={poll?.location || ''} eventTitle={eventTitle} />
              <div className="flex h-full flex-col w-full min-w-0 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Calendar</p>
                <p className="text-xs text-slate-500">Highlighted days show the options you picked.</p>
                <div className="mt-3 flex-1 min-w-0">
                  <SuggestedDatesCalendar
                    dates={calendarDates}
                    showIntro={false}
                    className="h-full border-0 shadow-none p-0 bg-transparent"
                  />
                </div>
              </div>
            </div>

            {renderEditSafetyCta()}
            {renderOrganiserReturnCta()}
          </div>

          {/* Backup email last, not first */}
          <div className="mb-8 rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-900">Backup email</p>
            <p className="mt-1 text-sm text-slate-600">
              We sent a copy of your organiser link. If you cannot see it, check spam or search for "Set The Date".
            </p>
          </div>

          <div className="text-center text-sm text-slate-600">
            Want to plan something else?{' '}
            <Link href="/" className="font-semibold text-slate-900 underline decoration-dotted">
              Create a new poll
            </Link>
          </div>

          <div className="text-center mt-10">
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
        </div>
      )}

      {photoLightboxIndex !== null && (
        <ImageLightbox images={partnerGallery} startIndex={photoLightboxIndex} onClose={closePhotoLightbox} />
      )}

      {toastMessage && (
        <div
          className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white text-black text-base font-medium px-6 py-3 rounded-xl shadow-xl z-50 border border-gray-300 animate-fade-in-out"
          style={{ WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', fontWeight: 500 }}
        >
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

export async function getServerSideProps({ params }) {
  const id = typeof params?.id === 'string' ? params.id : null;
  if (!id) {
    return { notFound: true };
  }

  try {
    const [{ db: adminDb }, { serializeFirestoreData }, { buildPublicPollSnapshot }] = await Promise.all([
      import('@/lib/firebaseAdmin'),
      import('@/utils/serializeFirestore'),
      import('@/lib/polls/publicSnapshot'),
    ]);

    const pollSnap = await adminDb.collection('polls').doc(id).get();
    if (!pollSnap.exists) {
      return { notFound: true };
    }

    const pollData = buildPublicPollSnapshot(pollSnap.data());
    let partnerData = null;

    if (pollData?.partnerSlug) {
      const partnerSnap = await adminDb.collection('partners').doc(pollData.partnerSlug).get();
      if (partnerSnap.exists) {
        partnerData = serializeFirestoreData({
          ...partnerSnap.data(),
          slug: partnerSnap.id,
        });
      }
    }

    return {
      props: {
        initialPoll: pollData,
        initialPartner: partnerData,
        shareId: id,
      },
    };
  } catch (error) {
    console.error('share/[id] getServerSideProps error', error);
    return { notFound: true };
  }
}

import { useCallback, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { nanoid } from 'nanoid';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import RentalBrandFrame from '@/components/RentalBrandFrame';
import RentalPropertyHero from '@/components/RentalPropertyHero';
import ShareButtonsLayout from '@/components/ShareButtonsLayout';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';
import { db } from '@/lib/firebase';
import { buildRentalLinks, buildRentalMetaDescription } from '@/lib/rentals/rentalsTemplates';
import { normalizeRentalProperty } from '@/lib/rentals/normalize';
import { logRentalEvent } from '@/lib/rentals/logRentalEvent';
import { HOLIDAY_DURATION_OPTIONS, getHolidayDurationLabel } from '@/utils/eventOptions';

const DateSelector = dynamic(() => import('@/components/DateSelector'), { ssr: false });

const DEFAULT_ACCENT = '#0f172a';
const DEFAULT_DEADLINE_HOURS = 168;
const DEADLINE_OPTIONS = [
  { value: 24, label: '1 day' },
  { value: 48, label: '2 days' },
  { value: 72, label: '3 days' },
  { value: DEFAULT_DEADLINE_HOURS, label: '1 week (default)' },
  { value: 336, label: '2 weeks' },
];

const parseDateOnly = (value) => {
  if (!value || typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

export default function RentalsPropertyPage({ property }) {
  const router = useRouter();
  const pollSectionRef = useRef(null);
  const blockedRanges = useMemo(
    () => (Array.isArray(property?.blockedRanges) ? property.blockedRanges : []),
    [property?.blockedRanges]
  );
  const [eventTitle, setEventTitle] = useState(
    property?.propertyName ? `Trip to ${property.propertyName}` : 'Trip'
  );
  const [organiserName, setOrganiserName] = useState('');
  const [organiserEmail, setOrganiserEmail] = useState('');
  const [organiserNotes, setOrganiserNotes] = useState('');
  const [selectedDates, setSelectedDates] = useState([]);
  const [deadlineHours, setDeadlineHours] = useState(DEFAULT_DEADLINE_HOURS);
  const [proposedDuration, setProposedDuration] = useState(
    HOLIDAY_DURATION_OPTIONS[3]?.value || '5_nights'
  );
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shareToast, setShareToast] = useState('');

  const blockedIntervals = useMemo(() => {
    return blockedRanges
      .map((range) => {
        const start = parseDateOnly(range?.start);
        const end = parseDateOnly(range?.end);
        if (!start || !end) return null;
        return { start: start.getTime(), end: end.getTime() };
      })
      .filter(Boolean);
  }, [blockedRanges]);

  const shareLinks = useMemo(() => buildRentalLinks(property), [property]);
  const travelWindowLabel = useMemo(() => {
    if (selectedDates.length < 2) return 'Select a start and end date';
    const sorted = selectedDates.slice().sort((a, b) => a - b);
    return `${format(sorted[0], 'EEE dd MMM yyyy')} to ${format(sorted[1], 'EEE dd MMM yyyy')}`;
  }, [selectedDates]);


  const brandedProperty = useMemo(
    () => ({
      ...property,
      metaDescription: buildRentalMetaDescription(property),
    }),
    [property]
  );

  const handleCtaScroll = () => {
    if (pollSectionRef.current) {
      pollSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleShareToast = (message) => {
    setShareToast(message);
    setTimeout(() => setShareToast(''), 2500);
  };

  const handleShare = (platform) => {
    const shareUrl = shareLinks.shareUrl;
    const propertyName = property?.propertyName || 'this property';
    const location = property?.locationText || 'your next trip';
    const message = `Plan a stay at ${propertyName} (${location}). Pick dates here: ${shareUrl}`;

    if (!shareUrl || typeof window === 'undefined') return;

    if (platform === 'whatsapp') {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank');
      logEventIfAvailable('rentals_share_whatsapp', { propertySlug: property?.slug });
      return;
    }

    if (platform === 'email') {
      const subject = encodeURIComponent(`Plan a stay at ${propertyName}`);
      const body = encodeURIComponent(message);
      window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
      logEventIfAvailable('rentals_share_email', { propertySlug: property?.slug });
      return;
    }

    if (platform === 'sms') {
      window.open(`sms:?&body=${encodeURIComponent(message)}`, '_blank');
      logEventIfAvailable('rentals_share_sms', { propertySlug: property?.slug });
      return;
    }

    if (platform === 'copy') {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(shareUrl);
        handleShareToast('Link copied to clipboard');
      } else {
        handleShareToast('Copy not supported in this browser');
      }
      logEventIfAvailable('rentals_share_copy', { propertySlug: property?.slug });
      return;
    }

    if (platform === 'discord' || platform === 'slack') {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(shareUrl);
        const platformName = platform === 'discord' ? 'Discord' : 'Slack';
        handleShareToast(`Link copied. Paste it in ${platformName}.`);
      } else {
        handleShareToast('Copy not supported in this browser');
      }
      logEventIfAvailable('rentals_share_copy', { propertySlug: property?.slug, platform });
      return;
    }

    window.open(shareUrl, '_blank');
  };

  const handleTripCreate = useCallback(
    async (event) => {
      event.preventDefault();
      setFormError('');

      if (!eventTitle.trim()) {
        setFormError('Add a trip title so guests know what you are planning.');
        return;
      }

      if (!organiserName.trim()) {
        setFormError('Add your name so guests know who is hosting.');
        return;
      }

      if (!organiserEmail || !organiserEmail.includes('@')) {
        setFormError('Enter a contact email so we can send your trip poll link.');
        return;
      }

      if (selectedDates.length < 2) {
        setFormError('Pick a start and end date for your travel window.');
        return;
      }

      const orderedDates = selectedDates.slice().sort((a, b) => a - b);
      setIsSubmitting(true);
      try {
        const now = new Date();
        const formattedDates = orderedDates.map((date) => date.toISOString());
        const latestDate = orderedDates[orderedDates.length - 1];

        let effectiveDeadlineHours = deadlineHours;
        if (latestDate instanceof Date && !Number.isNaN(latestDate.getTime())) {
          const endOfLatestDay = new Date(latestDate);
          endOfLatestDay.setHours(23, 59, 59, 999);
          const hoursUntilLatest = Math.ceil(
            (endOfLatestDay.getTime() - now.getTime()) / (1000 * 60 * 60)
          );
          if (Number.isFinite(hoursUntilLatest) && hoursUntilLatest > 0) {
            const maxVotingWindow = hoursUntilLatest;
            effectiveDeadlineHours = Math.min(deadlineHours, maxVotingWindow);
          }
        }

        const deadlineTimestamp = Timestamp.fromDate(
          new Date(now.getTime() + effectiveDeadlineHours * 60 * 60 * 1000)
        );

        const editToken = nanoid(32);
        const pollData = {
          organiserFirstName: organiserName.trim(),
          organiserLastName: '',
          organiserEmail: organiserEmail.trim(),
          organiserPlanType: 'rental',
          organiserUnlocked: true,
          eventTitle: eventTitle.trim(),
          location: property?.locationText || property?.propertyName || 'Trip',
          dates: formattedDates,
          createdAt: Timestamp.now(),
          deadline: deadlineTimestamp,
          editToken,
          entrySource: property?.slug ? `rental:${property.slug}` : 'rental-page',
          eventType: 'holiday',
          eventOptions: { proposedDuration },
          rentalsPropertyId: property?.propertyId || property?.id || null,
          rentalsPropertySlug: property?.slug || null,
          rentalsOwnerId: property?.ownerId || null,
          propertyName: property?.propertyName || null,
          organiserNotes: organiserNotes.trim(),
        };

        const docRef = await addDoc(collection(db, 'polls'), pollData);
        logEventIfAvailable('rentals_trip_poll_created', {
          propertySlug: property?.slug,
          pollId: docRef.id,
        });
        await logRentalEvent('rentals_trip_poll_created', {
          propertyId: property?.propertyId || property?.id,
          propertySlug: property?.slug,
          pollId: docRef.id,
        });
        router.push(`/trip/${docRef.id}?onboarding=1&returnTo=share`);
      } catch (err) {
        console.error('rental trip poll creation failed', err);
        setFormError('Unable to create your trip poll. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      deadlineHours,
      eventTitle,
      organiserEmail,
      organiserName,
      organiserNotes,
      property?.id,
      property?.locationText,
      property?.ownerId,
      property?.propertyId,
      property?.propertyName,
      property?.slug,
      proposedDuration,
      router,
      selectedDates
    ]
  );

  return (
    <>
      <Head>
        <title>{property?.propertyName || 'Rental property'} - Set The Date</title>
      </Head>
      <RentalBrandFrame property={brandedProperty} showLogoAtTop={false}>
        <div className="space-y-10 text-slate-900">
          <RentalPropertyHero
            property={property}
            primaryCtaLabel="Start a trip poll"
            onPrimaryCta={handleCtaScroll}
            showMap
            badgeHref="https://setthedate.app"
            badgeAriaLabel="Visit the Set The Date homepage"
            showBadge={false}
            showBookingCta
          />

          <section
            id="rentals-trip-form"
            ref={pollSectionRef}
            className="rounded-3xl border border-slate-200 bg-white shadow p-6 text-left overflow-hidden"
          >
            <h2 className="text-xl font-semibold text-slate-900 mb-2">
              Plan a trip to {property?.propertyName || 'this property'}
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              Choose a travel window, share the poll, and let your group vote on the best dates to book.
            </p>

            <form onSubmit={handleTripCreate} className="space-y-4">
              <div>
                <label htmlFor="eventTitle" className="text-sm font-medium text-slate-600 block mb-1">
                  Trip title
                </label>
                <input
                  id="eventTitle"
                  type="text"
                  value={eventTitle}
                  onChange={(event) => setEventTitle(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 outline-none transition"
                  placeholder="e.g. Summer getaway"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="organiserName" className="text-sm font-medium text-slate-600 block mb-1">
                    Your name
                  </label>
                  <input
                    id="organiserName"
                    type="text"
                    value={organiserName}
                    onChange={(event) => setOrganiserName(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 outline-none transition"
                    placeholder="e.g. Jess"
                  />
                </div>
                <div>
                  <label htmlFor="organiserEmail" className="text-sm font-medium text-slate-600 block mb-1">
                    Email
                  </label>
                  <input
                    id="organiserEmail"
                    type="email"
                    value={organiserEmail}
                    onChange={(event) => setOrganiserEmail(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 outline-none transition"
                    placeholder="you@email.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="proposedDuration" className="text-sm font-medium text-slate-600 block mb-1">
                  Preferred stay length
                </label>
                <select
                  id="proposedDuration"
                  value={proposedDuration}
                  onChange={(event) => setProposedDuration(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 outline-none transition bg-white"
                >
                  {HOLIDAY_DURATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {proposedDuration && (
                  <p className="text-xs text-slate-500 mt-1">
                    Ideal trip length: {getHolidayDurationLabel(proposedDuration)}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-700">Travel window</p>
                <p className="text-xs text-slate-500 mt-1">{travelWindowLabel}</p>
                <DateSelector
                  selectedDates={selectedDates}
                  setSelectedDates={setSelectedDates}
                  eventType="holiday"
                  blockedRanges={blockedRanges}
                />
                <p className="text-xs text-slate-500 mt-2">
                  Unavailable dates are crossed out based on the property calendar.
                </p>
              </div>

              <div>
                <label htmlFor="pollDeadline" className="text-sm font-medium text-slate-600 block mb-1">
                  How long should voting stay open?
                </label>
                <select
                  id="pollDeadline"
                  value={deadlineHours}
                  onChange={(event) => setDeadlineHours(Number(event.target.value))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 outline-none transition bg-white"
                >
                  {DEADLINE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="organiserNotes" className="text-sm font-medium text-slate-600 block mb-1">
                  Notes for your group (optional)
                </label>
                <textarea
                  id="organiserNotes"
                  value={organiserNotes}
                  onChange={(event) => setOrganiserNotes(event.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 outline-none transition"
                  placeholder="e.g. Prefer mid-week flights or flexible dates."
                />
              </div>

              {formError && <p className="text-sm text-rose-600">{formError}</p>}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-full bg-slate-900 text-white font-semibold py-3 shadow disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Creating your trip poll...' : 'Create trip poll'}
              </button>
            </form>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white shadow p-6 text-left">
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Share this property</h2>
            <p className="text-sm text-slate-600 mb-4">
              Share this page with your group to plan dates.
            </p>
            <ShareButtonsLayout onShare={handleShare} />
            {shareToast && <p className="text-xs font-semibold text-emerald-600 mt-3">{shareToast}</p>}
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={property?.bookingUrl || shareLinks.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-full bg-slate-900 text-white font-semibold px-6 py-3"
              >
                Visit listing
              </a>
              <button
                type="button"
                onClick={() => handleShare('copy')}
                className="inline-flex items-center justify-center rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 hover:border-slate-900"
              >
                Copy share link
              </button>
            </div>
          </section>
        </div>
      </RentalBrandFrame>
    </>
  );
}

export async function getServerSideProps({ params }) {
  const slug = typeof params?.slug === 'string' ? params.slug.toLowerCase() : null;
  if (!slug) {
    return { notFound: true };
  }

  const { db } = await import('@/lib/firebaseAdmin');
  const snapshot = await db
    .collection('rentalsProperties')
    .where('slug', '==', slug)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return { notFound: true };
  }

  const propertyDoc = snapshot.docs[0];
  const propertyData = propertyDoc.data();
  const ownerId = propertyData?.ownerId || null;
  let ownerData = null;

  if (ownerId) {
    const ownerSnap = await db.collection('rentalsOwners').doc(ownerId).get();
    if (ownerSnap.exists) {
      ownerData = ownerSnap.data();
    }
  }

  const normalized = normalizeRentalProperty(
    { ...propertyData, propertyId: propertyDoc.id },
    slug
  );
  const defaults = ownerData?.brandingDefaults || {};
  const merged = {
    ...normalized,
    blockedRanges: Array.isArray(normalized?.blockedRanges) ? normalized.blockedRanges : [],
    logoUrl: normalized.logoUrl || defaults.logoUrl || '',
    accentColor: normalized.accentColor || defaults.accentColor || DEFAULT_ACCENT,
    heroImageUrl:
      normalized.heroImageUrl || defaults.heroImageUrl || normalized.images?.[0] || '',
    introText: normalized.introText || defaults.introText || '',
    ownerName: ownerData?.name || '',
    ownerEmail: ownerData?.email || '',
  };

  if (merged.active === false) {
    return { notFound: true };
  }

  return {
    props: {
      property: merged,
    },
  };
}

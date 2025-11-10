import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { nanoid } from 'nanoid';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import PartnerBrandFrame from '@/components/PartnerBrandFrame';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';
import { buildPartnerLinks, normalizePartnerRecord } from '@/lib/partners/emailTemplates';
import { db } from '@/lib/firebase';

const DateSelector = dynamic(() => import('@/components/DateSelector'), { ssr: false });
const MEAL_OPTIONS = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'brunch', label: 'Brunch' },
  { id: 'coffee', label: 'Coffee' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'lunch_drinks', label: 'Lunch drinks' },
  { id: 'afternoon_tea', label: 'Afternoon tea' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'evening', label: 'Evening out' },
];

export default function PartnerPublicPage({ partner }) {
  const router = useRouter();
  const defaultEventTitle = useMemo(() => {
    if (partner?.venueName) {
      return `Night at ${partner.venueName}`;
    }
    return 'Set The Date event';
  }, [partner?.venueName]);
  const [eventTitle, setEventTitle] = useState(defaultEventTitle);
  const [organiserName, setOrganiserName] = useState('');
  const [organiserEmail, setOrganiserEmail] = useState('');
  const [selectedDates, setSelectedDates] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (partner?.slug) {
      logEventIfAvailable('partner_public_page_view', { partner: partner.slug });
    }
  }, [partner?.slug]);

  if (!partner) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900">
        <p>Partner not found.</p>
      </main>
    );
  }

  const mealOptions = useMemo(() => {
    if (Array.isArray(partner?.allowedMealTags) && partner.allowedMealTags.length) {
      return MEAL_OPTIONS.filter((option) => partner.allowedMealTags.includes(option.id));
    }
    return MEAL_OPTIONS;
  }, [partner?.allowedMealTags]);

  const initialMealSelection = useMemo(() => {
    if (mealOptions.length) {
      return mealOptions.slice(0, Math.min(2, mealOptions.length)).map((option) => option.id);
    }
    return [];
  }, [mealOptions]);

  const [mealTimes, setMealTimes] = useState(initialMealSelection);
  const venueGallery = useMemo(() => {
    if (Array.isArray(partner?.venuePhotoGallery) && partner.venuePhotoGallery.length) {
      return partner.venuePhotoGallery;
    }
    return partner?.venuePhotoUrl ? [partner.venuePhotoUrl] : [];
  }, [partner?.venuePhotoGallery, partner?.venuePhotoUrl]);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  useEffect(() => {
    setMealTimes((prev) => {
      if (prev.length) {
        return prev.filter((item) => mealOptions.some((option) => option.id === item));
      }
      return initialMealSelection;
    });
  }, [mealOptions, initialMealSelection]);

  useEffect(() => {
    if (!venueGallery.length) {
      setActivePhotoIndex(0);
      return;
    }
    setActivePhotoIndex((prev) => (prev < venueGallery.length ? prev : 0));
  }, [venueGallery]);

  const handleCta = () => {
    logEventIfAvailable('partner_cta_click', { partner: partner.slug });
  };

  const pollSectionRef = useRef(null);
  const ctaHref = '#partner-poll-form';
  const locationLabel = partner.city ? `${partner.venueName}, ${partner.city}` : partner.venueName;
  const fullAddress = partner.fullAddress || '';
  const mapsQuery = encodeURIComponent(fullAddress || locationLabel || partner.city || partner.venueName);
  const mapsEmbedUrl = `https://www.google.com/maps?q=${mapsQuery}&output=embed`;
  const bookingUrl = partner.bookingUrl;
  useEffect(() => {
    setEventTitle(defaultEventTitle);
  }, [defaultEventTitle]);

  const activePhoto = venueGallery[activePhotoIndex] || null;
  const thumbnailPhotos = venueGallery
    .map((url, idx) => ({ url, idx }))
    .filter((item) => item.idx !== activePhotoIndex)
    .slice(0, 3);
  const eventTitlePlaceholder = partner?.venueName
    ? `e.g. Celebration at ${partner.venueName}`
    : 'e.g. Birthday dinner with friends';

  const handlePartnerPollCreate = async (event) => {
    event.preventDefault();
    setFormError('');

    if (!eventTitle?.trim()) {
      setFormError('Add an event title so guests know what you are planning.');
      return;
    }

    if (!organiserName?.trim()) {
      setFormError('Add your lead organiser name so guests know who is hosting.');
      return;
    }

    if (!selectedDates.length) {
      setFormError('Pick at least one date.');
      return;
    }

    if (!mealTimes.length) {
      setFormError('Choose at least one time of day.');
      return;
    }

    if (!organiserEmail || !organiserEmail.includes('@')) {
      setFormError('Enter a lead organiser email so we can send you the poll link.');
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date();
      const formattedDates = selectedDates
        .slice()
        .sort((a, b) => a - b)
        .map((date) => date.toISOString());

      const editToken = nanoid(32);
      const trimmedEventTitle = eventTitle.trim() || defaultEventTitle;
      const pollData = {
        organiserFirstName: organiserName.trim(),
        organiserLastName: '',
        organiserEmail: organiserEmail.trim(),
        organiserPlanType: 'venue',
        organiserUnlocked: true,
        eventTitle: trimmedEventTitle,
        location: locationLabel,
        dates: formattedDates,
        createdAt: Timestamp.now(),
        deadline: Timestamp.fromDate(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)),
        editToken,
        entrySource: partner.slug ? `partner:${partner.slug}` : 'partner-page',
        eventType: 'meal',
        eventOptions: { mealTimes },
        partnerSlug: partner.slug,
      };

      const docRef = await addDoc(collection(db, 'polls'), pollData);

      logEventIfAvailable('partner_poll_created', {
        partner: partner.slug,
        pollId: docRef.id,
        selectedDateCount: formattedDates.length,
      });

      router.push(`/share/${docRef.id}`);
    } catch (err) {
      console.error('partner poll creation failed', err);
      setFormError('Unable to create your poll. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCtaScroll = () => {
    handleCta();
    if (pollSectionRef.current) {
      pollSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      router.replace(ctaHref);
    }
  };

  return (
    <PartnerBrandFrame partner={partner} showLogoAtTop={false}>
      <div className="space-y-10 text-slate-900">
        <div id="settings" className="sr-only" aria-hidden="true" />
        <section className="rounded-[32px] border border-slate-200 bg-white shadow-2xl shadow-slate-900/5 p-6 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.85fr)] items-start">
            <div className="space-y-3">
              {venueGallery.length > 0 ? (
                <>
                  <div className="w-full rounded-[32px] overflow-hidden border border-slate-200 shadow">
                    {activePhoto && (
                      <img
                        src={activePhoto}
                        alt={`${partner.venueName} featured photo`}
                        className="w-full h-[22rem] object-cover"
                        loading="lazy"
                      />
                    )}
                  </div>
                  {thumbnailPhotos.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      {thumbnailPhotos.map(({ url, idx }) => (
                        <button
                          type="button"
                          key={`${url}-${idx}`}
                          onClick={() => setActivePhotoIndex(idx)}
                          className="rounded-2xl overflow-hidden border border-slate-200 shadow focus:outline-none focus:ring-2 focus:ring-slate-900/30"
                          aria-label="Show photo preview"
                        >
                          <img src={url} alt={`${partner.venueName} preview ${idx + 1}`} className="w-full h-28 object-cover" loading="lazy" />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-[32px] border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-slate-500">
                  Venue photos coming soon.
                </div>
              )}
              {partner.logoUrl && (
                <div className="inline-flex items-center gap-3 rounded-full border border-slate-200/80 bg-white/80 px-4 py-2 shadow-sm">
                  <img
                    src={partner.logoUrl}
                    alt={`${partner.venueName} logo`}
                    className="h-10 w-auto object-contain"
                  />
                  <span className="text-sm font-medium text-slate-600">{partner.venueName}</span>
                </div>
              )}
            </div>
            <div className="space-y-6 text-left">
              <div className="space-y-3">
                <p className="uppercase tracking-[0.4em] text-xs text-slate-500">Featured venue</p>
                <h1 className="text-3xl md:text-4xl font-semibold leading-tight">
                  Plan your visit to {partner.venueName}
                  {partner.city ? <span> in {partner.city}</span> : null}
                </h1>
                <p className="text-slate-600">
                  {partner.venuePitch ||
                    `Pick a few dates, share the link, and let your friends vote Best/Maybe/No. When your group agrees, lock the table with the ${partner.venueName} team.`}
                </p>
                {partner.slug && (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-4 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.35em] text-slate-500">
                    {partner.slug}
                  </span>
                )}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div>
                  <p className="text-sm text-slate-500">Venue</p>
                  <p className="text-lg font-semibold text-slate-900">{locationLabel}</p>
                  {fullAddress && <p className="text-sm text-slate-600">{fullAddress}</p>}
                </div>
                <div className="flex flex-wrap gap-3">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-full border border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-900 hover:text-white transition"
                  >
                    View on Google Maps
                  </a>
                  {bookingUrl && (
                    <a
                      href={bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-900"
                    >
                      Visit venue site
                    </a>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleCtaScroll}
                  className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:translate-y-px"
                >
                  Start a Set The Date poll
                </button>
                {bookingUrl && (
                  <a
                    href={bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-full border border-slate-300 px-6 py-3 text-base font-semibold text-slate-700 hover:border-slate-900"
                  >
                    More about this venue
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 overflow-hidden bg-white mt-8">
            <div className="bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">
              Map view
            </div>
            <div className="aspect-[4/3] w-full">
              <iframe
                title={`${partner.venueName} map`}
                src={mapsEmbedUrl}
                loading="lazy"
                allowFullScreen
                className="h-full w-full"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </section>

        <section
          id="partner-poll-form"
          ref={pollSectionRef}
          className="rounded-3xl border border-slate-200 bg-white shadow p-6 text-left"
        >
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Pick dates with your group</h2>
          <p className="text-sm text-slate-600 mb-4">
            Add your lead organiser name, choose as many dates as you like, and we&apos;ll spin up a Set The Date poll themed for {partner.venueName}.
          </p>
          <form onSubmit={handlePartnerPollCreate} className="space-y-4">
            <div>
              <label htmlFor="eventTitle" className="text-sm font-medium text-slate-600 block mb-1">
                Event title
              </label>
              <input
                id="eventTitle"
                type="text"
                value={eventTitle}
                onChange={(event) => setEventTitle(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                placeholder={eventTitlePlaceholder}
                required
              />
              <p className="text-xs text-slate-500 mt-1">Shown on your Set The Date poll invite.</p>
            </div>

            <div>
              <label htmlFor="organiserName" className="text-sm font-medium text-slate-600 block mb-1">
                Lead organiser name
              </label>
              <input
                id="organiserName"
                type="text"
                value={organiserName}
                onChange={(event) => setOrganiserName(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 outline-none transition"
                placeholder="e.g. Jamie"
                required
              />
            </div>

            <div>
              <label htmlFor="organiserEmail" className="text-sm font-medium text-slate-600 block mb-1">
                Lead organiser email
              </label>
              <input
                id="organiserEmail"
                type="email"
                value={organiserEmail}
                onChange={(event) => setOrganiserEmail(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 outline-none transition"
                placeholder="We&apos;ll send the poll link here"
                required
              />
            </div>

            <div>
              <p className="text-sm font-medium text-slate-600 mb-2">When are you thinking?</p>
              <div className="flex flex-wrap gap-2">
                {MEAL_OPTIONS.map((option) => {
                  const active = mealTimes.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setMealTimes((prev) =>
                          prev.includes(option.id) ? prev.filter((item) => item !== option.id) : [...prev, option.id]
                        );
                      }}
                      className={`rounded-full px-4 py-2 text-sm font-semibold border transition ${
                        active
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'border-slate-300 text-slate-600 hover:border-slate-900'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <DateSelector selectedDates={selectedDates} setSelectedDates={setSelectedDates} eventType="general" />

            {formError && <p className="text-sm text-rose-600">{formError}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-full bg-slate-900 text-white font-semibold py-3 shadow disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Creating your poll...' : 'Create poll for this venue'}
            </button>
          </form>

          <div className="mt-4 text-sm text-slate-600">
            Want to plan something else?{' '}
            <Link href="/" className="font-semibold text-slate-900 underline">
              Create your own event
            </Link>
          </div>
        </section>

        <div className="flex justify-center pt-2">
          <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-600 shadow">
            <img src="/images/setthedate-logo.png" alt="Set The Date Pro" className="h-8 w-8 rounded-md border border-slate-200" />
            Powered by Set The Date Pro
          </div>
        </div>
      </div>
    </PartnerBrandFrame>
  );
}

export async function getServerSideProps({ params }) {
  const slug = typeof params?.slug === 'string' ? params.slug.toLowerCase() : null;
  if (!slug) {
    return { notFound: true };
  }

  const { db } = await import('@/lib/firebaseAdmin');
  const snapshot = await db.collection('partners').doc(slug).get();
  if (!snapshot.exists) {
    return { notFound: true };
  }

  const partner = normalizePartnerRecord(snapshot.data(), slug);
  return {
    props: {
      partner,
    },
  };
}

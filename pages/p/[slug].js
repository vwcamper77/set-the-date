import { useEffect, useState, useMemo, useRef } from 'react';

import Link from 'next/link';

import dynamic from 'next/dynamic';

import { useRouter } from 'next/router';

import { nanoid } from 'nanoid';

import { addDoc, collection, Timestamp } from 'firebase/firestore';

import { onAuthStateChanged } from 'firebase/auth';

import { format } from 'date-fns';

import PartnerBrandFrame from '@/components/PartnerBrandFrame';

import VenueHero from '@/components/VenueHero';

import PoweredByBadge from '@/components/PoweredByBadge';

import { logEventIfAvailable } from '@/lib/logEventIfAvailable';

import { normalizePartnerRecord } from '@/lib/partners/emailTemplates';
import {
  FEATURED_EVENT_DESCRIPTION_LIMIT,
  FEATURED_EVENT_TITLE_LIMIT,
  MAX_FEATURED_EVENTS,
  dateInputStringToDate,
  normalizeFeaturedEvents,
} from '@/lib/partners/featuredEvents';
import { isAdminEmail } from '@/lib/adminUsers';

import { db, auth } from '@/lib/firebase';



const DateSelector = dynamic(() => import('@/components/DateSelector'), { ssr: false });

const MEAL_OPTIONS = [

  { id: 'breakfast', label: 'Breakfast' },

  { id: 'brunch', label: 'Brunch' },

  { id: 'coffee', label: 'Coffee' },

  { id: 'lunch', label: 'Lunch' },

  { id: 'lunch_drinks', label: 'Lunch drinks' },

  { id: 'afternoon_tea', label: 'Afternoon tea' },

  { id: 'dinner', label: 'Dinner' },

  { id: 'evening', label: 'Drinks' },

];

const ALL_MEAL_TAG_IDS = MEAL_OPTIONS.map((option) => option.id);

const normalizeMealTags = (tags) => {

  const validTags = new Set(ALL_MEAL_TAG_IDS);

  if (!Array.isArray(tags)) {

    return [...ALL_MEAL_TAG_IDS];

  }

  const cleaned = Array.from(

    new Set(

      tags

        .map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : ''))

        .filter((tag) => tag && validTags.has(tag))

    )

  );

  return cleaned.length ? cleaned : [...ALL_MEAL_TAG_IDS];

};

const MAX_GALLERY_PHOTOS = 4;
const DEFAULT_DEADLINE_HOURS = 168;
const DEADLINE_OPTIONS = [
  { value: 24, label: '1 day' },
  { value: 48, label: '2 days' },
  { value: 72, label: '3 days' },
  { value: DEFAULT_DEADLINE_HOURS, label: '1 week (default)' },
  { value: 336, label: '2 weeks' },
];



const fileToDataUrl = (file) =>

  new Promise((resolve, reject) => {

    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);

    reader.onerror = reject;

    reader.readAsDataURL(file);

  });



const deriveGallery = (partner) => {

  if (!partner) return [];

  if (Array.isArray(partner.venuePhotoGallery) && partner.venuePhotoGallery.length) {

    return partner.venuePhotoGallery.filter(Boolean).slice(0, MAX_GALLERY_PHOTOS);

  }

  if (partner.venuePhotoUrl) {

    return [partner.venuePhotoUrl];

  }

  return [];

};



export default function PartnerPublicPage({ partner: initialPartner }) {

  const router = useRouter();

  const [partner, setPartner] = useState(initialPartner);

  const [authUser, setAuthUser] = useState(null);

  const initialGallery = useMemo(() => deriveGallery(initialPartner), [initialPartner]);

  const [settingsForm, setSettingsForm] = useState({

    logoUrl: initialPartner?.logoUrl || '',

    brandColor: initialPartner?.brandColor || '#0f172a',

    venuePhotoUrl: initialPartner?.venuePhotoUrl || initialGallery[0] || '',

    venuePhotos: initialGallery,

    venueName: initialPartner?.venueName || '',

    city: initialPartner?.city || '',

    fullAddress: initialPartner?.fullAddress || '',

    phoneNumber: initialPartner?.phoneNumber || '',

    bookingUrl: initialPartner?.bookingUrl || '',

    venuePitch: initialPartner?.venuePitch || '',

    allowedMealTags: normalizeMealTags(initialPartner?.allowedMealTags),

    contactEmail: initialPartner?.contactEmail || '',
    contactName: initialPartner?.contactName || '',

    featuredEvents: normalizeFeaturedEvents(initialPartner?.featuredEvents || []),

    instagramUrl: initialPartner?.instagramUrl || '',

    facebookUrl: initialPartner?.facebookUrl || '',

    tiktokUrl: initialPartner?.tiktokUrl || '',

    twitterUrl: initialPartner?.twitterUrl || '',

  });

  const [settingsVisible, setSettingsVisible] = useState(false);

  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [savingSettings, setSavingSettings] = useState(false);

  const [settingsError, setSettingsError] = useState('');

  const [settingsMessage, setSettingsMessage] = useState('');

  const [galleryUploading, setGalleryUploading] = useState(false);

  const [photoUrlInput, setPhotoUrlInput] = useState('');

  const [photoMessage, setPhotoMessage] = useState('');

  const [featuredEventDraft, setFeaturedEventDraft] = useState({
    id: '',
    title: '',
    description: '',
    fixedDates: [],
    isActive: true,
  });
  const [editingFeaturedEventId, setEditingFeaturedEventId] = useState(null);
  const [featuredEventError, setFeaturedEventError] = useState('');

  const defaultEventTitle = useMemo(() => {

    if (partner?.venueName) {

      return `Night at ${partner.venueName}`;

    }

    return 'Set The Date event';

  }, [partner?.venueName]);

  const normalizedAllowedMealTags = useMemo(

    () => normalizeMealTags(partner?.allowedMealTags),

    [partner?.allowedMealTags]

  );

  const [eventTitle, setEventTitle] = useState('');

  const [organiserName, setOrganiserName] = useState('');

  const [organiserEmail, setOrganiserEmail] = useState('');

  const [selectedDates, setSelectedDates] = useState([]);

  const [deadlineHours, setDeadlineHours] = useState(DEFAULT_DEADLINE_HOURS);

  const [votingDeadlineDate, setVotingDeadlineDate] = useState(() => {
    const now = new Date();
    return format(new Date(now.getTime() + DEFAULT_DEADLINE_HOURS * 60 * 60 * 1000), 'EEEE do MMMM yyyy, h:mm a');
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formError, setFormError] = useState('');
  const [selectedFeaturedEventId, setSelectedFeaturedEventId] = useState(null);
  const [lockedDate, setLockedDate] = useState(null);
  const [autoFillHighlight, setAutoFillHighlight] = useState(false);
  const [expandedFeaturedEventId, setExpandedFeaturedEventId] = useState(null);
  const [featuredEventModalId, setFeaturedEventModalId] = useState(null);
  const [featuredDateInput, setFeaturedDateInput] = useState('');
  const [organiserNotes, setOrganiserNotes] = useState('');

  useEffect(() => {
    const now = new Date();
    let previewHours = deadlineHours;

    if (selectedDates.length) {
      const sortedDates = selectedDates.slice().sort((a, b) => a - b);
      const earliestDate = sortedDates[0];
      if (earliestDate instanceof Date && !Number.isNaN(earliestDate.getTime())) {
        const hoursUntilEarliest = Math.floor((earliestDate.getTime() - now.getTime()) / (1000 * 60 * 60));
        if (Number.isFinite(hoursUntilEarliest)) {
          const maxVotingWindow = Math.max(1, hoursUntilEarliest);
          previewHours = Math.min(deadlineHours, maxVotingWindow);
        }
      }
    }

    const previewDeadline = new Date(now.getTime() + previewHours * 60 * 60 * 1000);
    setVotingDeadlineDate(format(previewDeadline, 'EEEE do MMMM yyyy, h:mm a'));
  }, [deadlineHours, selectedDates]);



  useEffect(() => {

    if (!auth) return undefined;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {

      setAuthUser(firebaseUser);

    });

    return () => unsubscribe();

  }, []);



  useEffect(() => {

    const gallery = deriveGallery(partner);

    setSettingsForm({

      logoUrl: partner?.logoUrl || '',

      brandColor: partner?.brandColor || '#0f172a',

      venuePhotoUrl: partner?.venuePhotoUrl || gallery[0] || '',

      venuePhotos: gallery,

      venueName: partner?.venueName || '',

      city: partner?.city || '',

      fullAddress: partner?.fullAddress || '',

      phoneNumber: partner?.phoneNumber || '',

      bookingUrl: partner?.bookingUrl || '',

      venuePitch: partner?.venuePitch || '',

      allowedMealTags: normalizeMealTags(partner?.allowedMealTags),

      contactEmail: partner?.contactEmail || '',
      contactName: partner?.contactName || '',

      featuredEvents: normalizeFeaturedEvents(partner?.featuredEvents || []),

      instagramUrl: partner?.instagramUrl || '',

      facebookUrl: partner?.facebookUrl || '',

      tiktokUrl: partner?.tiktokUrl || '',

      twitterUrl: partner?.twitterUrl || '',

    });

    setPhotoMessage('');

    setPhotoUrlInput('');

    resetFeaturedEventDraft();

  }, [

    partner?.logoUrl,

    partner?.brandColor,

    partner?.venuePhotoUrl,

    partner?.venuePhotoGallery,

    partner?.venueName,

    partner?.city,

    partner?.fullAddress,

    partner?.phoneNumber,

    partner?.bookingUrl,

    partner?.venuePitch,

    partner?.allowedMealTags,

    partner?.contactEmail,
    partner?.contactName,

    partner?.featuredEvents,

    partner?.instagramUrl,

    partner?.facebookUrl,

    partner?.tiktokUrl,

    partner?.twitterUrl,

  ]);



  useEffect(() => {

    if (typeof window === 'undefined') return;

    const evaluateHash = () => {

      setSettingsVisible(window.location.hash === '#settings');

    };

    evaluateHash();

    window.addEventListener('hashchange', evaluateHash);

    return () => window.removeEventListener('hashchange', evaluateHash);

  }, []);



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



  const mealOptions = useMemo(

    () => MEAL_OPTIONS.filter((option) => normalizedAllowedMealTags.includes(option.id)),

    [normalizedAllowedMealTags]

  );



  const [mealTimes, setMealTimes] = useState([]);

  const [mealTimesError, setMealTimesError] = useState(false);



  useEffect(() => {

    setMealTimes((prev) => prev.filter((item) => mealOptions.some((option) => option.id === item)));

  }, [mealOptions]);





  const handleCta = () => {

    logEventIfAvailable('partner_cta_click', { partner: partner.slug });

  };



  const pollSectionRef = useRef(null);

  const mealOptionsRef = useRef(null);

  const logoUploadInputRef = useRef(null);

  const galleryFileInputRef = useRef(null);
  const submitButtonRef = useRef(null);
  const autoFillTimerRef = useRef(null);

  const ctaHref = '#partner-poll-form';

  const loginRedirect = useMemo(() => {
    if (!partner?.slug) return '/venues/login';
    return `/venues/login?redirect=${encodeURIComponent(`/p/${partner.slug}#settings`)}`;
  }, [partner?.slug]);

  const contactEmail = (partner?.contactEmail || '').trim().toLowerCase();

  const authEmail = (authUser?.email || '').trim().toLowerCase();

  const authIsAdmin = isAdminEmail(authEmail);

  const canEditSettings = Boolean(
    authUser && (authIsAdmin || !contactEmail || contactEmail === authEmail)
  );

  const locationLabel = partner.city ? `${partner.venueName}, ${partner.city}` : partner.venueName;

  const eventTitlePlaceholder = partner?.venueName

    ? `e.g. Celebration at ${partner.venueName}`

    : 'e.g. Birthday dinner with friends';

  const featuredEventTitlePlaceholder = partner?.venueName

    ? `e.g. ${partner.venueName} showcase night`

    : 'Opera Night at Bella Vita';

  const featuredEventDescriptionPlaceholder = partner?.venueName

    ? `Explain what makes ${partner.venueName} special, including menus, music, or offers.`

    : 'Special set menu and live music. Limited tables.';

  const featuredEvents = useMemo(

    () => normalizeFeaturedEvents(partner?.featuredEvents || []).filter((event) => event.isActive),

    [partner?.featuredEvents]

  );

  const selectedFeaturedEvent = useMemo(

    () => featuredEvents.find((event) => event.id === selectedFeaturedEventId) || null,

    [featuredEvents, selectedFeaturedEventId]

  );

  useEffect(() => {

    if (!selectedFeaturedEventId) return;

    const stillExists = featuredEvents.some((event) => event.id === selectedFeaturedEventId);

    if (!stillExists) {

      setSelectedFeaturedEventId(null);

      setLockedDate(null);

      setSelectedDates([]);

      setAutoFillHighlight(false);

    }

  }, [featuredEvents, selectedFeaturedEventId]);



  const handleClearFeaturedEventSelection = () => {

    setSelectedFeaturedEventId(null);

    setLockedDate(null);

    setAutoFillHighlight(false);

    if (autoFillTimerRef.current) {

      clearTimeout(autoFillTimerRef.current);

    }

    setSelectedDates([]);

  };



  const handleFeaturedEventSelect = (eventId, specificDate = null) => {

    const target = featuredEvents.find((event) => event.id === eventId);

    if (!target) return;

    setSelectedFeaturedEventId(eventId);

    setEventTitle(target.title || defaultEventTitle);

    const candidateDates =
      Array.isArray(target.fixedDates) && target.fixedDates.length
        ? target.fixedDates
        : target.fixedDate
        ? [target.fixedDate]
        : [];

    const chosenDateStr = specificDate || candidateDates[0] || null;
    const parsedDate = dateInputStringToDate(chosenDateStr);

    if (parsedDate) {
      setSelectedDates([parsedDate]);
      setLockedDate(parsedDate);
    } else {
      setSelectedDates([]);
      setLockedDate(null);
    }

    setFormError('');

    setAutoFillHighlight(true);

    if (autoFillTimerRef.current) {

      clearTimeout(autoFillTimerRef.current);

    }

    autoFillTimerRef.current = setTimeout(() => setAutoFillHighlight(false), 1400);

    const targetNode = submitButtonRef.current || pollSectionRef.current;

    if (targetNode?.scrollIntoView) {

      targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });

    }

  };



  const handleCalendarDatesChange = (dates) => {

    if (lockedDate) {

      setSelectedDates([lockedDate]);

      return;

    }

    const next = Array.isArray(dates) ? dates : [];

    setSelectedDates(next);

  };



  useEffect(() => {

    return () => {

      if (autoFillTimerRef.current) {

        clearTimeout(autoFillTimerRef.current);

      }

    };

  }, []);


  const formatFeaturedDate = (value) => {

    const parsed = dateInputStringToDate(value);

    if (!parsed) return null;

    return format(parsed, 'EEEE do MMMM yyyy');

  };



  const getDescriptionPreview = (text) => {

    if (!text) return '';

    if (text.length <= 275) return text;

    return `${text.slice(0, 275)}...`;

  };

  const renderTextWithLinks = (text) => {

    if (!text) return null;

    const urlRegex = /(https?:\/\/[^\s]+)/gi;

    const pieces = [];

    const lines = text.split(/\r?\n/);

    lines.forEach((line, lineIndex) => {

      const segments = line.split(urlRegex);

      segments.forEach((segment, segmentIndex) => {

        const isUrl = /^https?:\/\/[^\s]+$/i.test(segment);

        pieces.push(

          isUrl ? (

            <a

              key={`seg-${lineIndex}-${segmentIndex}`}

              href={segment}

              target="_blank"

              rel="noopener noreferrer"

              className="underline text-amber-700 break-words"

            >

              {segment}

            </a>

          ) : (

            <span key={`seg-${lineIndex}-${segmentIndex}`}>{segment}</span>

          )

        );

      });

      if (lineIndex < lines.length - 1) {

        pieces.push(<br key={`br-${lineIndex}`} />);

      }

    });

    return pieces;

  };

  const openFeaturedEventModal = (eventId) => setFeaturedEventModalId(eventId);
  const closeFeaturedEventModal = () => setFeaturedEventModalId(null);



  const handlePartnerPollCreate = async (event) => {

    event.preventDefault();

    setFormError('');
    setMealTimesError(false);



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
      setMealTimesError(true);
      if (mealOptionsRef.current?.scrollIntoView) {
        mealOptionsRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      const firstOption = mealOptionsRef.current?.querySelector('button');
      if (firstOption?.focus) {
        firstOption.focus();
      }

      return;

    }



    if (!organiserEmail || !organiserEmail.includes('@')) {

      setFormError('Enter a lead organiser email so we can send you the poll link.');

      return;

    }



    setIsSubmitting(true);

    try {

      const now = new Date();

      const orderedDates = selectedDates.slice().sort((a, b) => a - b);

      const formattedDates = orderedDates.map((date) => date.toISOString());

      const earliestDate = orderedDates[0];

      let effectiveDeadlineHours = deadlineHours;

      if (earliestDate instanceof Date && !Number.isNaN(earliestDate.getTime())) {

        const hoursUntilEarliest = Math.floor((earliestDate.getTime() - now.getTime()) / (1000 * 60 * 60));

        const maxVotingWindow = Math.max(1, hoursUntilEarliest);

        effectiveDeadlineHours = Math.min(deadlineHours, maxVotingWindow);

      }

      const deadlineTimestamp = Timestamp.fromDate(

        new Date(now.getTime() + effectiveDeadlineHours * 60 * 60 * 1000)

      );



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

        deadline: deadlineTimestamp,

        editToken,

        entrySource: partner.slug ? `partner:${partner.slug}` : 'partner-page',

        eventType: 'meal',

        eventOptions: { mealTimes },

        partnerSlug: partner.slug,

        organiserNotes: organiserNotes ? organiserNotes.trim() : '',
        featuredEventId: selectedFeaturedEvent?.id || null,
        featuredEventTitle: selectedFeaturedEvent?.title || null,
        featuredEventDescription: selectedFeaturedEvent?.description || null,
        featuredEventDates: Array.isArray(selectedFeaturedEvent?.fixedDates)
          ? selectedFeaturedEvent.fixedDates
          : selectedFeaturedEvent?.fixedDate
          ? [selectedFeaturedEvent.fixedDate]
          : [],

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



  const handleCloseSettings = () => {

    if (typeof window !== 'undefined') {

      const base = `${window.location.pathname}${window.location.search || ''}`;

      window.history.replaceState(null, document.title, base);

    }

    setSettingsVisible(false);

  };



  const handleLogoFileChange = async (event) => {

    setSettingsError('');

    setSettingsMessage('');

    const file = event.target.files?.[0];

    if (!file) return;

    if (!authUser) {

      setSettingsError('Sign in to upload a new logo.');

      event.target.value = '';

      return;

    }

    if (!file.type.startsWith('image/')) {

      setSettingsError('Please upload an image file (PNG, JPG, or SVG).');

      event.target.value = '';

      return;

    }

    if (!partner?.slug) {

      setSettingsError('This venue is missing a slug. Refresh or contact support.');

      event.target.value = '';

      return;

    }

    setUploadingLogo(true);

    try {

      const dataUrl = await fileToDataUrl(file);

      const token = await authUser.getIdToken();

      const response = await fetch('/api/partners/uploadLogo', {

        method: 'POST',

        headers: {

          'Content-Type': 'application/json',

          Authorization: `Bearer ${token}`,

        },

        body: JSON.stringify({

          slug: partner.slug,

          fileName: file.name,

          contentType: file.type,

          dataUrl,

          target: 'logo',

        }),

      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload?.url) {

        throw new Error(payload?.error || 'Unable to upload logo.');

      }

      setSettingsForm((prev) => ({ ...prev, logoUrl: payload.url }));

      setSettingsMessage('Logo uploaded. Click Save changes to publish it.');

    } catch (error) {

      console.error('partner logo upload failed', error);

      setSettingsError(error?.message || 'Unable to upload logo right now. Please try again.');

    } finally {

      setUploadingLogo(false);

      if (event.target) {

        event.target.value = '';

      }

    }

  };



  const handleGalleryFileChange = async (event) => {

    setPhotoMessage('');

    const file = event.target.files?.[0];

    if (!file) return;

    if (!authUser) {

      setSettingsError('Sign in to upload venue photos.');

      event.target.value = '';

      return;

    }

    if (!file.type.startsWith('image/')) {

      setPhotoMessage('Please upload an image file.');

      event.target.value = '';

      return;

    }

    if (!partner?.slug) {

      setSettingsError('This venue is missing a slug. Refresh or contact support.');

      event.target.value = '';

      return;

    }

    if ((settingsForm.venuePhotos || []).length >= MAX_GALLERY_PHOTOS) {

      setPhotoMessage(`You can upload up to ${MAX_GALLERY_PHOTOS} venue photos.`);

      event.target.value = '';

      return;

    }

    setGalleryUploading(true);

    try {

      const dataUrl = await fileToDataUrl(file);

      const token = await authUser.getIdToken();

      const response = await fetch('/api/partners/uploadLogo', {

        method: 'POST',

        headers: {

          'Content-Type': 'application/json',

          Authorization: `Bearer ${token}`,

        },

        body: JSON.stringify({

          slug: partner.slug,

          fileName: file.name,

          contentType: file.type,

          dataUrl,

          target: 'gallery',

        }),

      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload?.url) {

        throw new Error(payload?.error || 'Unable to upload photo.');

      }

      setSettingsForm((prev) => {

        const nextPhotos = [...(prev.venuePhotos || []), payload.url].slice(0, MAX_GALLERY_PHOTOS);

        return {

          ...prev,

          venuePhotos: nextPhotos,

          venuePhotoUrl: prev.venuePhotoUrl || nextPhotos[0] || '',

        };

      });

      setPhotoMessage('Photo uploaded. Remember to save changes.');

    } catch (error) {

      console.error('partner gallery upload failed', error);

      setPhotoMessage(error?.message || 'Unable to upload photo right now.');

    } finally {

      setGalleryUploading(false);

      if (event.target) {

        event.target.value = '';

      }

    }

  };



  const handleSettingsFieldChange = (field) => (event) => {

    const { value } = event.target;

    setSettingsForm((prev) => ({ ...prev, [field]: value }));

  };



  const handleAllowedMealTagToggle = (tagId) => {

    setSettingsError('');

    setSettingsMessage('');

    setSettingsForm((prev) => {

      const existing = Array.isArray(prev.allowedMealTags) ? prev.allowedMealTags : [];

      const exists = existing.includes(tagId);

      const next = exists ? existing.filter((item) => item !== tagId) : [...existing, tagId];

      const ordered = ALL_MEAL_TAG_IDS.filter((id) => next.includes(id));

      return { ...prev, allowedMealTags: ordered };

    });

  };



  const handleAddPhotoFromUrl = () => {

    setPhotoMessage('');

    const trimmed = photoUrlInput.trim();

    if (!trimmed) {

      setPhotoMessage('Paste a photo URL first.');

      return;

    }

    try {

      // Validate URL

      const url = new URL(trimmed);

      setSettingsForm((prev) => {

        const existing = Array.isArray(prev.venuePhotos) ? prev.venuePhotos : [];

        if (existing.length >= MAX_GALLERY_PHOTOS) {

          setPhotoMessage(`You can upload up to ${MAX_GALLERY_PHOTOS} venue photos.`);

          return prev;

        }

        if (existing.includes(url.toString())) {

          setPhotoMessage('This photo is already in your gallery.');

          return prev;

        }

        const nextPhotos = [...existing, url.toString()];

        return {

          ...prev,

          venuePhotos: nextPhotos,

          venuePhotoUrl: prev.venuePhotoUrl || nextPhotos[0] || '',

        };

      });

      setPhotoUrlInput('');

      setPhotoMessage('Photo added.');

    } catch {

      setPhotoMessage('Enter a valid https:// photo URL.');

    }

  };



  const handleRemovePhoto = (index) => {

    setSettingsForm((prev) => {

      const existing = Array.isArray(prev.venuePhotos) ? prev.venuePhotos : [];

      const nextPhotos = existing.filter((_, idx) => idx !== index);

      const nextHero = nextPhotos.length

        ? nextPhotos.includes(prev.venuePhotoUrl)

          ? prev.venuePhotoUrl

          : nextPhotos[0]

        : '';

      return {

        ...prev,

        venuePhotos: nextPhotos,

        venuePhotoUrl: nextHero,

      };

    });

  };



  const handleSetHeroPhoto = (url) => {

    setSettingsForm((prev) => ({ ...prev, venuePhotoUrl: url }));

  };



  const resetFeaturedEventDraft = () => {

    setFeaturedEventDraft({

      id: '',

      title: '',

      description: '',

      fixedDates: [],

      isActive: true,

    });

    setEditingFeaturedEventId(null);

    setFeaturedEventError('');

    setFeaturedDateInput('');

  };



  const handleFeaturedEventFieldChange = (field) => (event) => {

    const nextValue = field === 'isActive' ? event.target.checked : event.target.value;

    setFeaturedEventDraft((prev) => ({ ...prev, [field]: nextValue }));

    if (featuredEventError) {

      setFeaturedEventError('');

    }

  };

  const handleAddFeaturedDate = (dateStr) => {

    if (!dateStr) return;

    setFeaturedEventDraft((prev) => {

      const existing = Array.isArray(prev.fixedDates) ? prev.fixedDates : [];

      const cleaned = dateStr.trim();

      if (!cleaned || existing.includes(cleaned)) return prev;

      return { ...prev, fixedDates: [...existing, cleaned] };

    });

  };



  const handleRemoveFeaturedDate = (dateStr) => {

    setFeaturedEventDraft((prev) => {

      const existing = Array.isArray(prev.fixedDates) ? prev.fixedDates : [];

      return { ...prev, fixedDates: existing.filter((d) => d !== dateStr) };

    });

  };



  const handleEditFeaturedEvent = (eventId) => {

    const existing = (settingsForm.featuredEvents || []).find((item) => item.id === eventId);

    if (!existing) return;

    setEditingFeaturedEventId(eventId);

    setFeaturedEventDraft({

      id: existing.id,

      title: existing.title || '',

      description: existing.description || '',

      fixedDate: existing.fixedDate || null,

      isActive: existing.isActive !== false,

    });

    setFeaturedEventError('');

  };



  const handleDeleteFeaturedEvent = (eventId) => {

    setSettingsForm((prev) => {

      const existing = Array.isArray(prev.featuredEvents) ? prev.featuredEvents : [];

      return { ...prev, featuredEvents: existing.filter((item) => item.id !== eventId) };

    });

    if (editingFeaturedEventId === eventId) {

      resetFeaturedEventDraft();

    }

  };

  const handleDuplicateFeaturedEvent = (eventId) => {

    const existing = (settingsForm.featuredEvents || []).find((item) => item.id === eventId);

    if (!existing) return;

    setEditingFeaturedEventId(null);

    setFeaturedEventDraft({

      id: '',

      title: existing.title || '',

      description: existing.description || '',

      fixedDate: null,

      isActive: existing.isActive !== false,

    });

    setFeaturedEventError('');

  };



  const handleSaveFeaturedEventDraft = () => {

    const title = (featuredEventDraft.title || '').trim();

    if (!title) {

      setFeaturedEventError(

        `Add a title for this featured event at ${partner?.venueName || 'your venue'}.`

      );

      return;

    }

    const description = (featuredEventDraft.description || '')

      .trim()

      .slice(0, FEATURED_EVENT_DESCRIPTION_LIMIT);

    const fixedDates = Array.isArray(featuredEventDraft.fixedDates)
      ? featuredEventDraft.fixedDates.filter(Boolean)
      : [];
    const fixedDate = fixedDates[0] || null;

    const eventId = editingFeaturedEventId || featuredEventDraft.id || nanoid(10);

    const currentCount = Array.isArray(settingsForm.featuredEvents)

      ? settingsForm.featuredEvents.length

      : 0;

    if (!editingFeaturedEventId && currentCount >= MAX_FEATURED_EVENTS) {

      setFeaturedEventError(`You can add up to ${MAX_FEATURED_EVENTS} featured events.`);

      return;

    }

    const nextEvent = {

      id: eventId,

      title,

      description,

      fixedDate,
      fixedDates,

      isActive: Boolean(featuredEventDraft.isActive),

    };

    setSettingsForm((prev) => {

      const existing = Array.isArray(prev.featuredEvents) ? prev.featuredEvents : [];

      const hasExisting = existing.some((item) => item.id === eventId);

      if (hasExisting) {

        return {

          ...prev,

          featuredEvents: existing.map((item) => (item.id === eventId ? nextEvent : item)),

        };

      }

      return { ...prev, featuredEvents: [...existing, nextEvent] };

    });

    resetFeaturedEventDraft();

  };



  const handleResetSettings = () => {

    const confirmed = typeof window === 'undefined'

      ? true

      : window.confirm(

          'Reset all unsaved changes to the last saved venue details? This will discard edits to featured events, photos, and text.'

        );

    if (!confirmed) return;

    const gallery = deriveGallery(partner);

    setSettingsForm({

      logoUrl: partner?.logoUrl || '',

      brandColor: partner?.brandColor || '#0f172a',

      venuePhotoUrl: partner?.venuePhotoUrl || gallery[0] || '',

      venuePhotos: gallery,

      venueName: partner?.venueName || '',

      city: partner?.city || '',

      fullAddress: partner?.fullAddress || '',

      phoneNumber: partner?.phoneNumber || '',

      bookingUrl: partner?.bookingUrl || '',

      venuePitch: partner?.venuePitch || '',

      allowedMealTags: normalizeMealTags(partner?.allowedMealTags),

      contactEmail: partner?.contactEmail || '',
      contactName: partner?.contactName || '',

      featuredEvents: normalizeFeaturedEvents(partner?.featuredEvents || []),

      instagramUrl: partner?.instagramUrl || '',

      facebookUrl: partner?.facebookUrl || '',

      tiktokUrl: partner?.tiktokUrl || '',

      twitterUrl: partner?.twitterUrl || '',

    });

    setPhotoUrlInput('');

    setPhotoMessage('');

    setSettingsError('');

    setSettingsMessage('');

    resetFeaturedEventDraft();

  };



  const handleSaveSettings = async (event) => {

    if (event && typeof event.preventDefault === 'function') {

      event.preventDefault();

    }

    setSettingsError('');

    setSettingsMessage('');

    if (!authUser) {

      setSettingsError('Sign in to save your settings.');

      return;

    }

    if (!partner?.slug) {

      setSettingsError('Missing venue slug. Refresh this page and try again.');

      return;

    }

    const selectedMealTags = Array.isArray(settingsForm.allowedMealTags) ? settingsForm.allowedMealTags : [];

    if (!selectedMealTags.length) {

      setSettingsError('Select at least one time of day your venue offers.');

      return;

    }

    const allowedMealTags = normalizeMealTags(selectedMealTags);

    setSavingSettings(true);

    try {

      const token = await authUser.getIdToken();

      const response = await fetch('/api/partners/updateAssets', {

        method: 'POST',

        headers: {

          'Content-Type': 'application/json',

          Authorization: `Bearer ${token}`,

        },

        body: JSON.stringify({

          slug: partner.slug,

          logoUrl: settingsForm.logoUrl,

          brandColor: settingsForm.brandColor,

          venuePhotoUrl: settingsForm.venuePhotoUrl,

          venuePhotoGallery: settingsForm.venuePhotos || [],

          venueName: settingsForm.venueName,

          city: settingsForm.city,

          fullAddress: settingsForm.fullAddress,

          phoneNumber: settingsForm.phoneNumber,

          bookingUrl: settingsForm.bookingUrl,

          venuePitch: settingsForm.venuePitch,

          allowedMealTags,

          ...(authIsAdmin && settingsForm.contactEmail
            ? { contactEmail: settingsForm.contactEmail }
            : {}),
          ...(authIsAdmin && settingsForm.contactName ? { contactName: settingsForm.contactName } : {}),

          featuredEvents: normalizeFeaturedEvents(settingsForm.featuredEvents || []),

          instagramUrl: settingsForm.instagramUrl,

          facebookUrl: settingsForm.facebookUrl,

          tiktokUrl: settingsForm.tiktokUrl,

          twitterUrl: settingsForm.twitterUrl,

        }),

      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {

        throw new Error(payload?.error || 'Unable to save settings.');

      }

      if (payload?.partner) {

        setPartner(payload.partner);

      }

      setSettingsMessage('Venue details updated.');

    } catch (error) {

      console.error('partner settings save failed', error);

      setSettingsError(error?.message || 'Unable to save settings.');

    } finally {

      setSavingSettings(false);

    }

  };



  const manageFeaturedEventsSection = (

    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-4">

      <div className="flex items-center justify-between gap-3">

        <div>

          <p className="text-sm font-semibold text-slate-800">Manage Featured Events</p>

          <p className="text-xs text-slate-600">

            Create pre-set events guests can tap to auto-fill the poll title and date.

          </p>

          <p className="text-[11px] text-slate-500">

            {(settingsForm.featuredEvents || []).length}/{MAX_FEATURED_EVENTS} saved

          </p>

        </div>

        <button

          type="button"

          onClick={resetFeaturedEventDraft}

          className="rounded-full border border-slate-300 px-4 py-1 text-xs font-semibold text-slate-700 hover:border-slate-900"

        >

          Add new event

        </button>

      </div>

      {Array.isArray(settingsForm.featuredEvents) && settingsForm.featuredEvents.length ? (

        <ul className="space-y-3">

          {settingsForm.featuredEvents.map((event) => (

            <li

              key={event.id}

              className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"

            >

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

                <div className="space-y-1">

                  <p className="text-sm font-semibold text-slate-900">{event.title}</p>

                  <p className="text-xs text-slate-500">

                    {Array.isArray(event.fixedDates) && event.fixedDates.length

                      ? `${event.fixedDates.length} date${event.fixedDates.length === 1 ? '' : 's'}`

                      : event.fixedDate

                      ? `Fixed date: ${event.fixedDate}`

                      : 'Flexible date'}

                    {event.isActive ? ' - Active' : ' - Hidden'}

                  </p>

                  {Array.isArray(event.fixedDates) && event.fixedDates.length ? (

                    <div className="flex flex-wrap gap-2">

                      {event.fixedDates.map((date) => (

                        <span

                          key={`${event.id}-${date}`}

                          className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700"

                        >

                          {formatFeaturedDate(date) || date}

                        </span>

                      ))}

                    </div>

                  ) : null}

                  {event.description ? (

                    <div className="text-sm text-slate-600 whitespace-pre-line">

                      {renderTextWithLinks(event.description)}

                    </div>

                  ) : null}

                </div>

                <div className="flex gap-2 shrink-0">

                  <button

                    type="button"

                    onClick={() => handleEditFeaturedEvent(event.id)}

                    className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:border-slate-900"

                  >

                    Edit

                  </button>

                  <button

                    type="button"

                    onClick={() => handleDuplicateFeaturedEvent(event.id)}

                    className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:border-slate-900"

                  >

                    Duplicate

                  </button>

                  <button

                    type="button"

                    onClick={() => handleDeleteFeaturedEvent(event.id)}

                    className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 hover:border-rose-500"

                  >

                    Delete

                  </button>

                </div>

              </div>

            </li>

          ))}

        </ul>

      ) : (

        <p className="text-xs text-slate-600">

          No featured events yet. Add one to pre-fill the organiser poll with your preferred title and date.

        </p>

      )}

      <div className="grid gap-4 md:grid-cols-2">

        <div>

          <label htmlFor="featuredEventTitle" className="text-sm font-semibold text-slate-700 mb-1 block">

            Title*

          </label>

          <input

            id="featuredEventTitle"

            type="text"

            value={featuredEventDraft.title}

            onChange={handleFeaturedEventFieldChange('title')}

            maxLength={FEATURED_EVENT_TITLE_LIMIT}

            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"

            placeholder={featuredEventTitlePlaceholder}

          />

          <p className="text-[11px] text-slate-500 mt-1">

            Up to {FEATURED_EVENT_TITLE_LIMIT} characters.

          </p>

        </div>

        <div className="flex items-center gap-2 pt-6">

          <input

            id="featuredEventActive"

            type="checkbox"

            checked={featuredEventDraft.isActive}

            onChange={handleFeaturedEventFieldChange('isActive')}

            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"

          />

          <label htmlFor="featuredEventActive" className="text-sm text-slate-700">

            Active (show on the public page)

          </label>

        </div>

      </div>

      <div>

        <label htmlFor="featuredEventDescription" className="text-sm font-semibold text-slate-700 mb-1 block">

          Description

        </label>

        <textarea

          id="featuredEventDescription"

          rows={2}

          maxLength={FEATURED_EVENT_DESCRIPTION_LIMIT}

          value={featuredEventDraft.description}

          onChange={handleFeaturedEventFieldChange('description')}

          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"

          placeholder={featuredEventDescriptionPlaceholder}

        />

        <p className="text-xs text-slate-500 mt-1">

          Up to {FEATURED_EVENT_DESCRIPTION_LIMIT} characters. Links stay clickable; we show the first 275 on the public card.

        </p>

      </div>

      <div>

        <label htmlFor="featuredEventDate" className="text-sm font-semibold text-slate-700 mb-1 block">

          Specific dates (optional)

        </label>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">

          <input

            id="featuredEventDate"

            type="date"

            value={featuredDateInput}

            onChange={(event) => setFeaturedDateInput(event.target.value || '')}

            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"

          />

          <button

            type="button"

            onClick={() => {

              if (featuredDateInput) {

                handleAddFeaturedDate(featuredDateInput);

                setFeaturedDateInput('');

              }

            }}

            className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:border-slate-900"

          >

            Add date

          </button>

          {featuredEventDraft.fixedDates?.length ? (

            <div className="flex flex-wrap gap-2">

              {featuredEventDraft.fixedDates.map((date) => (

                <span

                  key={date}

                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"

                >

                  {formatFeaturedDate(date) || date}

                  <button

                    type="button"

                    onClick={() => handleRemoveFeaturedDate(date)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                    aria-label="Remove date"
                  >
                    ✕
                  </button>

                </span>

              ))}

            </div>

          ) : null}

        </div>

        <p className="text-xs text-slate-500 mt-1">

          Add one or more fixed dates. Leave empty to keep the poll flexible.

        </p>

      </div>

      {featuredEventError && (

        <p className="text-sm text-rose-600">{featuredEventError}</p>

      )}

      <div className="flex flex-wrap gap-3 justify-end">

        <button

          type="button"

          onClick={resetFeaturedEventDraft}

          className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:border-slate-900"

        >

          Cancel

        </button>

        <button

          type="button"

          onClick={handleSaveFeaturedEventDraft}

          className="rounded-full bg-slate-900 text-white px-5 py-2 text-sm font-semibold shadow disabled:opacity-60 disabled:cursor-not-allowed"

        >

          {editingFeaturedEventId ? 'Update event' : 'Add event'}

        </button>

      </div>

    </div>

  );



  return (
    <>
      <div id="settings" className="h-0" aria-hidden="true" />

      <PartnerBrandFrame partner={partner} showLogoAtTop={false}>
        <div className="space-y-10 text-slate-900">

        {settingsVisible && (
          <section className="rounded-3xl border border-slate-200 bg-white shadow p-6 space-y-4">

            <header className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">

              <div>

                <p className="uppercase tracking-[0.35em] text-xs text-slate-500">Venue settings</p>

                <h2 className="text-2xl font-semibold text-slate-900">Edit your partner page</h2>

                <p className="text-sm text-slate-500">

                  Update the name, address, description, logo, and gallery exactly how guests should see them.

                </p>

              </div>

              <button

                type="button"

                onClick={handleCloseSettings}

                className="self-start rounded-full border border-slate-200 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 hover:border-slate-900 hover:text-slate-900"

              >

                Close

              </button>

            </header>



            {settingsError && (

              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-2">

                {settingsError}

              </p>

            )}

            {settingsMessage && (

              <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-2">

                {settingsMessage}

              </p>

            )}



            {!authUser && (

              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">

                <p className="font-semibold">Sign in to edit this venue.</p>

                <p className="mt-1">

                  <Link href={loginRedirect} className="underline font-semibold">

                    Go to the partner login

                  </Link>{' '}

                  and we&apos;ll bring you back here automatically.

                </p>

              </div>

            )}



            {authUser && !canEditSettings && !authIsAdmin && (

              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 space-y-1">

                <p className="font-semibold">This login cannot update the venue yet.</p>

                <p>

                  Signed in as {authUser.email}. Only the partner contact {partner?.contactEmail || 'email on file'} can

                  update these details. Ask them to sign in or contact Set The Date support.

                </p>

              </div>

            )}



            {authUser && canEditSettings && (

              <form onSubmit={handleSaveSettings} className="space-y-6">

                <div className="grid gap-4 md:grid-cols-2">

                  <div>

                    <label htmlFor="venueName" className="text-sm font-semibold text-slate-700 mb-1 block">

                      Venue name

                    </label>

                    <input

                      id="venueName"

                      type="text"

                      value={settingsForm.venueName}

                      onChange={handleSettingsFieldChange('venueName')}

                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900"

                      placeholder="e.g. Will's Sky Bar Loches"

                      required

                    />

                  </div>

                  <div>

                    <label htmlFor="venueCity" className="text-sm font-semibold text-slate-700 mb-1 block">

                      City / area

                    </label>

                    <input

                      id="venueCity"

                      type="text"

                      value={settingsForm.city}

                      onChange={handleSettingsFieldChange('city')}

                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900"

                      placeholder="e.g. Loches, France"

                    />

                  </div>

                </div>

                {authIsAdmin && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label htmlFor="contactEmail" className="text-sm font-semibold text-slate-700 mb-1 block">
                        Contact email (admin only)
                      </label>
                      <input
                        id="contactEmail"
                        type="email"
                        value={settingsForm.contactEmail}
                        onChange={handleSettingsFieldChange('contactEmail')}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900"
                        placeholder="owner@venue.com"
                      />
                    </div>
                    <div>
                      <label htmlFor="contactName" className="text-sm font-semibold text-slate-700 mb-1 block">
                        Contact name (admin only)
                      </label>
                      <input
                        id="contactName"
                        type="text"
                        value={settingsForm.contactName}
                        onChange={handleSettingsFieldChange('contactName')}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900"
                        placeholder="Owner name"
                      />
                    </div>
                  </div>
                )}



                <div>

                  <label htmlFor="venueAddress" className="text-sm font-semibold text-slate-700 mb-1 block">

                    Full address

                  </label>

                  <textarea

                    id="venueAddress"

                    rows={2}

                    value={settingsForm.fullAddress}

                    onChange={handleSettingsFieldChange('fullAddress')}

                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900"

                    placeholder="123 Rue du Chateau, Loches"

                  />

                </div>



                <div>

                  <label htmlFor="phoneNumber" className="text-sm font-semibold text-slate-700 mb-1 block">

                    Phone number

                  </label>

                  <input

                    id="phoneNumber"

                    type="tel"

                    value={settingsForm.phoneNumber}

                    onChange={handleSettingsFieldChange('phoneNumber')}

                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900"

                    placeholder="+44 20 1234 5678"

                  />

                </div>



                <div>

                  <label htmlFor="venuePitch" className="text-sm font-semibold text-slate-700 mb-1 block">

                    Venue description

                  </label>

                  <textarea

                    id="venuePitch"

                    rows={3}

                    value={settingsForm.venuePitch}

                    onChange={handleSettingsFieldChange('venuePitch')}

                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900"

                    placeholder="Tell guests why they should book with you."

                  />

                </div>



                <div className="grid gap-4 md:grid-cols-2">

                  <div>

                    <label htmlFor="bookingUrl" className="text-sm font-semibold text-slate-700 mb-1 block">

                      Booking link (optional)

                    </label>

                    <input

                      id="bookingUrl"

                      type="url"

                      value={settingsForm.bookingUrl}

                      onChange={handleSettingsFieldChange('bookingUrl')}

                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900"

                      placeholder="https://"

                    />

                  </div>

                  <div>

                    <label htmlFor="brandColor" className="text-sm font-semibold text-slate-700 mb-1 block">

                      Brand color

                    </label>

                    <div className="flex items-center gap-3">

                      <input

                        id="brandColor"

                        type="color"

                        value={settingsForm.brandColor}

                        onChange={(event) =>

                          setSettingsForm((prev) => ({ ...prev, brandColor: event.target.value || '#0f172a' }))

                        }

                        className="h-12 w-16 rounded-xl border border-slate-200 bg-white"

                      />

                      <input

                        type="text"

                        value={settingsForm.brandColor}

                        onChange={handleSettingsFieldChange('brandColor')}

                        className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900"

                        placeholder="#0f172a"

                      />

                    </div>

                  </div>

                </div>


                <div>

                  <p className="text-sm font-semibold text-slate-700 mb-1">Times of day you offer</p>

                  <p className="text-xs text-slate-500 mb-2">

                    Guests will only see these options when they create a poll for your venue.

                  </p>

                  <div className="flex flex-wrap gap-2">

                    {MEAL_OPTIONS.map((option) => {

                      const active = (settingsForm.allowedMealTags || []).includes(option.id);

                      return (

                        <button

                          type="button"

                          key={option.id}

                          onClick={() => handleAllowedMealTagToggle(option.id)}

                          className={`rounded-full px-3 py-1 text-sm border ${

                            active

                              ? 'bg-slate-900 text-white border-slate-900'

                              : 'border-slate-300 text-slate-700 hover:border-slate-900'

                          }`}

                        >

                          {option.label}

                        </button>

                      );

                    })}

                  </div>

                  {Array.isArray(settingsForm.allowedMealTags) && !settingsForm.allowedMealTags.length && (

                    <p className="text-xs text-rose-600 mt-1">Select at least one time of day.</p>

                  )}

                </div>



                <div className="grid gap-4 md:grid-cols-2">

                  <div>

                    <label htmlFor="instagramUrl" className="text-sm font-semibold text-slate-700 mb-1 block">

                      Instagram URL

                    </label>

                    <input

                      id="instagramUrl"

                      type="url"

                      value={settingsForm.instagramUrl}

                      onChange={handleSettingsFieldChange('instagramUrl')}

                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900"

                      placeholder="https://instagram.com/yourvenue"

                    />

                  </div>



                  <div>

                    <label htmlFor="facebookUrl" className="text-sm font-semibold text-slate-700 mb-1 block">

                      Facebook URL

                    </label>

                    <input

                      id="facebookUrl"

                      type="url"

                      value={settingsForm.facebookUrl}

                      onChange={handleSettingsFieldChange('facebookUrl')}

                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900"

                      placeholder="https://facebook.com/yourvenue"

                    />

                  </div>

                </div>



                <div className="grid gap-4 md:grid-cols-2">

                  <div>

                    <label htmlFor="tiktokUrl" className="text-sm font-semibold text-slate-700 mb-1 block">

                      TikTok URL

                    </label>

                    <input

                      id="tiktokUrl"

                      type="url"

                      value={settingsForm.tiktokUrl}

                      onChange={handleSettingsFieldChange('tiktokUrl')}

                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900"

                      placeholder="https://www.tiktok.com/@yourvenue"

                    />

                  </div>



                  <div>

                    <label htmlFor="twitterUrl" className="text-sm font-semibold text-slate-700 mb-1 block">

                      X / Twitter URL

                    </label>

                    <input

                      id="twitterUrl"

                      type="url"

                      value={settingsForm.twitterUrl}

                      onChange={handleSettingsFieldChange('twitterUrl')}

                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900"

                      placeholder="https://twitter.com/yourvenue"

                    />

                  </div>

                </div>



                <div className="space-y-3">

                  <label className="text-sm font-semibold text-slate-700 mb-1 block">Logo</label>

                  <div className="flex flex-col gap-4 md:flex-row md:items-center">

                    <div className="flex-1">

                      {settingsForm.logoUrl ? (

                        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 flex items-center justify-center">

                          <img
                            src={settingsForm.logoUrl}
                            alt={`${settingsForm.venueName || 'Venue'} logo preview`}
                            className="h-24 w-auto object-contain"
                          />

                        </div>

                      ) : (

                        <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">

                          No logo uploaded yet.

                        </div>

                      )}

                    </div>

                    <div className="w-full md:w-48">

                      <input

                        type="file"

                        accept="image/*"

                        ref={logoUploadInputRef}

                        onChange={handleLogoFileChange}

                        className="hidden"

                      />

                      <button

                        type="button"

                        onClick={() => logoUploadInputRef.current?.click()}

                        disabled={uploadingLogo || savingSettings}

                        className="w-full rounded-full bg-slate-900 text-white text-sm font-semibold px-4 py-2 disabled:opacity-60 disabled:cursor-not-allowed"

                      >

                        {uploadingLogo ? 'Uploading...' : 'Upload new logo'}

                      </button>

                      <p className="text-xs text-slate-500 mt-2">PNG or SVG recommended, up to 5MB.</p>

                    </div>

                  </div>

                </div>



                <div className="space-y-3">

                  <div className="flex items-center justify-between gap-3">

                    <div>

                      <p className="text-sm font-semibold text-slate-700">Venue photos</p>

                      <p className="text-xs text-slate-500">

                        Add up to {MAX_GALLERY_PHOTOS} photos. Choose a hero photo for the top of the page.

                      </p>

                    </div>

                    <span className="text-xs text-slate-500">

                      {settingsForm.venuePhotos?.length || 0}/{MAX_GALLERY_PHOTOS}

                    </span>

                  </div>

                  {photoMessage && <p className="text-xs text-slate-600">{photoMessage}</p>}

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

                    {(settingsForm.venuePhotos || []).map((photo, idx) => {

                      const isHero = photo === settingsForm.venuePhotoUrl;

                      return (

                        <div
                          key={`${photo}-${idx}`}
                          className="relative rounded-2xl border border-slate-200 overflow-hidden shadow-sm"
                        >
                          <img src={photo} alt="Venue photo" className="h-40 w-full object-cover" />

                          <button

                            type="button"

                            onClick={() => handleRemovePhoto(idx)}

                            className="absolute top-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow hover:bg-rose-50"

                            aria-label="Remove photo"

                          >

                            x

                          </button>

                          <button

                            type="button"

                            onClick={() => handleSetHeroPhoto(photo)}

                            className={`m-3 rounded-full px-3 py-1 text-xs font-semibold ${
                              isHero
                                ? 'bg-slate-900 text-white border border-slate-900'
                                : 'border border-slate-300 text-slate-600 hover:border-slate-900 hover:text-slate-900'
                            }`}

                          >

                            {isHero ? 'Hero photo' : 'Set as hero'}

                          </button>

                        </div>

                      );

                    })}

                  </div>

                  <div className="flex flex-col gap-3 md:flex-row">

                    <input

                      type="url"

                      value={photoUrlInput}

                      onChange={(event) => setPhotoUrlInput(event.target.value)}

                      className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900"

                      placeholder="Paste a photo URL"

                    />

                    <button

                      type="button"

                      onClick={handleAddPhotoFromUrl}

                      className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:border-slate-900"

                    >

                      Add link

                    </button>

                  </div>

                  <div>

                    <input

                      type="file"

                      accept="image/*"

                      ref={galleryFileInputRef}

                      onChange={handleGalleryFileChange}

                      className="hidden"

                    />

                    <button

                      type="button"

                      onClick={() => galleryFileInputRef.current?.click()}

                      disabled={galleryUploading || savingSettings}

                      className="rounded-full bg-slate-900 text-white px-6 py-2 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"

                    >

                      {galleryUploading ? 'Uploading...' : 'Upload photo'}

                    </button>

                  </div>

                </div>





                {manageFeaturedEventsSection}

                <p className="text-xs text-slate-500">

                  Reset clears all unsaved changes in this form, including featured events and gallery edits.

                </p>

                <div className="flex flex-wrap gap-3 justify-end">

                  <button

                    type="button"

                    onClick={handleResetSettings}

                    className="rounded-full border border-slate-300 px-6 py-2 text-sm font-semibold text-slate-600 hover:border-slate-900"

                  >

                    Reset

                  </button>

                  <button

                    type="submit"

                    disabled={savingSettings}

                    className="rounded-full bg-slate-900 text-white font-semibold px-6 py-2 disabled:opacity-60 disabled:cursor-not-allowed"

                  >

                    {savingSettings ? 'Saving...' : 'Save changes'}

                  </button>

                </div>

              </form>

            )}

          </section>
        )}

        <VenueHero

          partner={partner}

          primaryCtaLabel="Start a Set The Date poll"

          onPrimaryCta={handleCtaScroll}

          showMap={false}

          badgeHref="https://setthedate.app"

          badgeAriaLabel="Visit the Set The Date homepage"
 
          showBadge={false}

          showBookingCta={false}

        />
        <section

          id="partner-poll-form"

          ref={pollSectionRef}

          className="rounded-3xl border border-slate-200 bg-white shadow p-6 text-left overflow-hidden"

        >

          <h2 className="text-xl font-semibold text-slate-900 mb-2">Get your group to commit to a date</h2>

          <p className="text-sm text-slate-600 mb-4">
            Add your name and a few possible dates at {partner.venueName}. We&apos;ll create a simple Set The Date poll you can share with friends or colleagues so they tap Best / Maybe / No - and you can see the best date to book in seconds, no logins needed.
          </p>

          <form onSubmit={handlePartnerPollCreate} className="space-y-4">

            {featuredEvents.length > 0 && (
              <div className="space-y-2" suppressHydrationWarning>
                <p className="text-sm font-semibold text-slate-700">
                  Featured events from {partner?.venueName || 'this venue'}
                </p>
                <div className="flex flex-wrap gap-3 pb-2">
                  {featuredEvents.map((event) => {
                    const isSelected = event.id === selectedFeaturedEventId;
                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => handleFeaturedEventSelect(event.id)}
                        className={`min-w-[220px] rounded-2xl border px-4 py-3 text-left transition transform hover:scale-[1.01] ${
                          isSelected
                            ? 'border-amber-500 bg-amber-100 shadow'
                            : 'border-amber-300 bg-amber-50 hover:border-amber-500'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-start gap-2">
                              <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                              <div className="flex flex-wrap gap-2">
                                {Array.isArray(event.fixedDates) && event.fixedDates.length ? (
                                  event.fixedDates.map((dateStr) => {
                                    const formatted = formatFeaturedDate(dateStr) || dateStr;
                                    const isSelectedDate =
                                      selectedFeaturedEventId === event.id &&
                                      lockedDate &&
                                      format(lockedDate, 'yyyy-MM-dd') === dateStr;
                                    return (
                                      <button
                                        key={`${event.id}-${dateStr}`}
                                        type="button"
                                        onClick={(evt) => {
                                          evt.stopPropagation();
                                          handleFeaturedEventSelect(event.id, dateStr);
                                        }}
                                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                          isSelectedDate
                                            ? 'border-amber-600 bg-amber-100 text-amber-700'
                                            : 'border-amber-300 bg-white/80 text-amber-700 hover:border-amber-500'
                                        }`}
                                      >
                                        {formatted}
                                      </button>
                                    );
                                  })
                                ) : event.fixedDate ? (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                    {formatFeaturedDate(event.fixedDate) || event.fixedDate}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            {event.description ? (
                              <>
                                <div className="text-xs text-slate-700 whitespace-pre-line">
                                  {renderTextWithLinks(
                                    expandedFeaturedEventId === event.id
                                      ? event.description
                                      : getDescriptionPreview(event.description)
                                  )}
                                </div>
                                {event.description.length > 275 && (
                                  <button
                                    type="button"
                                    onClick={(evt) => {
                                      evt.stopPropagation();
                                      openFeaturedEventModal(event.id);
                                    }}
                                    className="text-[11px] font-semibold text-amber-700 underline"
                                  >
                                    Show more
                                  </button>
                                )}
                              </>
                            ) : (
                              <p className="text-xs text-slate-500">Tap to auto-fill the poll.</p>
                            )}
                          </div>
                          {!event.fixedDate && !(Array.isArray(event.fixedDates) && event.fixedDates.length) ? (
                            <span className="text-[11px] font-semibold text-amber-700">Flexible</span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {selectedFeaturedEvent && (
                  <div className="flex items-center gap-2 text-xs text-amber-700">
                    <span>Auto-filled from "{selectedFeaturedEvent.title}".</span>
                    <button
                      type="button"
                      onClick={handleClearFeaturedEventSelection}
                      className="underline font-semibold"
                    >
                      Clear selection
                    </button>
                  </div>
                )}

                {featuredEventModalId && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-slate-900/60">
                    <div className="max-w-2xl w-full rounded-3xl bg-white shadow-2xl border border-slate-200 p-6 space-y-3">
                      {(() => {
                        const modalEvent = featuredEvents.find((evt) => evt.id === featuredEventModalId);
                        if (!modalEvent) return null;
                        return (
                          <>
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <p className="text-lg font-semibold text-slate-900">{modalEvent.title}</p>
                                {modalEvent.fixedDate ? (
                                  <p className="text-sm font-semibold text-amber-700">
                                    {formatFeaturedDate(modalEvent.fixedDate) || modalEvent.fixedDate}
                                  </p>
                                ) : (
                                  <p className="text-sm font-semibold text-amber-700">Flexible date</p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={closeFeaturedEventModal}
                                className="text-sm font-semibold text-slate-600 hover:text-slate-900"
                                aria-label="Close"
                              >
                                Close
                              </button>
                            </div>
                            <div className="text-sm text-slate-700 whitespace-pre-line">
                              {renderTextWithLinks(modalEvent.description) || 'No details provided.'}
                            </div>
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={closeFeaturedEventModal}
                                className="rounded-full bg-slate-900 text-white px-4 py-2 text-sm font-semibold"
                              >
                                Close
                              </button>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>

              <label htmlFor="eventTitle" className="text-sm font-medium text-slate-600 block mb-1">

                Event title

              </label>

              <input

                id="eventTitle"

                type="text"

                value={eventTitle}

                onChange={(event) => setEventTitle(event.target.value)}

                className={`w-full rounded-2xl border px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:ring-2 outline-none transition ${
                  autoFillHighlight
                    ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-200'
                    : 'border-slate-200 focus:border-slate-900 focus:ring-slate-900/20'
                }`}

                placeholder={eventTitlePlaceholder}

                required

              />

              <p className="text-xs text-slate-500 mt-1">Shown on your Set The Date poll invite.</p>

            </div>

            <div>

              <label htmlFor="organiserNotes" className="text-sm font-medium text-slate-600 block mb-1">

                Notes for guests (optional)

              </label>

              <textarea

                id="organiserNotes"

                rows={3}

                value={organiserNotes}

                onChange={(event) => setOrganiserNotes(event.target.value)}

                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"

                placeholder="Share menu highlights, arrival time, dress code, or booking notes."

              />

              <p className="text-xs text-slate-500 mt-1">Shown on the share and results pages.</p>

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

              <div className="flex flex-wrap gap-2" ref={mealOptionsRef}>

                {mealOptions.map((option) => {

                  const active = mealTimes.includes(option.id);

                  return (

                    <button

                      key={option.id}

                      type="button"

                      onClick={() => {

                        const exists = mealTimes.includes(option.id);

                        const nextSelection = exists

                          ? mealTimes.filter((item) => item !== option.id)

                          : [...mealTimes, option.id];

                        const orderedSelection = mealOptions

                          .map((item) => item.id)

                          .filter((id) => nextSelection.includes(id));

                        setMealTimes(orderedSelection);

                        if (orderedSelection.length) {

                          setMealTimesError(false);

                          if (formError === 'Choose at least one time of day.') {

                            setFormError('');

                          }

                        }

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

              {mealTimesError && !mealTimes.length && (

                <p className="text-xs text-rose-600 mt-1">

                  Select at least one option so guests know when they can book.

                </p>

              )}

            </div>


            <div className="relative">
              {lockedDate && <div className="absolute inset-0 z-10 rounded-2xl bg-white/40 pointer-events-auto" aria-hidden="true" />}
              <div className={lockedDate ? 'pointer-events-none' : ''}>
                <DateSelector
                  selectedDates={selectedDates}
                  setSelectedDates={handleCalendarDatesChange}
                  eventType="general"
                />
              </div>
            </div>

            {lockedDate && (
              <p className="text-xs text-amber-700 mt-2">
                Date locked to {format(lockedDate, 'EEE dd MMM yyyy')} from "
                {selectedFeaturedEvent?.title || 'featured event'}".{' '}
                <button type="button" onClick={handleClearFeaturedEventSelection} className="underline font-semibold">
                  Clear lock
                </button>
              </p>
            )}

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

              <p className="text-xs text-slate-500 mt-1">

                Voting closes on{' '}

                <span className="font-semibold text-slate-900">{votingDeadlineDate}</span>. We&apos;ll shorten it if your first

                available date happens sooner.

              </p>

            </div>



            {formError && <p className="text-sm text-rose-600">{formError}</p>}



            <button

              ref={submitButtonRef}

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

        <div className="flex justify-center pt-6">
          <PoweredByBadge
            href="https://setthedate.app"
            ariaLabel="Powered by Set The Date"
          />
        </div>

      </div>

    </PartnerBrandFrame>
  </>
);

}


// Hide the global venue promo footer; this branded page already surfaces the CTA.
PartnerPublicPage.showPromoFooter = false;

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


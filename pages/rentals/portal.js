import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signInWithCustomToken, signOut } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import LogoHeader from '@/components/LogoHeader';
import PortalTopNav from '@/components/PortalTopNav';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '@/lib/firebase';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';
import {
  buildRentalLinks,
  buildRentalPostStayEmail,
  buildRentalWebsiteSnippet,
} from '@/lib/rentals/rentalsTemplates';
import { logRentalEvent } from '@/lib/rentals/logRentalEvent';

const DEFAULT_ACCENT = '#0f172a';
const DEFAULT_HERO_FOCUS = 'center';

const IMAGE_PRESETS = {
  logo: { width: 600, height: 600, type: 'image/png', quality: 0.92, maxSizeMb: 3 },
  hero: { width: 1600, height: 1000, type: 'image/jpeg', quality: 0.82, maxSizeMb: 6 },
  gallery: { width: 1600, height: 1200, type: 'image/jpeg', quality: 0.82, maxSizeMb: 6 },
};

const MAX_GALLERY_IMAGES = 12;

const HERO_FOCUS_OPTIONS = [
  { value: 'center', label: 'Center (default)' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
];

const getHeroFocusClass = (value) => {
  if (value === 'top') return 'object-top';
  if (value === 'bottom') return 'object-bottom';
  return 'object-center';
};

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const toSafeFileName = (value = 'image') => {
  const cleaned = String(value)
    .toLowerCase()
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'image';
};

const getFileExtension = (type) => (type === 'image/png' ? 'png' : 'jpg');

const loadImageFromFile = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unable to read image file.'));
    };
    image.src = url;
  });

const compressImageFile = async (file, preset) => {
  const image = await loadImageFromFile(file);
  const canvas = document.createElement('canvas');
  canvas.width = preset.width;
  canvas.height = preset.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas not available in this browser.');
  }
  const scale = Math.max(preset.width / image.width, preset.height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = (preset.width - drawWidth) / 2;
  const offsetY = (preset.height - drawHeight) / 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, preset.width, preset.height);
  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, preset.type, preset.quality)
  );
  if (!blob) {
    throw new Error('Unable to compress image.');
  }
  return blob;
};

const emptyPropertyForm = {
  propertyName: '',
  slug: '',
  locationText: '',
  bookingUrl: '',
  icalUrl: '',
  logoUrl: '',
  accentColor: DEFAULT_ACCENT,
  heroImageUrl: '',
  heroImageFocus: DEFAULT_HERO_FOCUS,
  introText: '',
  images: [],
  active: true,
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['trialing', 'active']);

const isSubscriptionActive = (status) =>
  ACTIVE_SUBSCRIPTION_STATUSES.has(String(status || '').toLowerCase());

export default function RentalsPortalPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [claimsReady, setClaimsReady] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [owner, setOwner] = useState(null);
  const [properties, setProperties] = useState([]);
  const [activePropertyId, setActivePropertyId] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingOwner, setLoadingOwner] = useState(false);
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [portalError, setPortalError] = useState('');
  const [propertyForm, setPropertyForm] = useState(emptyPropertyForm);
  const [editingPropertyId, setEditingPropertyId] = useState(null);
  const [slugEdited, setSlugEdited] = useState(false);
  const [propertyImageInput, setPropertyImageInput] = useState('');
  const [propertySubmitting, setPropertySubmitting] = useState(false);
  const [propertyMessage, setPropertyMessage] = useState('');
  const [propertyError, setPropertyError] = useState('');
  const [showLogoUrlInput, setShowLogoUrlInput] = useState(false);
  const [showHeroUrlInput, setShowHeroUrlInput] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadMessage, setLogoUploadMessage] = useState('');
  const [heroUploading, setHeroUploading] = useState(false);
  const [heroUploadMessage, setHeroUploadMessage] = useState('');
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryUploadMessage, setGalleryUploadMessage] = useState('');
  const [brandingValues, setBrandingValues] = useState({
    logoUrl: '',
    accentColor: DEFAULT_ACCENT,
    heroImageUrl: '',
    introText: '',
  });
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingMessage, setBrandingMessage] = useState('');
  const [brandingError, setBrandingError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [calendarSyncing, setCalendarSyncing] = useState(false);
  const [calendarSyncMessage, setCalendarSyncMessage] = useState('');
  const [calendarSyncError, setCalendarSyncError] = useState('');
  const copyTimerRef = useRef(null);
  const logoUploadInputRef = useRef(null);
  const heroUploadInputRef = useRef(null);
  const galleryUploadInputRef = useRef(null);
  const logoUploadInputId = useId();
  const heroUploadInputId = useId();
  const galleryUploadInputId = useId();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoadingAuth(false);
      setClaimsReady(false);
      setClaimError('');
      if (!firebaseUser) {
        const nextPath =
          typeof router.asPath === 'string' && router.asPath ? router.asPath : '/rentals/portal';
        router.replace(`/rentals/login?redirect=${encodeURIComponent(nextPath)}`);
      }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const ensureClaims = async () => {
      setClaimsReady(false);
      setClaimError('');
      try {
        const tokenResult = await user.getIdTokenResult(true);
        if (tokenResult?.claims?.portalType === 'rentals') {
          if (!cancelled) {
            setClaimsReady(true);
          }
          return;
        }

        const token = await user.getIdToken();
        const response = await fetch('/api/rentals/claim-access', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.token) {
          throw new Error(payload?.error || 'Unable to unlock rentals access.');
        }
        await signInWithCustomToken(auth, payload.token);
        if (!cancelled) {
          setClaimsReady(true);
        }
      } catch (error) {
        console.error('rentals claim access failed', error);
        if (!cancelled) {
          setClaimsReady(true);
          setClaimError(error?.message || 'Unable to unlock rentals access.');
        }
      }
    };

    ensureClaims();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || !claimsReady) return;
    let cancelled = false;
    setLoadingOwner(true);

    const fetchOwner = async () => {
      try {
        const ownerRef = doc(db, 'rentalsOwners', user.uid);
        const snapshot = await getDoc(ownerRef);
        if (cancelled) return;
        if (!snapshot.exists()) {
          setOwner(null);
          setPortalError('This account is not linked to a rentals owner profile yet.');
          await signOut(auth);
          router.replace('/rentals/login');
          return;
        }
        const data = snapshot.data();
        if (!isSubscriptionActive(data?.subscriptionStatus)) {
          setOwner(null);
          setPortalError('Your trial is not active yet. Start a free trial to access the portal.');
          await signOut(auth);
          router.replace('/rentals/pricing');
          return;
        }
        setOwner({ id: snapshot.id, ...data });
        const defaults = data?.brandingDefaults || {};
        setBrandingValues({
          logoUrl: defaults.logoUrl || '',
          accentColor: defaults.accentColor || DEFAULT_ACCENT,
          heroImageUrl: defaults.heroImageUrl || '',
          introText: defaults.introText || '',
        });
      } catch (error) {
        console.error('rentals owner load failed', error);
        if (!cancelled) {
          setPortalError('Unable to load your rentals owner profile right now.');
        }
      } finally {
        if (!cancelled) {
          setLoadingOwner(false);
        }
      }
    };

    fetchOwner();
    return () => {
      cancelled = true;
    };
  }, [claimsReady, router, user]);

  useEffect(() => {
    if (!user || !claimsReady) return;
    let cancelled = false;
    setLoadingProperties(true);

    const fetchProperties = async () => {
      try {
        const propertiesRef = collection(db, 'rentalsProperties');
        const propertiesQuery = query(propertiesRef, where('ownerId', '==', user.uid));
        const snapshot = await getDocs(propertiesQuery);
        if (cancelled) return;
        const docs = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        }));
        setProperties(docs);
        if (docs.length && !docs.some((item) => item.id === activePropertyId)) {
          setActivePropertyId(docs[0].id);
        }
      } catch (error) {
        console.error('rentals properties load failed', error);
        if (!cancelled) {
          setPortalError('Unable to load your properties right now.');
          setProperties([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingProperties(false);
        }
      }
    };

    fetchProperties();
    return () => {
      cancelled = true;
    };
  }, [activePropertyId, claimsReady, user]);

  useEffect(() => {
    if (portalError) return;
    logEventIfAvailable('rentals_portal_view');
  }, [portalError]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setCalendarSyncMessage('');
    setCalendarSyncError('');
  }, [editingPropertyId]);

  const activeProperty = useMemo(() => {
    if (!properties.length) return null;
    return properties.find((item) => item.id === activePropertyId) || properties[0];
  }, [activePropertyId, properties]);
  const editingProperty = useMemo(
    () => (editingPropertyId ? properties.find((item) => item.id === editingPropertyId) : null),
    [editingPropertyId, properties]
  );
  const canSyncIcal = Boolean(editingProperty?.icalUrl && editingProperty.icalUrl.trim());

  const propertyLimit = owner?.propertyLimit;
  const resolvedPropertyLimit =
    typeof propertyLimit === 'number' && Number.isFinite(propertyLimit) ? propertyLimit : null;
  const hasReachedLimit =
    resolvedPropertyLimit !== null && properties.length >= resolvedPropertyLimit;

  const summaryCards = useMemo(() => {
    const liveCount = properties.filter((property) => property.active).length;
    const cards = [
      {
        label: 'Properties live',
        value: liveCount,
        detail: 'Published listings',
      },
      {
        label: 'Total properties',
        value: properties.length,
        detail: 'Linked to this owner',
      },
      {
        label: 'Plan tier',
        value: owner?.planTier ? owner.planTier.toUpperCase() : 'SOLO',
        detail: resolvedPropertyLimit ? `${resolvedPropertyLimit} properties` : 'Custom plan',
      },
    ];

    if (user?.email || owner?.email) {
      cards.push({
        label: 'Signed in as',
        value: user?.email || owner?.email,
        detail: 'Account email',
      });
    }

    return cards;
  }, [owner?.email, owner?.planTier, properties, resolvedPropertyLimit, user?.email]);

  const resetPropertyForm = () => {
    setPropertyForm(emptyPropertyForm);
    setEditingPropertyId(null);
    setSlugEdited(false);
    setPropertyImageInput('');
    setShowLogoUrlInput(false);
    setShowHeroUrlInput(false);
    setLogoUploadMessage('');
    setHeroUploadMessage('');
    setGalleryUploadMessage('');
  };

  const handlePropertyChange = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;

    if (field === 'slug') {
      const trimmed = String(value || '').trim();
      const isEdited = trimmed.length > 0;
      setSlugEdited(isEdited);
      setPropertyForm((prev) => ({
        ...prev,
        slug: isEdited ? value : slugify(prev.propertyName || ''),
      }));
      return;
    }

    if (field === 'propertyName') {
      setPropertyForm((prev) => {
        const next = { ...prev, propertyName: value };
        if (!slugEdited) {
          next.slug = slugify(value);
        }
        return next;
      });
      return;
    }

    setPropertyForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePropertyAddImage = () => {
    const url = propertyImageInput.trim();
    if (!url) return;
    if ((propertyForm.images || []).length >= MAX_GALLERY_IMAGES) {
      setPropertyError(`You can add up to ${MAX_GALLERY_IMAGES} gallery images.`);
      return;
    }
    try {
      const parsed = new URL(url);
      setPropertyForm((prev) => ({
        ...prev,
        images: Array.from(new Set([...(prev.images || []), parsed.toString()])),
      }));
      setPropertyImageInput('');
    } catch {
      setPropertyError('Please enter a valid image URL.');
    }
  };

  const handlePropertyRemoveImage = (url) => {
    setPropertyForm((prev) => ({
      ...prev,
      images: (prev.images || []).filter((item) => item !== url),
    }));
  };

  const handleGalleryMakeFeatured = (url) => {
    setPropertyForm((prev) => {
      const images = Array.isArray(prev.images) ? prev.images : [];
      const next = [url, ...images.filter((item) => item !== url)];
      return { ...prev, images: next };
    });
  };

  const ensureUploadAccess = async (setMessage) => {
    if (!user) {
      setMessage('Sign in to upload images.');
      return false;
    }
    if (!claimsReady || claimError) {
      setMessage('We are still unlocking your rentals access. Try again in a moment.');
      return false;
    }
    try {
      await user.getIdToken(true);
    } catch (error) {
      console.error('rentals upload token refresh failed', error);
    }
    return true;
  };

  const buildUploadPath = (kind, baseName, extension) => {
    const ownerId = user?.uid || 'owner';
    const propertyKey =
      editingPropertyId ||
      slugify(propertyForm.slug || propertyForm.propertyName || editingProperty?.slug || 'property') ||
      'draft';
    const safeBase = baseName || 'image';
    return `rentals-properties/${ownerId}/${propertyKey}/${kind}-${safeBase}-${Date.now()}.${extension}`;
  };

  const getUploadErrorMessage = (error) => {
    if (error?.code === 'storage/retry-limit-exceeded') {
      return 'Upload timed out. Check your connection and try again.';
    }
    if (error?.code === 'storage/unauthorized') {
      return 'Upload blocked. Refresh this page or sign in again to continue.';
    }
    return error?.message || 'Upload failed. Please try again.';
  };

  const handleLogoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLogoUploadMessage('');
    if (!(await ensureUploadAccess(setLogoUploadMessage))) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      setLogoUploadMessage('Please upload an image file.');
      return;
    }
    if (file.size > IMAGE_PRESETS.logo.maxSizeMb * 1024 * 1024) {
      setLogoUploadMessage(`File too large. Keep it under ${IMAGE_PRESETS.logo.maxSizeMb}MB.`);
      return;
    }
    setLogoUploading(true);
    setLogoUploadMessage('Compressing logo...');
    try {
      const blob = await compressImageFile(file, IMAGE_PRESETS.logo);
      const extension = getFileExtension(IMAGE_PRESETS.logo.type);
      const safeName = toSafeFileName(file.name);
      const destination = storageRef(storage, buildUploadPath('logo', safeName, extension));
      setLogoUploadMessage('Uploading logo...');
      await uploadBytes(destination, blob, { contentType: IMAGE_PRESETS.logo.type });
      const url = await getDownloadURL(destination);
      setPropertyForm((prev) => ({ ...prev, logoUrl: url }));
      setShowLogoUrlInput(false);
      setLogoUploadMessage('Logo uploaded.');
    } catch (error) {
      console.error('rentals logo upload failed', error);
      setLogoUploadMessage(getUploadErrorMessage(error));
    } finally {
      setLogoUploading(false);
      if (logoUploadInputRef.current) {
        logoUploadInputRef.current.value = '';
      }
    }
  };

  const handleHeroUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setHeroUploadMessage('');
    if (!(await ensureUploadAccess(setHeroUploadMessage))) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      setHeroUploadMessage('Please upload an image file.');
      return;
    }
    if (file.size > IMAGE_PRESETS.hero.maxSizeMb * 1024 * 1024) {
      setHeroUploadMessage(`File too large. Keep it under ${IMAGE_PRESETS.hero.maxSizeMb}MB.`);
      return;
    }
    setHeroUploading(true);
    setHeroUploadMessage('Compressing hero image...');
    try {
      const blob = await compressImageFile(file, IMAGE_PRESETS.hero);
      const extension = getFileExtension(IMAGE_PRESETS.hero.type);
      const safeName = toSafeFileName(file.name);
      const destination = storageRef(storage, buildUploadPath('hero', safeName, extension));
      setHeroUploadMessage('Uploading hero image...');
      await uploadBytes(destination, blob, { contentType: IMAGE_PRESETS.hero.type });
      const url = await getDownloadURL(destination);
      setPropertyForm((prev) => ({ ...prev, heroImageUrl: url }));
      setShowHeroUrlInput(false);
      setHeroUploadMessage('Hero image uploaded.');
    } catch (error) {
      console.error('rentals hero upload failed', error);
      setHeroUploadMessage(getUploadErrorMessage(error));
    } finally {
      setHeroUploading(false);
      if (heroUploadInputRef.current) {
        heroUploadInputRef.current.value = '';
      }
    }
  };

  const handleGalleryUpload = async (event) => {
    const files = Array.from(event.target.files || []).filter(Boolean);
    if (!files.length) return;
    setGalleryUploadMessage('');

    const existingCount = (propertyForm.images || []).length;
    const availableSlots = MAX_GALLERY_IMAGES - existingCount;
    if (availableSlots <= 0) {
      setGalleryUploadMessage(`You can upload up to ${MAX_GALLERY_IMAGES} gallery images.`);
      return;
    }

    if (!(await ensureUploadAccess(setGalleryUploadMessage))) {
      return;
    }

    const acceptedFiles = files.slice(0, availableSlots);
    const skippedForLimit = files.length - acceptedFiles.length;
    let addedCount = 0;
    let invalidCount = 0;
    let oversizeCount = 0;
    setGalleryUploading(true);
    setGalleryUploadMessage('Uploading gallery images...');

    try {
      const newUrls = [];
      for (const file of acceptedFiles) {
        if (!file.type.startsWith('image/')) {
          invalidCount += 1;
          continue;
        }
        if (file.size > IMAGE_PRESETS.gallery.maxSizeMb * 1024 * 1024) {
          oversizeCount += 1;
          continue;
        }
        const blob = await compressImageFile(file, IMAGE_PRESETS.gallery);
        const extension = getFileExtension(IMAGE_PRESETS.gallery.type);
        const safeName = toSafeFileName(file.name);
        const destination = storageRef(storage, buildUploadPath('gallery', safeName, extension));
        await uploadBytes(destination, blob, { contentType: IMAGE_PRESETS.gallery.type });
        const url = await getDownloadURL(destination);
        newUrls.push(url);
        addedCount += 1;
      }

      if (newUrls.length) {
        setPropertyForm((prev) => ({
          ...prev,
          images: Array.from(new Set([...(prev.images || []), ...newUrls])),
        }));
      }

      const messageParts = [];
      if (addedCount) {
        messageParts.push(`Added ${addedCount} image${addedCount === 1 ? '' : 's'}.`);
      }
      if (skippedForLimit) {
        messageParts.push(`${skippedForLimit} skipped (gallery limit).`);
      }
      if (invalidCount) {
        messageParts.push(`${invalidCount} skipped (not an image).`);
      }
      if (oversizeCount) {
        messageParts.push(`${oversizeCount} skipped (too large).`);
      }
      setGalleryUploadMessage(messageParts.join(' ') || 'No images uploaded.');
    } catch (error) {
      console.error('rentals gallery upload failed', error);
      setGalleryUploadMessage(getUploadErrorMessage(error));
    } finally {
      setGalleryUploading(false);
      if (galleryUploadInputRef.current) {
        galleryUploadInputRef.current.value = '';
      }
    }
  };

  const handleEditProperty = (property) => {
    if (!property) return;
    setEditingPropertyId(property.id);
    setSlugEdited(true);
    setPropertyForm({
      propertyName: property.propertyName || '',
      slug: property.slug || '',
      locationText: property.locationText || '',
      bookingUrl: property.bookingUrl || '',
      icalUrl: property.icalUrl || '',
      logoUrl: property.logoUrl || '',
      accentColor: property.accentColor || DEFAULT_ACCENT,
      heroImageUrl: property.heroImageUrl || '',
      heroImageFocus: property.heroImageFocus || DEFAULT_HERO_FOCUS,
      introText: property.introText || '',
      images: Array.isArray(property.images) ? property.images : [],
      active: Boolean(property.active),
    });
    setPropertyMessage('');
    setPropertyError('');
    setShowLogoUrlInput(false);
    setShowHeroUrlInput(false);
    setLogoUploadMessage('');
    setHeroUploadMessage('');
    setGalleryUploadMessage('');
  };

  const handlePropertySubmit = async (event) => {
    event.preventDefault();
    setPropertyMessage('');
    setPropertyError('');

    if (!user) {
      setPropertyError('Sign in to manage properties.');
      return;
    }

    if (!propertyForm.propertyName.trim()) {
      setPropertyError('Add a property name.');
      return;
    }

    if (!propertyForm.bookingUrl.trim()) {
      setPropertyError('Add a booking link for guests.');
      return;
    }

    if (!editingPropertyId && hasReachedLimit) {
      setPropertyError('You have reached the property limit for this plan.');
      return;
    }

    const slug = propertyForm.slug ? slugify(propertyForm.slug) : slugify(propertyForm.propertyName);
    const trimmedIcalUrl = propertyForm.icalUrl.trim();
    const shouldResetCalendar = !editingPropertyId || (editingProperty?.icalUrl || '') !== trimmedIcalUrl;
    if (!slug) {
      setPropertyError('Add a property slug for your public page.');
      return;
    }

    setPropertySubmitting(true);
    try {
      const propertiesRef = collection(db, 'rentalsProperties');
      const slugQuery = query(
        propertiesRef,
        where('slug', '==', slug),
        where('active', '==', true),
        limit(1)
      );
      const slugSnapshot = await getDocs(slugQuery);
      if (!slugSnapshot.empty) {
        const existingDoc = slugSnapshot.docs[0];
        if (!editingPropertyId || existingDoc.id !== editingPropertyId) {
          setPropertyError('That slug is already taken. Try another.');
          setPropertySubmitting(false);
          return;
        }
      }

      const calendarResetPayload = shouldResetCalendar
        ? {
            blockedRanges: [],
            icalSyncStatus: 'never',
            icalErrorMessage: '',
            icalLastSyncedAt: null,
          }
        : {};

      const propertyPayload = {
        ownerId: user.uid,
        slug,
        propertyName: propertyForm.propertyName.trim(),
        locationText: propertyForm.locationText.trim(),
        images: (propertyForm.images || []).filter(Boolean),
        bookingUrl: propertyForm.bookingUrl.trim(),
        icalUrl: trimmedIcalUrl,
        logoUrl: propertyForm.logoUrl.trim(),
        accentColor: propertyForm.accentColor.trim() || DEFAULT_ACCENT,
        heroImageUrl: propertyForm.heroImageUrl.trim(),
        heroImageFocus: propertyForm.heroImageFocus || DEFAULT_HERO_FOCUS,
        introText: propertyForm.introText.trim(),
        active: Boolean(propertyForm.active),
        updatedAt: serverTimestamp(),
        ...calendarResetPayload,
      };

      if (editingPropertyId) {
        const propertyRef = doc(db, 'rentalsProperties', editingPropertyId);
        await setDoc(propertyRef, propertyPayload, { merge: true });
        setProperties((prev) =>
          prev.map((item) =>
            item.id === editingPropertyId ? { ...item, ...propertyPayload } : item
          )
        );
        logEventIfAvailable('rentals_property_updated', { propertyId: editingPropertyId });
        await logRentalEvent('rentals_property_updated', {
          ownerId: user.uid,
          propertyId: editingPropertyId,
          propertySlug: slug,
        });
        setPropertyMessage('Property updated.');
      } else {
        const docRef = await addDoc(propertiesRef, {
          ...propertyPayload,
          createdAt: serverTimestamp(),
        });
        await setDoc(docRef, { propertyId: docRef.id }, { merge: true });
        setProperties((prev) => [{ id: docRef.id, ...propertyPayload }, ...prev]);
        setActivePropertyId(docRef.id);
        logEventIfAvailable('rentals_property_created', { propertyId: docRef.id });
        await logRentalEvent('rentals_property_created', {
          ownerId: user.uid,
          propertyId: docRef.id,
          propertySlug: slug,
        });
        setPropertyMessage('Property added.');
      }

      resetPropertyForm();
    } catch (error) {
      console.error('rentals property save failed', error);
      const message = String(error?.message || '');
      let friendly = 'Unable to save this property right now.';
      if (error?.code === 'permission-denied' || message.includes('Missing or insufficient permissions')) {
        friendly = 'Permissions error. Refresh the page or sign in again, then retry.';
      } else if (error?.code === 'unauthenticated') {
        friendly = 'Please sign in again to save this property.';
      }
      setPropertyError(friendly);
    } finally {
      setPropertySubmitting(false);
    }
  };

  const handleBrandingChange = (field) => (event) => {
    setBrandingValues((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleBrandingSave = async (event) => {
    event.preventDefault();
    if (!user) return;
    setBrandingSaving(true);
    setBrandingMessage('');
    setBrandingError('');
    try {
      const ownerRef = doc(db, 'rentalsOwners', user.uid);
      await setDoc(
        ownerRef,
        {
          brandingDefaults: {
            logoUrl: brandingValues.logoUrl.trim(),
            accentColor: brandingValues.accentColor.trim() || DEFAULT_ACCENT,
            heroImageUrl: brandingValues.heroImageUrl.trim(),
            introText: brandingValues.introText.trim(),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setBrandingMessage('Branding defaults saved.');
      logEventIfAvailable('rentals_branding_saved');
      await logRentalEvent('rentals_branding_saved', { ownerId: user.uid });
    } catch (error) {
      console.error('rentals branding save failed', error);
      setBrandingError('Unable to save branding defaults right now.');
    } finally {
      setBrandingSaving(false);
    }
  };

  const handleCopy = (text, label) => {
    if (!text) return;
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setCopyStatus('Copy not supported in this browser');
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopyStatus(`${label} copied`);
        if (copyTimerRef.current) {
          clearTimeout(copyTimerRef.current);
        }
        copyTimerRef.current = setTimeout(() => setCopyStatus(''), 2500);
      })
      .catch(() => {
        setCopyStatus('Unable to copy right now');
      });
  };

  const locationMapUrl = useMemo(() => {
    const query = (propertyForm.locationText || '').trim();
    if (!query) return '';
    return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  }, [propertyForm.locationText]);

  const shareLinks = activeProperty ? buildRentalLinks(activeProperty) : null;
  const websiteSnippet = activeProperty ? buildRentalWebsiteSnippet(activeProperty) : '';
  const postStayEmail = activeProperty ? buildRentalPostStayEmail(activeProperty) : '';

  const handleIcalRetry = async (property) => {
    if (!user || !property?.id) return;
    setCalendarSyncing(true);
    setCalendarSyncMessage('');
    setCalendarSyncError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/rentals/sync-ical?propertyId=${property.id}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to sync calendar right now.');
      }
      if (payload?.property?.id) {
        setProperties((prev) =>
          prev.map((item) => (item.id === payload.property.id ? payload.property : item))
        );
      }
      setCalendarSyncMessage('Calendar synced.');
    } catch (error) {
      setCalendarSyncError(error?.message || 'Unable to sync calendar right now.');
    } finally {
      setCalendarSyncing(false);
    }
  };

  const handlePortalSignOut = async () => {
    try {
      await signOut(auth);
      router.replace('/rentals/login');
    } catch (error) {
      console.error('rentals portal sign out failed', error);
      setPortalError('Unable to sign out right now. Please try again in a moment.');
    }
  };

  if (!user && loadingAuth) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Rental owner portal - Set The Date</title>
      </Head>
      <PortalTopNav
        isLoggedIn={Boolean(user)}
        portalType="rentals"
        userEmail={user?.email || owner?.email || ''}
        onSignOut={user ? handlePortalSignOut : undefined}
      />
      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black px-4 py-12">
        <div className="max-w-6xl mx-auto text-slate-900">
          <div className="flex flex-col items-center text-center mb-12 rounded-[32px] bg-white shadow-2xl shadow-slate-900/20 px-8 py-10">
            <LogoHeader isPro />
            <p className="uppercase tracking-[0.35em] text-xs text-slate-500 mt-4">Dashboard</p>
            <h1 className="text-4xl font-semibold mt-2 text-slate-900">Rental owner portal</h1>
            <p className="text-slate-600 mt-3 max-w-2xl">
              {user?.email
                ? `Signed in as ${user.email}.`
                : 'Sign in to see the properties linked to your account.'}{' '}
              Manage your public property pages, share tools, and trip poll links.
            </p>
          </div>

          {portalError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 mb-6">
              {portalError}
            </div>
          )}
          {claimError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 mb-6">
              {claimError}
            </div>
          )}
          {loadingOwner && (
            <p className="text-sm text-slate-500 mb-4">Loading owner profile...</p>
          )}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
            {summaryCards.map((card) => (
              <StatCard key={card.label} label={card.label} value={card.value} detail={card.detail} />
            ))}
          </div>

          <section
            id="properties"
            className="scroll-mt-28 rounded-3xl border border-white bg-white/95 shadow-xl shadow-slate-900/10 p-6 mb-8"
          >
            <header className="mb-4 text-left">
              <p className="uppercase tracking-[0.3em] text-xs text-slate-500">Properties</p>
              <h2 className="text-2xl font-semibold text-slate-900">Manage public pages</h2>
              <p className="text-sm text-slate-500 mt-1">
                View each property page, copy the slug, or update details and branding.
              </p>
            </header>

            {loadingProperties ? (
              <p className="text-sm text-slate-500">Loading properties...</p>
            ) : properties.length ? (
              <>
                <div className="flex flex-wrap gap-2 mb-4">
                  {properties.map((property) => (
                    <button
                      key={property.id}
                      type="button"
                      onClick={() => setActivePropertyId(property.id)}
                      className={`rounded-full px-4 py-1 text-sm font-semibold border transition ${
                        activePropertyId === property.id
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'border-slate-300 text-slate-600 hover:border-slate-900'
                      }`}
                    >
                      {property.propertyName || property.slug}
                    </button>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-700">
                    <thead>
                      <tr className="text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-2">Name</th>
                        <th>Slug</th>
                        <th>Location</th>
                        <th className="text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {properties.map((property) => (
                        <tr
                          key={property.id}
                          className={`border-t border-slate-100 ${
                            activePropertyId === property.id ? 'bg-slate-50' : ''
                          }`}
                        >
                          <td className="py-3 font-semibold text-slate-900">
                            {property.propertyName || 'Untitled property'}
                          </td>
                          <td className="py-3">
                            <Link
                              href={`/rentals/p/${property.slug}`}
                              target="_blank"
                              className="text-slate-900 underline"
                            >
                              /rentals/p/{property.slug}
                            </Link>
                          </td>
                          <td className="py-3">{property.locationText || '--'}</td>
                          <td className="py-3 text-center">
                            <div className="flex flex-col md:flex-row gap-2 justify-center">
                              <button
                                type="button"
                                onClick={() => handleEditProperty(property)}
                                className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-1 text-xs font-semibold text-slate-700 hover:border-slate-900"
                              >
                                Edit details
                              </button>
                              <Link
                                href={`/rentals/p/${property.slug}`}
                                target="_blank"
                                className="inline-flex items-center justify-center rounded-full bg-slate-900 text-white px-4 py-1 text-xs font-semibold"
                              >
                                View page
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                No properties are linked to {user?.email || 'this account'} yet.
              </p>
            )}

            {!loadingProperties && resolvedPropertyLimit !== null && (
              <p className="mt-4 text-xs text-slate-500">
                {hasReachedLimit
                  ? `You have reached the ${resolvedPropertyLimit}-property allowance for this plan.`
                  : `You can add ${resolvedPropertyLimit - properties.length} more propert${
                      resolvedPropertyLimit - properties.length === 1 ? 'y' : 'ies'
                    } before upgrading.`}
              </p>
            )}

            <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm font-semibold text-slate-900 mb-2">
                {editingPropertyId ? 'Edit property' : 'Add a property'}
              </p>
              <form className="space-y-4" onSubmit={handlePropertySubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="propertyName">
                      Property name
                    </label>
                    <input
                      id="propertyName"
                      type="text"
                      value={propertyForm.propertyName}
                      onChange={handlePropertyChange('propertyName')}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
                      placeholder="e.g. Coastline Cottage"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="propertySlug">
                      Property page link
                    </label>
                    <input
                      id="propertySlug"
                      type="text"
                      value={propertyForm.slug}
                      onChange={handlePropertyChange('slug')}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
                      placeholder="coastline-cottage"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Auto-generated from the property name. You can edit it.{' '}
                      {propertyForm.slug
                        ? `Public link: /rentals/p/${propertyForm.slug}`
                        : 'Public link: /rentals/p/your-property'}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="propertyLocation">
                      Location
                    </label>
                    <input
                      id="propertyLocation"
                      type="text"
                      value={propertyForm.locationText}
                      onChange={handlePropertyChange('locationText')}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
                      placeholder="City, Country"
                    />
                    {locationMapUrl && (
                      <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
                        <iframe
                          title="Location preview"
                          src={locationMapUrl}
                          className="w-full h-40"
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="propertyBooking">
                      Booking link
                    </label>
                    <input
                      id="propertyBooking"
                      type="url"
                      value={propertyForm.bookingUrl}
                      onChange={handlePropertyChange('bookingUrl')}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
                      placeholder="https://"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="propertyIcal">
                    Availability calendar (iCal URL, optional)
                  </label>
                  <input
                    id="propertyIcal"
                    type="url"
                    value={propertyForm.icalUrl}
                    onChange={handlePropertyChange('icalUrl')}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
                    placeholder="Paste your Airbnb / VRBO / Booking.com iCal link"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Read-only. Used to hide unavailable dates for guests when provided.
                  </p>
                  {editingProperty?.icalSyncStatus === 'error' && (
                    <div className="mt-2 text-xs text-rose-600">
                      Calendar sync error{editingProperty.icalErrorMessage ? `: ${editingProperty.icalErrorMessage}` : '.'}
                    </div>
                  )}
                  {editingProperty?.icalLastSyncedAt ? (
                    <p className="text-xs text-slate-500 mt-1">
                      Last synced: {formatTimestamp(editingProperty.icalLastSyncedAt)}
                    </p>
                  ) : (
                    canSyncIcal && (
                      <p className="text-xs text-slate-500 mt-1">Not synced yet.</p>
                    )
                  )}
                  {canSyncIcal && (
                    <button
                      type="button"
                      onClick={() => handleIcalRetry(editingProperty)}
                      disabled={calendarSyncing}
                      className="mt-2 inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-1 text-xs font-semibold text-slate-700 hover:border-slate-900 disabled:opacity-60"
                    >
                      {calendarSyncing
                        ? editingProperty?.icalSyncStatus === 'error'
                          ? 'Retrying...'
                          : 'Syncing...'
                        : editingProperty?.icalSyncStatus === 'error'
                        ? 'Retry sync'
                        : 'Sync now'}
                    </button>
                  )}
                  {calendarSyncMessage && (
                    <p className="text-xs font-semibold text-emerald-600 mt-2">{calendarSyncMessage}</p>
                  )}
                  {calendarSyncError && (
                    <p className="text-xs font-semibold text-rose-600 mt-2">{calendarSyncError}</p>
                  )}
                  {Array.isArray(editingProperty?.blockedRanges) && editingProperty.blockedRanges.length > 0 && (
                    <p className="text-xs text-slate-500 mt-2">
                      Blocked ranges loaded: {editingProperty.blockedRanges.length}
                    </p>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="propertyLogo">
                      Logo
                    </label>
                    {showLogoUrlInput && (
                      <input
                        id="propertyLogo"
                        type="url"
                        value={propertyForm.logoUrl}
                        onChange={handlePropertyChange('logoUrl')}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
                        placeholder="https://"
                      />
                    )}
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                      <input
                        id={logoUploadInputId}
                        ref={logoUploadInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="sr-only"
                        disabled={logoUploading}
                      />
                      <label
                        htmlFor={logoUploadInputId}
                        role="button"
                        tabIndex={logoUploading ? -1 : 0}
                        aria-disabled={logoUploading}
                        className={`inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold transition ${
                          logoUploading
                            ? 'cursor-not-allowed opacity-60 text-slate-500'
                            : 'cursor-pointer text-slate-700 hover:border-slate-900 hover:text-slate-900'
                        }`}
                      >
                        {logoUploading ? 'Uploading...' : 'Upload logo'}
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowLogoUrlInput((prev) => !prev)}
                        className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:border-slate-900 hover:text-slate-900"
                      >
                        {showLogoUrlInput ? 'Hide logo URL' : 'Use logo URL'}
                      </button>
                      <span className="text-xs text-slate-500">Auto-cropped to square.</span>
                    </div>
                    {logoUploadMessage && (
                      <p className="text-xs text-slate-500 mt-2">{logoUploadMessage}</p>
                    )}
                    {propertyForm.logoUrl && (
                      <div className="mt-3 flex justify-center">
                        <img
                          src={propertyForm.logoUrl}
                          alt="Uploaded logo preview"
                          className="max-h-32 object-contain rounded-xl border border-slate-200 bg-white p-2"
                          loading="lazy"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="propertyAccent">
                      Accent color
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        id="propertyAccent"
                        type="color"
                        value={propertyForm.accentColor}
                        onChange={handlePropertyChange('accentColor')}
                        className="h-12 w-20 cursor-pointer rounded-xl border border-slate-200 bg-white"
                      />
                      <input
                        type="text"
                        value={propertyForm.accentColor}
                        onChange={handlePropertyChange('accentColor')}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
                        placeholder={DEFAULT_ACCENT}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="propertyHero">
                    Hero image
                  </label>
                  {showHeroUrlInput && (
                    <input
                      id="propertyHero"
                      type="url"
                      value={propertyForm.heroImageUrl}
                      onChange={handlePropertyChange('heroImageUrl')}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
                      placeholder="https://"
                    />
                  )}
                  <div className="mt-2 flex flex-wrap gap-2 items-center">
                    <input
                      id={heroUploadInputId}
                      ref={heroUploadInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleHeroUpload}
                      className="sr-only"
                      disabled={heroUploading}
                    />
                    <label
                      htmlFor={heroUploadInputId}
                      role="button"
                      tabIndex={heroUploading ? -1 : 0}
                      aria-disabled={heroUploading}
                      className={`inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold transition ${
                        heroUploading
                          ? 'cursor-not-allowed opacity-60 text-slate-500'
                          : 'cursor-pointer text-slate-700 hover:border-slate-900 hover:text-slate-900'
                      }`}
                    >
                      {heroUploading ? 'Uploading...' : 'Upload hero image'}
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowHeroUrlInput((prev) => !prev)}
                      className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:border-slate-900 hover:text-slate-900"
                    >
                      {showHeroUrlInput ? 'Hide hero URL' : 'Use hero URL'}
                    </button>
                    <span className="text-xs text-slate-500">Auto-cropped to 16:10.</span>
                  </div>
                  {heroUploadMessage && (
                    <p className="text-xs text-slate-500 mt-2">{heroUploadMessage}</p>
                  )}
                  {propertyForm.heroImageUrl && (
                    <div
                      className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white"
                      style={{ aspectRatio: '16 / 10' }}
                    >
                      <img
                        src={propertyForm.heroImageUrl}
                        alt="Uploaded hero preview"
                        className={`h-full w-full object-cover ${getHeroFocusClass(propertyForm.heroImageFocus)}`}
                        loading="lazy"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="heroFocus">
                    Hero image focus
                  </label>
                  <select
                    id="heroFocus"
                    value={propertyForm.heroImageFocus}
                    onChange={handlePropertyChange('heroImageFocus')}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
                  >
                    {HERO_FOCUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">Adjust vertical framing for the hero image.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="propertyIntro">
                    Intro text
                  </label>
                  <textarea
                    id="propertyIntro"
                    rows={3}
                    value={propertyForm.introText}
                    onChange={handlePropertyChange('introText')}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
                    placeholder="Share a short welcome message for guests."
                  />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Gallery images</p>
                    <p className="text-xs text-slate-500">{(propertyForm.images || []).length} added</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      id={galleryUploadInputId}
                      ref={galleryUploadInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleGalleryUpload}
                      className="sr-only"
                      disabled={galleryUploading}
                    />
                    <label
                      htmlFor={galleryUploadInputId}
                      role="button"
                      tabIndex={galleryUploading ? -1 : 0}
                      aria-disabled={galleryUploading}
                      className={`inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold transition ${
                        galleryUploading
                          ? 'cursor-not-allowed opacity-60 text-slate-500'
                          : 'cursor-pointer text-slate-700 hover:border-slate-900 hover:text-slate-900'
                      }`}
                    >
                      {galleryUploading ? 'Uploading...' : 'Upload images'}
                    </label>
                    <span className="text-xs text-slate-500">Auto-cropped to 4:3. You can select multiple.</span>
                  </div>
                  {galleryUploadMessage && (
                    <p className="text-xs text-slate-500">{galleryUploadMessage}</p>
                  )}
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      type="url"
                      value={propertyImageInput}
                      onChange={(event) => setPropertyImageInput(event.target.value)}
                      className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
                      placeholder="Paste an image URL"
                    />
                    <button
                      type="button"
                      onClick={handlePropertyAddImage}
                      className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:border-slate-900"
                    >
                      Add image
                    </button>
                  </div>
                  {(propertyForm.images || []).length > 0 && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {propertyForm.images.map((url, index) => (
                        <div
                          key={url}
                          className="relative rounded-2xl border border-slate-200 bg-white p-2"
                        >
                          <div className="relative w-full overflow-hidden rounded-xl" style={{ aspectRatio: '4 / 3' }}>
                            <img
                              src={url}
                              alt="Gallery image"
                              className="absolute inset-0 h-full w-full object-cover object-center"
                              loading="lazy"
                            />
                          </div>
                          {index === 0 ? (
                            <span className="absolute top-2 left-2 rounded-full bg-slate-900/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                              Featured
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleGalleryMakeFeatured(url)}
                              className="absolute top-2 left-2 inline-flex items-center justify-center rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-900 hover:text-white transition"
                            >
                              Make featured
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handlePropertyRemoveImage(url)}
                            className="absolute top-2 right-2 inline-flex items-center justify-center rounded-full bg-white/90 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-rose-100 hover:text-rose-700 transition"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={propertyForm.active}
                    onChange={handlePropertyChange('active')}
                  />
                  Publish this property page now
                </label>

                {propertyError && <p className="text-sm text-rose-600">{propertyError}</p>}
                {propertyMessage && <p className="text-sm text-emerald-600">{propertyMessage}</p>}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={propertySubmitting}
                    className="rounded-full bg-slate-900 text-white font-semibold px-6 py-2 disabled:opacity-60"
                  >
                    {propertySubmitting
                      ? editingPropertyId
                        ? 'Saving...'
                        : 'Adding...'
                      : editingPropertyId
                      ? 'Save changes'
                      : 'Add property'}
                  </button>
                  {editingPropertyId && (
                    <button
                      type="button"
                      onClick={resetPropertyForm}
                      className="rounded-full border border-slate-300 px-6 py-2 text-sm font-semibold text-slate-700 hover:border-slate-900"
                    >
                      Cancel edit
                    </button>
                  )}
                </div>
              </form>
            </div>
          </section>

          <section
            id="branding"
            className="scroll-mt-28 rounded-3xl border border-white bg-white/95 shadow-xl shadow-slate-900/10 p-6 mb-8"
          >
            <header className="mb-4 text-left">
              <p className="uppercase tracking-[0.3em] text-xs text-slate-500">Branding</p>
              <h2 className="text-2xl font-semibold text-slate-900">Owner-level defaults</h2>
              <p className="text-sm text-slate-500 mt-1">
                Set default branding that will apply to new properties or fill in missing fields.
              </p>
            </header>

            <form className="space-y-4" onSubmit={handleBrandingSave}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="brandingLogo">
                    Default logo URL
                  </label>
                  <input
                    id="brandingLogo"
                    type="url"
                    value={brandingValues.logoUrl}
                    onChange={handleBrandingChange('logoUrl')}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
                    placeholder="https://"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="brandingAccent">
                    Default accent color
                  </label>
                  <input
                    id="brandingAccent"
                    type="text"
                    value={brandingValues.accentColor}
                    onChange={handleBrandingChange('accentColor')}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
                    placeholder={DEFAULT_ACCENT}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="brandingHero">
                  Default hero image URL
                </label>
                <input
                  id="brandingHero"
                  type="url"
                  value={brandingValues.heroImageUrl}
                  onChange={handleBrandingChange('heroImageUrl')}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
                  placeholder="https://"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="brandingIntro">
                  Default intro text
                </label>
                <textarea
                  id="brandingIntro"
                  rows={3}
                  value={brandingValues.introText}
                  onChange={handleBrandingChange('introText')}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
                  placeholder="Share a short welcome message for guests."
                />
              </div>

              {brandingError && <p className="text-sm text-rose-600">{brandingError}</p>}
              {brandingMessage && <p className="text-sm text-emerald-600">{brandingMessage}</p>}

              <button
                type="submit"
                disabled={brandingSaving}
                className="rounded-full bg-slate-900 text-white text-sm font-semibold px-6 py-2 disabled:opacity-60"
              >
                {brandingSaving ? 'Saving...' : 'Save branding defaults'}
              </button>
            </form>
          </section>

          <section
            id="share-tools"
            className="scroll-mt-28 rounded-3xl border border-white bg-white/95 shadow-xl shadow-slate-900/10 p-6 mb-8"
          >
            <header className="mb-4 text-left">
              <p className="uppercase tracking-[0.3em] text-xs text-slate-500">Share tools</p>
              <h2 className="text-2xl font-semibold text-slate-900">Copy blocks for your campaigns</h2>
              <p className="text-sm text-slate-500 mt-1">
                Use the snippets below in your website, post-stay emails, or WhatsApp follow-ups.
              </p>
            </header>

            {!activeProperty ? (
              <p className="text-sm text-slate-500">
                Add a property first to generate share links and snippets.
              </p>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Website button snippet</p>
                    <button
                      type="button"
                      onClick={() => handleCopy(websiteSnippet, 'Button snippet')}
                      className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:border-slate-900 hover:text-slate-900"
                    >
                      Copy
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={websiteSnippet}
                    rows={6}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  />
                  <p className="text-xs text-slate-500">
                    Drop this HTML anywhere on your site to link guests to your property page.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Post-stay email snippet</p>
                    <button
                      type="button"
                      onClick={() => handleCopy(postStayEmail, 'Email snippet')}
                      className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:border-slate-900 hover:text-slate-900"
                    >
                      Copy
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={postStayEmail}
                    rows={6}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                  />
                  <p className="text-xs text-slate-500">
                    Add this to your post-stay email or SMS follow-up.
                  </p>
                </div>
              </div>
            )}

            {shareLinks && (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Property share link</p>
                  <button
                    type="button"
                    onClick={() => handleCopy(shareLinks.shareUrl, 'Share link')}
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:border-slate-900 hover:text-slate-900"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-sm text-slate-700 mt-2">{shareLinks.shareUrl}</p>
                {copyStatus && <p className="text-xs font-semibold text-emerald-600 mt-2">{copyStatus}</p>}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

function StatCard({ label, value, detail }) {
  return (
    <div className="rounded-3xl border border-white bg-white/95 shadow-md shadow-slate-900/10 p-5 text-slate-900">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-2">{label}</p>
      <p className="text-3xl font-semibold break-words">{value ?? '--'}</p>
      {detail && <p className="text-sm text-slate-500">{detail}</p>}
    </div>
  );
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  if (value._seconds) return value._seconds * 1000;
  return new Date(value).getTime() || 0;
}

function formatTimestamp(value) {
  const millis = toMillis(value);
  if (!millis) return '--';
  return new Date(millis).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}












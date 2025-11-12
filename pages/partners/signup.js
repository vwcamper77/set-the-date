import { useState, useEffect, useRef, useId } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import PartnerNav from '@/components/PartnerNav';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';
import { storage, auth } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signInAnonymously } from 'firebase/auth';

const MEAL_TAGS = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'brunch', label: 'Brunch' },
  { id: 'coffee', label: 'Coffee' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'lunch_drinks', label: 'Lunch drinks' },
  { id: 'afternoon_tea', label: 'Afternoon tea' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'evening', label: 'Evening out' },
];

const DEFAULT_BRAND = '#0f172a';

const initialForm = {
  venueName: '',
  contactName: '',
  contactEmail: '',
  logoUrl: '',
  venuePhotoUrl: '',
  venuePhotos: [],
  brandColor: DEFAULT_BRAND,
  city: '',
  fullAddress: '',
  bookingUrl: '',
  venuePitch: '',
  allowedMealTags: ['breakfast', 'brunch', 'coffee', 'lunch', 'lunch_drinks', 'afternoon_tea', 'dinner', 'evening'],
};

export default function PartnerSignupPage({
  onboardingToken,
  prefillContactEmail = '',
  prefillContactName = '',
  prefillVenueName = '',
}) {
  const router = useRouter();
  const [formValues, setFormValues] = useState(() => ({
    ...initialForm,
    contactEmail: prefillContactEmail || '',
    contactName: prefillContactName || '',
    venueName: prefillVenueName || '',
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [shareUrl, setShareUrl] = useState('https://plan.setthedate.app/partners/start');
  const [copiedLink, setCopiedLink] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoMessage, setLogoMessage] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoMessage, setPhotoMessage] = useState('');
  const fileInputRef = useRef(null);
  const venuePhotoInputRef = useRef(null);
  const [venuePhotoInputValue, setVenuePhotoInputValue] = useState('');
  const [showLogoUrlInput, setShowLogoUrlInput] = useState(true);
  const [logoInputValue, setLogoInputValue] = useState('');
  const logoFileInputId = useId();
  const venuePhotoFileInputId = useId();

  const addVenuePhotoUrl = (url) => {
    if (!url) return;
    setFormValues((prev) => {
      const existing = Array.isArray(prev.venuePhotos) ? prev.venuePhotos : [];
      if (existing.length >= 3 || existing.includes(url)) return prev;
      const nextPhotos = [...existing, url];
      return {
        ...prev,
        venuePhotos: nextPhotos,
        venuePhotoUrl: nextPhotos[0] || '',
      };
    });
  };

  const removeVenuePhotoUrl = (url) => {
    setFormValues((prev) => {
      const existing = Array.isArray(prev.venuePhotos) ? prev.venuePhotos : [];
      const nextPhotos = existing.filter((item) => item !== url);
      return {
        ...prev,
        venuePhotos: nextPhotos,
        venuePhotoUrl: nextPhotos[0] || '',
      };
    });
  };

  const handleAddVenuePhotoFromInput = () => {
    if (!venuePhotoInputValue.trim()) {
      setPhotoMessage('Paste a valid URL before adding.');
      return;
    }
    if ((formValues.venuePhotos || []).length >= 3) {
      setPhotoMessage('You can upload up to three venue photos.');
      return;
    }
    try {
      const validUrl = new URL(venuePhotoInputValue.trim());
      addVenuePhotoUrl(validUrl.toString());
      setVenuePhotoInputValue('');
      setPhotoMessage('Photo added.');
    } catch {
      setPhotoMessage('Please enter a valid URL.');
    }
  };

  const handleManualLogoInput = (value) => {
    setLogoInputValue(value);
    setFormValues((prev) => ({ ...prev, logoUrl: value }));
  };

  const handleGoBack = () => {
    router.push('/');
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setShareUrl(`${window.location.origin}/partners/start`);
    }
  }, []);

  useEffect(() => {
    if (!auth.currentUser) {
      signInAnonymously(auth).catch((err) => console.error('anon auth failed', err));
    }
  }, []);

  const handleChange = (field) => (event) => {
    const { value } = event.target;
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  const toggleMealTag = (tag) => {
    setFormValues((prev) => {
      const exists = prev.allowedMealTags.includes(tag);
      return {
        ...prev,
        allowedMealTags: exists
          ? prev.allowedMealTags.filter((item) => item !== tag)
          : [...prev.allowedMealTags, tag],
      };
    });
  };

  const handleColorPickerChange = (event) => {
    setFormValues((prev) => ({ ...prev, brandColor: event.target.value }));
  };

  const handleLogoFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setLogoMessage('Please upload an image file.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setLogoMessage('File too large. Keep it under 3MB.');
      return;
    }
    setUploadingLogo(true);
    setLogoMessage('Uploading logo...');
    try {
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const destination = storageRef(storage, `partner-logos/${fileName}`);
      await uploadBytes(destination, file, { contentType: file.type });
      const url = await getDownloadURL(destination);
      setFormValues((prev) => ({ ...prev, logoUrl: url }));
      setLogoInputValue('');
      setLogoMessage('Logo uploaded.');
    } catch (uploadErr) {
      console.error('logo upload failed', uploadErr);
      setLogoMessage('Upload failed. Please try again.');
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleVenuePhotoFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if ((formValues.venuePhotos || []).length >= 3) {
      setPhotoMessage('You can upload up to three venue photos.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setPhotoMessage('Please upload an image file.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setPhotoMessage('File too large. Keep it under 3MB.');
      return;
    }
    setUploadingPhoto(true);
    setPhotoMessage('Uploading photo...');
    try {
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const destination = storageRef(storage, `partner-venue-photos/${fileName}`);
      await uploadBytes(destination, file, { contentType: file.type });
      const url = await getDownloadURL(destination);
      addVenuePhotoUrl(url);
      setVenuePhotoInputValue('');
      setPhotoMessage('Photo uploaded.');
    } catch (uploadErr) {
      console.error('venue photo upload failed', uploadErr);
      setPhotoMessage('Upload failed. Please try again.');
    } finally {
      setUploadingPhoto(false);
      if (venuePhotoInputRef.current) {
        venuePhotoInputRef.current.value = '';
      }
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!onboardingToken) {
      setError('Missing access token. Start from /partners/start to unlock this form.');
      return;
    }

    logEventIfAvailable('partner_signup_submitted', {
      venueName: formValues.venueName,
      city: formValues.city,
    });

    setSubmitting(true);
    try {
      const response = await fetch('/api/partners/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formValues,
          onboardingToken,
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const message = result?.message || 'Unable to create partner profile. Please try again.';
        setError(message);
        logEventIfAvailable('partner_signup_failed', {
          venueName: formValues.venueName,
          city: formValues.city,
          reason: message,
        });
        return;
      }

      setFormValues({ ...initialForm, venuePhotos: [] });
      setVenuePhotoInputValue('');
      setLogoInputValue('');
      setLogoMessage('');
      setPhotoMessage('');
      logEventIfAvailable('partner_signup_success', { partner: result.slug });
      router.push(`/partners/thanks?slug=${result.slug}`);
    } catch (err) {
      setError('Something went wrong. Please try again.');
      logEventIfAvailable('partner_signup_failed', {
        venueName: formValues.venueName,
        city: formValues.city,
        reason: err?.message || 'unknown',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Partner signup - Set The Date</title>
        <meta
          name="description"
          content="Hotels and restaurants can create a branded Set The Date share page and ready-to-send campaign email."
        />
      </Head>

      <PartnerNav />
      <main className="min-h-screen bg-slate-100 text-slate-900 px-4 py-10 sm:py-14">
        <section className="max-w-5xl mx-auto space-y-8">
          <div className="rounded-[32px] bg-white px-6 sm:px-12 py-10 shadow-2xl shadow-slate-900/25">
            <div className="text-center space-y-4">
              <p className="uppercase tracking-[0.4em] text-xs text-slate-500">Hospitality</p>
              <h1 className="text-4xl sm:text-5xl font-semibold leading-tight text-slate-900">
                Get your tables booked the efficient way
              </h1>
              <p className="text-base sm:text-lg text-slate-600 max-w-3xl mx-auto">
                Help customers pick dates by sharing a hosted voting page tailored to your restaurant, hotel, or bar. Upload your brand assets once and Set The Date Pro spins up a public share page, email copy, and voting calendar you can send with every private dining or group stay enquiry. It turns “we’re thinking about a group booking” conversations into concrete dates, captures guest emails for re-marketing, and shows when your venue is in demand.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3 text-left text-sm mt-8">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="font-semibold text-slate-900">Branded share page</p>
                <p className="text-slate-600 mt-1">Your logo, menu highlights, and venue photos baked into every poll.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="font-semibold text-slate-900">Ready-to-send campaign</p>
                <p className="text-slate-600 mt-1">Copy-and-paste email templates for Mailchimp, Brevo, or Gmail.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="font-semibold text-slate-900">Menu-friendly polls</p>
                <p className="text-slate-600 mt-1">Breakfast through late-night slots so guests can pick what works.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 md:col-span-3">
                <p className="font-semibold text-slate-900">Why venues love it</p>
                <p className="text-slate-600 mt-1">
                  Every poll captures organiser emails, shows their group which dates work best, and sends confirmed demand back to your team.
                  Less back-and-forth, more booked covers and high-value stays.
                </p>
              </div>
            </div>
            <div className="mt-8 flex justify-center">
              <a
                href="#partner-signup-form"
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 text-white font-semibold px-6 py-3 hover:bg-slate-800 transition"
              >
                Start listing your venue
                <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>
        </section>

        <section
          id="partner-signup-form"
          className="mt-12 max-w-4xl mx-auto rounded-[32px] bg-white text-slate-900 shadow-2xl shadow-slate-900/40 px-8 py-12"
        >
          <div className="text-center mb-10">
            <p className="uppercase tracking-[0.35em] text-xs text-slate-500 mb-3">Hospitality</p>
            <h1 className="text-4xl font-semibold text-slate-900">
              Launch your venue on Set The Date
            </h1>
            <p className="text-slate-600 mt-3 max-w-2xl mx-auto">
              Add your venue details, upload your brand color, and we will spin up a public share page plus a ready-to-send campaign
              email you can paste into any ESP.
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="venueName">
                Venue name
              </label>
              <input
                id="venueName"
                type="text"
                required
                value={formValues.venueName}
                onChange={handleChange('venueName')}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                placeholder="e.g. Horizon Hotel Skybar"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="contactName">
                  Contact name
                </label>
                <input
                  id="contactName"
                  type="text"
                  required
                  value={formValues.contactName}
                  onChange={handleChange('contactName')}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="contactEmail">
                  Contact email
                </label>
                <input
                  id="contactEmail"
                  type="email"
                  required
                  value={formValues.contactEmail}
                  onChange={handleChange('contactEmail')}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                  placeholder="you@venue.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="logoUpload">
                Logo
              </label>
              <input
                id="logoUpload"
                type="hidden"
                value={formValues.logoUrl}
                onChange={handleChange('logoUrl')}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  id={logoFileInputId}
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoFile}
                  className="sr-only"
                  disabled={uploadingLogo}
                />
                <label
                  htmlFor={logoFileInputId}
                  role="button"
                  tabIndex={uploadingLogo ? -1 : 0}
                  aria-disabled={uploadingLogo}
                  className={`inline-flex items-center justify-center rounded-full border border-slate-900 px-4 py-2 text-sm font-semibold transition ${
                    uploadingLogo
                      ? 'cursor-not-allowed opacity-60 text-slate-500'
                      : 'cursor-pointer text-slate-900 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  {uploadingLogo ? 'Uploading...' : 'Upload logo'}
                </label>
                <button
                  type="button"
                  onClick={() => setShowLogoUrlInput((prev) => !prev)}
                  className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-900 hover:text-slate-900 transition"
                >
                  {showLogoUrlInput ? 'Hide logo link field' : 'Paste logo URL instead'}
                </button>
              </div>
              {logoMessage && <p className="text-xs text-slate-500 mt-2">{logoMessage}</p>}
              {showLogoUrlInput && (
                <div className="mt-2">
                  <input
                    type="url"
                    value={logoInputValue}
                    onChange={(e) => handleManualLogoInput(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                    placeholder="https://your-site.com/logo.png"
                  />
                </div>
              )}
              {formValues.logoUrl && (
                <div className="mt-3 flex justify-center">
                  <img
                    src={formValues.logoUrl}
                    alt="Uploaded logo preview"
                    className="max-h-52 object-contain rounded-xl border border-slate-200 bg-white p-3 shadow-inner"
                    loading="lazy"
                  />
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="brandColor">
                  Brand color (hex)
                </label>
                <input
                  id="brandColor"
                  type="text"
                  required
                  value={formValues.brandColor}
                  onChange={handleChange('brandColor')}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                  placeholder="#0f172a"
                  pattern="^#(?:[0-9a-fA-F]{3}){1,2}$"
                  title="Use a hex code such as #0f172a"
                />
                <input
                  type="color"
                  value={formValues.brandColor}
                  onChange={handleColorPickerChange}
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 p-1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="city">
                  City
                </label>
                <input
                  id="city"
                  type="text"
                  required
                  value={formValues.city}
                  onChange={handleChange('city')}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                  placeholder="e.g. London"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="fullAddress">
                Full venue address
              </label>
              <textarea
                id="fullAddress"
                rows={2}
                required
                value={formValues.fullAddress}
                onChange={handleChange('fullAddress')}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                placeholder="123 Example Street, Borough, Postcode"
              />
              <p className="mt-2 text-xs text-slate-500">
                We show this address to visitors and use it to render the venue map.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="venuePhotoUrl">
                Venue photo URL
              </label>
              <input
                id="venuePhotoUrl"
                type="url"
                value={venuePhotoInputValue}
                onChange={(e) => setVenuePhotoInputValue(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                placeholder="https://example.com/photo.jpg"
              />
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={handleAddVenuePhotoFromInput}
                  className="inline-flex items-center justify-center rounded-full border border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-900 hover:text-white transition"
                >
                  Add photo via URL
                </button>
                <input
                  id={venuePhotoFileInputId}
                  ref={venuePhotoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleVenuePhotoFile}
                  className="sr-only"
                  disabled={uploadingPhoto}
                />
                <label
                  htmlFor={venuePhotoFileInputId}
                  role="button"
                  tabIndex={uploadingPhoto ? -1 : 0}
                  aria-disabled={uploadingPhoto}
                  className={`inline-flex items-center justify-center rounded-full border border-slate-900 px-4 py-2 text-sm font-semibold transition ${
                    uploadingPhoto
                      ? 'cursor-not-allowed opacity-60 text-slate-500'
                      : 'cursor-pointer text-slate-900 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  {uploadingPhoto ? 'Uploading...' : 'Upload venue photo'}
                </label>
                {photoMessage && <p className="text-xs text-slate-500">{photoMessage}</p>}
              </div>
              {(formValues.venuePhotos || []).length > 0 && (
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {formValues.venuePhotos.map((photo) => (
                    <div
                      key={photo}
                      className="relative rounded-2xl border border-slate-200 bg-white p-2 shadow-inner flex flex-col gap-2"
                    >
                      <img
                        src={photo}
                        alt="Venue preview"
                        className="h-32 w-full object-cover rounded-xl"
                        loading="lazy"
                      />
                      <button
                        type="button"
                        onClick={() => removeVenuePhotoUrl(photo)}
                        className="text-xs text-rose-600 font-semibold hover:text-rose-800 self-center"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="venuePitch">
                Value proposition (what&apos;s special about your venue?)
              </label>
              <textarea
                id="venuePitch"
                required
                value={formValues.venuePitch}
                onChange={handleChange('venuePitch')}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition min-h-[120px]"
                placeholder="e.g. Our rooftop Skybar overlooks London Bridge—perfect for team celebrations."
              />
            </div>

            <div>
              <p className="text-sm font-medium text-slate-600 mb-2">Which time slots should guests see?</p>
              <div className="flex flex-wrap gap-2">
                {MEAL_TAGS.map((tag) => {
                  const active = formValues.allowedMealTags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleMealTag(tag.id)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold border transition ${
                        active
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'border-slate-300 text-slate-600 hover:border-slate-900'
                      }`}
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Guests only see the time slots you select above.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="bookingUrl">
                Booking URL (optional)
              </label>
              <input
                id="bookingUrl"
                type="url"
                value={formValues.bookingUrl}
                onChange={handleChange('bookingUrl')}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                placeholder="https://book.venue.com/group"
              />
            </div>

            {error && <p className="text-sm text-rose-600 font-medium">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-2xl bg-slate-900 text-white font-semibold py-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-slate-900/30"
            >
              {submitting ? 'Submitting...' : 'Create my share page'}
            </button>
          </form>

          <div className="mt-10 rounded-3xl border border-slate-200 bg-white/80 p-6 text-center">
            <p className="text-sm font-semibold text-slate-800">
              Share this page with your favourite venue so they can launch Set The Date.
            </p>
            <p className="text-sm text-slate-600 mt-1 mb-4">
              When they go live we will unlock Set The Date Pro for three of your friends for free.
            </p>
            <button
              type="button"
              onClick={() => {
                if (navigator?.clipboard?.writeText) {
                  navigator.clipboard.writeText(shareUrl).then(() => {
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2500);
                  });
                }
              }}
              className="inline-flex items-center justify-center rounded-full border border-slate-900 px-6 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-900 hover:text-white transition"
            >
              {copiedLink ? 'Link copied!' : 'Copy share link'}
            </button>
          </div>
        </section>
      </main>
    </>
  );
}

export async function getServerSideProps({ query }) {
  const token = typeof query.token === 'string' ? query.token : '';
  if (!token) {
    return {
      redirect: {
        destination: '/partners/start',
        permanent: false,
      },
    };
  }

  try {
    const { findOnboardingByToken } = await import('@/lib/partners/onboardingService');
    const record = await findOnboardingByToken(token);
    if (!record) {
      throw new Error('invalid token');
    }

    return {
      props: {
        onboardingToken: token,
        prefillContactEmail: record.data.customerEmail || '',
        prefillContactName: record.data.customerName || '',
        prefillVenueName: record.data.customerName || '',
      },
    };
  } catch (error) {
    console.error('partner signup token error', error);
    return {
      redirect: {
        destination: '/partners/start',
        permanent: false,
      },
    };
  }
}

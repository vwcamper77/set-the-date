import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { auth, db, storage } from '@/lib/firebase';
import { isAdminEmail, ADMIN_EMAIL } from '@/lib/adminUsers';
import {
  PARTNER_MEAL_TAGS,
  DEFAULT_PARTNER_BRAND_COLOR,
  DEFAULT_PARTNER_MEAL_TAG_IDS,
  MAX_PARTNER_GALLERY_PHOTOS,
} from '@/lib/partners/constants';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

const provider = new GoogleAuthProvider();
const REQUIRED_FIELDS = ['venueName', 'contactName', 'contactEmail', 'city', 'fullAddress', 'venuePitch', 'logoUrl'];

export default function AdminVenuesPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [venues, setVenues] = useState([]);
  const [fetchingVenues, setFetchingVenues] = useState(false);
  const [formValues, setFormValues] = useState(() => ({
    venueName: '',
    contactName: 'Admin',
    contactEmail: ADMIN_EMAIL,
    city: '',
    fullAddress: '',
    venuePitch: '',
    logoUrl: '',
    venuePhotoUrl: '',
    venuePhotos: [],
    brandColor: DEFAULT_PARTNER_BRAND_COLOR,
    bookingUrl: '',
    allowedMealTags: [...DEFAULT_PARTNER_MEAL_TAG_IDS],
    sendOwnerEmail: false,
  }));
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [updateForm, setUpdateForm] = useState({ slug: '', contactEmail: '', contactName: '' });
  const [updating, setUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const [logoMessage, setLogoMessage] = useState('');
  const [photoMessage, setPhotoMessage] = useState('');
  const [venuePhotoInputValue, setVenuePhotoInputValue] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const logoFileInputRef = useRef(null);
  const venuePhotoFileInputRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser && isAdminEmail(firebaseUser.email)) {
        setUser(firebaseUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const loadVenues = async () => {
      setFetchingVenues(true);
      setError('');
      try {
        const q = query(collection(db, 'partners'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const docs = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setVenues(docs);
      } catch (err) {
        console.error('admin venues load failed', err);
        setError('Unable to load venues right now.');
      } finally {
        setFetchingVenues(false);
      }
    };
    loadVenues();
  }, [user]);

  const login = () => {
    signInWithPopup(auth, provider).catch((err) => {
      console.error('admin login failed', err);
      setError('Login failed. Try again.');
    });
  };

  const handleInput = (key) => (event) => {
    const value = event.target.value;
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleCheckbox = (key) => (event) => {
    const checked = event.target.checked;
    setFormValues((prev) => ({ ...prev, [key]: checked }));
  };

  const toggleMealTag = (tagId) => {
    setFormValues((prev) => {
      const exists = prev.allowedMealTags.includes(tagId);
      return {
        ...prev,
        allowedMealTags: exists
          ? prev.allowedMealTags.filter((value) => value !== tagId)
          : [...prev.allowedMealTags, tagId],
      };
    });
  };

  const addVenuePhotoUrl = (url) => {
    const trimmed = (url || '').trim();
    if (!trimmed) return;
    setFormValues((prev) => {
      const existing = Array.isArray(prev.venuePhotos) ? prev.venuePhotos : [];
      if (existing.length >= MAX_PARTNER_GALLERY_PHOTOS || existing.includes(trimmed)) return prev;
      const nextPhotos = [...existing, trimmed];
      return {
        ...prev,
        venuePhotos: nextPhotos,
        venuePhotoUrl: prev.venuePhotoUrl || nextPhotos[0] || '',
      };
    });
  };

  const removeVenuePhotoUrl = (url) => {
    setFormValues((prev) => {
      const existing = Array.isArray(prev.venuePhotos) ? prev.venuePhotos : [];
      const nextPhotos = existing.filter((item) => item !== url);
      const nextHero =
        prev.venuePhotoUrl === url ? (nextPhotos[0] || '') : prev.venuePhotoUrl;
      return { ...prev, venuePhotos: nextPhotos, venuePhotoUrl: nextHero };
    });
  };

  const handleAddVenuePhotoFromInput = () => {
    if (!venuePhotoInputValue.trim()) {
      setPhotoMessage('Paste a valid URL before adding.');
      return;
    }
    addVenuePhotoUrl(venuePhotoInputValue.trim());
    setVenuePhotoInputValue('');
    setPhotoMessage('Photo URL added.');
  };

  const ensureUploadAccess = useCallback(
    async (setMessage) => {
      if (!user) {
        setMessage('Sign in as admin to upload assets.');
        return false;
      }
      if (!isAdminEmail(user.email || '')) {
        setMessage('Only admin users can upload assets.');
        return false;
      }
      try {
        if (auth.currentUser) {
          await auth.currentUser.getIdToken(true);
        }
      } catch (tokenErr) {
        console.error('admin upload token refresh failed', tokenErr);
      }
      return true;
    },
    [user]
  );

  const handleLogoFile = async (event) => {
    if (!(await ensureUploadAccess(setLogoMessage))) {
      return;
    }
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
      setLogoMessage('Logo uploaded.');
    } catch (uploadErr) {
      console.error('admin logo upload failed', uploadErr);
      setLogoMessage('Upload failed. Please try again.');
    } finally {
      setUploadingLogo(false);
      if (logoFileInputRef.current) {
        logoFileInputRef.current.value = '';
      }
    }
  };

  const handleVenuePhotoFile = async (event) => {
    if (!(await ensureUploadAccess(setPhotoMessage))) {
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;
    if ((formValues.venuePhotos || []).length >= MAX_PARTNER_GALLERY_PHOTOS) {
      setPhotoMessage(`You can upload up to ${MAX_PARTNER_GALLERY_PHOTOS} venue photos.`);
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
      setPhotoMessage('Photo uploaded.');
    } catch (uploadErr) {
      console.error('admin venue photo upload failed', uploadErr);
      setPhotoMessage('Upload failed. Please try again.');
    } finally {
      setUploadingPhoto(false);
      if (venuePhotoFileInputRef.current) {
        venuePhotoFileInputRef.current.value = '';
      }
    }
  };

  const missingFields = useMemo(
    () => REQUIRED_FIELDS.filter((key) => !String(formValues[key] || '').trim().length),
    [formValues]
  );

  const handleCreate = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!user) {
      setError('Sign in as admin to create a venue.');
      return;
    }

    if (missingFields.length) {
      setError(`Fill required fields: ${missingFields.join(', ')}`);
      return;
    }

    setCreating(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/partners/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formValues),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to create venue.');
      }
      setSuccess(`Created ${payload.slug}`);
      setFormValues((prev) => ({
        ...prev,
        venueName: '',
        city: '',
        fullAddress: '',
        venuePitch: '',
        logoUrl: '',
        venuePhotoUrl: '',
        venuePhotos: [],
        bookingUrl: '',
        allowedMealTags: [...DEFAULT_PARTNER_MEAL_TAG_IDS],
        sendOwnerEmail: false,
      }));
      setLogoMessage('');
      setPhotoMessage('');
      setVenuePhotoInputValue('');
      setVenues((prev) => [{ id: payload.slug, ...payload.partner }, ...prev]);
    } catch (err) {
      console.error('admin venue create failed', err);
      setError(err?.message || 'Unable to create venue.');
    } finally {
      setCreating(false);
    }
  };

  const handleContactUpdate = async (event) => {
    event.preventDefault();
    setUpdateMessage('');
    setError('');
    if (!user) {
      setError('Sign in as admin to update contact details.');
      return;
    }
    if (!updateForm.slug || !updateForm.contactEmail) {
      setError('Slug and contact email are required to update.');
      return;
    }
    setUpdating(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/partners/updateAssets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          slug: updateForm.slug.trim(),
          contactEmail: updateForm.contactEmail.trim(),
          contactName: updateForm.contactName,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to update contact.');
      }
      setUpdateMessage('Contact updated.');
    } catch (err) {
      console.error('admin contact update failed', err);
      setError(err?.message || 'Unable to update contact.');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <p className="p-6">Loading...</p>;
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1 className="text-2xl font-bold">Admin Login</h1>
        <p className="text-sm text-gray-600 mt-2">Only admin emails can access the venue tool.</p>
        <button
          onClick={login}
          className="mt-4 px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Login with Google
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <p className="text-sm text-gray-500">Admin: {user.email}</p>
          <h1 className="text-3xl font-bold">Admin Venues</h1>
          <p className="text-sm text-gray-600">Create or inspect venue pages without Stripe.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/admin')}
            className="px-4 py-2 text-sm rounded border border-gray-300 hover:bg-gray-50"
          >
            Back to dashboard
          </button>
          <button
            onClick={() => router.push('/partners/start')}
            className="px-4 py-2 text-sm rounded border border-gray-300 hover:bg-gray-50"
          >
            View venue marketing
          </button>
        </div>
      </div>

      <form onSubmit={handleCreate} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Create venue</h2>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formValues.sendOwnerEmail}
                onChange={handleCheckbox('sendOwnerEmail')}
              />
              Send owner email
            </label>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700">Venue name*</label>
            <input
              value={formValues.venueName}
              onChange={handleInput('venueName')}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="Venue name"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700">City*</label>
            <input
              value={formValues.city}
              onChange={handleInput('city')}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="City"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700">Contact name*</label>
            <input
              value={formValues.contactName}
              onChange={handleInput('contactName')}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="Admin / owner"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700">Contact email*</label>
            <input
              type="email"
              value={formValues.contactEmail}
              onChange={handleInput('contactEmail')}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="owner@venue.com"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700">Full address*</label>
            <input
              value={formValues.fullAddress}
              onChange={handleInput('fullAddress')}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="123 Street, City"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700">Brand color*</label>
            <input
              value={formValues.brandColor}
              onChange={handleInput('brandColor')}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="#0f172a"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-gray-700">Venue pitch*</label>
            <textarea
              value={formValues.venuePitch}
              onChange={handleInput('venuePitch')}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              rows={3}
              placeholder="Short pitch shown on the page."
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700">Logo URL*</label>
            <input
              value={formValues.logoUrl}
              onChange={handleInput('logoUrl')}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="https://..."
            />
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <input
                ref={logoFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoFile}
                className="text-sm"
              />
              <span className="text-xs text-gray-600">
                {uploadingLogo ? 'Uploading logo...' : logoMessage || 'Upload a logo or paste a URL.'}
              </span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700">Hero photo URL</label>
            <input
              value={formValues.venuePhotoUrl}
              onChange={handleInput('venuePhotoUrl')}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="https://..."
            />
          <p className="text-xs text-gray-500 mt-1">Defaults to the first gallery photo if left empty. Click “Set as hero” below to pick one.</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700">Booking URL (optional)</label>
            <input
              value={formValues.bookingUrl}
              onChange={handleInput('bookingUrl')}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="https://bookings.venue.com"
            />
          </div>
        </div>

        <div className="md:col-span-2">
          <p className="text-sm font-semibold text-gray-700">Venue gallery (up to {MAX_PARTNER_GALLERY_PHOTOS})</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <input
              value={venuePhotoInputValue}
              onChange={(e) => setVenuePhotoInputValue(e.target.value)}
              className="flex-1 min-w-[200px] rounded-lg border px-3 py-2"
              placeholder="https://photo-url.com/image.jpg"
            />
            <button
              type="button"
              onClick={handleAddVenuePhotoFromInput}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
            >
              Add URL
            </button>
            <input
              ref={venuePhotoFileInputRef}
              type="file"
              accept="image/*"
              onChange={handleVenuePhotoFile}
              className="text-sm"
            />
          </div>
          <p className="text-xs text-gray-600 mt-1">
            {uploadingPhoto ? 'Uploading photo...' : photoMessage || 'Upload or paste URLs; first photo becomes hero by default.'}
          </p>
          <div className="flex flex-wrap gap-3 mt-2">
            {Array.isArray(formValues.venuePhotos) && formValues.venuePhotos.length === 0 && (
              <span className="text-xs text-gray-500">No gallery photos yet.</span>
            )}
            {Array.isArray(formValues.venuePhotos) &&
              formValues.venuePhotos.map((url) => {
                const isHero = formValues.venuePhotoUrl === url;
                return (
                  <div
                    key={url}
                    className={`rounded-lg border px-3 py-2 text-xs flex items-center gap-2 bg-white shadow-sm ${
                      isHero ? 'border-blue-500' : 'border-gray-200'
                    }`}
                  >
                    <a className="text-blue-600 underline" href={url} target="_blank" rel="noopener noreferrer">
                      View
                    </a>
                    {isHero ? (
                      <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700">Hero photo</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setFormValues((prev) => ({ ...prev, venuePhotoUrl: url }))}
                        className="rounded-full border border-gray-300 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Set as hero
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeVenuePhotoUrl(url)}
                      className="text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Meal tags</p>
          <div className="flex flex-wrap gap-2">
            {PARTNER_MEAL_TAGS.map((tag) => {
              const active = formValues.allowedMealTags.includes(tag.id);
              return (
                <button
                  type="button"
                  key={tag.id}
                  onClick={() => toggleMealTag(tag.id)}
                  className={`rounded-full px-3 py-1 text-sm border ${
                    active ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 text-slate-700'
                  }`}
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && <p className="text-sm text-rose-600 font-medium">{error}</p>}
        {success && <p className="text-sm text-emerald-600 font-medium">{success}</p>}

        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Create venue'}
        </button>
      </form>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Existing venues</h2>
          {fetchingVenues && <p className="text-xs text-gray-500">Refreshing...</p>}
        </div>
        {!venues.length ? (
          <p className="text-sm text-gray-600 mt-3">No venues yet.</p>
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b bg-gray-50">
                  <th className="px-3 py-2">Venue</th>
                  <th className="px-3 py-2">City</th>
                  <th className="px-3 py-2">Contact</th>
                  <th className="px-3 py-2">Slug</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {venues.map((venue) => {
                  const slug = venue.slug || venue.id;
                  return (
                    <tr key={slug} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold">{venue.venueName || '-'}</td>
                      <td className="px-3 py-2">{venue.city || '-'}</td>
                      <td className="px-3 py-2">{venue.contactEmail || '-'}</td>
                      <td className="px-3 py-2">
                        <a
                          className="text-blue-600 underline"
                          href={`/p/${slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {slug}
                        </a>
                      </td>
                      <td className="px-3 py-2 capitalize">{venue.status || 'active'}</td>
                      <td className="px-3 py-2 text-right">
                        <a
                          className="inline-flex items-center rounded border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                          href={`/p/${slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Edit
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <form onSubmit={handleContactUpdate} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold">Update contact email</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-700">Slug*</label>
            <input
              value={updateForm.slug}
              onChange={(e) => setUpdateForm((prev) => ({ ...prev, slug: e.target.value }))}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="venue-slug"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700">Contact email*</label>
            <input
              type="email"
              value={updateForm.contactEmail}
              onChange={(e) => setUpdateForm((prev) => ({ ...prev, contactEmail: e.target.value }))}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="owner@venue.com"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700">Contact name</label>
            <input
              value={updateForm.contactName}
              onChange={(e) => setUpdateForm((prev) => ({ ...prev, contactName: e.target.value }))}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="Owner name"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={updating}
            className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {updating ? 'Updating...' : 'Update contact'}
          </button>
          {updateMessage && <p className="text-sm text-emerald-600 font-semibold">{updateMessage}</p>}
        </div>
      </form>
    </div>
  );
}

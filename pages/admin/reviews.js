import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { collection, getDocs, orderBy, query, updateDoc, doc } from 'firebase/firestore';
import { format } from 'date-fns';
import { auth, db } from '@/lib/firebase';
import { isAdminEmail } from '@/lib/adminUsers';

const formatDate = (value) => {
  if (!value) return '';
  if (value?.seconds) {
    return format(new Date(value.seconds * 1000), 'd MMM yyyy');
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, 'd MMM yyyy');
};

const getCreatedAtMs = (value) => {
  if (value?.seconds) return value.seconds * 1000;
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

export default function AdminReviews() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [filterPublicOnly, setFilterPublicOnly] = useState(false);
  const [filterMissingConsent, setFilterMissingConsent] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser && isAdminEmail(currentUser.email)) {
        setUser(currentUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      fetchReviews();
    }
  }, [user]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const fetchReviews = async () => {
    const reviewsQuery = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(reviewsQuery);
    const docs = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    setReviews(docs);
  };

  const toggleConsent = async (reviewId, currentConsent) => {
    setSavingId(reviewId);
    try {
      await updateDoc(doc(db, 'reviews', reviewId), {
        consentPublic: !currentConsent,
      });
      setReviews((prev) =>
        prev.map((review) =>
          review.id === reviewId ? { ...review, consentPublic: !currentConsent } : review
        )
      );
    } finally {
      setSavingId(null);
    }
  };

  const filteredReviews = useMemo(() => {
    return reviews.filter((review) => {
      if (filterPublicOnly && !review.consentPublic) return false;
      if (filterMissingConsent && review.consentPublic) return false;
      return true;
    });
  }, [reviews, filterPublicOnly, filterMissingConsent]);

  const sortedReviews = useMemo(() => {
    return [...filteredReviews].sort(
      (a, b) => getCreatedAtMs(b.createdAt) - getCreatedAtMs(a.createdAt)
    );
  }, [filteredReviews]);

  const publicCount = reviews.filter((review) => review.consentPublic).length;
  const privateCount = reviews.length - publicCount;

  if (loading) return <p>Loading...</p>;
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <h1 className="text-2xl font-bold">Admin Login</h1>
        <button
          onClick={login}
          className="mt-4 rounded bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
        >
          Login with Google
        </button>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Review Manager</h1>
          <p className="text-sm text-gray-600">
            Approve reviews to show on the public reviews page.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => router.push('/admin')}
            className="rounded bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-800"
          >
            ← Back to dashboard
          </button>
          <button
            type="button"
            onClick={() => router.push('/reviews')}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
          >
            View public reviews
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
          Total: {reviews.length}
        </span>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
          Public: {publicCount}
        </span>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">
          Private: {privateCount}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => {
            setFilterPublicOnly((prev) => !prev);
            setFilterMissingConsent(false);
          }}
          className="rounded bg-gray-200 px-4 py-2 text-sm"
        >
          {filterPublicOnly ? 'Show all reviews' : 'Show public reviews'}
        </button>
        <button
          type="button"
          onClick={() => {
            setFilterMissingConsent((prev) => !prev);
            setFilterPublicOnly(false);
          }}
          className="rounded bg-gray-200 px-4 py-2 text-sm"
        >
          {filterMissingConsent ? 'Show all reviews' : 'Show private reviews'}
        </button>
      </div>

      {sortedReviews.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
          No reviews found.
        </div>
      ) : (
        <div className="space-y-4">
          {sortedReviews.map((review) => {
            const organiserLine = [review.firstName, review.city].filter(Boolean).join(' · ');
            const organiserLabel =
              organiserLine || review.organiserName || review.organiserEmailHash || 'Anonymous';
            return (
              <div
                key={review.id}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-gray-400">
                      {formatDate(review.createdAt) || 'Unknown date'}
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-gray-900">
                      “{review.text}”
                    </h2>
                    <p className="mt-2 text-sm text-gray-500">
                      {organiserLabel}
                      {review.eventTitle ? ` · ${review.eventTitle}` : ''}
                      {review.location ? ` · ${review.location}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                      Rating: {review.rating || '—'}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleConsent(review.id, review.consentPublic)}
                      disabled={savingId === review.id}
                      className={`rounded-full px-4 py-2 text-xs font-semibold ${
                        review.consentPublic
                          ? 'bg-emerald-600 text-white'
                          : 'bg-amber-200 text-amber-900'
                      }`}
                    >
                      {savingId === review.id
                        ? 'Saving…'
                        : review.consentPublic
                        ? 'Public'
                        : 'Private'}
                    </button>
                  </div>
                </div>
                {review.pollId ? (
                  <p className="mt-3 text-xs text-gray-400">Poll ID: {review.pollId}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

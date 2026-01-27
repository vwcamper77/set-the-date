import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { format } from 'date-fns';
import { auth } from '@/lib/firebase';
import { isAdminEmail } from '@/lib/adminUsers';
import ReviewStars from '@/components/ReviewStars';

const provider = new GoogleAuthProvider();

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, 'd MMM yyyy');
};

export default function AdminReviewsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [error, setError] = useState('');

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
    const loadReviews = async () => {
      setError('');
      setLoadingReviews(true);
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/admin/reviews', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to load reviews.');
        }
        setReviews(Array.isArray(payload.reviews) ? payload.reviews : []);
      } catch (err) {
        console.error('admin reviews load failed', err);
        setError('Unable to load reviews right now.');
      } finally {
        setLoadingReviews(false);
      }
    };
    loadReviews();
  }, [user]);

  const publicReviews = useMemo(
    () => reviews.filter((review) => review.consentPublic),
    [reviews]
  );

  const login = () => {
    signInWithPopup(auth, provider).catch((err) => {
      console.error('admin login failed', err);
      setError('Login failed. Try again.');
    });
  };

  if (loading) return <p>Loading...</p>;
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <h1 className="text-2xl font-bold">Admin Login</h1>
        <button onClick={login} className="mt-4 rounded bg-blue-600 px-6 py-2 text-white hover:bg-blue-700">
          Login with Google
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Review Manager</h1>
          <p className="text-sm text-slate-600">
            Track attendee feedback and confirm which reviews can be shown publicly.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => router.push('/admin')}
            className="rounded bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800"
          >
            Back to dashboard
          </button>
          <a
            href="/reviews"
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
          >
            View public reviews
          </a>
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Total reviews</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{reviews.length}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Public consent</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{publicReviews.length}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Pending only</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {reviews.length - publicReviews.length}
          </p>
        </div>
      </div>

      {loadingReviews ? <p className="text-sm text-slate-500">Loading reviews…</p> : null}
      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

      {reviews.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
          No reviews found yet.
        </div>
      ) : (
        <div className="grid gap-4">
          {reviews.map((review) => {
            const nameLine = [review.firstName, review.city].filter(Boolean).join(' · ');
            const createdAt = formatDate(review.createdAt);
            return (
              <article key={review.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                  <div className="flex flex-wrap items-center gap-2 uppercase tracking-[0.3em]">
                    <ReviewStars rating={review.rating} />
                    {review.verifiedOrganiser ? <span>Verified attendee</span> : null}
                  </div>
                  <span className={review.consentPublic ? 'text-emerald-600' : 'text-amber-600'}>
                    {review.consentPublic ? 'Public' : 'Private'}
                  </span>
                </div>
                <p className="mt-3 text-base font-semibold text-slate-900">
                  "{review.text}"
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {nameLine ? <span>{nameLine}</span> : null}
                  {nameLine && createdAt ? <span>·</span> : null}
                  {createdAt ? <span>{createdAt}</span> : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

import Head from 'next/head';
import Link from 'next/link';
import { format } from 'date-fns';
import LogoHeader from '@/components/LogoHeader';
import ReviewStars from '@/components/ReviewStars';
import { serializeFirestoreData } from '@/utils/serializeFirestore';

const PAGE_SIZE = 8;

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, 'd MMM yyyy');
};

const formatName = (firstName, city) => {
  const name = firstName?.trim();
  const cityName = city?.trim();
  if (name && cityName) return `${name} in ${cityName}`;
  if (name) return name;
  if (cityName) return cityName;
  return '';
};

const getCreatedAtMs = (value) => {
  if (!value) return 0;
  if (typeof value.toDate === 'function') {
    return value.toDate().getTime();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 0;
  return parsed.getTime();
};

const isMissingIndexError = (error) => {
  if (!error) return false;
  if (error?.code === 9) return true;
  return typeof error?.message === 'string' && error.message.includes('requires an index');
};

export default function ReviewsPage({ reviews, page, hasNext }) {
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = hasNext ? page + 1 : null;

  return (
    <>
      <Head>
        <title>Set The Date reviews</title>
      </Head>
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
          <LogoHeader compact />
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Reviews</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">
              Organiser reviews
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Shared with permission from organisers who used Set The Date.
            </p>
          </div>

          {reviews.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
              No public reviews yet.
            </div>
          ) : (
            <div className="grid gap-4">
              {reviews.map((review) => {
                const nameLine = formatName(review.firstName, review.city);
                const createdAt = formatDate(review.createdAt);
                return (
                  <article
                    key={review.id}
                    className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                      {review.verifiedOrganiser ? <span>Verified organiser</span> : null}
                      <ReviewStars rating={review.rating} />
                    </div>
                    <p className="mt-3 text-lg font-semibold text-slate-900">
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

          <div className="flex items-center justify-between">
            {prevPage ? (
              <Link
                href={`/reviews?page=${prevPage}`}
                className="rounded-full border border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-900 hover:text-white transition"
              >
                Previous
              </Link>
            ) : (
              <span />
            )}
            {nextPage ? (
              <Link
                href={`/reviews?page=${nextPage}`}
                className="rounded-full border border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-900 hover:text-white transition"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

export async function getServerSideProps({ query }) {
  const pageParam = Number.parseInt(query?.page, 10);
  const page = Number.isFinite(pageParam) && pageParam > 1 ? pageParam : 1;
  const offset = (page - 1) * PAGE_SIZE;

  try {
    const { db: adminDb } = await import('@/lib/firebaseAdmin');
    let snapshot;
    try {
      snapshot = await adminDb
        .collection('reviews')
        .where('consentPublic', '==', true)
        .orderBy('createdAt', 'desc')
        .offset(offset)
        .limit(PAGE_SIZE + 1)
        .get();
    } catch (error) {
      if (!isMissingIndexError(error)) {
        throw error;
      }
      console.warn('reviews page missing index, falling back to in-memory sort');
      const fallbackSnapshot = await adminDb
        .collection('reviews')
        .where('consentPublic', '==', true)
        .get();
      const sortedDocs = fallbackSnapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => getCreatedAtMs(b.createdAt) - getCreatedAtMs(a.createdAt));
      snapshot = {
        docs: sortedDocs.slice(offset, offset + PAGE_SIZE + 1).map((doc) => ({
          id: doc.id,
          data: () => {
            const { id, ...data } = doc;
            return data;
          },
        })),
      };
    }

    const docs = snapshot.docs.map((doc) =>
      serializeFirestoreData({ id: doc.id, ...doc.data() })
    );
    const hasNext = docs.length > PAGE_SIZE;
    if (hasNext) docs.pop();

    return {
      props: {
        reviews: docs,
        page,
        hasNext,
      },
    };
  } catch (error) {
    console.error('reviews page error', error);
    return {
      props: {
        reviews: [],
        page: 1,
        hasNext: false,
      },
    };
  }
}

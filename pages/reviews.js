import Head from 'next/head';
import Link from 'next/link';
import { format } from 'date-fns';
import LogoHeader from '@/components/LogoHeader';
import ReviewStars from '@/components/ReviewStars';
import { serializeFirestoreData } from '@/utils/serializeFirestore';

const PAGE_SIZE = 8;

const isPublicReview = (review) => {
  if (typeof review?.publicDisplay === 'boolean') {
    return review.publicDisplay === true;
  }
  const consentValue =
    review.publicConsent || (review.consentPublic ? 'yes' : 'pending');
  const visibility =
    review.visibility || (consentValue === 'yes' ? 'public' : 'private');
  const moderation =
    review.moderationStatus || (consentValue === 'yes' ? 'approved' : 'pending');
  return consentValue === 'yes' && visibility === 'public' && moderation === 'approved';
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, 'd MMM yyyy');
};

const formatName = (nameValue, cityValue) => {
  const name = nameValue?.trim();
  const cityName = cityValue?.trim();
  if (name && cityName) return `${name} in ${cityName}`;
  if (name) return name;
  if (cityName) return cityName;
  return '';
};

const buildSchemaMarkup = ({ reviews, averageRating, reviewCount }) => {
  const safeAverage = Number.isFinite(averageRating) ? averageRating : 0;
  const safeCount = Number.isFinite(reviewCount) ? reviewCount : 0;
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Set The Date',
    url: 'https://plan.setthedate.app/reviews',
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: Number(safeAverage.toFixed(1)),
      reviewCount: safeCount,
    },
    review: reviews.map((review) => ({
      '@type': 'Review',
      reviewBody: review.text,
      datePublished: review.createdAt,
      reviewRating: {
        '@type': 'Rating',
        ratingValue: review.rating,
      },
      author: {
        '@type': 'Person',
        name:
          review.reviewerName ||
          review.firstName ||
          (review.reviewerRole === 'organiser' ? 'Verified organiser' : 'Verified attendee'),
      },
    })),
  };
};

export default function ReviewsPage({ reviews, page, hasNext, aggregate }) {
  const averageRating = aggregate?.averageRating || 0;
  const reviewCount = aggregate?.reviewCount || 0;
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = hasNext ? page + 1 : null;
  const schemaMarkup = buildSchemaMarkup({
    reviews,
    averageRating,
    reviewCount,
  });

  return (
    <>
      <Head>
        <title>Set The Date reviews</title>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaMarkup) }}
        />
      </Head>
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
          <LogoHeader compact />
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Reviews</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">
              Verified reviews
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Shared with permission from organisers and attendees who used Set The Date.
            </p>
          </div>

          <div className="grid gap-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <p className="text-xs uppercase tracking-[0.35em] text-slate-400">
                Aggregate rating
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-3xl font-semibold text-slate-900">
                  {Number.isFinite(averageRating) ? averageRating.toFixed(1) : '0.0'}
                </span>
                <ReviewStars rating={Math.round(averageRating)} sizeClass="h-5 w-5" />
                <span className="text-xs text-slate-500">
                  {reviewCount} review{reviewCount === 1 ? '' : 's'}
                </span>
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
              <p className="text-xs uppercase tracking-[0.35em] text-slate-400">
                How we verify reviews
              </p>
              <p className="mt-2">
                Verified attendee means the review is tied to a real vote or organiser token.
                We never show emails on this page.
              </p>
            </div>
          </div>

          {reviews.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
              No public reviews yet.
            </div>
          ) : (
            <div className="grid gap-4">
              {reviews.map((review) => {
                const nameLine = formatName(
                  review.reviewerName || review.firstName,
                  review.reviewerCity || review.city
                );
                const createdAt = formatDate(review.createdAt);
                const verifiedLabel = review.verified
                  ? review.reviewerRole === 'organiser'
                    ? 'Verified organiser'
                    : 'Verified attendee'
                  : null;
                const eventTitle = review.pollTitleSnapshot || review.eventTitle || null;
                return (
                  <article
                    key={review.id}
                    className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                      {verifiedLabel ? <span>{verifiedLabel}</span> : null}
                      <ReviewStars rating={review.rating} />
                    </div>
                    <p className="mt-3 text-lg font-semibold text-slate-900">
                      "{review.text}"
                    </p>
                    {review.replyPublic?.text ? (
                      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                          Reply from Set The Date
                        </p>
                        <p className="mt-2">{review.replyPublic.text}</p>
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {nameLine ? <span>{nameLine}</span> : null}
                      {nameLine && createdAt ? <span>/</span> : null}
                      {createdAt ? <span>{createdAt}</span> : null}
                      {eventTitle ? (
                        <>
                          <span>/</span>
                          <span>{eventTitle}</span>
                        </>
                      ) : null}
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
    const baseQuery = adminDb
      .collection('reviews')
      .where('consentPublic', '==', true)
      .orderBy('createdAt', 'desc');
    const snapshot = await baseQuery.offset(offset).limit(PAGE_SIZE + 1).get();

    const docs = snapshot.docs.map((doc) =>
      serializeFirestoreData({ id: doc.id, ...doc.data() })
    );
    const filtered = docs.filter(isPublicReview);
    const hasNext = filtered.length > PAGE_SIZE;
    if (hasNext) filtered.pop();

    const aggregateSnap = await baseQuery.get();
    const aggregateDocs = aggregateSnap.docs
      .map((doc) => serializeFirestoreData({ id: doc.id, ...doc.data() }))
      .filter(isPublicReview);
    const reviewCount = aggregateDocs.length;
    const averageRating =
      reviewCount > 0
        ? aggregateDocs.reduce((sum, review) => sum + (Number(review.rating) || 0), 0) /
          reviewCount
        : 0;

    return {
      props: {
        reviews: filtered,
        page,
        hasNext,
        aggregate: {
          reviewCount,
          averageRating,
        },
      },
    };
  } catch (error) {
    console.error('reviews page error', error);
    return {
      props: {
        reviews: [],
        page: 1,
        hasNext: false,
        aggregate: {
          reviewCount: 0,
          averageRating: 0,
        },
      },
    };
  }
}

import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import LogoHeader from '@/components/LogoHeader';
import ReviewStars from '@/components/ReviewStars';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';

const GOOGLE_REVIEW_URL = 'https://g.page/r/CcNH5Ymc8VoGEBM/review';
const FACEBOOK_REVIEW_URL = 'https://www.facebook.com/setthedateapp/reviews';
const MAX_REVIEW_LENGTH = 500;

const StarButton = ({ filled, onClick, label }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className="rounded-full p-1 transition hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
  >
    <svg viewBox="0 0 20 20" className="h-7 w-7" aria-hidden="true">
      <path
        d="M10 1.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L10 1.5z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        className={filled ? 'text-amber-500' : 'text-slate-300'}
      />
    </svg>
  </button>
);

const copyToClipboard = async (value) => {
  if (!value) return false;
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const success = document.execCommand('copy');
  document.body.removeChild(textarea);
  return success;
};

export default function ReviewPage({ poll, pollId, token, error }) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [firstName, setFirstName] = useState('');
  const [consentPublic, setConsentPublic] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submittedReview, setSubmittedReview] = useState(null);
  const [copyStatus, setCopyStatus] = useState('');
  const [shareStatus, setShareStatus] = useState('');

  const remaining = MAX_REVIEW_LENGTH - text.length;
  const isLowRating = rating > 0 && rating <= 3;
  const hasSubmission = Boolean(submittedReview);

  const shareUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || 'https://plan.setthedate.app';

  const displayName = useMemo(() => {
    if (!submittedReview) return '';
    const name = submittedReview.firstName?.trim();
    if (name) return name;
    return '';
  }, [submittedReview]);

  useEffect(() => {
    if (!error) {
      logEventIfAvailable('review_page_view', { pollId });
    }
  }, [error, pollId]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');

    if (!rating) {
      setSubmitError('Choose a star rating before submitting.');
      return;
    }
    if (!text.trim()) {
      setSubmitError('Add a short review before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/reviews/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pollId,
          token,
          rating,
          text: text.trim(),
          firstName,
          consentPublic,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.message || 'Unable to submit your review.');
      }
      setSubmittedReview(payload.review);
      logEventIfAvailable('review_submitted', { pollId, rating, consentPublic });
    } catch (err) {
      setSubmitError(err?.message || 'Unable to submit your review.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyReview = async () => {
    if (!submittedReview?.text) return;
    const success = await copyToClipboard(submittedReview.text);
    setCopyStatus(success ? 'Copied review text.' : 'Unable to copy text.');
    logEventIfAvailable('review_copy_text', { pollId });
    setTimeout(() => setCopyStatus(''), 2000);
  };

  const handleShare = async () => {
    const sharePayload = {
      title: 'Set The Date',
      text: 'Plan your event in minutes with Set The Date.',
      url: shareUrl,
    };
    try {
      if (navigator?.share) {
        await navigator.share(sharePayload);
        setShareStatus('Thanks for sharing.');
      } else {
        const success = await copyToClipboard(shareUrl);
        setShareStatus(success ? 'Link copied.' : 'Unable to copy link.');
      }
    } catch {
      setShareStatus('Share cancelled.');
    }
    setTimeout(() => setShareStatus(''), 2000);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-xl text-center">
          <LogoHeader compact />
          <h1 className="text-2xl font-semibold text-slate-900">Review link unavailable</h1>
          <p className="mt-3 text-sm text-slate-600">{error}</p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center justify-center rounded-full border border-slate-900 px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-900 hover:text-white transition"
          >
            Back to Set The Date
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Leave a review</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-rose-50 px-4 py-8">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
          <LogoHeader compact />

          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Review</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">
              Leave a quick rating and review
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Thanks for organising {poll?.eventTitle || 'your event'}
              {poll?.location ? ` in ${poll.location}` : ''}.
            </p>
          </div>

          {!hasSubmission ? (
            <form
              onSubmit={handleSubmit}
              className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm shadow-slate-200/60"
            >
              <div>
                <label className="text-sm font-semibold text-slate-900">
                  Your rating
                </label>
                <div className="mt-3 flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <StarButton
                      key={`rating-${value}`}
                      filled={value <= rating}
                      label={`Set rating to ${value}`}
                      onClick={() => setRating(value)}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-5">
                <label className="text-sm font-semibold text-slate-900">
                  Your review
                </label>
                <textarea
                  rows={4}
                  maxLength={MAX_REVIEW_LENGTH}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                  placeholder="Share a short note about your experience."
                />
                <p className="mt-2 text-xs text-slate-500">
                  {remaining} characters left
                </p>
              </div>

              <div className="mt-5">
                <label className="text-xs font-semibold text-slate-600">First name (optional)</label>
                <input
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                  placeholder="Your name"
                />
              </div>

              <label className="mt-5 flex items-start gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={consentPublic}
                  onChange={(event) => setConsentPublic(event.target.checked)}
                  className="mt-1"
                />
                <span>I am happy for this review to be shown publicly on Set The Date.</span>
              </label>

              {isLowRating ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <span className="font-semibold">Need help?</span> If something did not work, reply to this email and we will help.
                </div>
              ) : null}

              {submitError ? (
                <p className="mt-3 text-sm text-red-600">{submitError}</p>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="mt-5 w-full rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {submitting ? 'Submitting...' : 'Submit review'}
              </button>

              <p className="mt-3 text-xs text-slate-500">
                If something did not work, reply to this email and we will help.
              </p>
            </form>
          ) : (
            <div className="space-y-5">
              <div className="rounded-3xl border border-amber-200 bg-white p-5 shadow-sm shadow-amber-200/70">
                <p className="text-xs uppercase tracking-[0.35em] text-amber-600">
                  Thank you
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  Your review is ready to share
                </h2>
                <div className="mt-4 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-5 text-white shadow-lg">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-amber-200">
                    <span>Verified attendee</span>
                    <ReviewStars rating={submittedReview.rating} sizeClass="h-5 w-5" className="text-white" />
                  </div>
                  <blockquote className="mt-4 text-2xl font-semibold leading-snug">
                    "{submittedReview.text}"
                  </blockquote>
                  {displayName ? (
                    <p className="mt-3 text-sm text-amber-100">{displayName}</p>
                  ) : null}
                  <p className="mt-4 text-xs uppercase tracking-[0.3em] text-amber-200">
                    {submittedReview.eventTitle || poll?.eventTitle || 'Set The Date event'}
                  </p>
                  {submittedReview.location || poll?.location ? (
                    <p className="mt-1 text-sm text-amber-100">
                      {submittedReview.location || poll?.location}
                    </p>
                  ) : null}
                </div>
              </div>

              {isLowRating ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                  <span className="font-semibold">Need help?</span> If something did not work, reply to this email and we will help.
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleCopyReview}
                  className="rounded-full border border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white"
                >
                  Copy review text
                </button>
                <a
                  href={GOOGLE_REVIEW_URL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => logEventIfAvailable('review_click_google', { pollId })}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-emerald-500"
                >
                  Post on Google
                </a>
                <a
                  href={FACEBOOK_REVIEW_URL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => logEventIfAvailable('review_click_facebook', { pollId })}
                  className="rounded-full bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-blue-500"
                >
                  Post on Facebook
                </a>
                <button
                  type="button"
                  onClick={handleShare}
                  className="rounded-full border border-amber-300 bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-200"
                >
                  Share Set The Date
                </button>
              </div>

              {copyStatus ? (
                <p className="text-xs text-slate-600">{copyStatus}</p>
              ) : null}
              {shareStatus ? (
                <p className="text-xs text-slate-600">{shareStatus}</p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export async function getServerSideProps({ params, query }) {
  const pollId = params.pollId;
  const token = typeof query.token === 'string' ? query.token : '';

  try {
    const { db: adminDb } = await import('@/lib/firebaseAdmin');
    const pollSnap = await adminDb.collection('polls').doc(pollId).get();

    if (!pollSnap.exists) {
      return {
        props: {
          error: 'This review link is not valid.',
        },
      };
    }

    const poll = pollSnap.data();
    const tokenValid = Boolean(token && poll?.editToken && token === poll.editToken);

    if (!tokenValid) {
      return {
        props: {
          error: 'This review link has expired or is not valid.',
        },
      };
    }

    return {
      props: {
        poll: {
          eventTitle: poll.eventTitle || 'your event',
          location: poll.location || '',
          organiserName:
            poll.organiserFirstName || poll.organiserName || poll.organiser || '',
        },
        pollId,
        token,
      },
    };
  } catch (error) {
    console.error('review page error', error);
    return {
      props: {
        error: 'We could not load this review link. Please try again later.',
      },
    };
  }
}

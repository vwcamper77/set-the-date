import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { isAdminEmail } from '@/lib/adminUsers';
import ReviewStars from '@/components/ReviewStars';

const FLAG_REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'abusive', label: 'Abusive' },
  { value: 'fake', label: 'Fake' },
  { value: 'personal_data', label: 'Personal data' },
];
const EMAIL_TEMPLATES = {
  thanks: {
    subject: 'Thanks for your review',
    message: 'Thanks for the review - really appreciate it.',
  },
  sorry: {
    subject: 'Sorry it was not great',
    message: "Sorry it wasn't great. If you want to share more detail, I read every reply.",
  },
  detail: {
    subject: 'Could you share a little more detail?',
    message: 'If you have a moment, could you share a little more detail? It helps us fix the right things.',
  },
};

const normalizeDate = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (value?.seconds) return new Date(value.seconds * 1000);
  if (value instanceof Date) return value;
  return null;
};

const formatDateTime = (value) => {
  const date = normalizeDate(value);
  if (!date) return 'Unknown';
  return format(date, 'd MMM yyyy, HH:mm');
};

const formatDateOnly = (value) => {
  const date = normalizeDate(value);
  if (!date) return '';
  return format(date, 'd MMM yyyy');
};

const maskEmail = (email) => {
  if (!email) return '';
  const [user, domain] = email.split('@');
  if (!domain) return `${user?.slice(0, 1) || ''}***`;
  const maskedUser = user.length <= 2 ? `${user[0]}*` : `${user.slice(0, 2)}***`;
  const domainParts = domain.split('.');
  const domainName = domainParts[0] || '';
  const domainTail = domainParts.slice(1).join('.');
  const maskedDomain = domainName ? `${domainName[0]}***` : '';
  return `${maskedUser}@${maskedDomain}${domainTail ? `.${domainTail}` : ''}`;
};

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

const normalizeReview = (review) => {
  const publicConsent =
    review.publicConsent || (review.consentPublic ? 'yes' : 'pending');
  const visibility =
    review.visibility || (publicConsent === 'yes' ? 'public' : 'private');
  const moderationStatus =
    review.moderationStatus || (publicConsent === 'yes' ? 'approved' : 'pending');
  return {
    ...review,
    publicConsent,
    visibility,
    moderationStatus,
    reviewerRole: review.reviewerRole || 'organiser',
    verified: review.verified ?? review.verifiedOrganiser ?? false,
  };
};

const StatusChip = ({ label, tone }) => (
  <span
    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}
  >
    {label}
  </span>
);

const getVisibilityTone = (value) => {
  if (value === 'public') return 'bg-emerald-100 text-emerald-700';
  return 'bg-slate-100 text-slate-700';
};

const getConsentTone = (value) => {
  if (value === 'yes') return 'bg-emerald-100 text-emerald-700';
  if (value === 'no') return 'bg-rose-100 text-rose-700';
  return 'bg-amber-100 text-amber-700';
};

const getModerationTone = (value) => {
  if (value === 'approved') return 'bg-emerald-100 text-emerald-700';
  if (value === 'hidden') return 'bg-amber-100 text-amber-700';
  if (value === 'deleted') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-700';
};

export default function ReviewManager() {
  const [user, setUser] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [copyStatus, setCopyStatus] = useState({});
  const [flagReasons, setFlagReasons] = useState({});
  const [lastDeleted, setLastDeleted] = useState(null);
  const [emailModal, setEmailModal] = useState({
    open: false,
    review: null,
    template: 'thanks',
    subject: EMAIL_TEMPLATES.thanks.subject,
    message: EMAIL_TEMPLATES.thanks.message,
  });
  const [replyModal, setReplyModal] = useState({
    open: false,
    review: null,
    text: '',
    mode: 'public',
    sendEmailCopy: true,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      if (nextUser && isAdminEmail(nextUser.email)) {
        setUser(nextUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const stats = useMemo(() => {
    const total = reviews.length;
    const consentYes = reviews.filter((review) => review.publicConsent === 'yes').length;
    const pending = reviews.filter((review) => review.moderationStatus === 'pending').length;
    return { total, consentYes, pending };
  }, [reviews]);

  const fetchReviews = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/reviews/list', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to load reviews');
      }
      const normalized = (payload?.reviews || []).map(normalizeReview);
      setReviews(normalized);
    } catch (err) {
      setError(err?.message || 'Unable to load reviews');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchReviews();
  }, [user]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const withReviewAction = async (reviewId, action) => {
    setBusyId(reviewId);
    setNotice('');
    try {
      await action();
      await fetchReviews();
    } catch (err) {
      setNotice(err?.message || 'Action failed.');
    } finally {
      setBusyId('');
    }
  };

  const handleCopy = async (reviewId, key, value) => {
    const success = await copyToClipboard(value);
    setCopyStatus((prev) => ({ ...prev, [reviewId]: success ? key : '' }));
    setTimeout(() => {
      setCopyStatus((prev) => ({ ...prev, [reviewId]: '' }));
    }, 1500);
  };

  const updateReview = async (reviewId, updates) => {
    if (!user) throw new Error('Sign in required.');
    const token = await user.getIdToken();
    const response = await fetch('/api/admin/reviews/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reviewId, ...updates }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Unable to update review.');
    }
  };

  const sendContactEmail = async ({ reviewId, subject, message }) => {
    if (!user) throw new Error('Sign in required.');
    const token = await user.getIdToken();
    const response = await fetch('/api/admin/reviews/contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reviewId, subject, message }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Unable to send email.');
    }
  };

  const sendReply = async ({ reviewId, text, replyMode, sendEmailCopy }) => {
    if (!user) throw new Error('Sign in required.');
    const token = await user.getIdToken();
    const response = await fetch('/api/admin/reviews/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reviewId, text, replyMode, sendEmailCopy }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Unable to send reply.');
    }
  };

  const requestConsent = async (reviewId) => {
    if (!user) throw new Error('Sign in required.');
    const token = await user.getIdToken();
    const response = await fetch('/api/admin/reviews/requestConsent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reviewId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Unable to request consent.');
    }
  };

  const flagReview = async (reviewId, reason) => {
    if (!user) throw new Error('Sign in required.');
    const token = await user.getIdToken();
    const response = await fetch('/api/admin/reviews/flag', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reviewId, reason }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Unable to flag review.');
    }
  };

  const handleConsentChange = (review, nextConsent) =>
    withReviewAction(review.id, async () => {
      const updates = { publicConsent: nextConsent };
      if (nextConsent !== 'yes' && review.visibility === 'public') {
        updates.visibility = 'private';
      }
      await updateReview(review.id, updates);
    });

  const handleModerationChange = (review, nextStatus) =>
    withReviewAction(review.id, async () => {
      const updates = { moderationStatus: nextStatus };
      if (nextStatus === 'hidden' || nextStatus === 'deleted') {
        updates.visibility = 'private';
      }
      await updateReview(review.id, updates);
    });

  const handleMakePublic = (review) =>
    withReviewAction(review.id, async () => {
      await updateReview(review.id, { visibility: 'public', moderationStatus: 'approved' });
    });

  const handleMakePrivate = (review) =>
    withReviewAction(review.id, async () => {
      await updateReview(review.id, { visibility: 'private' });
    });

  const handleHide = (review) =>
    withReviewAction(review.id, async () => {
      await updateReview(review.id, { moderationStatus: 'hidden', visibility: 'private' });
    });

  const handleDelete = (review) =>
    withReviewAction(review.id, async () => {
      setLastDeleted({
        reviewId: review.id,
        moderationStatus: review.moderationStatus,
        visibility: review.visibility,
      });
      await updateReview(review.id, { moderationStatus: 'deleted', visibility: 'private' });
    });

  const handleUndoDelete = () => {
    if (!lastDeleted) return;
    const { reviewId, moderationStatus, visibility } = lastDeleted;
    return withReviewAction(reviewId, async () => {
      await updateReview(reviewId, {
        moderationStatus: moderationStatus || 'pending',
        visibility: visibility || 'private',
      });
      setLastDeleted(null);
    });
  };

  if (loading && !user) return <p className="p-8">Loading...</p>;

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
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">
              Review Manager
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">
              Review Manager
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Moderate, respond, and keep public reviews trustworthy.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin"
              className="rounded-full border border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white"
            >
              Back to dashboard
            </Link>
            <Link
              href="/reviews"
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              View public reviews
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-600 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Total reviews</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{stats.total}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Public consent</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{stats.consentYes}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Pending only</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{stats.pending}</p>
          </div>
        </div>

        {notice ? (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
            {notice}
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-sm text-slate-500">Loading reviews...</p>
        ) : reviews.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
            No reviews yet.
          </div>
        ) : (
          <div className="mt-6 grid gap-5">
            {reviews.map((review) => {
              const pollTitle = review.pollTitleSnapshot || review.eventTitle || 'Untitled event';
              const pollId = review.pollId || review.id;
              const location = review.pollLocationSnapshot || review.location || 'TBD';
              const reviewerName =
                review.reviewerName || review.firstName || review.organiserName || '';
              const reviewerCity = review.reviewerCity || review.city || '';
              const reviewerLabel =
                reviewerName && reviewerCity
                  ? `${reviewerName} / ${reviewerCity}`
                  : reviewerName || reviewerCity;
              const reviewerEmail = review.reviewerEmail || review.organiserEmail || '';
              const maskedEmail = maskEmail(reviewerEmail);
              const createdAt = formatDateTime(review.createdAt);
              const finalDate = formatDateOnly(review.pollFinalDateSnapshot || review.finalDate);
              const voteCount =
                review.votesCountSnapshot ?? review.votesCount ?? review.totalVotes ?? null;
              const inviteCount = review.attendeesInvitedSnapshot ?? null;
              const finalDateAttendees = review.attendeesOnFinalDateSnapshot ?? null;
              const isBusy = busyId === review.id;
              const copied = copyStatus[review.id];
              const consentValue = review.publicConsent || 'pending';
              const moderationValue = review.moderationStatus || 'pending';
              const visibilityValue = review.visibility || 'private';
              const canMakePublic =
                consentValue === 'yes' && moderationValue !== 'deleted';
              const roleLabel =
                review.reviewerRole === 'attendee' ? 'Attendee' : 'Organiser';

              return (
                <article
                  key={review.id}
                  className="rounded-3xl border border-slate-200 bg-white shadow-sm"
                >
                  <div className="grid gap-6 p-5 lg:grid-cols-[1fr_260px]">
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <Link
                            href={`/poll/${pollId}`}
                            className="text-lg font-semibold text-slate-900 hover:underline"
                          >
                            {pollTitle}
                          </Link>
                          <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                            Poll ID
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(review.id, 'poll', pollId)}
                            className="text-xs font-semibold text-slate-700"
                          >
                            {copied === 'poll' ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <span>Created: {createdAt}</span>
                          <span>Role: {roleLabel}</span>
                          {review.verified ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                              {review.reviewerRole === 'attendee'
                                ? 'Verified attendee'
                                : 'Verified organiser'}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                        <Link href={`/poll/${pollId}`} className="hover:text-slate-900">
                          View poll
                        </Link>
                        <Link href={`/results/${pollId}`} className="hover:text-slate-900">
                          View results
                        </Link>
                        <Link href={`/share/${pollId}`} className="hover:text-slate-900">
                          View share page
                        </Link>
                      </div>

                      <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                        <p>Attendees invited: {inviteCount ?? '-'}</p>
                        <p>People voted: {Number.isFinite(voteCount) ? voteCount : '-'}</p>
                        <p>
                          Attendees on final date:{' '}
                          {Number.isFinite(finalDateAttendees) ? finalDateAttendees : '-'}
                        </p>
                        <p>Location: {location || 'TBD'}</p>
                      </div>

                      {finalDate ? (
                        <p className="mt-2 text-xs text-slate-500">
                          Final date: {finalDate}
                        </p>
                      ) : null}

                      <div className="mt-4">
                        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                          <ReviewStars rating={review.rating} />
                        </div>
                        <p className="mt-3 text-lg font-semibold text-slate-900">
                          "{review.text}"
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          {reviewerLabel ? <span>{reviewerLabel}</span> : null}
                          {reviewerEmail ? (
                            <>
                              <span>/</span>
                              <button
                                type="button"
                                onClick={() => handleCopy(review.id, 'email', reviewerEmail)}
                                className="font-semibold text-slate-600"
                              >
                                {copied === 'email' ? 'Email copied' : maskedEmail}
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <StatusChip
                          label={visibilityValue === 'public' ? 'Public' : 'Private'}
                          tone={getVisibilityTone(visibilityValue)}
                        />
                        <StatusChip
                          label={`Consent: ${consentValue}`}
                          tone={getConsentTone(consentValue)}
                        />
                        <StatusChip
                          label={`Moderation: ${moderationValue}`}
                          tone={getModerationTone(moderationValue)}
                        />
                      </div>

                      {review.replyPublic?.text ? (
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                            Public reply
                          </p>
                          <p className="mt-2">{review.replyPublic.text}</p>
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          Actions
                        </p>
                        <div className="mt-3 flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => handleMakePublic(review)}
                            disabled={!canMakePublic || isBusy}
                            className="rounded-full bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            Make public
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMakePrivate(review)}
                            disabled={isBusy}
                            className="rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                          >
                            Make private
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              withReviewAction(review.id, () => requestConsent(review.id))
                            }
                            disabled={consentValue !== 'pending' || isBusy}
                            className="rounded-full border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-700 disabled:opacity-50"
                          >
                            Request public consent
                          </button>
                        </div>

                        <div className="mt-4 space-y-3">
                          <div>
                            <label className="text-xs font-semibold text-slate-600">
                              Consent
                            </label>
                            <select
                              value={consentValue}
                              onChange={(event) =>
                                handleConsentChange(review, event.target.value)
                              }
                              disabled={isBusy}
                              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                            >
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                              <option value="pending">Pending</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-600">
                              Moderation
                            </label>
                            <select
                              value={moderationValue}
                              onChange={(event) =>
                                handleModerationChange(review, event.target.value)
                              }
                              disabled={isBusy}
                              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                            >
                              <option value="approved">Approved</option>
                              <option value="pending">Pending</option>
                              <option value="hidden">Hidden</option>
                              <option value="deleted">Deleted</option>
                            </select>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setEmailModal({
                                open: true,
                                review,
                                template: 'thanks',
                                subject: EMAIL_TEMPLATES.thanks.subject,
                                message: EMAIL_TEMPLATES.thanks.message,
                              })
                            }
                            disabled={isBusy}
                            className="rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                          >
                            Email reviewer
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setReplyModal({
                                open: true,
                                review,
                                text: '',
                                mode: 'public',
                                sendEmailCopy: true,
                              })
                            }
                            disabled={isBusy}
                            className="rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                          >
                            Reply to review
                          </button>
                        </div>

                        <div className="mt-4 space-y-2">
                          <label className="text-xs font-semibold text-slate-600">
                            Flag reason
                          </label>
                          <select
                            value={flagReasons[review.id] || FLAG_REASONS[0].value}
                            onChange={(event) =>
                              setFlagReasons((prev) => ({
                                ...prev,
                                [review.id]: event.target.value,
                              }))
                            }
                            disabled={isBusy}
                            className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                          >
                            {FLAG_REASONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              withReviewAction(review.id, () =>
                                flagReview(
                                  review.id,
                                  flagReasons[review.id] || FLAG_REASONS[0].value
                                )
                              )
                            }
                            disabled={isBusy}
                            className="rounded-full border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700"
                          >
                            Flag review
                          </button>
                          <button
                            type="button"
                            onClick={() => handleHide(review)}
                            disabled={isBusy}
                            className="rounded-full border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700"
                          >
                            Hide from public
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(review)}
                            disabled={isBusy}
                            className="rounded-full border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700"
                          >
                            Delete (soft)
                          </button>
                          {lastDeleted?.reviewId === review.id ? (
                            <button
                              type="button"
                              onClick={handleUndoDelete}
                              className="rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                            >
                              Undo delete
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {emailModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-slate-900">Email reviewer</h2>
            <p className="mt-1 text-sm text-slate-600">
              Send a short, human note. Keep it calm and direct.
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <label className="text-xs font-semibold text-slate-600">Template</label>
                <select
                  value={emailModal.template}
                  onChange={(event) => {
                    const template = event.target.value;
                    const draft = EMAIL_TEMPLATES[template];
                    setEmailModal((prev) => ({
                      ...prev,
                      template,
                      subject: draft.subject,
                      message: draft.message,
                    }));
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                >
                  <option value="thanks">Thanks</option>
                  <option value="sorry">Sorry it was not great</option>
                  <option value="detail">Can you share more detail?</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Subject</label>
                <input
                  value={emailModal.subject}
                  onChange={(event) =>
                    setEmailModal((prev) => ({ ...prev, subject: event.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Message</label>
                <textarea
                  rows={4}
                  value={emailModal.message}
                  onChange={(event) =>
                    setEmailModal((prev) => ({ ...prev, message: event.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() =>
                  withReviewAction(emailModal.review.id, async () => {
                    await sendContactEmail({
                      reviewId: emailModal.review.id,
                      subject: emailModal.subject,
                      message: emailModal.message,
                    });
                    setEmailModal((prev) => ({ ...prev, open: false }));
                  })
                }
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Send email
              </button>
              <button
                type="button"
                onClick={() => setEmailModal((prev) => ({ ...prev, open: false }))}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {replyModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-slate-900">Reply to review</h2>
            <p className="mt-1 text-sm text-slate-600">
              Public replies show on the public reviews page.
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <label className="text-xs font-semibold text-slate-600">Reply text</label>
                <textarea
                  rows={4}
                  value={replyModal.text}
                  onChange={(event) =>
                    setReplyModal((prev) => ({ ...prev, text: event.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex flex-col gap-2 text-xs text-slate-600">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="reply-mode"
                    value="public"
                    checked={replyModal.mode === 'public'}
                    onChange={() => setReplyModal((prev) => ({ ...prev, mode: 'public' }))}
                  />
                  Public reply
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="reply-mode"
                    value="private"
                    checked={replyModal.mode === 'private'}
                    onChange={() => setReplyModal((prev) => ({ ...prev, mode: 'private' }))}
                  />
                  Private email only
                </label>
              </div>
              {replyModal.mode === 'public' ? (
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={replyModal.sendEmailCopy}
                    onChange={(event) =>
                      setReplyModal((prev) => ({
                        ...prev,
                        sendEmailCopy: event.target.checked,
                      }))
                    }
                  />
                  Also email them a copy of this reply
                </label>
              ) : null}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() =>
                  withReviewAction(replyModal.review.id, async () => {
                    await sendReply({
                      reviewId: replyModal.review.id,
                      text: replyModal.text,
                      replyMode: replyModal.mode,
                      sendEmailCopy: replyModal.sendEmailCopy,
                    });
                    setReplyModal((prev) => ({ ...prev, open: false, text: '' }));
                  })
                }
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Send reply
              </button>
              <button
                type="button"
                onClick={() => setReplyModal((prev) => ({ ...prev, open: false }))}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

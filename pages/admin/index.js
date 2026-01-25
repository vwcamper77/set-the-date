import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { collection, getDocs, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { useTable, useSortBy, usePagination, useGlobalFilter } from 'react-table';
import { format, differenceInCalendarDays } from 'date-fns';
import {
  DEFAULT_FREE_DATE_LIMIT,
  DEFAULT_FREE_POLL_LIMIT,
  getDefaultDateLimitCopy,
} from '@/lib/gatingDefaults';
import { isAdminEmail } from '@/lib/adminUsers';

// --- Persist table settings in localStorage ---
const PAGE_SIZE_KEY = 'adminDashboardPageSize';
const PAGE_INDEX_KEY = 'adminDashboardPageIndex';

function savePageSettings(pageSize, pageIndex) {
  try {
    localStorage.setItem(PAGE_SIZE_KEY, pageSize);
    localStorage.setItem(PAGE_INDEX_KEY, pageIndex);
  } catch (e) {}
}

function loadPageSettings() {
  try {
    const storedPageSize = Number(localStorage.getItem(PAGE_SIZE_KEY));
    const storedPageIndex = Number(localStorage.getItem(PAGE_INDEX_KEY));
    return {
      pageSize: Number.isFinite(storedPageSize) && storedPageSize > 0 ? storedPageSize : 100,
      pageIndex: Number.isFinite(storedPageIndex) && storedPageIndex >= 0 ? storedPageIndex : 0,
    };
  } catch (e) {
    return { pageSize: 100, pageIndex: 0 };
  }
}
// ----------------------------------------------

const TEST_EMAILS = [
  'gavinfern@hotmail.com',
  'hello@setthedate.app',
  'test@gmail.com',
  'setthedateapp@gmail.com',
  'booking@chateaumontfelix.com',
  'nicheescapes@gmail.com'
];


export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterUnshared, setFilterUnshared] = useState(false);
  const [filterLive, setFilterLive] = useState(false);
  const [reminderSentIds, setReminderSentIds] = useState([]);
  const [pokeSentIds, setPokeSentIds] = useState([]);
  const [reviewSentIds, setReviewSentIds] = useState([]);
  const hasWindow = typeof window !== 'undefined';
  const [siteGatingConfig, setSiteGatingConfig] = useState(null);
  const [gatingForm, setGatingForm] = useState({
    enabled: process.env.NEXT_PUBLIC_PRO_GATING === 'true',
    freePollLimit: String(DEFAULT_FREE_POLL_LIMIT),
    freeDateLimit: String(DEFAULT_FREE_DATE_LIMIT),
    dateLimitCopy: getDefaultDateLimitCopy(DEFAULT_FREE_DATE_LIMIT),
  });
  const [gatingLoading, setGatingLoading] = useState(true);
  const [gatingSaving, setGatingSaving] = useState(false);
  const [gatingMessage, setGatingMessage] = useState('');
  const [gatingError, setGatingError] = useState('');
  const previewParsedFreeDateLimit = Number.parseInt(gatingForm.freeDateLimit, 10);
  const previewFreeDateLimit =
    Number.isFinite(previewParsedFreeDateLimit) && previewParsedFreeDateLimit > 0
      ? previewParsedFreeDateLimit
      : DEFAULT_FREE_DATE_LIMIT;
  const previewDateLimitCopy =
    gatingForm.dateLimitCopy?.trim() || getDefaultDateLimitCopy(previewFreeDateLimit);

  useEffect(() => {
    if (!hasWindow) return;
    try {
      const storedReminders = JSON.parse(localStorage.getItem('adminReminderSentIds') || '[]');
      const storedPokes = JSON.parse(localStorage.getItem('adminPokeSentIds') || '[]');
      const storedReviews = JSON.parse(localStorage.getItem('adminReviewSentIds') || '[]');
      if (Array.isArray(storedReminders)) setReminderSentIds(storedReminders);
      if (Array.isArray(storedPokes)) setPokeSentIds(storedPokes);
      if (Array.isArray(storedReviews)) setReviewSentIds(storedReviews);
    } catch (err) {
      console.warn('Failed to load reminder state', err);
    }
  }, [hasWindow]);

  useEffect(() => {
    if (!hasWindow) return;
    try {
      localStorage.setItem('adminReminderSentIds', JSON.stringify(reminderSentIds));
    } catch (err) {
      console.warn('Failed to persist reminder state', err);
    }
  }, [hasWindow, reminderSentIds]);

  useEffect(() => {
    if (!hasWindow) return;
    try {
      localStorage.setItem('adminPokeSentIds', JSON.stringify(pokeSentIds));
    } catch (err) {
      console.warn('Failed to persist poke state', err);
    }
  }, [hasWindow, pokeSentIds]);

  useEffect(() => {
    if (!hasWindow) return;
    try {
      localStorage.setItem('adminReviewSentIds', JSON.stringify(reviewSentIds));
    } catch (err) {
      console.warn('Failed to persist review state', err);
    }
  }, [hasWindow, reviewSentIds]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && isAdminEmail(user.email)) setUser(user);
      else setUser(null);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) fetchPolls();
  }, [user]);

  const fetchPolls = async () => {
    const querySnapshot = await getDocs(collection(db, 'polls'));
    const pollsData = await Promise.all(querySnapshot.docs.map(async (docSnap) => {
      const poll = { id: docSnap.id, ...docSnap.data() };
      poll.organizerName = `${poll.organiserFirstName || ''} ${poll.organiserLastName || ''}`.trim() || '—';
      poll.location = poll.location || '—';
      poll.createdAtObj = poll.createdAt?.seconds
        ? new Date(poll.createdAt.seconds * 1000)
        : poll.createdAt
        ? new Date(poll.createdAt)
        : null;

      const votesSnapshot = await getDocs(collection(db, `polls/${docSnap.id}/votes`));
      poll.totalVotes = votesSnapshot.size;

      let yesCount = 0, maybeCount = 0, noCount = 0;
      let earliestVoteMs = null;
      votesSnapshot.forEach((voteDoc) => {
        const voteData = voteDoc.data();
        if (voteData.votes) {
          Object.values(voteData.votes).forEach((response) => {
            if (response.toLowerCase() === 'yes') yesCount++;
            else if (response.toLowerCase() === 'maybe') maybeCount++;
            else if (response.toLowerCase() === 'no') noCount++;
          });
        }
        const voteCreated = voteData.createdAt ?? voteData.updatedAt;
        let voteMs = null;
        if (voteCreated?.seconds) {
          voteMs = voteCreated.seconds * 1000;
        } else if (voteCreated instanceof Date) {
          voteMs = voteCreated.getTime();
        } else if (typeof voteCreated === 'string') {
          const parsed = Date.parse(voteCreated);
          if (!Number.isNaN(parsed)) voteMs = parsed;
        }
        if (typeof voteMs === 'number' && !Number.isNaN(voteMs)) {
          if (earliestVoteMs === null || voteMs < earliestVoteMs) {
            earliestVoteMs = voteMs;
          }
        }
      });
      poll.yesVotes = yesCount;
      poll.maybeVotes = maybeCount;
      poll.noVotes = noCount;

      if (earliestVoteMs !== null && poll.createdAtObj instanceof Date) {
        const diffHours = (earliestVoteMs - poll.createdAtObj.getTime()) / 36e5;
        poll.timeToFirstVoteHours = Number.isFinite(diffHours) ? Math.max(diffHours, 0) : null;
      } else {
        poll.timeToFirstVoteHours = null;
      }

      return poll;
    }));

    const getCreatedAtMs = (poll) => {
      if (poll?.createdAt?.seconds) return poll.createdAt.seconds * 1000;
      if (!poll?.createdAt) return 0;
      const date = poll.createdAt instanceof Date ? poll.createdAt : new Date(poll.createdAt);
      const timestamp = date?.getTime?.();
      return Number.isNaN(timestamp) ? 0 : timestamp;
    };

    const cleanedPolls = pollsData
      .filter(p => !p.archived && !TEST_EMAILS.includes(p.organiserEmail?.toLowerCase()))
      .sort((a, b) => getCreatedAtMs(a) - getCreatedAtMs(b))
      .map((poll, index) => ({ ...poll, eventNumber: index + 1 }))
      .reverse();

    setPolls(cleanedPolls);
  };

  const archivePoll = async (pollId) => {
    await updateDoc(doc(db, 'polls', pollId), { archived: true });
    fetchPolls();
  };

  const deletePoll = async (pollId) => {
    if (!window.confirm('Delete this poll permanently (including votes)?')) return;
    await deleteDoc(doc(db, 'polls', pollId));
    fetchPolls();
  };

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const handleGatingFormChange = (field, value) => {
    setGatingForm((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    if (!user) {
      setGatingLoading(false);
      setGatingError('');
      setSiteGatingConfig(null);
      return;
    }

    let cancelled = false;
    const fetchConfig = async () => {
      setGatingLoading(true);
      setGatingError('');
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/site-settings/gating', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Unable to load gating settings.');
        }
        const normalized = await response.json();
        if (cancelled) return;
        setSiteGatingConfig(normalized);
        setGatingForm({
          enabled: normalized.enabled,
          freePollLimit: String(normalized.freePollLimit),
          freeDateLimit: String(normalized.freeDateLimit),
          dateLimitCopy: normalized.dateLimitCopy,
        });
      } catch (err) {
        console.error('Failed to load gating settings', err);
        if (!cancelled) {
          setGatingError('Unable to load gating settings.');
        }
      } finally {
        if (!cancelled) {
          setGatingLoading(false);
        }
      }
    };

    fetchConfig();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleGatingSave = async () => {
    setGatingSaving(true);
    setGatingMessage('');
    setGatingError('');
    const parsedFreeDateLimit = Number.parseInt(gatingForm.freeDateLimit, 10);
    const parsedFreePollLimit = Number.parseInt(gatingForm.freePollLimit, 10);
    const normalizedFreeDateLimit =
      Number.isFinite(parsedFreeDateLimit) && parsedFreeDateLimit > 0
        ? parsedFreeDateLimit
        : DEFAULT_FREE_DATE_LIMIT;
    const normalizedFreePollLimit =
      Number.isFinite(parsedFreePollLimit) && parsedFreePollLimit > 0
        ? parsedFreePollLimit
        : DEFAULT_FREE_POLL_LIMIT;
    const dateLimitCopyValue =
      (gatingForm.dateLimitCopy || '').trim() ||
      getDefaultDateLimitCopy(normalizedFreeDateLimit);
    const payload = {
      enabled: gatingForm.enabled,
      freeDateLimit: normalizedFreeDateLimit,
      freePollLimit: normalizedFreePollLimit,
      dateLimitCopy: dateLimitCopyValue,
    };

    if (!user) {
      setGatingError('Sign in to save gating settings.');
      setGatingSaving(false);
      return;
    }

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/site-settings/gating', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Unable to save gating settings.');
      }
      const saved = await response.json();
      setSiteGatingConfig(saved);
      setGatingForm({
        enabled: saved.enabled,
        freePollLimit: String(saved.freePollLimit),
        freeDateLimit: String(saved.freeDateLimit),
        dateLimitCopy: saved.dateLimitCopy,
      });
      setGatingMessage('Gating settings saved.');
    } catch (err) {
      console.error('Failed to save gating settings', err);
      setGatingError('Unable to save gating settings.');
    } finally {
      setGatingSaving(false);
    }
  };

  const getEarliestPlannedDate = (poll) => {
    if (!Array.isArray(poll?.dates) || poll.dates.length === 0) return null;
    return poll.dates
      .map((d) => new Date(d))
      .filter((d) => !Number.isNaN(d?.getTime?.()))
      .sort((a, b) => a - b)[0] ?? null;
  };

  const getDeadlineDate = (deadline) => {
    if (deadline?.seconds) return new Date(deadline.seconds * 1000);
    if (deadline) return new Date(deadline);
    return null;
  };

  const getStatus = (poll) => {
    const now = new Date();
    const earliestPlannedDate = getEarliestPlannedDate(poll);
    const hasPlannedDate =
      earliestPlannedDate instanceof Date && !Number.isNaN(earliestPlannedDate.getTime());

    if (hasPlannedDate) {
      const daysUntil = differenceInCalendarDays(earliestPlannedDate, now);
      if (daysUntil < 0) return { label: 'Passed', daysUntil, sortValue: daysUntil };
      if (daysUntil === 0) return { label: 'Live', daysUntil, sortValue: 0 };
      if (daysUntil <= 10) return { label: 'Upcoming', daysUntil, sortValue: daysUntil };
      return { label: 'Planning', daysUntil, sortValue: daysUntil };
    }

    const deadlineDate = getDeadlineDate(poll?.deadline);
    if (!deadlineDate || Number.isNaN(deadlineDate?.getTime?.())) {
      return { label: 'Unknown', daysUntil: null, sortValue: Number.POSITIVE_INFINITY };
    }

    if (deadlineDate < now) {
      return { label: 'Passed', daysUntil: null, sortValue: Number.NEGATIVE_INFINITY };
    }

    return { label: 'Planning', daysUntil: null, sortValue: Number.POSITIVE_INFINITY };
  };

  const formatStatusLabel = (status) => {
    if (!status) return 'Unknown';
    const { label, daysUntil } = status;
    if (label === 'Live') return 'Live (Today)';
    if (label === 'Passed') return 'Passed';
    if (Number.isFinite(daysUntil)) {
      const dayLabel = daysUntil === 1 ? 'day' : 'days';
      return `${label} (${daysUntil} ${dayLabel})`;
    }
    return label;
  };

  const getStatusColor = (label) => {
    switch (label) {
      case 'Live':
        return '#22c55e';
      case 'Passed':
        return '#ef4444';
      case 'Upcoming':
        return '#f59e0b';
      case 'Planning':
        return '#2563eb';
      default:
        return undefined;
    }
  };

  // Table columns
  const columns = useMemo(() => [
    {
      Header: 'Event #',
      accessor: 'eventNumber',
      id: 'eventNumber',
      Cell: ({ value, row }) => value ?? row.index + 1,
      disableSortBy: true
    },
    { Header: 'Poll ID', accessor: 'id' },
    {
      Header: 'Event Title', accessor: 'eventTitle',
      Cell: ({ row }) => <a className="text-blue-500 underline block truncate max-w-[200px]" href={`/results/${row.original.id}`} target="_blank" rel="noopener noreferrer">{row.original.eventTitle || '—'}</a>
    },
    {
      Header: 'Event Type',
      id: 'eventTypeDisplay',
      accessor: row => {
        const rawType = (row.eventType || 'general').toLowerCase();
        const labelMap = {
          holiday: 'Trip',
          meal: 'Meal',
          general: 'General',
        };
        const baseLabel = labelMap[rawType] || (rawType.charAt(0).toUpperCase() + rawType.slice(1));
        if (rawType === 'meal') {
          const mealTimes = Array.isArray(row.eventOptions?.mealTimes) ? row.eventOptions.mealTimes : [];
          if (mealTimes.length) {
            const normalized = new Set(
              mealTimes
                .map((meal) => (typeof meal === 'string' ? meal.toLowerCase() : ''))
                .filter(Boolean)
            );
            const orderedMeals = [
              ['breakfast', 'B'],
              ['lunch', 'L'],
              ['dinner', 'D'],
              ['evening', 'E'],
            ];
            const abbreviations = orderedMeals
              .filter(([key]) => normalized.has(key))
              .map(([, abbrev]) => abbrev);
            if (abbreviations.length) return `${baseLabel} (${abbreviations.join(',')})`;
          }
        }
        return baseLabel;
      },
    },
    { Header: 'Organizer Name', accessor: 'organizerName' },
    {
      Header: 'Organizer Email',
      accessor: 'organiserEmail',
      Cell: ({ value, row }) => {
        if (!value) return '—';
        const organiserName =
          row.original.organiserFirstName ||
          row.original.organiserLastName ||
          value.split('@')[0] ||
          'there';
        const eventTitle = row.original.eventTitle || '—';
        const location = row.original.location || 'your chosen location';
        const pollId = row.original.id;
        const pollLink = pollId
          ? `https://plan.setthedate.app/share/${pollId}`
          : 'https://plan.setthedate.app';
        const subject = encodeURIComponent(`Quick update for "${eventTitle}"`);
        const bodyLines = [
          `Hi ${organiserName},`,
          '',
          `Here’s the link to your "${eventTitle}" poll${location ? ` in ${location}` : ''}:`,
          pollLink,
          '',
          'Let me know if you need anything tweaked.',
          '',
          'Thanks,',
          'Gavin',
        ];
        const body = encodeURIComponent(bodyLines.join('\n'));
        const mailto = `mailto:${encodeURIComponent(value)}?subject=${subject}&body=${body}`;
        return (
          <a
            href={mailto}
            className="text-blue-600 hover:underline"
          >
            {value}
          </a>
        );
      },
    },
    { Header: 'Location', accessor: 'location' },
    {
      Header: 'Planned Event Date',
      id: 'plannedEventDate',
      accessor: row => {
        if (Array.isArray(row.dates) && row.dates.length > 0) {
          const dates = row.dates
            .map(d => new Date(d))
            .filter(d => !isNaN(d))
            .sort((a, b) => a - b);
          if (dates.length > 0) return dates[0]; // Date object for true sorting
        }
        return null;
      },
      Cell: ({ value }) =>
        value && !isNaN(value)
          ? (() => {
              const today = new Date();
              const diffDays = differenceInCalendarDays(value, today);
              const style = {
                color: diffDays < 0 ? '#9ca3af' : diffDays < 4 ? '#ef4444' : '#22c55e',
                fontWeight: 600,
              };
              return (
                <span style={style}>
                  {format(value, 'EEE do MMM')}
                </span>
              );
            })()
          : 'No dates selected',
      sortType: 'datetime'
    },
    {
      Header: 'Created At',
      id: 'createdAt',
      accessor: row =>
        row.createdAt?.seconds
          ? new Date(row.createdAt.seconds * 1000)
          : row.createdAt
          ? new Date(row.createdAt)
          : null,
      Cell: ({ value }) =>
        value && !isNaN(value)
          ? format(value, 'EEE dd MMM yyyy, HH:mm')
          : '—',
      sortType: 'datetime'
    },
    {
      Header: 'Deadline',
      id: 'deadline',
      accessor: row =>
        row.deadline?.seconds
          ? new Date(row.deadline.seconds * 1000)
          : row.deadline
          ? new Date(row.deadline)
          : null,
      Cell: ({ value }) =>
        value && !isNaN(value)
          ? (() => {
              const daysUntilDeadline = differenceInCalendarDays(value, new Date());
              const style = daysUntilDeadline <= 2
                ? { color: '#ef4444', fontWeight: 600 }
                : { color: '#22c55e', fontWeight: 600 };
              return (
                <span style={style}>
                  {format(value, 'EEE dd MMM')} ({daysUntilDeadline} days)
                </span>
              );
            })()
          : '—',
      sortType: 'datetime'
    },
    {
      Header: 'Status',
      id: 'status',
      accessor: row => getStatus(row),
      Cell: ({ value }) => (
        <span style={{
          color: getStatusColor(value?.label),
          fontWeight: 600
        }}>
          {formatStatusLabel(value)}
        </span>
      ),
      sortType: (rowA, rowB, columnId) => {
        const a = rowA.values[columnId]?.sortValue ?? 0;
        const b = rowB.values[columnId]?.sortValue ?? 0;
        return a - b;
      },
    },
    // ---- FINALIZED DOT COLUMN HERE ----
    {
      Header: 'Finalised',
      id: 'finalised',
      accessor: row => {
        if (row.finalDate) return 'finalised';
        const deadlineDate = getDeadlineDate(row.deadline);
        if (deadlineDate && deadlineDate < new Date()) {
          return 'needs_finalisation';
        }
        return 'pending';
      },
      Cell: ({ value, row }) => {
        const baseDotStyle = {
          display: 'inline-block',
          width: '1.6rem',
          textAlign: 'center',
          fontSize: '1.8rem',
          lineHeight: '1',
        };

        if (value === 'finalised') {
          return (
            <span
              title="Finalised"
              style={{ ...baseDotStyle, color: '#22c55e' }}
            >
              {String.fromCharCode(8226)}
            </span>
          );
        }
        if (value === 'needs_finalisation') {
          const pollId = row.original.id;
          const hasSentReminder = reminderSentIds.includes(pollId);

          const handleComposeReminder = () => {
            const {
              organiserEmail,
              organiserName,
              organiserFirstName,
              eventTitle,
              id,
              editToken,
              location,
            } = row.original;
            if (!organiserEmail || !eventTitle || !id || !editToken) {
              window.alert('Missing organiser details or edit token for this poll.');
              return;
            }

            const friendlyName =
              organiserFirstName ||
              organiserName ||
              organiserEmail.split('@')[0] ||
              'there';

            const title = eventTitle || 'your event';
            const resultsUrl = `https://plan.setthedate.app/results/${id}?token=${editToken}`;
            const subject = encodeURIComponent(`Reminder: please finalise "${title}"`);
            const bodyLines = [
              `Hi ${friendlyName},`,
              '',
              `Voting has now closed for "${title}"${location ? ` in ${location}` : ''}, but the date hasn't been locked in yet.`,
              '',
              'Once you finalise the date:',
              "- we'll notify everyone who voted",
              "- they can save it to their calendar",
              '- and the date will be locked in for the group',
              '',
              'Finalise your event here:',
              resultsUrl,
              '',
              'Thanks,',
              'The Set The Date Team',
            ];
            setReminderSentIds((prev) =>
              prev.includes(pollId) ? prev : [...prev, pollId]
            );
            const body = encodeURIComponent(bodyLines.join('\n'));
            const mailto = `mailto:${encodeURIComponent(
              organiserEmail
            )}?subject=${subject}&body=${body}`;
            const link = document.createElement('a');
            link.href = mailto;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          };

          return (
            <button
              onClick={handleComposeReminder}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
              title={hasSentReminder ? 'Reminder email opened' : 'Email organiser to finalise'}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: '1.2rem',
                  textAlign: 'center',
                  fontSize: hasSentReminder ? '1.2rem' : '1.4rem',
                  lineHeight: 1,
                  color: '#ef4444',
                }}
                aria-hidden="true"
              >
                {hasSentReminder ? '\u2709\uFE0F' : '\uD83D\uDC49'}
              </span>
            </button>
          );
        }
        return (
          <span
            title="Awaiting deadline"
            style={{ ...baseDotStyle, color: '#9ca3af' }}
          >
            {String.fromCharCode(8226)}
          </span>
        );
      }
    },
    // ---- END FINALIZED COLUMN ----
    {
      Header: 'Total Voters',
      accessor: 'totalVotes',
      Cell: ({ value, row }) => {
        const count = typeof value === 'number' ? value : 0;
        if (count >= 2) {
          return count >= 0 ? count : 'N/A';
        }

        const pollId = row.original.id;
        const status = getStatus(row.original);
        const isPassed = status?.label === 'Passed';
        const hasPoked = pokeSentIds.includes(pollId);
        const hasReviewSent = reviewSentIds.includes(pollId);
        const organiserEmail = row.original.organiserEmail;
        const organiserName =
          row.original.organiserFirstName ||
          row.original.organiserName ||
          row.original.organiserLastName ||
          row.original.organizerName ||
          organiserEmail?.split('@')[0] ||
          'there';
        const eventTitle = row.original.eventTitle || '-';
        const editToken = row.original.editToken;
        const shareUrl = `https://plan.setthedate.app/share/${pollId}`;

        const handlePoke = () => {
          if (!organiserEmail) {
            window.alert('Organiser email missing for this poll.');
            return;
          }

          const subject =
            count === 0
              ? `Quick nudge: invite voters for "${eventTitle}"`
              : `Keep "${eventTitle}" moving - only one vote so far`;
          const voteStatusLine =
            count === 0
              ? `So far we've only seen 0 votes. Most polls pick up fast after a quick re-share.`
              : `So far we've only seen 1 vote. Most polls pick up fast after a quick re-share.`;
          const bodyLines = [
            `Hi ${organiserName},`,
            '',
            `A quick nudge on your trip poll for "${eventTitle}".`,
            '',
            voteStatusLine,
            '',
            'Share your link here to get a few more responses:',
            shareUrl,
            '',
            'Tip: drop it into the WhatsApp group with something like:',
            '"Quick one - can you tap Best / Maybe / No for the trip dates? Takes 30 seconds."',
            '',
            'If you need a hand, just reply to this email.',
            '',
            'Thanks,',
            'The Set The Date Team',
            '',
            "P.S. If you don't see future updates, check your Promotions or Spam folder and mark us as safe.",
          ];
          const body = encodeURIComponent(bodyLines.join('\n'));
          const mailto = `mailto:${encodeURIComponent(
            organiserEmail
          )}?subject=${encodeURIComponent(subject)}&body=${body}`;

          const link = document.createElement('a');
          link.href = mailto;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          setPokeSentIds((prev) =>
            prev.includes(pollId) ? prev : [...prev, pollId]
          );
        };

        const handleReviewRequest = () => {
          if (!organiserEmail || !editToken) {
            window.alert('Organiser email or edit token missing for this poll.');
            return;
          }

          const reviewUrl = `https://plan.setthedate.app/review/${pollId}?token=${editToken}`;
          const subject = `Quick review for "${eventTitle}"?`;
          const bodyLines = [
            `Hi ${organiserName},`,
            '',
            `Hope your event "${eventTitle}" went well.`,
            '',
            'Could you leave a quick rating and review? It takes 30 seconds.',
            '',
            'Review link:',
            reviewUrl,
            '',
            'We only show public reviews with your consent.',
            'If something did not work, reply to this email and we will help.',
            '',
            'Thanks,',
            'The Set The Date Team',
          ];

          const body = encodeURIComponent(bodyLines.join('\n'));
          const mailto = `mailto:${encodeURIComponent(
            organiserEmail
          )}?subject=${encodeURIComponent(subject)}&body=${body}`;

          const link = document.createElement('a');
          link.href = mailto;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          setReviewSentIds((prev) =>
            prev.includes(pollId) ? prev : [...prev, pollId]
          );
        };

        if (!isPassed && count >= 2) {
          return count >= 0 ? count : 'N/A';
        }

        return (
          <span className="inline-flex items-center gap-2 text-sm">
            <span>{count}</span>
            <button
              onClick={isPassed ? handleReviewRequest : handlePoke}
              title={
                isPassed
                  ? hasReviewSent
                    ? 'Review email opened'
                    : 'Email organiser to leave a review'
                  : hasPoked
                  ? 'Reminder email opened'
                  : 'Email organiser to encourage more votes'
              }
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: '1.2rem',
                  textAlign: 'center',
                  fontSize: isPassed
                    ? hasReviewSent
                      ? '1.2rem'
                      : '1.4rem'
                    : hasPoked
                    ? '1.2rem'
                    : '1.4rem',
                  lineHeight: 1,
                  color: isPassed ? '#f59e0b' : '#ef4444',
                }}
                aria-hidden="true"
              >
                {isPassed
                  ? hasReviewSent
                    ? '\u2709\uFE0F'
                    : '\u2605'
                  : hasPoked
                  ? '\u2709\uFE0F'
                  : '\uD83D\uDC49'}
              </span>
            </button>
          </span>
        );
      },
    },
    {
      Header: 'Total Votes',
      id: 'totalVoteCount',
      accessor: row => (row.yesVotes || 0) + (row.maybeVotes || 0) + (row.noVotes || 0),
      Cell: ({ row, value }) => (row.original.eventType === 'holiday' ? 'N/A' : value),
      disableSortBy: true,
    },
    {
      Header: 'Engagement',
      id: 'engagement',
      accessor: row => row.timeToFirstVoteHours,
      Cell: ({ value, row }) => {
        const totalVotes = row.original.totalVotes || 0;
        if (totalVotes <= 1) {
          return (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500">
              <span aria-hidden="true">⚠️</span>
              Needs shares
            </span>
          );
        }
        if (value === null || !Number.isFinite(value)) {
          return (
            <span className="text-xs text-gray-500 font-medium">
              Unknown
            </span>
          );
        }

        const hours = Math.max(0, value);
        let tone = { label: 'Warming', color: '#f97316' };
        if (hours <= 12) {
          tone = { label: 'Hot', color: '#16a34a' };
        } else if (hours <= 48) {
          tone = { label: 'Warm', color: '#facc15' };
        } else if (hours > 72) {
          tone = { label: 'Cold', color: '#ef4444' };
        }

        const formatted =
          hours < 1
            ? `${Math.round(hours * 60)}m`
            : hours < 24
            ? `${Math.round(hours)}h`
            : `${(hours / 24).toFixed(1)}d`;

        return (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{
              backgroundColor: `${tone.color}22`,
              color: tone.color,
            }}
          >
            <span aria-hidden="true">🔥</span>
            {tone.label}
            <span className="text-xs font-normal text-gray-500">
              ({formatted})
            </span>
          </span>
        );
      },
      sortType: (rowA, rowB, columnId) => {
        const a = rowA.values[columnId];
        const b = rowB.values[columnId];
        if (a === b) return 0;
        if (a === null || a === undefined) return 1;
        if (b === null || b === undefined) return -1;
        return a - b;
      },
    },
    {
      Header: 'Actions',
      id: 'actions',
      Cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => archivePoll(row.original.id)}
            className="text-yellow-600 hover:text-yellow-700 text-sm"
          >
            🗂️ Archive
          </button>
          <button
            onClick={() => deletePoll(row.original.id)}
            className="text-red-500 hover:text-red-700 text-sm"
          >
            🗑️ Delete
          </button>
        </div>
      )
    }
  ], [polls, reminderSentIds, pokeSentIds, reviewSentIds]);

  const orderedColumns = useMemo(() => {
    const columnByKey = new Map(
      columns.map((column) => [(column.Header ?? column.id), column])
    );
    const desiredOrder = [
      'Event #',
      'Event Title',
      'Event Type',
      'Status',
      'Finalised',
      'Total Voters',
      'Total Votes',
      'Engagement',
      'Planned Event Date',
      'Created At',
      'Deadline',
      'Organizer Name',
      'Organizer Email',
      'Location',
      'Poll ID',
      'Actions',
    ];
    const ordered = desiredOrder
      .map((key) => columnByKey.get(key))
      .filter(Boolean);
    const extras = columns.filter((column) => !ordered.includes(column));
    return [...ordered, ...extras];
  }, [columns]);

  // ---- TABLE WITH RESTORED PAGE SIZE/INDEX ----
  const { pageSize: savedPageSize, pageIndex: savedPageIndex } = loadPageSettings();
  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    prepareRow,
    page,
    canPreviousPage,
    canNextPage,
    pageOptions,
    pageCount,
    gotoPage,
    nextPage,
    previousPage,
    setPageSize,
    state: { pageIndex, pageSize, globalFilter },
    setGlobalFilter,
  } = useTable(
    {
      columns: orderedColumns,
      data: polls,
      initialState: {
        pageIndex: savedPageIndex,
        pageSize: savedPageSize,
        sortBy: [{ id: 'createdAt', desc: true }]
      }
    },
    useGlobalFilter,
    useSortBy,
    usePagination
  );

  // Persist pageSize and pageIndex
  useEffect(() => {
    savePageSettings(pageSize, pageIndex);
  }, [pageSize, pageIndex]);

  // Ensure you never land on a non-existent page after filters/data change
  useEffect(() => {
    if (pageIndex > pageCount - 1) {
      gotoPage(0);
    }
  }, [pageIndex, pageCount, gotoPage]);
  // ---- END ----

  const filteredPolls = useMemo(() => {
    const now = new Date();
    return polls.filter(p => {
      const isLive = getStatus(p).label === 'Live';
      return (
        (!filterUnshared || (p.totalVotes === 0 && (now - new Date(p.createdAt?.seconds * 1000 || 0)) / 86400000 >= 2)) &&
        (!filterLive || isLive)
      );
    });
  }, [polls, filterUnshared, filterLive]);

  const topPoll = [...filteredPolls].sort((a, b) => b.yesVotes - a.yesVotes)[0];

  const exportCSV = () => {
    const rows = [
      ['Poll ID', 'Title', 'Organiser', 'Location', 'Planned Date', 'Yes', 'Maybe', 'No']
    ];
    polls.forEach(p => {
      let plannedDate = '';
      if (Array.isArray(p.dates) && p.dates.length > 0) {
        const dates = p.dates
          .map(d => new Date(d))
          .filter(d => !isNaN(d))
          .sort((a, b) => a - b);
        if (dates.length > 0) plannedDate = format(dates[0], 'EEE do MMM yyyy');
      }
      rows.push([p.id, p.eventTitle, p.organizerName, p.location, plannedDate, p.yesVotes, p.maybeVotes, p.noVotes]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'set-the-date-polls.csv';
    link.click();
  };

  // Summary totals
  const yesTotal = polls.reduce((sum, p) => sum + (p.yesVotes || 0), 0);
  const maybeTotal = polls.reduce((sum, p) => sum + (p.maybeVotes || 0), 0);
  const noTotal = polls.reduce((sum, p) => sum + (p.noVotes || 0), 0);
  const grandTotal = yesTotal + maybeTotal + noTotal;

  if (loading) return <p>Loading...</p>;
  if (!user) return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-2xl font-bold">Admin Login</h1>
      <button onClick={login} className="mt-4 px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Login with Google</button>
    </div>
  );

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>

      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800">Gating controls</p>
            <p className="text-xs text-gray-500">
              Configure the free poll/date limits and the phrasing shown to organisers when they hit the gate.
            </p>
          </div>
          {siteGatingConfig && (
            <p className="text-xs text-gray-500">
              Current free limit: {siteGatingConfig.freeDateLimit} date
              {siteGatingConfig.freeDateLimit === 1 ? '' : 's'} · {siteGatingConfig.freePollLimit} poll
              {siteGatingConfig.freePollLimit === 1 ? '' : 's'}.
            </p>
          )}
        </div>
        {gatingLoading ? (
          <p className="mt-3 text-sm text-gray-500">Loading gating settings...</p>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={gatingForm.enabled}
                  onChange={(e) => handleGatingFormChange('enabled', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Enable gating
              </label>
              <div>
                <label className="text-xs font-semibold text-gray-600" htmlFor="free-poll-limit">
                  Free poll limit
                </label>
                <input
                  id="free-poll-limit"
                  type="number"
                  min="1"
                  step="1"
                  value={gatingForm.freePollLimit}
                  onChange={(e) => handleGatingFormChange('freePollLimit', e.target.value)}
                  className="mt-1 w-full rounded-lg border px-2 py-1 text-sm"
                />
                <p className="text-xs text-gray-500">How many polls a free organiser can create.</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600" htmlFor="free-date-limit">
                  Free date limit
                </label>
                <input
                  id="free-date-limit"
                  type="number"
                  min="1"
                  step="1"
                  value={gatingForm.freeDateLimit}
                  onChange={(e) => handleGatingFormChange('freeDateLimit', e.target.value)}
                  className="mt-1 w-full rounded-lg border px-2 py-1 text-sm"
                />
                <p className="text-xs text-gray-500">Dates a free organiser can add before the gate.</p>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600" htmlFor="gating-copy">
                Gate copy (leave empty to use automated sentence)
              </label>
              <textarea
                id="gating-copy"
                rows={2}
                value={gatingForm.dateLimitCopy}
                onChange={(e) => handleGatingFormChange('dateLimitCopy', e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-500">
                Preview: <span className="text-gray-800">{previewDateLimitCopy}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleGatingSave}
                disabled={gatingSaving}
                className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {gatingSaving ? 'Saving…' : 'Save gating settings'}
              </button>
              {gatingMessage && <span className="text-sm font-medium text-green-600">{gatingMessage}</span>}
              {gatingError && <span className="text-sm font-medium text-red-600">{gatingError}</span>}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-4 mb-4">
        <button onClick={() => setFilterUnshared(!filterUnshared)} className="bg-gray-200 px-4 py-2 rounded">{filterUnshared ? 'Show All Events' : 'Show Unshared Events'}</button>
        <button onClick={() => setFilterLive(!filterLive)} className="bg-gray-200 px-4 py-2 rounded">{filterLive ? 'Show All' : 'Show Only Live'}</button>
        <button onClick={exportCSV} className="bg-green-500 text-white px-4 py-2 rounded">⬇️ Export to CSV</button>
        <button onClick={() => router.push('/admin/archived')} className="bg-blue-600 text-white px-4 py-2 rounded">View Archived</button>
        <button onClick={() => router.push('/admin/venues')} className="bg-indigo-600 text-white px-4 py-2 rounded">Manage Venues</button>
      </div>

      <input value={globalFilter || ''} onChange={(e) => setGlobalFilter(e.target.value)} placeholder="Search by Organizer or Event Title" className="mb-4 p-2 border rounded w-full" />

      <div className="mb-6 bg-gray-100 p-4 rounded-md flex flex-wrap justify-between text-sm font-medium">
        <div>Total Events: {polls.length}</div>
        <div>Total Voters: {polls.reduce((sum, p) => sum + (p.totalVotes || 0), 0)}</div>
        <div>Yes Votes: {yesTotal}</div>
        <div>Maybe Votes: {maybeTotal}</div>
        <div>No Votes: {noTotal}</div>
        <div className="font-bold">Total Votes: {grandTotal}</div>
      </div>

      {topPoll && (
        <div className="mb-6 bg-green-50 border border-green-300 p-4 rounded text-green-700">
          🏆 Top Poll: <strong>{topPoll.eventTitle}</strong> ({topPoll.yesVotes} yes votes)
        </div>
      )}

      {/* --- MOBILE FRIENDLY, TIGHTER TABLE --- */}
      <div className="w-full overflow-x-auto">
        <table {...getTableProps()} className="min-w-full bg-white">
          <thead>
            {headerGroups.map((headerGroup) => (
              <tr {...headerGroup.getHeaderGroupProps()}>
                {headerGroup.headers.map((column) => (
                  <th
                    {...column.getHeaderProps(column.getSortByToggleProps())}
                    className="px-2 py-2 border-b-2 font-bold bg-gray-100 text-xs md:text-sm whitespace-nowrap"
                  >
                    {column.render('Header')}
                    <span>{column.isSorted ? (column.isSortedDesc ? ' 🔽' : ' 🔼') : ''}</span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody {...getTableBodyProps()}>
            {page.map((row) => {
              prepareRow(row);
              return (
                <tr {...row.getRowProps()} className="hover:bg-gray-50">
                  {row.cells.map((cell) => (
                    <td
                      {...cell.getCellProps()}
                      className="px-2 py-1 border-b text-xs md:text-sm whitespace-nowrap"
                    >
                      {cell.render('Cell')}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* --- END TABLE --- */}

      <div className="flex justify-between mt-4">
        <div>
          <button onClick={() => gotoPage(0)} disabled={!canPreviousPage} className="mr-2">{'<<'}</button>
          <button onClick={() => previousPage()} disabled={!canPreviousPage} className="mr-2">{'<'}</button>
          <button onClick={() => nextPage()} disabled={!canNextPage} className="mr-2">{'>'}</button>
          <button onClick={() => gotoPage(pageCount - 1)} disabled={!canNextPage}>{'>>'}</button>
        </div>
        <span>
          Page <strong>{pageIndex + 1} of {pageOptions.length}</strong>
        </span>
        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
          {[25, 50, 100].map((size) => <option key={size} value={size}>Show {size}</option>)}
        </select>
      </div>
    </div>
  );
}

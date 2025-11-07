import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { collection, getDocs, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { useTable, useSortBy, usePagination, useGlobalFilter } from 'react-table';
import { format, differenceInCalendarDays } from 'date-fns';

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

const ADMIN_EMAIL = 'setthedateapp@gmail.com';
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
  const hasWindow = typeof window !== 'undefined';

  useEffect(() => {
    if (!hasWindow) return;
    try {
      const storedReminders = JSON.parse(localStorage.getItem('adminReminderSentIds') || '[]');
      const storedPokes = JSON.parse(localStorage.getItem('adminPokeSentIds') || '[]');
      if (Array.isArray(storedReminders)) setReminderSentIds(storedReminders);
      if (Array.isArray(storedPokes)) setPokeSentIds(storedPokes);
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
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email === ADMIN_EMAIL) setUser(user);
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

  const getEarliestPlannedDate = (poll) => {
    if (!Array.isArray(poll?.dates) || poll.dates.length === 0) return null;
    return poll.dates
      .map((d) => new Date(d))
      .filter((d) => !Number.isNaN(d?.getTime?.()))
      .sort((a, b) => a - b)[0] ?? null;
  };

  const getStatus = (poll) => {
    const now = new Date();

    const earliestPlannedDate = getEarliestPlannedDate(poll);
    if (earliestPlannedDate instanceof Date && !Number.isNaN(earliestPlannedDate.getTime())) {
      return earliestPlannedDate >= now ? 'Live' : 'Passed';
    }

    const { deadline } = poll || {};
    const deadlineDate = deadline?.seconds
      ? new Date(deadline.seconds * 1000)
      : deadline
      ? new Date(deadline)
      : null;

    if (!deadlineDate || Number.isNaN(deadlineDate?.getTime?.())) {
      return 'Unknown';
    }

    return deadlineDate > now ? 'Live' : 'Passed';
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
        const eventTitle = row.original.eventTitle || 'your event';
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
              const isShortNotice = diffDays < 4;
              const style = {
                color: isShortNotice ? '#ef4444' : '#22c55e',
                fontWeight: 600,
              };
              return (
                <span style={style}>
                  {format(value, 'EEE do MMM')} ({diffDays} days)
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
          color: value === 'Live' ? '#22c55e' : value === 'Passed' ? '#ef4444' : undefined,
          fontWeight: 600
        }}>
          {value}
        </span>
      ),
    },
    // ---- FINALIZED DOT COLUMN HERE ----
    {
      Header: 'Finalised',
      id: 'finalised',
      accessor: row => {
        if (row.finalDate) return 'finalised';
        const earliestPlannedDate = getEarliestPlannedDate(row);
        if (earliestPlannedDate && earliestPlannedDate < new Date()) {
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
              `The voting has closed for "${title}"${location ? ` in ${location}` : ''}, but the event date hasn’t been locked in yet.`,
              '',
              `You can finalise the event here: ${resultsUrl}`,
              '',
              'Thank you!',
              'Set The Date Admin',
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
        if (count >= 2 || row.original.eventType === 'holiday') {
          return count >= 0 ? count : 'N/A';
        }

        const pollId = row.original.id;
        const hasPoked = pokeSentIds.includes(pollId);
        const organiserEmail = row.original.organiserEmail;
        const organiserName =
          row.original.organiserFirstName ||
          row.original.organiserLastName ||
          row.original.organizerName ||
          organiserEmail?.split('@')[0] ||
          'there';
        const eventTitle = row.original.eventTitle || 'your event';
        const shareUrl = `https://plan.setthedate.app/share/${pollId}`;

        const handlePoke = () => {
          if (!organiserEmail) {
            window.alert('Organiser email missing for this poll.');
            return;
          }
          const subject =
            count === 0
              ? `Quick nudge: invite voters for "${eventTitle}"`
              : `Keep "${eventTitle}" moving – only one vote so far`;
          const bodyLines = [
            `Hi ${organiserName},`,
            '',
            count === 0
              ? `Your event "${eventTitle}" does not have any votes yet.`
              : `Your event "${eventTitle}" only has one vote so far.`,
            '',
            `Share the poll link to get more responses: ${shareUrl}`,
            '',
            'Thanks!',
            'Set The Date Admin',
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

        return (
          <span className="inline-flex items-center gap-2 text-sm">
            <span>{count}</span>
            <button
              onClick={handlePoke}
              title={
                hasPoked
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
                  fontSize: hasPoked ? '1.2rem' : '1.4rem',
                  lineHeight: 1,
                  color: '#ef4444',
                }}
                aria-hidden="true"
              >
                {hasPoked ? '\u2709\uFE0F' : '\uD83D\uDC49'}
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
  ], [polls, reminderSentIds, pokeSentIds]);

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
      const deadline = p.deadline?.seconds ? new Date(p.deadline.seconds * 1000) : null;
      const isLive = deadline ? deadline > now : false;
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

      <div className="flex gap-4 mb-4">
        <button onClick={() => setFilterUnshared(!filterUnshared)} className="bg-gray-200 px-4 py-2 rounded">{filterUnshared ? 'Show All Events' : 'Show Unshared Events'}</button>
        <button onClick={() => setFilterLive(!filterLive)} className="bg-gray-200 px-4 py-2 rounded">{filterLive ? 'Show All' : 'Show Only Live'}</button>
        <button onClick={exportCSV} className="bg-green-500 text-white px-4 py-2 rounded">⬇️ Export to CSV</button>
        <button onClick={() => router.push('/admin/archived')} className="bg-blue-600 text-white px-4 py-2 rounded">View Archived</button>
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

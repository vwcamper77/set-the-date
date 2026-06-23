import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import Head from 'next/head';
import { useRouter } from 'next/router';
import LogoHeader from '@/components/LogoHeader';
import { useIsIosCapacitorApp } from '@/lib/capacitorRuntime';
import { getEventPaths, getStoredEvents } from '@/lib/myEvents';

const formatCreatedAt = (value) => {
  if (!value) return 'Saved recently';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Saved recently' : format(date, 'EEE d MMM yyyy, h:mm a');
};

export default function MyEventsPage() {
  const router = useRouter();
  const isNativeIosApp = useIsIosCapacitorApp();
  const [events, setEvents] = useState([]);

  useEffect(() => {
    setEvents(getStoredEvents());
  }, []);

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [events]
  );

  const navigateTo = (href) => {
    if (!href) return;
    router.push(href);
  };

  return (
    <>
      <Head>
        <title>My Events - Set The Date</title>
        <meta name="description" content="Events saved on this device." />
      </Head>

      <main className="min-h-screen bg-slate-50 px-4 py-6">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <LogoHeader isPro={false} compact={isNativeIosApp} />
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">My events</p>
                <h1 className="mt-2 text-3xl font-semibold text-slate-900">Events saved on this device.</h1>
                <p className="mt-2 text-sm text-slate-600">
                  Jump back into sharing, voting, results, or editing from your iPhone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigateTo('/')}
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Create new event
              </button>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {sortedEvents.length ? (
              sortedEvents.map((event) => {
                const paths = getEventPaths(event);
                return (
                  <article
                    key={event.pollId}
                    className="rounded-[24px] border border-slate-200 bg-white px-5 py-5 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-lg font-semibold text-slate-900">{event.title || 'Untitled event'}</p>
                        <p className="mt-1 text-sm text-slate-600">{event.location || 'Location TBC'}</p>
                        <p className="mt-2 text-xs uppercase tracking-[0.3em] text-slate-400">
                          Saved {formatCreatedAt(event.createdAt)}
                        </p>
                        {(event.organiserName || event.organiserEmail) && (
                          <p className="mt-2 text-sm text-slate-500">
                            {event.organiserName || 'Organiser'}
                            {event.organiserEmail ? ` · ${event.organiserEmail}` : ''}
                          </p>
                        )}
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                        {event.eventType === 'holiday' ? 'Trip' : 'Poll'}
                      </span>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => navigateTo(paths.share)}
                        className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-900"
                      >
                        Share
                      </button>
                      <button
                        type="button"
                        onClick={() => navigateTo(paths.voting)}
                        className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                      >
                        Open voting page
                      </button>
                      <button
                        type="button"
                        onClick={() => navigateTo(paths.results)}
                        className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-900"
                      >
                        Results
                      </button>
                      {paths.manage ? (
                        <button
                          type="button"
                          onClick={() => navigateTo(paths.manage)}
                          className="rounded-full border border-blue-300 px-4 py-2 text-sm font-semibold text-blue-700 hover:border-blue-500"
                        >
                          Manage/Edit
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-300 bg-white px-5 py-12 text-center shadow-sm">
                <p className="text-lg font-semibold text-slate-900">No events saved yet.</p>
                <p className="mt-2 text-sm text-slate-600">Events saved on this device will appear here.</p>
                <button
                  type="button"
                  onClick={() => navigateTo('/')}
                  className="mt-5 inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Create your first event
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import TripVotingForm from '@/components/TripVotingForm';
import LogoHeader from '@/components/LogoHeader';
import CountdownTimer from '@/components/CountdownTimer';
import { OG_LOGO_IMAGE, SHARE_BASE_URL } from '@/lib/brandAssets';

export async function getServerSideProps(context) {
  const { id } = context.params;
  const pollRef = doc(db, 'polls', id);
  const pollSnap = await getDoc(pollRef);

  if (!pollSnap.exists()) {
    return { notFound: true };
  }

  const data = pollSnap.data();

  if (data.eventType !== 'holiday') {
    return {
      redirect: {
        destination: `/poll/${id}`,
        permanent: false,
      },
    };
  }

  const poll = {
    ...data,
    createdAt: data.createdAt?.toDate().toISOString() || null,
    deadline: data.deadline?.toDate().toISOString() || null,
    selectedDates: data.dates || data.selectedDates || [],
  };

  return {
    props: {
      poll,
      id,
    },
  };
}

export default function TripPollPage({ poll, id }) {
  const router = useRouter();
  const { onboarding, returnTo } = router.query || {};
  const isOnboarding = onboarding === '1' || onboarding === 'true' || onboarding === true;
  const nextAfterSubmit =
    (returnTo === 'share' || isOnboarding) && id ? `/share/${id}?from=organiser-onboarding` : `/trip-results/${id}`;

  useEffect(() => {
    if (!poll?.eventTitle) return;
    document.body.classList.add('bg-gray-50');
    return () => document.body.classList.remove('bg-gray-50');
  }, [poll?.eventTitle]);

  if (!poll) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const organiser = poll.organiserFirstName || 'Someone';
  const eventTitle = poll.eventTitle || 'Trip';
  const location = poll.location || 'somewhere';
  const isProPoll = poll.planType === 'pro' || poll.unlocked;
  const tripUrl = id ? `${SHARE_BASE_URL}/trip/${id}?view=calendar` : SHARE_BASE_URL;
  const eventSnapshotOgImage = id ? `${SHARE_BASE_URL}/api/share/event-snapshot/${id}` : OG_LOGO_IMAGE;
  const deadlineISO =
    typeof poll?.deadline === 'string'
      ? poll.deadline
      : poll?.deadline
      ? new Date(poll.deadline).toISOString()
      : null;

  return (
    <>
      <Head>
        <title>{`${organiser} is planning a trip to ${location}`}</title>
        <meta name="description" content="Share when you can travel and help lock in the best trip dates." />
        <meta property="og:title" content={`${organiser} is planning a trip to ${location}`} />
        <meta property="og:description" content="Share when you can travel and help lock in the best trip dates." />
        <meta property="og:image" content={eventSnapshotOgImage} />
        <meta property="og:image" content={OG_LOGO_IMAGE} />
        <meta property="og:url" content={tripUrl} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={eventSnapshotOgImage} />
      </Head>

      <div className="min-h-screen flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-3xl bg-white shadow-md rounded-xl p-6 md:p-10">
          <div className="flex justify-center mb-6">
            <LogoHeader isPro={isProPoll} />
          </div>
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold">
              Help {organiser} pick the best dates for <span className="text-blue-600">{eventTitle}</span>
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Travel plans are happening in <strong>{location}</strong>. Choose the days you can make it inside the organiser’s window.
            </p>
            {isOnboarding && (
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 text-amber-800 text-sm border border-amber-200">
                <span className="font-semibold">Step 1 of 2:</span>
                Add your own availability. We’ll send you straight to the share page next.
              </div>
            )}
            {deadlineISO && (
              <p className="mt-3 text-sm font-semibold text-blue-600">
                <CountdownTimer deadline={deadlineISO} />
              </p>
            )}
          </div>

          <TripVotingForm
            poll={poll}
            pollId={id}
            organiser={organiser}
            eventTitle={eventTitle}
            onSubmitted={() => {
              router.replace(nextAfterSubmit);
            }}
          />
        </div>
      </div>
    </>
  );
}

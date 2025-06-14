import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { db } from '@/lib/firebase';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';
import { doc, getDoc } from 'firebase/firestore';
import Head from 'next/head';
import { format, parseISO } from 'date-fns';
import PollVotingForm from '@/components/PollVotingForm';
import PollShareButtons from '@/components/PollShareButtons';
import CountdownTimer from '@/components/CountdownTimer';

export async function getServerSideProps(context) {
  const { id } = context.params;
  const pollRef = doc(db, 'polls', id);
  const pollSnap = await getDoc(pollRef);

  if (!pollSnap.exists()) {
    return { notFound: true };
  }

  const data = pollSnap.data();

  // ✅ Serialize Firestore Timestamps and Dates properly
  const poll = {
    ...data,
    createdAt: data.createdAt?.toDate().toISOString() || null,
    updatedAt: data.updatedAt?.toDate().toISOString() || null, // ✅ serialize updatedAt
    deadline: data.deadline?.toDate().toISOString() || null,
    finalDate: data.finalDate || null,
    selectedDates: data.selectedDates
      ? data.selectedDates.map(d => d?.toDate().toISOString())
      : [],
  };

  return {
    props: { poll, id },
  };
}

export default function PollPage({ poll, id }) {
  const router = useRouter();

useEffect(() => {
  logEventIfAvailable('vote_started', {
    pollId: id,
    eventTitle: poll?.eventTitle || 'Unknown'
  });
}, [id, poll?.eventTitle]);


  const organiser = poll?.organiserFirstName || 'Someone';
  const eventTitle = poll?.eventTitle || 'an event';
  const location = poll?.location || 'somewhere';
  const finalDate = poll?.finalDate;

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://plan.setthedate.app';
  const pollUrl = `${baseUrl}/poll/${id}`;

  const now = new Date();
  const deadline = poll?.deadline ? new Date(poll.deadline) : null;
  const isPollExpired = deadline && now > deadline;

const handleResultsClick = () => {
  logEventIfAvailable('see_results_clicked', {
    pollId: id,
    eventTitle: poll?.eventTitle || 'Unknown'
  });
  router.push(`/results/${id}`);
};


  const handleSuggestClick = () => {
    logEventIfAvailable('suggest_change_clicked', { pollId: id });
  };

  // ✅ Sort selectedDates in frontend
  const sortedDates = poll?.selectedDates?.slice().sort((a, b) => new Date(a) - new Date(b));

  return (
    <>
      <Head>
        <title>{`${organiser} is planning ${eventTitle} in ${location}`}</title>
        <meta property="og:title" content={`${organiser} is planning ${eventTitle} in ${location}`} />
        <meta property="og:description" content={`Vote now to help choose a date for ${eventTitle}`} />
        <meta property="og:image" content="https://plan.setthedate.app/logo.png" />
        <meta property="og:url" content={pollUrl} />
        <meta property="og:type" content="website" />
      </Head>

      <div className="max-w-md mx-auto p-4">
        <img
          src="/images/setthedate-logo.png"
          alt="Set The Date Logo"
          className="h-32 mx-auto mb-6"
        />

        <div className="bg-yellow-100 border border-yellow-300 text-yellow-800 p-3 mb-4 rounded text-center font-semibold">
          🎉 {organiser} is planning {eventTitle} — add which dates work for you!
        </div>

        <div className="flex items-center justify-center gap-2 mb-3 text-sm text-gray-700 font-medium">
          <img
            src="https://cdn-icons-png.flaticon.com/512/684/684908.png"
            alt="Location Icon"
            className="w-4 h-4"
          />
          <span>{location}</span>
        </div>

        {finalDate && (
          <div className="text-center bg-green-100 border border-green-300 text-green-800 font-medium p-3 rounded mb-4">
            ✅ Final Date Locked In: {format(parseISO(finalDate), 'EEEE do MMMM yyyy')}
          </div>
        )}

        {poll?.deadline && <CountdownTimer deadline={poll.deadline} />}

        {isPollExpired && (
          <div className="text-center text-red-600 font-semibold mt-6 mb-4">
            ⏳ Voting has closed — but you can still share your availability and leave a message for the organiser.
          </div>
        )}

        {/* ✅ Sorted Selected Dates Display */}
        {sortedDates && sortedDates.length > 0 && (
          <div className="mb-6">
            <h2 className="text-center font-semibold mb-2">Selected Dates</h2>
            <ul className="list-disc list-inside">
              {sortedDates.map(date => (
                <li key={date}>{new Date(date).toDateString()}</li>
              ))}
            </ul>
          </div>
        )}

        <PollVotingForm
          poll={poll}
          pollId={id}
          organiser={organiser}
          eventTitle={eventTitle}
        />

        <button
          onClick={handleResultsClick}
          className="mt-4 border border-black text-black px-4 py-2 rounded w-full font-semibold"
        >
          See Results
        </button>

        <div className="mt-6 flex justify-center">
          <a
            href={`/suggest/${id}`}
            onClick={handleSuggestClick}
            className="inline-flex items-center gap-2 px-4 py-2 border border-blue-500 text-blue-600 rounded-md font-medium hover:bg-blue-50"
          >
            <img
              src="https://cdn-icons-png.flaticon.com/512/1827/1827344.png"
              alt="Message Icon"
              className="w-5 h-5"
            />
            Suggest a change to the organiser
          </a>
        </div>

        <PollShareButtons
          pollUrl={pollUrl}
          organiser={organiser}
          eventTitle={eventTitle}
          location={location}
         onShare={(platform) => logEventIfAvailable('attendee_shared_poll', {
          platform,
          pollId: id,
          eventTitle: poll?.eventTitle || 'Unknown'
        })}

        />

        <div className="text-center mt-6">
          <a
            href="/"
            className="inline-flex items-center text-blue-600 font-semibold hover:underline"
          >
            <img
              src="https://cdn-icons-png.flaticon.com/512/747/747310.png"
              alt="Calendar"
              className="w-5 h-5 mr-2"
            />
            Create Your Own Event
          </a>
        </div>

        <div className="text-center mt-10">
          <a
            href="https://buymeacoffee.com/eveningout"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block"
          >
            <img
              src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
              alt="Buy Me a Coffee"
              className="h-12 mx-auto"
            />
          </a>
        </div>
      </div>
    </>
  );
}

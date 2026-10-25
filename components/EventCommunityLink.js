import Link from 'next/link';
export default function EventCommunityLink({ id }) {
  if (!id) return null;
  return <div className="std-community-link"><span aria-hidden="true">✳</span><div><strong>A little space for your group.</strong><p>Questions, meeting spots, and the details that make a plan.</p></div><Link href={`/event/${encodeURIComponent(id)}/community`}>Open conversation ↗</Link></div>;
}

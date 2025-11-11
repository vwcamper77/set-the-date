import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import PartnerNav from '@/components/PartnerNav';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';
import { buildPartnerLinks, buildCampaignText, normalizePartnerRecord } from '@/lib/partners/emailTemplates';

export default function PartnerThanksPage({ partner, campaignText, shareUrl, sharePath }) {
  const [copyLabel, setCopyLabel] = useState('Copy email text');
  const [sending, setSending] = useState(false);
  const [sendMessage, setSendMessage] = useState('');

  if (!partner) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <p>Partner not found.</p>
      </main>
    );
  }

  const sharePageHref = shareUrl || `${process.env.NEXT_PUBLIC_BASE_URL || 'https://plan.setthedate.app'}/p/${partner.slug}`;
  const sharePagePath = sharePath || `/p/${partner.slug}`;
  const settingsHref = '/portal?type=venue#settings';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(campaignText);
      setCopyLabel('Copied!');
      setTimeout(() => setCopyLabel('Copy email text'), 2000);
    } catch (err) {
      setCopyLabel('Copy manually');
    }
  };

  const handleSendEmail = async () => {
    setSendMessage('');
    setSending(true);
    logEventIfAvailable('partner_self_email_clicked', { partner: partner.slug });
    try {
      const response = await fetch('/api/partners/sendSelfEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: partner.slug }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setSendMessage(payload?.message || 'Unable to send email.');
        return;
      }
      setSendMessage('Check your inbox—email sent.');
    } catch (err) {
      setSendMessage('Unable to send email.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Head>
        <title>Partner assets ready - Set The Date</title>
      </Head>
      <PartnerNav />
      <main className="min-h-screen bg-slate-100 text-slate-900 px-4 py-10 sm:py-14">
        <div className="mx-auto max-w-4xl rounded-3xl bg-white p-8 shadow-2xl">
          <div className="text-center mb-10">
            <p className="uppercase tracking-[0.4em] text-xs text-slate-500 mb-3">Partners</p>
            <h1 className="text-3xl font-semibold text-slate-900">You are live, {partner.contactName?.split(' ')[0] || partner.contactName}.</h1>
            <p className="text-slate-600 mt-3">
              Share this public page and paste the campaign email below into your email service provider (ESP).
            </p>
          </div>

          <div className="space-y-8">
            <div className="rounded-2xl border border-slate-200 p-6 bg-slate-50">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-2">Public page</p>
              <Link href={sharePagePath} className="text-xl font-semibold text-slate-900 break-all underline">
                {sharePageHref}
              </Link>
              <div className="mt-4 flex flex-col md:flex-row gap-3">
                <Link
                  href={sharePagePath}
                  className="inline-flex justify-center items-center px-5 py-3 rounded-full bg-white text-slate-900 font-semibold"
                  target="_blank"
                  rel="noreferrer"
                >
                  View share page
                </Link>
                <Link
                  href={settingsHref}
                  className="inline-flex justify-center items-center px-5 py-3 rounded-full border border-slate-300 text-slate-600 hover:border-slate-900 hover:text-slate-900 transition"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open settings
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-6 bg-white">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                <p className="text-sm text-slate-600">Campaign email for your customers</p>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-full border border-slate-300 text-sm text-slate-600 hover:border-slate-900 hover:text-slate-900 transition"
                >
                  {copyLabel}
                </button>
              </div>
              <textarea
                readOnly
                value={campaignText}
                className="w-full min-h-[200px] rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800"
              />
              <p className="text-xs text-slate-500 mt-3">
                Paste this into the email service provider (ESP) you already use. Update your photos, colors, or password anytime from the settings link above.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-6 bg-white">
              <p className="text-sm text-slate-600 mb-4">Need it in your inbox?</p>
              <button
                type="button"
                onClick={handleSendEmail}
                disabled={sending}
                className="inline-flex items-center justify-center px-5 py-3 rounded-full bg-slate-900 text-white font-semibold disabled:opacity-60"
              >
                {sending ? 'Sending...' : 'Send me a copy'}
              </button>
              {sendMessage && <p className="text-xs text-slate-500 mt-2">{sendMessage}</p>}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

export async function getServerSideProps({ query }) {
  const slug = typeof query.slug === 'string' ? query.slug.toLowerCase() : null;
  if (!slug) {
    return { notFound: true };
  }

  const { db } = await import('@/lib/firebaseAdmin');
  const snapshot = await db.collection('partners').doc(slug).get();
  if (!snapshot.exists) {
    return { notFound: true };
  }

  const rawData = snapshot.data();
  const partner = normalizePartnerRecord(rawData, slug);
  const { shareUrl, sharePath } = buildPartnerLinks({ ...partner, slug });
  const campaignText = buildCampaignText({ ...partner, slug });

  return {
    props: {
      partner,
      campaignText,
      shareUrl,
      sharePath,
    },
  };
}

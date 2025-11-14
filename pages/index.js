import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import EventBuilder, { FREE_DATE_LIMIT, FREE_POLL_LIMIT } from '@/components/EventBuilder/EventBuilder';
import LegacyCreatePage from '@/legacy/OriginalCreatePage_2025_11_13';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';

const getQueryValue = (router, key) => {
  const value = router.query?.[key];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  const asPath = router.asPath || '';
  const queryIndex = asPath.indexOf('?');
  if (queryIndex === -1) return '';
  const search = asPath.slice(queryIndex + 1);
  try {
    const params = new URLSearchParams(search);
    return params.get(key) || '';
  } catch (err) {
    console.warn('Failed to parse query params', err);
    return '';
  }
};

export default function HomePage() {
  const router = useRouter();
  const partnerSlug = getQueryValue(router, 'partner');
  const prefillLocation = getQueryValue(router, 'prefillLocation');

  const gatingConfig = useMemo(
    () => ({
      enabled: process.env.NEXT_PUBLIC_PRO_GATING === 'true',
      freePollLimit: FREE_POLL_LIMIT,
      freeDateLimit: FREE_DATE_LIMIT,
    }),
    []
  );

  const initialBuilderData = useMemo(
    () => ({
      location: prefillLocation || '',
    }),
    [prefillLocation]
  );

  const handleBuilderSubmit = useCallback((result) => {
    if (!result?.pollId) return;
    logEventIfAvailable('event_builder_submit', {
      pollId: result.pollId,
      eventType: result?.pollData?.eventType,
    });
  }, []);

  if (partnerSlug) {
    return <LegacyCreatePage />;
  }

  return (
    <EventBuilder
      initialData={initialBuilderData}
      gating={gatingConfig}
      onSubmit={handleBuilderSubmit}
    />
  );
}

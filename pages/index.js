import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import EventBuilder from '@/components/EventBuilder/EventBuilder';
import LegacyCreatePage from '@/legacy/OriginalCreatePage_2025_11_13';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';
import { getGatingConfigFromStore } from '@/lib/siteSettings';
import {
  DEFAULT_FREE_DATE_LIMIT,
  DEFAULT_FREE_POLL_LIMIT,
  getDefaultDateLimitCopy,
} from '@/lib/gatingDefaults';

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

const buildFallbackConfig = () => ({
  enabled: process.env.NEXT_PUBLIC_PRO_GATING === 'true',
  freePollLimit: DEFAULT_FREE_POLL_LIMIT,
  freeDateLimit: DEFAULT_FREE_DATE_LIMIT,
  dateLimitCopy: getDefaultDateLimitCopy(DEFAULT_FREE_DATE_LIMIT),
});

export default function HomePage({ initialGatingConfig }) {
  const router = useRouter();
  const partnerSlug = getQueryValue(router, 'partner');
  const prefillLocation = getQueryValue(router, 'prefillLocation');
  const routedLocation = getQueryValue(router, 'location');
  const routedAddress = getQueryValue(router, 'address');
  const prefillTitle = getQueryValue(router, 'title');
  const prefillMode = getQueryValue(router, 'mode');
  const prefillNote = getQueryValue(router, 'note');
  const prefillSourceUrl = getQueryValue(router, 'sourceUrl');

  const gatingConfig = initialGatingConfig ?? buildFallbackConfig();

  const initialBuilderData = useMemo(
    () => ({
      location: routedLocation || routedAddress || prefillLocation || '',
      title: prefillTitle || '',
      eventType:
        prefillMode === 'meals' ? 'meal' : prefillMode === 'trip' ? 'holiday' : 'general',
      notes: prefillNote || (prefillSourceUrl ? `Suggested by AI. Website: ${prefillSourceUrl}` : ''),
    }),
    [prefillLocation, routedLocation, routedAddress, prefillTitle, prefillMode, prefillNote, prefillSourceUrl]
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

export async function getServerSideProps() {
  try {
    const gatingConfig = await getGatingConfigFromStore();
    return { props: { initialGatingConfig: gatingConfig } };
  } catch (error) {
    console.error('Failed to load gating config', error);
    return { props: { initialGatingConfig: buildFallbackConfig() } };
  }
}

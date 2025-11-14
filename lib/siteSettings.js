import { db } from './firebaseAdmin';
import {
  DEFAULT_FREE_DATE_LIMIT,
  DEFAULT_FREE_POLL_LIMIT,
  GATING_CONFIG_COLLECTION,
  GATING_CONFIG_DOC_ID,
  getDefaultDateLimitCopy,
} from './gatingDefaults';

export const getGatingConfigFromStore = async () => {
  const docRef = db.collection(GATING_CONFIG_COLLECTION).doc(GATING_CONFIG_DOC_ID);
  const snapshot = await docRef.get();
  const stored = snapshot.exists ? snapshot.data() : {};

  const freeDateLimit =
    typeof stored.freeDateLimit === 'number' ? stored.freeDateLimit : DEFAULT_FREE_DATE_LIMIT;
  const freePollLimit =
    typeof stored.freePollLimit === 'number' ? stored.freePollLimit : DEFAULT_FREE_POLL_LIMIT;
  const enabled =
    typeof stored.enabled === 'boolean' ? stored.enabled : process.env.NEXT_PUBLIC_PRO_GATING === 'true';
  const dateLimitCopy =
    typeof stored.dateLimitCopy === 'string' && stored.dateLimitCopy.trim()
      ? stored.dateLimitCopy.trim()
      : getDefaultDateLimitCopy(freeDateLimit);

  return {
    enabled,
    freeDateLimit,
    freePollLimit,
    dateLimitCopy,
  };
};

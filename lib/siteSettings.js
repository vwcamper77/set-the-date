import { db } from './firebaseAdmin';
import {
  DEFAULT_FREE_DATE_LIMIT,
  DEFAULT_FREE_POLL_LIMIT,
  GATING_CONFIG_COLLECTION,
  GATING_CONFIG_DOC_ID,
  getDefaultDateLimitCopy,
} from './gatingDefaults';

const parsePositiveInt = (value, fallback) => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return fallback;
};

export const normalizeGatingConfig = (raw = {}) => {
  const freeDateLimit = parsePositiveInt(raw.freeDateLimit, DEFAULT_FREE_DATE_LIMIT);
  const freePollLimit = parsePositiveInt(raw.freePollLimit, DEFAULT_FREE_POLL_LIMIT);
  const enabled =
    typeof raw.enabled === 'boolean' ? raw.enabled : process.env.NEXT_PUBLIC_PRO_GATING === 'true';
  const dateLimitCopy =
    typeof raw.dateLimitCopy === 'string' && raw.dateLimitCopy.trim()
      ? raw.dateLimitCopy.trim()
      : getDefaultDateLimitCopy(freeDateLimit);

  return {
    enabled,
    freeDateLimit,
    freePollLimit,
    dateLimitCopy,
  };
};

const gatingDocRef = db.collection(GATING_CONFIG_COLLECTION).doc(GATING_CONFIG_DOC_ID);

export const getGatingConfigFromStore = async () => {
  const snapshot = await gatingDocRef.get();
  return normalizeGatingConfig(snapshot.exists ? snapshot.data() : {});
};

export const getGatingDocRef = () => gatingDocRef;

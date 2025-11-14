// Shared defaults used by the builder, admin, and server-side helpers.
export const DEFAULT_FREE_POLL_LIMIT = 1;
export const DEFAULT_FREE_DATE_LIMIT = 5;
export const GATING_CONFIG_COLLECTION = 'siteSettings';
export const GATING_CONFIG_DOC_ID = 'gating';

export const getDefaultDateLimitCopy = (limit = DEFAULT_FREE_DATE_LIMIT) =>
  `Unlimited date options (no more than ${limit}-date cap for regular events).`;

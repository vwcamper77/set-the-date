const envAdmins = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

const DEFAULT_ADMIN_EMAIL = 'setthedateapp@gmail.com';
const ADMIN_EMAILS = envAdmins.length ? envAdmins : [DEFAULT_ADMIN_EMAIL];

export const ADMIN_EMAIL = ADMIN_EMAILS[0];
export const ADMIN_EMAILS_LIST = ADMIN_EMAILS;

export const isAdminEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  return ADMIN_EMAILS_LIST.includes(normalized);
};

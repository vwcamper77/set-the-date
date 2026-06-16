const INTERNATIONAL_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

export const normaliseInternationalPhoneNumber = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const cleaned = raw.replace(/[\s()-]/g, '');
  const withPlus = cleaned.startsWith('00') ? `+${cleaned.slice(2)}` : cleaned;

  if (!withPlus.startsWith('+')) {
    return withPlus.replace(/[^\d]/g, '');
  }

  return `+${withPlus.slice(1).replace(/[^\d]/g, '')}`;
};

export const isValidInternationalPhoneNumber = (value) => {
  const normalised = normaliseInternationalPhoneNumber(value);
  return INTERNATIONAL_PHONE_REGEX.test(normalised);
};

export const getInternationalPhoneError = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return 'Enter your mobile number with country code.';
  }

  const normalised = normaliseInternationalPhoneNumber(raw);

  if (!normalised.startsWith('+')) {
    return 'Include the country code, like +44 or +1.';
  }

  if (!INTERNATIONAL_PHONE_REGEX.test(normalised)) {
    return 'That mobile number looks off. Try again with the country code.';
  }

  return '';
};

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : 'https://plan.setthedate.app');
const DEFAULT_ACCENT = '#0f172a';

export const buildRentalLinks = (property) => {
  const slug = property?.slug;
  const sharePath = slug ? `/rentals/p/${slug}` : '/rentals/how-it-works';
  const shareUrl = `${BASE_URL}${sharePath}`;
  const bookingUrl = property?.bookingUrl || `${BASE_URL}/rentals/pricing`;
  return { shareUrl, sharePath, bookingUrl };
};

export const buildRentalWebsiteSnippet = (property) => {
  const { shareUrl } = buildRentalLinks(property);
  const accent = property?.accentColor || DEFAULT_ACCENT;
  const label = property?.propertyName ? `Plan a stay at ${property.propertyName}` : 'Plan your stay';
  return [
    '<!-- Set The Date rentals button -->',
    `<a href="${shareUrl}"`,
    '  style="display:inline-block;padding:12px 20px;border-radius:999px;',
    `  background:${accent};color:#ffffff;text-decoration:none;font-weight:600;"`,
    `>${label}</a>`,
  ].join('\n');
};

export const buildRentalPostStayEmail = (property) => {
  const { shareUrl, bookingUrl } = buildRentalLinks(property);
  const propertyName = property?.propertyName || 'your stay';
  return [
    `Thanks again for staying at ${propertyName}.`,
    '',
    'Planning the next trip?',
    `Share this link so your group can vote on dates: ${shareUrl}`,
    '',
    `Ready to book now? ${bookingUrl}`,
  ].join('\n');
};

export const buildRentalMetaDescription = (property) => {
  const propertyName = property?.propertyName || 'this property';
  const location = property?.locationText ? ` in ${property.locationText}` : '';
  return `Plan your next stay at ${propertyName}${location} with Set The Date.`;
};

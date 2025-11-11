const isValidUrl = (value) => typeof value === 'string' && Boolean(value.trim());

export const getPartnerOgImage = (partner, fallback) => {
  if (!partner || typeof partner !== 'object') {
    return fallback;
  }

  const gallery = Array.isArray(partner.venuePhotoGallery)
    ? partner.venuePhotoGallery.filter(isValidUrl)
    : [];

  const candidates = [
    ...gallery,
    partner.venuePhotoUrl,
    partner.logoUrl,
  ].filter(isValidUrl);

  if (candidates.length) {
    return candidates[0];
  }

  return fallback;
};

export default getPartnerOgImage;

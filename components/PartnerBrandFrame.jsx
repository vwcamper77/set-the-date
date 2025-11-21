import Head from 'next/head';
import getPartnerOgImage from '@/utils/getPartnerOgImage';
import { OG_LOGO_IMAGE, SHARE_BASE_URL } from '@/lib/brandAssets';

const FALLBACK_BRAND = '#0f172a';
const FALLBACK_OG_IMAGE = OG_LOGO_IMAGE;

const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);

const hexToRgb = (value = FALLBACK_BRAND) => {
  if (!value) return { r: 15, g: 23, b: 42 };
  let hex = value.replace('#', '').trim();
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('');
  }
  const int = Number.parseInt(hex, 16);
  if (Number.isNaN(int)) return { r: 15, g: 23, b: 42 };
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
};

const withAlpha = (hex, alpha) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha)})`;
};

export default function PartnerBrandFrame({ partner, children, showLogoAtTop = true }) {
  const {
    venueName = 'Set The Date Partner',
    city,
    slug,
    brandColor = FALLBACK_BRAND,
    logoUrl,
    metaDescription,
  } = partner || {};

  const accent = brandColor || FALLBACK_BRAND;
  const title = `${venueName} x Set The Date`;
  const description =
    metaDescription || `Plan your next night out at ${venueName}${city ? ` in ${city}` : ''} with Set The Date.`;
  const shareUrl = slug ? `${SHARE_BASE_URL}/p/${slug}` : SHARE_BASE_URL;
  const ogImage = getPartnerOgImage(partner, FALLBACK_OG_IMAGE);
  const backgroundGradient = `linear-gradient(180deg, ${withAlpha(accent, 0.25)} 0%, ${withAlpha(
    accent,
    0.12
  )} 35%, #f9fbff 65%, #ffffff 100%)`;
  const panelShadow = `0 40px 120px ${withAlpha(accent, 0.25)}`;
  const cardShadow = `0 40px 90px ${withAlpha(accent, 0.18)}`;
  const borderColor = withAlpha(accent, 0.35);
  const panelPaddingY = showLogoAtTop ? 'py-4' : 'py-6';

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={OG_LOGO_IMAGE} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:url" content={shareUrl} />
      </Head>

      <div
        className="relative min-h-screen text-slate-900 pb-12"
        style={{ backgroundImage: backgroundGradient, paddingTop: '5px', paddingLeft: '5px', paddingRight: '5px' }}
      >
        <div className="relative z-10 max-w-5xl mx-auto">
          <div
            className={`rounded-[40px] bg-white/95 backdrop-blur px-9 ${panelPaddingY} space-y-8`}
            style={{ border: `1px solid ${borderColor}`, boxShadow: panelShadow }}
          >
            {logoUrl && showLogoAtTop && (
              <div className="flex justify-center">
                <div
                  className="mx-auto w-full max-w-3xl rounded-[36px] bg-white/95 backdrop-blur p-8 flex justify-center"
                  style={{ border: `1px solid ${borderColor}`, boxShadow: cardShadow }}
                >
                  <img
                    src={logoUrl}
                    alt={`${venueName} logo`}
                    className="h-24 w-auto object-contain md:h-28"
                    loading="lazy"
                  />
                </div>
              </div>
            )}

            {children}
          </div>
        </div>
      </div>
    </>
  );
}

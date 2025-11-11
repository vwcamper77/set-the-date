import Head from 'next/head';
import getPartnerOgImage from '@/utils/getPartnerOgImage';

const FALLBACK_BRAND = '#0f172a';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://plan.setthedate.app';
const FALLBACK_OG_IMAGE = `${BASE_URL}/logo.png`;

export default function PartnerBrandFrame({ partner, children, showLogoAtTop = true }) {
  const {
    venueName = 'Set The Date Partner',
    city,
    slug,
    brandColor = FALLBACK_BRAND,
    logoUrl,
    metaDescription,
  } = partner || {};

  const title = `${venueName} x Set The Date`;
  const description =
    metaDescription || `Plan your next night out at ${venueName}${city ? ` in ${city}` : ''} with Set The Date.`;
  const shareUrl = slug ? `${BASE_URL}/p/${slug}` : BASE_URL;
  const ogImage = getPartnerOgImage(partner, FALLBACK_OG_IMAGE);

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:url" content={shareUrl} />
      </Head>

      <div
        className="relative min-h-screen bg-gradient-to-b from-[#eef2ff] via-[#f9fbff] to-white text-slate-900 px-4 sm:px-6 py-12"
        style={{ '--partner-brand': brandColor }}
      >

        <div className="relative z-10 max-w-5xl mx-auto space-y-8">
          {logoUrl && showLogoAtTop && (
            <div className="flex justify-center">
              <div className="w-full rounded-[36px] border border-white/70 bg-white/95 backdrop-blur px-6 py-10 shadow-[0_40px_90px_rgba(15,23,42,0.12)]">
                <img
                  src={logoUrl}
                  alt={`${venueName} logo`}
                  className="mx-auto h-24 w-auto object-contain md:h-28"
                  loading="lazy"
                />
              </div>
            </div>
          )}

          <div className="rounded-[40px] border border-white/70 bg-white/95 backdrop-blur shadow-[0_40px_120px_rgba(15,23,42,0.15)] p-4 sm:p-9">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}

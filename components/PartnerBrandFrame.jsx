import Head from 'next/head';

const FALLBACK_BRAND = '#0f172a';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://plan.setthedate.app';

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

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        {logoUrl && <meta property="og:image" content={logoUrl} />}
        <meta property="og:url" content={shareUrl} />
      </Head>

      <div
        className="relative min-h-screen bg-gradient-to-b from-[#eef2ff] via-[#f9fbff] to-white text-slate-900 px-4 sm:px-6 py-12 overflow-hidden"
        style={{ '--partner-brand': brandColor }}
      >
        <div
          className="pointer-events-none absolute inset-x-[-10%] top-0 h-[320px] select-none"
          aria-hidden="true"
        >
          <div className="absolute inset-x-8 top-8 h-[260px] rounded-[48px] bg-white/70 shadow-[0_45px_120px_rgba(15,23,42,0.12)]" />
          <div className="absolute inset-x-16 top-0 h-[220px] rounded-[48px] border border-white/70 bg-white/40" />
        </div>

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

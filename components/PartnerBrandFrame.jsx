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
        className="min-h-screen bg-slate-100 text-slate-900 px-4 sm:px-6 py-12"
        style={{ '--partner-brand': brandColor }}
      >
        <div className="max-w-5xl mx-auto">
          {logoUrl && showLogoAtTop && (
            <div className="flex justify-center mb-8">
              <div className="rounded-3xl bg-white shadow-xl shadow-black/10 p-5 inline-flex">
                <img
                  src={logoUrl}
                  alt={`${venueName} logo`}
                  className="h-24 w-auto object-contain"
                  loading="lazy"
                />
              </div>
            </div>
          )}

          <div className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-2xl shadow-slate-900/10">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}

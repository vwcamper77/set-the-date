import { useMemo, useState } from 'react';
import PoweredByBadge from '@/components/PoweredByBadge';

export default function VenueHero({
  partner,
  primaryCtaLabel,
  onPrimaryCta,
  showMap = true,
  badgeHref,
  badgeAriaLabel,
}) {
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const gallery = useMemo(() => {
    if (Array.isArray(partner?.venuePhotoGallery) && partner.venuePhotoGallery.length) {
      return partner.venuePhotoGallery;
    }
    return partner?.venuePhotoUrl ? [partner.venuePhotoUrl] : [];
  }, [partner?.venuePhotoGallery, partner?.venuePhotoUrl]);

  const activePhoto = gallery[activePhotoIndex] || null;
  const thumbnailPhotos = gallery
    .map((url, idx) => ({ url, idx }))
    .filter((item) => item.idx !== activePhotoIndex)
    .slice(0, 3);

  const venueLocationLabel = partner?.city
    ? `${partner.venueName}, ${partner.city}`
    : partner?.venueName || '';
  const partnerFullAddress = partner?.fullAddress || '';
  const mapsQuerySource = partnerFullAddress || venueLocationLabel || partner?.city || partner?.venueName || '';
  const mapsQuery = mapsQuerySource ? encodeURIComponent(mapsQuerySource) : '';
  const mapsEmbedUrl = mapsQuery ? `https://www.google.com/maps?q=${mapsQuery}&output=embed` : '';
  const bookingUrl = partner?.bookingUrl || '';

  return (
    <section className="space-y-6 lg:space-y-8">
      <div className="flex justify-center">
        <PoweredByBadge href={badgeHref} ariaLabel={badgeAriaLabel} />
      </div>
      <div className="rounded-[36px] border border-slate-200 bg-white px-6 py-10 text-center shadow-[0_30px_70px_rgba(15,23,42,0.08)]">
        {partner?.logoUrl ? (
          <img
            src={partner.logoUrl}
            alt={`${partner.venueName} logo`}
            className="mx-auto h-28 w-auto max-w-full object-contain"
            loading="lazy"
          />
        ) : (
          <p className="text-2xl font-semibold text-slate-900">{partner?.venueName || 'Featured venue'}</p>
        )}
      </div>

      <div className="rounded-[36px] border border-slate-200 bg-white shadow-[0_45px_90px_rgba(15,23,42,0.12)] p-6 lg:p-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.85fr)] items-start">
          <div className="space-y-3">
            {gallery.length > 0 ? (
              <>
                <div className="w-full rounded-[32px] overflow-hidden border border-slate-200 shadow-lg shadow-slate-900/5">
                  {activePhoto && (
                    <img
                      src={activePhoto}
                      alt={`${partner?.venueName || 'Venue'} featured photo`}
                      className="w-full h-[22rem] object-cover"
                      loading="lazy"
                    />
                  )}
                </div>
                {thumbnailPhotos.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {thumbnailPhotos.map(({ url, idx }) => (
                      <button
                        type="button"
                        key={`${url}-${idx}`}
                        onClick={() => setActivePhotoIndex(idx)}
                        className="rounded-2xl overflow-hidden border border-slate-200 shadow focus:outline-none focus:ring-2 focus:ring-slate-900/30"
                        aria-label="Show photo preview"
                      >
                        <img src={url} alt={`${partner?.venueName || 'Venue'} preview ${idx + 1}`} className="w-full h-28 object-cover" loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-[32px] border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-slate-500">
                Venue photos coming soon.
              </div>
            )}
          </div>
          <div className="space-y-6 text-left">
            <div className="space-y-3">
              <p className="uppercase tracking-[0.4em] text-xs text-slate-500">Featured venue</p>
              <h1 className="text-3xl md:text-4xl font-semibold leading-tight">
                Plan your visit to {partner?.venueName}
                {partner?.city ? <span> in {partner.city}</span> : null}
              </h1>
              <p className="text-slate-600">
                {partner?.venuePitch ||
                  `Pick a few dates, share the link, and let your friends vote Best/Maybe/No. When your group agrees, lock the table with the ${partner?.venueName} team.`}
              </p>
              {partner?.slug && (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-4 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.35em] text-slate-500">
                  {partner.slug}
                </span>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div>
                <p className="text-sm text-slate-500">Venue</p>
                <p className="text-lg font-semibold text-slate-900">{venueLocationLabel}</p>
                {partnerFullAddress && <p className="text-sm text-slate-600">{partnerFullAddress}</p>}
              </div>
              <div className="flex flex-wrap gap-3">
                {mapsQuery && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-full border border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-900 hover:text-white transition"
                  >
                    View on Google Maps
                  </a>
                )}
                {bookingUrl && (
                  <a
                    href={bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-900"
                  >
                    Visit venue site
                  </a>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {primaryCtaLabel && onPrimaryCta && (
                <button
                  type="button"
                  onClick={onPrimaryCta}
                  className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:translate-y-px"
                >
                  {primaryCtaLabel}
                </button>
              )}
              {bookingUrl && (
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-full border border-slate-300 px-6 py-3 text-base font-semibold text-slate-700 hover:border-slate-900"
                >
                  Book with the venue
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
      {showMap && mapsEmbedUrl && (
        <div className="rounded-[32px] border border-slate-200 overflow-hidden bg-white shadow-lg shadow-slate-900/10">
          <div className="bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">
            Map view
          </div>
          <div className="aspect-[4/3] w-full">
            <iframe
              title={`${partner?.venueName || 'Venue'} map`}
              src={mapsEmbedUrl}
              loading="lazy"
              allowFullScreen
              className="h-full w-full"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      )}
    </section>
  );
}

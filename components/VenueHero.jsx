import { useEffect, useMemo, useState } from 'react';
import PoweredByBadge from '@/components/PoweredByBadge';
import { SHARE_BASE_URL } from '@/lib/brandAssets';
import ImageLightbox from '@/components/ImageLightbox';

export default function VenueHero({
  partner,
  primaryCtaLabel,
  onPrimaryCta,
  showMap = true,
  badgeHref,
  badgeAriaLabel,
  showBookingCta = true,
  showBadge = true,
}) {
  const partnerHref = partner?.slug ? `${SHARE_BASE_URL}/p/${partner.slug}` : null;
  const partnerShareUrl = partnerHref || SHARE_BASE_URL;
  const shareVenueName = partner?.venueName || 'this venue';
  const shareTitle = `${shareVenueName} x Set The Date`;
  const shareText = `Plan your next get together at ${shareVenueName} and send the poll to friends.`;
  const whatsappHref = partnerShareUrl
    ? `https://wa.me/?text=${encodeURIComponent(`${shareText} ${partnerShareUrl}`)}`
    : null;
  const facebookHref = partnerShareUrl
    ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(partnerShareUrl)}`
    : null;
  const emailHref = partnerShareUrl
    ? `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(
        `${shareText}\n\n${partnerShareUrl}`
      )}`
    : null;
  const smsHref = partnerShareUrl ? `sms:?body=${encodeURIComponent(`${shareText} ${partnerShareUrl}`)}` : null;
  const canUseWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [photoLightboxIndex, setPhotoLightboxIndex] = useState(null);
  const gallery = useMemo(() => {
    if (Array.isArray(partner?.venuePhotoGallery) && partner.venuePhotoGallery.length) {
      return partner.venuePhotoGallery.filter(Boolean);
    }
    return partner?.venuePhotoUrl ? [partner.venuePhotoUrl] : [];
  }, [partner?.venuePhotoGallery, partner?.venuePhotoUrl]);

  const openLightbox = (index = 0) => {
    if (!gallery.length) return;
    const clamped = Math.min(Math.max(index, 0), gallery.length - 1);
    setPhotoLightboxIndex(clamped);
  };

  const closeLightbox = () => setPhotoLightboxIndex(null);

  useEffect(() => {
    if (photoLightboxIndex === null) return;
    if (!gallery.length) {
      setPhotoLightboxIndex(null);
      return;
    }
    if (photoLightboxIndex > gallery.length - 1) {
      setPhotoLightboxIndex(gallery.length - 1);
    }
  }, [gallery.length, photoLightboxIndex]);

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
  const contactEmail = (partner?.contactEmail || '').trim();
  const phoneNumber = (partner?.phoneNumber || '').trim();
  const mailtoHref = useMemo(() => {
    if (!contactEmail) return '';
    const venueName = partner?.venueName || 'your venue';
    const subject = encodeURIComponent(`Table enquiry - ${venueName}`);
    const bodyLines = [
      `Hi ${venueName},`,
      '',
      'I found your venue on Set The Date and would like to enquire about a table.',
      '',
      'Please share availability and any set menu details.',
      '',
      'Thanks!',
    ];
    const body = encodeURIComponent(bodyLines.join('\n'));
    return `mailto:${contactEmail}?subject=${subject}&body=${body}`;
  }, [contactEmail, partner?.venueName]);
  const socialLinks = [
    { key: 'instagram', label: 'Instagram', url: partner?.instagramUrl },
    { key: 'facebook', label: 'Facebook', url: partner?.facebookUrl },
    { key: 'tiktok', label: 'TikTok', url: partner?.tiktokUrl },
    { key: 'twitter', label: 'X / Twitter', url: partner?.twitterUrl },
  ].filter((item) => Boolean(item.url));
  const { addressLine, postcode } = useMemo(() => {
    if (!partnerFullAddress) {
      return { addressLine: '', postcode: '' };
    }
    const parts = partnerFullAddress.trim().split(/\s+/);
    if (parts.length >= 2) {
      return {
        addressLine: parts.slice(0, -2).join(' '),
        postcode: parts.slice(-2).join(' '),
      };
    }
    return { addressLine: partnerFullAddress, postcode: '' };
  }, [partnerFullAddress]);
  const mobileShareButtons = [
    whatsappHref && {
      key: 'whatsapp',
      label: 'WhatsApp',
      href: whatsappHref,
      brandColor: '#25D366',
      textColor: '#ffffff',
    },
    facebookHref && {
      key: 'facebook',
      label: 'Facebook',
      href: facebookHref,
      brandColor: '#1877F2',
      textColor: '#ffffff',
    },
    emailHref && {
      key: 'email',
      label: 'Email',
      href: emailHref,
      brandColor: '#0f172a',
      textColor: '#ffffff',
    },
    smsHref && {
      key: 'sms',
      label: 'SMS',
      href: smsHref,
      brandColor: '#0CAF60',
      textColor: '#ffffff',
    },
  ].filter(Boolean);

  const copyShareLink = async () => {
    if (!partnerShareUrl || typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(partnerShareUrl);
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 2500);
    } catch (error) {
      console.error('Failed to copy share link', error);
    }
  };

  const handleNativeShare = async () => {
    if (!partnerShareUrl) return;
    if (!canUseWebShare) {
      await copyShareLink();
      return;
    }
    try {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: partnerShareUrl,
      });
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error('Unable to share via Web Share API, copying instead', error);
        await copyShareLink();
      }
    }
  };

  return (
    <section className="space-y-6 lg:space-y-8">
      {showBadge && (
        <div className="flex justify-center">
          <PoweredByBadge href={badgeHref || 'https://setthedate.app'} ariaLabel={badgeAriaLabel || 'Visit Set The Date'} />
        </div>
      )}
      <div className="rounded-[36px] border border-slate-200 bg-white px-6 py-10 text-center shadow-[0_30px_70px_rgba(15,23,42,0.08)] overflow-hidden">
        {partner?.logoUrl ? (
          partnerHref ? (
            <a href={partnerHref} aria-label={`${partner.venueName} page`}>
              <img
                src={partner.logoUrl}
                alt={`${partner.venueName} logo`}
                className="mx-auto h-28 w-auto max-w-full object-contain"
                loading="lazy"
              />
            </a>
          ) : (
            <img
              src={partner.logoUrl}
              alt={`${partner.venueName} logo`}
              className="mx-auto h-28 w-auto max-w-full object-contain"
              loading="lazy"
            />
          )
        ) : (
          <p className="text-2xl font-semibold text-slate-900">{partner?.venueName || 'Featured venue'}</p>
        )}
      </div>

      <div className="rounded-[36px] border border-slate-200 bg-white shadow-[0_45px_90px_rgba(15,23,42,0.12)] p-3 sm:p-6 lg:p-10 overflow-hidden">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.85fr)] items-start">
            <div className="space-y-4">
              {gallery.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => openLightbox(activePhotoIndex)}
                    className="w-full rounded-[32px] overflow-hidden border border-slate-200 shadow-lg shadow-slate-900/5 focus:outline-none focus:ring-2 focus:ring-slate-900/30"
                    aria-label="Open photo gallery"
                  >
                    {activePhoto && (
                      <img
                        src={activePhoto}
                        alt={`${partner?.venueName || 'Venue'} featured photo`}
                        className="w-full h-[22rem] object-cover"
                        loading="lazy"
                      />
                    )}
                  </button>
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
              {bookingUrl && showBookingCta && (
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-full border border-orange-500 bg-orange-500 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-orange-500/30 transition hover:bg-orange-600"
                >
                  Book with the venue
                </a>
              )}
              {partnerShareUrl && (
                <>
                  <button
                    type="button"
                    onClick={handleNativeShare}
                    className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:border-slate-900 transition"
                  >
                    {canUseWebShare ? 'Share venue page' : 'Share & copy link'}
                  </button>
                  {whatsappHref && (
                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-full border border-emerald-500 bg-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-600"
                    >
                      Share on WhatsApp
                    </a>
                  )}
                  {emailHref && (
                    <a
                      href={emailHref}
                      className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-6 py-3 text-sm font-semibold text-slate-800 shadow-sm hover:border-slate-900 transition"
                    >
                      Share via email
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={copyShareLink}
                    className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-6 py-3 text-sm font-semibold text-slate-800 shadow-sm hover:border-slate-900 transition"
                  >
                    {copiedShareLink ? 'Link copied' : 'Copy link'}
                  </button>
                </>
              )}
            </div>
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
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4 overflow-hidden">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] items-stretch">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-slate-500">Venue</p>
                    <p className="text-lg font-semibold text-slate-900">{venueLocationLabel}</p>
                    {addressLine && <p className="text-sm text-slate-600">{addressLine}</p>}
                    {postcode && <p className="text-sm font-semibold text-slate-900">{postcode}</p>}
                  {phoneNumber && (
                    <p className="text-sm text-slate-700">
                      Phone:{' '}
                      <a href={`tel:${phoneNumber}`} className="font-semibold text-slate-900 hover:underline">
                        {phoneNumber}
                      </a>
                    </p>
                  )}
                  {contactEmail && (
                    <div className="pt-2">
                      <a
                        href={mailtoHref || `mailto:${contactEmail}`}
                        className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-slate-900 hover:text-slate-900 transition"
                      >
                        Email venue
                      </a>
                    </div>
                  )}
                  {bookingUrl && (
                    <div className="pt-2">
                      <a
                        href={bookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-slate-900 hover:text-slate-900 transition"
                      >
                        Visit venue site
                      </a>
                    </div>
                  )}
                </div>

                </div>

                {mapsEmbedUrl && (
                  <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm flex flex-col h-full self-stretch">
                    <div className="bg-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500">
                      Map
                    </div>
                    <div className="relative flex-1 min-h-[110px] md:min-h-[120px] lg:min-h-[130px]">
                      <iframe
                        title={`${partner?.venueName || 'Venue'} map`}
                        src={mapsEmbedUrl}
                        loading="lazy"
                        allowFullScreen
                        className="absolute inset-0 h-full w-full"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {socialLinks.length > 0 && (
              <div className="mt-2 flex flex-nowrap items-center gap-2 overflow-x-auto pb-2">
                {socialLinks.map((link) => (
                  <a
                    key={link.key}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm border border-slate-200 hover:border-slate-900 hover:text-slate-900 transition"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            )}
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
      {photoLightboxIndex !== null && (
        <ImageLightbox images={gallery} startIndex={photoLightboxIndex} onClose={closeLightbox} />
      )}
      {partnerShareUrl && mobileShareButtons.length > 0 && (
        <div
          className="fixed inset-x-0 bottom-4 z-40 px-4 sm:hidden"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="rounded-[28px] border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_24px_60px_rgba(15,23,42,0.35)] backdrop-blur">
            <p className="text-center text-[0.72rem] font-semibold uppercase tracking-[0.35em] text-slate-500">
              Share with organisers
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {mobileShareButtons.map((network) => (
                <a
                  key={network.key}
                  href={network.href}
                  target={network.key === 'email' || network.key === 'sms' ? '_self' : '_blank'}
                  rel={network.key === 'email' || network.key === 'sms' ? undefined : 'noopener noreferrer'}
                  className="inline-flex h-12 items-center justify-center rounded-2xl text-sm font-semibold shadow-lg shadow-slate-900/10 transition hover:opacity-90"
                  style={{ backgroundColor: network.brandColor, color: network.textColor }}
                  aria-label={`Share via ${network.label}`}
                >
                  {network.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

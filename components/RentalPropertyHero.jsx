import { useEffect, useMemo, useState } from 'react';
import PoweredByBadge from '@/components/PoweredByBadge';
import { SHARE_BASE_URL } from '@/lib/brandAssets';
import ImageLightbox from '@/components/ImageLightbox';

const getHeroFocusClass = (value) => {
  if (value === 'top') return 'object-top';
  if (value === 'bottom') return 'object-bottom';
  return 'object-center';
};

export default function RentalPropertyHero({
  property,
  primaryCtaLabel,
  onPrimaryCta,
  showMap = true,
  badgeHref,
  badgeAriaLabel,
  showBookingCta = true,
  showBadge = true,
}) {
  const propertyHref = property?.slug ? `${SHARE_BASE_URL}/rentals/p/${property.slug}` : null;
  const propertyShareUrl = propertyHref || SHARE_BASE_URL;
  const sharePropertyName = property?.propertyName || 'this property';
  const shareTitle = `${sharePropertyName} x Set The Date`;
  const shareText = `Plan your stay at ${sharePropertyName} and send a trip poll to friends.`;
  const whatsappHref = propertyShareUrl
    ? `https://wa.me/?text=${encodeURIComponent(`${shareText} ${propertyShareUrl}`)}`
    : null;
  const facebookShareWebHref = propertyShareUrl
    ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(propertyShareUrl)}`
    : null;
  const facebookShareAppHref = facebookShareWebHref
    ? `fb://facewebmodal/f?href=${encodeURIComponent(facebookShareWebHref)}`
    : null;
  const emailHref = propertyShareUrl
    ? `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(
        `${shareText}\n\n${propertyShareUrl}`
      )}`
    : null;
  const smsHref = propertyShareUrl
    ? `sms:?body=${encodeURIComponent(`${shareText} ${propertyShareUrl}`)}`
    : null;
  const [canUseWebShare, setCanUseWebShare] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [photoLightboxIndex, setPhotoLightboxIndex] = useState(null);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const facebookHref =
    isMobileDevice && facebookShareAppHref ? facebookShareAppHref : facebookShareWebHref;
  const gallery = useMemo(() => {
    const images = Array.isArray(property?.images) ? property.images.filter(Boolean) : [];
    const hero = property?.heroImageUrl ? [property.heroImageUrl] : [];
    const merged = [...hero, ...images].filter(Boolean);
    return Array.from(new Set(merged));
  }, [property?.images, property?.heroImageUrl]);

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

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const ua = navigator.userAgent || '';
    setIsMobileDevice(/(android|iphone|ipad|ipod)/i.test(ua));
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    setCanUseWebShare(typeof navigator.share === 'function');
  }, []);

  const activePhoto = gallery[activePhotoIndex] || null;
  const thumbnailPhotos = gallery
    .map((url, idx) => ({ url, idx }))
    .filter((item) => item.idx !== activePhotoIndex)
    .slice(0, 3);

  const propertyLocationLabel = property?.locationText
    ? `${property.propertyName}, ${property.locationText}`
    : property?.propertyName || '';
  const propertyFullAddress = property?.fullAddress || property?.locationText || '';
  const mapsQuerySource =
    propertyFullAddress || propertyLocationLabel || property?.locationText || property?.propertyName || '';
  const mapsQuery = mapsQuerySource ? encodeURIComponent(mapsQuerySource) : '';
  const mapsEmbedUrl = mapsQuery ? `https://www.google.com/maps?q=${mapsQuery}&output=embed` : '';
  const bookingUrl = property?.bookingUrl || '';
  const contactEmail = (property?.contactEmail || '').trim();
  const phoneNumber = (property?.phoneNumber || '').trim();
  const mailtoHref = useMemo(() => {
    if (!contactEmail) return '';
    const propertyName = property?.propertyName || 'your property';
    const subject = encodeURIComponent(`Booking enquiry - ${propertyName}`);
    const bodyLines = [
      `Hi ${propertyName},`,
      '',
      'I found your property on Set The Date and would like to enquire about availability.',
      '',
      'Please share rates and booking details.',
      '',
      'Thanks!',
    ];
    const body = encodeURIComponent(bodyLines.join('\n'));
    return `mailto:${contactEmail}?subject=${subject}&body=${body}`;
  }, [contactEmail, property?.propertyName]);
  const socialLinks = [
    { key: 'instagram', label: 'Instagram', url: property?.instagramUrl },
    { key: 'facebook', label: 'Facebook', url: property?.facebookUrl },
    { key: 'tiktok', label: 'TikTok', url: property?.tiktokUrl },
    { key: 'twitter', label: 'X / Twitter', url: property?.twitterUrl },
  ].filter((item) => Boolean(item.url));
  const { addressLine, postcode } = useMemo(() => {
    if (!propertyFullAddress) {
      return { addressLine: '', postcode: '' };
    }
    const parts = propertyFullAddress.trim().split(/\s+/);
    if (parts.length >= 2) {
      return {
        addressLine: parts.slice(0, -2).join(' '),
        postcode: parts.slice(-2).join(' '),
      };
    }
    return { addressLine: propertyFullAddress, postcode: '' };
  }, [propertyFullAddress]);
  const mobileShareButtons = [
    whatsappHref && {
      key: 'whatsapp',
      label: 'WhatsApp',
      href: whatsappHref,
      brandColor: '#25D366',
      textColor: '#ffffff',
      target: '_blank',
      rel: 'noopener noreferrer',
    },
    facebookHref && {
      key: 'facebook',
      label: 'Facebook',
      href: facebookHref,
      brandColor: '#1877F2',
      textColor: '#ffffff',
      target: facebookHref.startsWith('fb://') ? '_self' : '_blank',
      rel: facebookHref.startsWith('fb://') ? undefined : 'noopener noreferrer',
    },
    emailHref && {
      key: 'email',
      label: 'Email',
      href: emailHref,
      brandColor: '#0f172a',
      textColor: '#ffffff',
      target: '_self',
    },
    smsHref && {
      key: 'sms',
      label: 'SMS',
      href: smsHref,
      brandColor: '#0CAF60',
      textColor: '#ffffff',
      target: '_self',
    },
  ].filter(Boolean);

  const copyShareLink = async () => {
    if (!propertyShareUrl || typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(propertyShareUrl);
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 2500);
    } catch (error) {
      console.error('Failed to copy share link', error);
    }
  };

  const handleNativeShare = async () => {
    if (!propertyShareUrl) return;
    if (!canUseWebShare) {
      await copyShareLink();
      return;
    }
    try {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: propertyShareUrl,
      });
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error('Unable to share via Web Share API, copying instead', error);
        await copyShareLink();
      }
    }
  };

  const desktopShareButtons = propertyShareUrl
    ? [
        {
          key: 'native',
          type: 'button',
          label: canUseWebShare ? 'Share property page' : 'Share & copy link',
          onClick: handleNativeShare,
        },
        whatsappHref && {
          key: 'whatsapp',
          type: 'link',
          label: 'WhatsApp',
          href: whatsappHref,
        },
        emailHref && {
          key: 'email',
          type: 'link',
          label: 'Email',
          href: emailHref,
        },
        smsHref && {
          key: 'sms',
          type: 'link',
          label: 'SMS',
          href: smsHref,
        },
      ].filter(Boolean)
    : [];

  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow p-6 text-slate-900">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {property?.logoUrl && (
                <a href={propertyHref} aria-label={`${property?.propertyName || 'Property'} page`}>
                  <img
                    src={property.logoUrl}
                    alt={`${property?.propertyName || 'Property'} logo`}
                    className="h-16 w-auto object-contain rounded-lg border border-slate-200 bg-white p-2 md:h-20"
                    loading="lazy"
                  />
                </a>
              )}
              <div>
                <p className="uppercase tracking-[0.4em] text-xs text-slate-500">Featured property</p>
                <p className="text-2xl font-semibold text-slate-900">
                  {property?.propertyName || 'Featured property'}
                </p>
              </div>
            </div>
            {primaryCtaLabel && (
              <button
                type="button"
                onClick={onPrimaryCta}
                className="hidden sm:inline-flex items-center justify-center rounded-full bg-slate-900 text-white font-semibold px-5 py-2 shadow"
              >
                {primaryCtaLabel}
              </button>
            )}
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
            {activePhoto ? (
              <button type="button" onClick={() => openLightbox(activePhotoIndex)} className="w-full">
                <img
                  src={activePhoto}
                  alt={`${property?.propertyName || 'Property'} featured photo`}
                  className={`w-full h-64 object-cover sm:h-72 ${getHeroFocusClass(
                    property?.heroImageFocus
                  )}`}
                  loading="lazy"
                />
              </button>
            ) : (
              <div className="h-64 sm:h-72 flex items-center justify-center text-sm text-slate-500">
                Add a hero image to spotlight this property.
              </div>
            )}
          </div>

          {thumbnailPhotos.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {thumbnailPhotos.map(({ url, idx }) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => {
                    setActivePhotoIndex(idx);
                    openLightbox(idx);
                  }}
                  className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-50"
                >
                  <img
                    src={url}
                    alt={`${property?.propertyName || 'Property'} preview ${idx + 1}`}
                    className="w-full h-28 object-cover object-center"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 space-y-3">
            <p className="uppercase tracking-[0.4em] text-xs text-slate-500">Plan your stay</p>
            <h2 className="text-2xl font-semibold text-slate-900">
              {property?.propertyName ? `Stay at ${property.propertyName}` : 'Plan a stay'}
            </h2>
            <p className="text-slate-600">
              {property?.introText ||
                'Pick a travel window, share a poll, and let your group vote on the best dates to book.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {primaryCtaLabel && (
                <button
                  type="button"
                  onClick={onPrimaryCta}
                  className="inline-flex items-center justify-center rounded-full bg-slate-900 text-white font-semibold px-5 py-2 shadow"
                >
                  {primaryCtaLabel}
                </button>
              )}
              {bookingUrl && showBookingCta && (
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-full border border-slate-900 px-5 py-2 font-semibold text-slate-900 hover:bg-slate-900 hover:text-white transition"
                >
                  Book now
                </a>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Share this property</p>
              {copiedShareLink && (
                <span className="text-xs font-semibold text-emerald-600">Link copied</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {desktopShareButtons.map((item) =>
                item.type === 'link' ? (
                  <a
                    key={item.key}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-slate-300 px-4 py-1 text-xs font-semibold text-slate-700 hover:border-slate-900 hover:text-slate-900"
                  >
                    {item.label}
                  </a>
                ) : (
                  <button
                    key={item.key}
                    type="button"
                    onClick={item.onClick}
                    className="rounded-full bg-slate-900 px-4 py-1 text-xs font-semibold text-white"
                  >
                    {item.label}
                  </button>
                )
              )}
            </div>
            {mobileShareButtons.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:hidden">
                {mobileShareButtons.map((item) => (
                  <a
                    key={item.key}
                    href={item.href}
                    className="rounded-2xl px-3 py-2 text-xs font-semibold text-center"
                    style={{ backgroundColor: item.brandColor, color: item.textColor }}
                    target={item.target}
                    rel={item.rel}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          {(showMap || contactEmail || phoneNumber || socialLinks.length > 0) && (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Property details</p>
                {propertyLocationLabel && (
                  <p className="text-lg font-semibold text-slate-900">{propertyLocationLabel}</p>
                )}
                {addressLine && (
                  <p className="text-sm text-slate-600">{addressLine}</p>
                )}
                {postcode && <p className="text-sm text-slate-600">{postcode}</p>}
              </div>
              {(contactEmail || phoneNumber || bookingUrl) && (
                <div className="flex flex-wrap gap-2">
                  {contactEmail && (
                    <a
                      href={mailtoHref}
                      className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-1 text-xs font-semibold text-slate-700 hover:border-slate-900"
                    >
                      Email host
                    </a>
                  )}
                  {phoneNumber && (
                    <a
                      href={`tel:${phoneNumber}`}
                      className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-1 text-xs font-semibold text-slate-700 hover:border-slate-900"
                    >
                      Call host
                    </a>
                  )}
                  {bookingUrl && (
                    <a
                      href={bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-1 text-xs font-semibold text-white"
                    >
                      Visit listing
                    </a>
                  )}
                </div>
              )}
              {socialLinks.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {socialLinks.map((link) => (
                    <a
                      key={link.key}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-1 text-xs font-semibold text-slate-700 hover:border-slate-900"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              )}
              {showMap && mapsEmbedUrl && (
                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                  <iframe
                    title={`${property?.propertyName || 'Property'} map`}
                    src={mapsEmbedUrl}
                    className="w-full h-40"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showBadge && (
        <div className="flex justify-center pt-6">
          <PoweredByBadge
            href={badgeHref}
            ariaLabel={badgeAriaLabel}
          />
        </div>
      )}

      {photoLightboxIndex !== null && gallery[photoLightboxIndex] && (
        <ImageLightbox
          images={gallery}
          selectedIndex={photoLightboxIndex}
          onClose={closeLightbox}
          onSelect={setPhotoLightboxIndex}
        />
      )}
    </section>
  );
}


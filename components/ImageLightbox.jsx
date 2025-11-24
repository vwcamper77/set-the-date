import { useCallback, useEffect, useMemo, useState } from 'react';

export default function ImageLightbox({ images = [], startIndex = 0, onClose }) {
  const gallery = useMemo(() => (Array.isArray(images) ? images.filter(Boolean) : []), [images]);
  const [activeIndex, setActiveIndex] = useState(() => (Number.isFinite(startIndex) ? startIndex : 0));
  const hasImages = gallery.length > 0;

  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose?.();
    }
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!hasImages) return;
    if (!Number.isFinite(startIndex)) {
      setActiveIndex(0);
      return;
    }
    const clamped = Math.min(Math.max(startIndex, 0), gallery.length - 1);
    setActiveIndex(clamped);
  }, [gallery.length, hasImages, startIndex]);

  useEffect(() => {
    if (!hasImages) return;
    setActiveIndex((prev) => Math.min(Math.max(prev, 0), gallery.length - 1));
  }, [gallery.length, hasImages]);

  useEffect(() => {
    if (!hasImages) return undefined;
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setActiveIndex((prev) => (prev - 1 + gallery.length) % gallery.length);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setActiveIndex((prev) => (prev + 1) % gallery.length);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [gallery.length, hasImages, onClose]);

  const goPrev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + gallery.length) % gallery.length);
  }, [gallery.length]);

  const goNext = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % gallery.length);
  }, [gallery.length]);

  if (!hasImages) return null;

  const activePhoto = gallery[Math.min(activeIndex, gallery.length - 1)] || gallery[0] || '';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-6 overflow-y-auto"
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        className="relative w-full max-w-5xl mx-auto"
        style={{ maxHeight: '90vh' }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white text-2xl font-bold shadow-2xl shadow-black/40 ring-2 ring-white/70 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-white"
          aria-label="Close photo viewer"
        >
          x
        </button>

        <div
          className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
          style={{ maxHeight: '90vh' }}
        >
          <div className="relative flex items-center justify-center bg-black" style={{ minHeight: '50vh', maxHeight: '82vh' }}>
            <img
              src={activePhoto}
              alt="Full-size gallery"
              className="block max-h-full max-w-full w-auto h-auto object-contain"
              loading="eager"
            />

            {gallery.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-4 py-2 text-lg font-bold text-slate-900 shadow hover:bg-white focus:outline-none focus:ring-2 focus:ring-white/80"
                  aria-label="Previous photo"
                >
                  {'<'}
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-4 py-2 text-lg font-bold text-slate-900 shadow hover:bg-white focus:outline-none focus:ring-2 focus:ring-white/80"
                  aria-label="Next photo"
                >
                  {'>'}
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/65 px-3 py-1 text-xs font-semibold text-white">
                  {activeIndex + 1} / {gallery.length}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

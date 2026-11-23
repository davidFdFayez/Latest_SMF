import { useEffect, useRef, useState } from 'react';
import { bannerImageStyle, fitBannerCrop } from '../utils/bannerCrop';

/**
 * A banner image the admin has positioned, inside a frame that clips it. The
 * frame's own class gives its size and shape. Until the picture has loaded it
 * is drawn with the position as chosen; then, if the frame is not the banner's
 * 16:5, the position is fitted to the frame's shape (see fitBannerCrop).
 */
export default function PositionedBanner({ src, crop, className, imgClassName, loading }) {
  const frameRef = useRef(null);
  const imgRef = useRef(null);
  const [natural, setNatural] = useState(null);
  const [aspect, setAspect] = useState(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const measure = () => {
      const box = frame.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) setAspect(box.width / box.height);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // A picture already in the cache can finish before the handler is attached.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) setNatural({ w: img.naturalWidth, h: img.naturalHeight });
  }, [src]);

  const fitted = natural && aspect ? fitBannerCrop(crop, natural, aspect) : crop;

  return (
    <span ref={frameRef} className={className}>
      <img
        ref={imgRef}
        className={imgClassName}
        src={src}
        alt=""
        loading={loading}
        style={bannerImageStyle(fitted)}
        onLoad={(event) => {
          const img = event.currentTarget;
          if (img.naturalWidth > 0) setNatural({ w: img.naturalWidth, h: img.naturalHeight });
        }}
      />
    </span>
  );
}

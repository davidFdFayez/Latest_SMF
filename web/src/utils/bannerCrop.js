/*
 * A tournament banner's position, as the admin's Adjust Image sets it and the
 * API returns it (`imageCrop`: { x, y, zoom }, or null). The file is never
 * cropped: this only frames it.
 *
 *   x, y  where the frame sits within the image's overflow, in percent:
 *         0 the left/top edge, 50 the middle, 100 the right/bottom.
 *   zoom  how much larger than "just covers the frame" it is drawn, 1 to 4.
 *
 * The position was chosen in the banner's 16:5 frame. bannerImageStyle() draws
 * it in a box that clips (overflow: hidden) with the same properties the admin
 * preview uses, so a 16:5 box shows exactly what the admin saw, and any box is
 * always fully covered — no empty area at any position or zoom.
 *
 * A box of another shape (a 16:9 card, the narrower header on a phone) uses
 * fitBannerCrop() once the picture's size is known: the smallest window of the
 * box's shape that holds the whole chosen area, centred on it — or, where the
 * picture is too short or too narrow for that, the largest window, centred on
 * the same spot. In a 16:5 box that is the chosen crop itself.
 */
export const BANNER_ASPECT = 16 / 5;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** The position with every value a usable number in range, or null. */
export function cleanCrop(crop) {
  if (!crop) return null;
  const x = Number(crop.x);
  const y = Number(crop.y);
  const zoom = Number(crop.zoom);
  if (![x, y, zoom].every(Number.isFinite)) return null;
  return { x: clamp(x, 0, 100), y: clamp(y, 0, 100), zoom: clamp(zoom, 1, 4) };
}

/** The style for a positioned banner, or undefined for one nobody has positioned. */
export function bannerImageStyle(crop) {
  const c = cleanCrop(crop);
  if (!c) return undefined;
  const x = Math.round(c.x * 100) / 100;
  const y = Math.round(c.y * 100) / 100;
  const zoom = Math.round(c.zoom * 10000) / 10000;
  return {
    objectFit: 'cover',
    objectPosition: `${x}% ${y}%`,
    transform: `scale(${zoom})`,
    transformOrigin: `${x}% ${y}%`,
  };
}

/**
 * The position for a box of `aspect` (width / height) that keeps the area the
 * admin chose in the 16:5 frame, for a picture of `natural` { w, h } pixels.
 */
export function fitBannerCrop(crop, natural, aspect) {
  const c = cleanCrop(crop);
  if (!c || !natural || !(natural.w > 0) || !(natural.h > 0) || !(aspect > 0)) return c;
  const { w, h } = natural;
  // The largest window of a shape that fits in the picture.
  const largest = (a) => (w / h > a ? { width: h * a, height: h } : { width: w, height: w / a });

  // The chosen area, in the picture's own pixels.
  const frame = largest(BANNER_ASPECT);
  const rw = frame.width / c.zoom;
  const rh = frame.height / c.zoom;
  const rl = (c.x / 100) * (w - rw);
  const rt = (c.y / 100) * (h - rh);

  // The smallest window of the box's shape holding it, if the picture allows.
  const box = largest(aspect);
  const tw = Math.min(Math.max(rw, rh * aspect), box.width);
  const th = tw / aspect;
  const left = clamp(rl + rw / 2 - tw / 2, 0, w - tw);
  const top = clamp(rt + rh / 2 - th / 2, 0, h - th);

  return {
    x: w - tw > 0.5 ? (left / (w - tw)) * 100 : 50,
    y: h - th > 0.5 ? (top / (h - th)) * 100 : 50,
    zoom: box.width / tw,
  };
}

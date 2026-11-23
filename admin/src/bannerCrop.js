/*
 * A tournament banner's position: which part of the picture shows inside the
 * 16:5 banner frame. The file itself is never cropped or re-encoded — only how
 * it is framed is stored, as three numbers the API keeps (BannerCrop.cs):
 *
 *   x, y  where the frame sits within the image's overflow on each axis, in
 *         percent: 0 the left/top edge, 50 the middle, 100 the right/bottom.
 *   zoom  how much larger than "just covers the frame" the image is drawn,
 *         about that same point. 1 to 4.
 *
 * In CSS that is object-fit: cover, object-position: x% y%, and
 * transform: scale(zoom) with transform-origin x% y%, inside a box that clips.
 * Every value covers the box completely, so dragging or zooming can never
 * open an empty area. The preview here and every page that shows the banner
 * use exactly those properties, which is what makes the preview the real crop.
 */

export const BANNER_DEFAULT_CROP = { x: 50, y: 50, zoom: 1 }
export const BANNER_MIN_ZOOM = 1
export const BANNER_MAX_ZOOM = 4

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/** The position as the API keeps it: x and y to a tenth, zoom to a hundredth. */
export function normaliseCrop(crop) {
  if (!crop) return null
  const x = Number(crop.x)
  const y = Number(crop.y)
  const zoom = Number(crop.zoom)
  if (![x, y, zoom].every(Number.isFinite)) return null
  return {
    x: Math.round(clamp(x, 0, 100) * 10) / 10,
    y: Math.round(clamp(y, 0, 100) * 10) / 10,
    zoom: Math.round(clamp(zoom, BANNER_MIN_ZOOM, BANNER_MAX_ZOOM) * 100) / 100,
  }
}

/** True when two positions frame the picture the same way (null is the default framing). */
export function sameCrop(a, b) {
  const first = normaliseCrop(a)
  const second = normaliseCrop(b)
  if (!first || !second) return !first && !second
  return first.x === second.x && first.y === second.y && first.zoom === second.zoom
}

/** "x y zoom", the form the banner upload takes it in. */
export function cropToField(crop) {
  const clean = normaliseCrop(crop)
  return clean ? `${clean.x} ${clean.y} ${clean.zoom}` : ''
}

/**
 * The style for an <img> filling a clipping box. Null — a banner nobody has
 * positioned — returns nothing, so the box's own default framing applies.
 */
export function bannerImageStyle(crop) {
  const clean = normaliseCrop(crop)
  if (!clean) return undefined
  return {
    objectFit: 'cover',
    objectPosition: `${clean.x}% ${clean.y}%`,
    transform: `scale(${clean.zoom})`,
    transformOrigin: `${clean.x}% ${clean.y}%`,
  }
}

/*
 * The same fitting the website does (web/src/utils/bannerCrop.js), kept
 * identical so the previews in Adjust Image are what the pages show: a frame
 * that is not 16:5 shows the smallest window of its own shape holding the whole
 * area chosen in the 16:5 frame, centred on it — or, where the picture is too
 * short or too narrow for that, the largest window, centred on the same spot.
 * In a 16:5 frame that is the chosen crop itself.
 */
export const BANNER_ASPECT = 16 / 5

export function fitBannerCrop(crop, natural, aspect) {
  const c = normaliseCrop(crop)
  if (!c || !natural || !(natural.w > 0) || !(natural.h > 0) || !(aspect > 0)) return c
  const { w, h } = natural
  // The largest window of a shape that fits in the picture.
  const largest = (a) => (w / h > a ? { width: h * a, height: h } : { width: w, height: w / a })

  // The chosen area, in the picture's own pixels.
  const frame = largest(BANNER_ASPECT)
  const rw = frame.width / c.zoom
  const rh = frame.height / c.zoom
  const rl = (c.x / 100) * (w - rw)
  const rt = (c.y / 100) * (h - rh)

  // The smallest window of the box's shape holding it, if the picture allows.
  const box = largest(aspect)
  const tw = Math.min(Math.max(rw, rh * aspect), box.width)
  const th = tw / aspect
  const left = clamp(rl + rw / 2 - tw / 2, 0, w - tw)
  const top = clamp(rt + rh / 2 - th / 2, 0, h - th)

  return {
    x: w - tw > 0.5 ? (left / (w - tw)) * 100 : 50,
    y: h - th > 0.5 ? (top / (h - th)) * 100 : 50,
    zoom: box.width / tw,
  }
}

/* A fitted position as a style, without the stored rounding (that is for the
   saved value; a fitted one is only drawn). */
export function fittedImageStyle(crop) {
  if (!crop) return undefined
  const x = Math.round(crop.x * 100) / 100
  const y = Math.round(crop.y * 100) / 100
  const zoom = Math.round(crop.zoom * 10000) / 10000
  return {
    objectFit: 'cover',
    objectPosition: `${x}% ${y}%`,
    transform: `scale(${zoom})`,
    transformOrigin: `${x}% ${y}%`,
  }
}

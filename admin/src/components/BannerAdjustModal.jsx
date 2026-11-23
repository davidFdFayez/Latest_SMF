import { useEffect, useRef, useState } from 'react'
import { MoveIcon, ResetIcon } from './Icons'
import {
  BANNER_DEFAULT_CROP,
  BANNER_MAX_ZOOM,
  BANNER_MIN_ZOOM,
  bannerImageStyle,
  clamp,
  cropToField,
  fitBannerCrop,
  fittedImageStyle,
  normaliseCrop,
  sameCrop,
} from '../bannerCrop'

const ZOOM_STEP = 0.1

/* The website's two other frames, for the previews: the tournament page header
   (its picture area is about 40% of a 1440px-wide page by 300px high) and the
   Activities card (16:9). */
const WEBSITE_FRAMES = [
  { key: 'header', label: 'Tournament page header', width: 576, height: 300 },
  { key: 'card', label: 'Activities card', width: 16, height: 9 },
]

/*
 * Where the image lands in a frame of fw × fh for a position, in the frame's
 * pixels — the same arithmetic as the CSS in bannerCrop.js. `left` runs from 0 (the
 * image's left edge at the frame's) to -sx (its right edge at the frame's).
 */
function geometry(crop, natural, fw, fh) {
  const cover = Math.max(fw / natural.w, fh / natural.h)
  const width = natural.w * cover * crop.zoom
  const height = natural.h * cover * crop.zoom
  const sx = width - fw
  const sy = height - fh
  return { fw, fh, width, height, sx, sy, left: -(crop.x / 100) * sx, top: -(crop.y / 100) * sy }
}

/* The overview's size: the whole picture, at most 200 × 76 pixels. */
function overviewSize(natural) {
  const scale = Math.min(200 / natural.w, 76 / natural.h)
  return {
    width: `${Math.max(24, Math.round(natural.w * scale))}px`,
    height: `${Math.max(12, Math.round(natural.h * scale))}px`,
  }
}

/**
 * Adjust Image: drag (mouse, touch or pen) to reposition, pinch or the slider
 * to zoom, Reset for the centred default. Cancel discards everything; Apply
 * hands the position back — the tournament form's Save is what keeps it.
 */
export default function BannerAdjustModal({
  src,
  initial,
  busy = false,
  error = '',
  applyLabel = 'Apply',
  onCancel,
  onApply,
}) {
  const [crop, setCrop] = useState(() => normaliseCrop(initial) || BANNER_DEFAULT_CROP)
  const [natural, setNatural] = useState(null)
  const [broken, setBroken] = useState(false)
  const [dragging, setDragging] = useState(false)
  const frameRef = useRef(null)
  const cropRef = useRef(crop)
  const pointers = useRef(new Map())
  const gesture = useRef(null)
  const ready = Boolean(natural) && !broken

  useEffect(() => {
    cropRef.current = crop
  }, [crop])

  useEffect(() => {
    frameRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  function frameBox() {
    const box = frameRef.current?.getBoundingClientRect()
    return box && box.width > 0 && box.height > 0 ? box : null
  }

  /* A position for `zoom` whose image's top-left corner is as near to
     (left, top) as the frame allows — the frame is always fully covered. */
  function place(base, zoom, left, top) {
    const box = frameBox()
    if (!box || !natural) return base
    const g = geometry({ ...base, zoom }, natural, box.width, box.height)
    const l = clamp(left, -g.sx, 0)
    const t = clamp(top, -g.sy, 0)
    return normaliseCrop({
      x: g.sx > 0.5 ? (-l / g.sx) * 100 : base.x,
      y: g.sy > 0.5 ? (-t / g.sy) * 100 : base.y,
      zoom,
    })
  }

  /* The image moved by (dx, dy) screen pixels from where `base` put it. */
  function pan(base, dx, dy) {
    const box = frameBox()
    if (!box || !natural) return base
    const g = geometry(base, natural, box.width, box.height)
    return place(base, base.zoom, g.left + dx, g.top + dy)
  }

  /* A new zoom that keeps the point under (ax, ay) — the frame's centre by
     default — where it is, so zooming does not throw the subject aside. */
  function zoomTo(base, zoom, anchor) {
    const box = frameBox()
    if (!box || !natural) return base
    const z = clamp(zoom, BANNER_MIN_ZOOM, BANNER_MAX_ZOOM)
    const ax = anchor ? anchor.x : box.width / 2
    const ay = anchor ? anchor.y : box.height / 2
    const g = geometry(base, natural, box.width, box.height)
    const u = (ax - g.left) / g.width
    const v = (ay - g.top) / g.height
    const ratio = z / base.zoom
    return place(base, z, ax - u * g.width * ratio, ay - v * g.height * ratio)
  }

  /* ── drag and pinch, through pointer events (mouse, touch and pen alike) ── */

  function local(point) {
    const box = frameBox()
    return box ? { x: point.x - box.left, y: point.y - box.top } : point
  }

  function beginGesture() {
    const points = [...pointers.current.values()]
    const base = cropRef.current
    if (points.length === 1) {
      gesture.current = { kind: 'pan', base, start: points[0] }
    } else if (points.length >= 2) {
      const [a, b] = points
      gesture.current = {
        kind: 'pinch',
        base,
        distance: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      }
    } else {
      gesture.current = null
    }
  }

  function onPointerDown(event) {
    if (!ready || busy) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    frameRef.current?.setPointerCapture?.(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    setDragging(true)
    beginGesture()
  }

  function onPointerMove(event) {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const current = gesture.current
    if (!current) return
    if (current.kind === 'pan') {
      const point = pointers.current.get(event.pointerId)
      setCrop(pan(current.base, point.x - current.start.x, point.y - current.start.y))
      return
    }
    const [a, b] = [...pointers.current.values()]
    const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const zoomed = zoomTo(current.base, current.base.zoom * (distance / current.distance), local(current.mid))
    setCrop(pan(zoomed, mid.x - current.mid.x, mid.y - current.mid.y))
  }

  function onPointerEnd(event) {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.delete(event.pointerId)
    // Lifting one finger of a pinch carries on as a drag with the other.
    beginGesture()
    if (pointers.current.size === 0) setDragging(false)
  }

  /* Arrow keys move the picture, + and − zoom, for anyone not using a pointer. */
  function onKeyDown(event) {
    if (!ready || busy) return
    const step = event.shiftKey ? 40 : 10
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (moves[event.key]) {
      event.preventDefault()
      setCrop((current) => pan(current, ...moves[event.key]))
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      setCrop((current) => zoomTo(current, current.zoom + ZOOM_STEP))
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault()
      setCrop((current) => zoomTo(current, current.zoom - ZOOM_STEP))
    }
  }

  // The small overview: the whole picture, with the part the banner shows.
  const overview = ready ? geometry(crop, natural, 16, 5) : null

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="banner-adjust-title">
      <div className="modal banner-adjust">
        <h3 id="banner-adjust-title">Adjust Image</h3>
        <p className="banner-adjust__lead">
          Drag to reposition the banner. The previews below show how the tournament page header and the Activities card
          frame the same area. The original image is kept unchanged.
        </p>

        <div
          ref={frameRef}
          className={`banner-adjust__frame${dragging ? ' is-dragging' : ''}${ready ? '' : ' is-waiting'}`}
          tabIndex={0}
          role="application"
          aria-label="Banner crop preview. Drag, or use the arrow keys, to reposition. Plus and minus zoom."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onLostPointerCapture={onPointerEnd}
          onKeyDown={onKeyDown}
          data-crop={cropToField(crop)}
        >
          {!broken && (
            <img
              src={src}
              alt=""
              draggable={false}
              style={bannerImageStyle(crop)}
              onLoad={(event) => {
                const image = event.currentTarget
                if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                  setNatural({ w: image.naturalWidth, h: image.naturalHeight })
                } else {
                  setBroken(true)
                }
              }}
              onError={() => setBroken(true)}
            />
          )}
          {ready && (
            <span className="banner-adjust__hint" aria-hidden="true">
              <MoveIcon /> Drag to reposition
            </span>
          )}
          {broken && (
            <span className="banner-adjust__broken">This image could not be loaded, so it cannot be positioned.</span>
          )}
        </div>

        <div className="banner-adjust__controls">
          <div className="banner-adjust__zoom">
            <label htmlFor="banner-adjust-zoom">Zoom</label>
            <button
              type="button"
              className="banner-adjust__step"
              aria-label="Zoom out"
              disabled={!ready || busy || crop.zoom <= BANNER_MIN_ZOOM}
              onClick={() => setCrop((current) => zoomTo(current, current.zoom - ZOOM_STEP))}
            >
              −
            </button>
            <input
              id="banner-adjust-zoom"
              type="range"
              min={BANNER_MIN_ZOOM}
              max={BANNER_MAX_ZOOM}
              step="0.01"
              value={crop.zoom}
              disabled={!ready || busy}
              onChange={(event) => {
                const value = Number(event.target.value)
                setCrop((current) => zoomTo(current, value))
              }}
            />
            <button
              type="button"
              className="banner-adjust__step"
              aria-label="Zoom in"
              disabled={!ready || busy || crop.zoom >= BANNER_MAX_ZOOM}
              onClick={() => setCrop((current) => zoomTo(current, current.zoom + ZOOM_STEP))}
            >
              +
            </button>
            <output className="banner-adjust__value" htmlFor="banner-adjust-zoom">
              {Math.round(crop.zoom * 100)}%
            </output>
          </div>
          <button
            type="button"
            className="btn btn--secondary btn--small"
            disabled={!ready || busy || sameCrop(crop, BANNER_DEFAULT_CROP)}
            onClick={() => setCrop(BANNER_DEFAULT_CROP)}
          >
            <ResetIcon /> Reset
          </button>
          {overview && (
            <div
              className="banner-adjust__overview"
              style={overviewSize(natural)}
              title="The whole image, with the part the banner shows"
              aria-hidden="true"
            >
              <img src={src} alt="" draggable={false} />
              <span
                className="banner-adjust__window"
                style={{
                  left: `${(-overview.left / overview.width) * 100}%`,
                  top: `${(-overview.top / overview.height) * 100}%`,
                  width: `${(overview.fw / overview.width) * 100}%`,
                  height: `${(overview.fh / overview.height) * 100}%`,
                }}
              />
            </div>
          )}
        </div>

        {ready && (
          <div className="banner-adjust__previews">
            {WEBSITE_FRAMES.map((frame) => (
              <figure className={`banner-adjust__site banner-adjust__site--${frame.key}`} key={frame.key}>
                <span
                  className="banner-adjust__site-frame"
                  style={{ aspectRatio: `${frame.width} / ${frame.height}` }}
                  data-crop={cropToField(fitBannerCrop(crop, natural, frame.width / frame.height))}
                >
                  <img
                    src={src}
                    alt=""
                    draggable={false}
                    style={fittedImageStyle(fitBannerCrop(crop, natural, frame.width / frame.height))}
                  />
                </span>
                <figcaption>{frame.label}</figcaption>
              </figure>
            ))}
          </div>
        )}

        {error && (
          <p className="pt-error" role="alert">
            {error}
          </p>
        )}

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => onApply(normaliseCrop(crop))}
            disabled={!ready || busy}
          >
            {busy ? 'Uploading…' : applyLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

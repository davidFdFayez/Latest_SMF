import { useRef, useState } from 'react'

/**
 * Where the subject of an image is, picked by clicking it.
 *
 * News cards crop every image into the same 16/9 window, and something has to
 * be lost at the edges. The old default — centred, a third of the way down —
 * is right for most photos and wrong exactly when it matters: a portrait shot
 * with the face high, or two people with one of them at the side. Rather than
 * guess harder, the editor says where the subject is and the card crops around
 * it.
 *
 * The preview beside the picture is the real thing: the same aspect ratio, the
 * same `object-position`, so what the editor sees is what the listing shows.
 */
export default function FocalPointPicker({ src, value, onChange }) {
  const imageRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  // A picture the console cannot load leaves nothing to click, and silently
  // ignoring the clicks is the worst of both worlds. Say so instead.
  const [broken, setBroken] = useState(false)

  const [x, y] = parse(value)

  function pointFrom(event) {
    const box = imageRef.current?.getBoundingClientRect()
    if (!box || !box.width || !box.height) return null
    const nextX = Math.round(((event.clientX - box.left) / box.width) * 100)
    const nextY = Math.round(((event.clientY - box.top) / box.height) * 100)
    return [clamp(nextX), clamp(nextY)]
  }

  function set(event) {
    const point = pointFrom(event)
    if (point) onChange(`${point[0]} ${point[1]}`)
  }

  // Arrow keys move the point for anyone not using a mouse.
  function onKeyDown(event) {
    const step = event.shiftKey ? 10 : 2
    const moves = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    onChange(`${clamp(x + move[0])} ${clamp(y + move[1])}`)
  }

  if (!src) return null

  if (broken) {
    return (
      <p className="focal__broken">
        This picture could not be loaded here, so the focal point cannot be set. Cards will crop it
        from the centre. Re-uploading it through <strong>Image</strong> above fixes this.
      </p>
    )
  }

  return (
    <div className="focal">
      <div className="focal__stage">
        <div
          className="focal__canvas"
          role="application"
          aria-label="Focal point — click the subject of the photo, or use the arrow keys"
          tabIndex={0}
          onKeyDown={onKeyDown}
          onMouseDown={(event) => {
            setDragging(true)
            set(event)
          }}
          onMouseMove={(event) => dragging && set(event)}
          onMouseUp={() => setDragging(false)}
          onMouseLeave={() => setDragging(false)}
        >
          <img
            ref={imageRef}
            src={src}
            alt=""
            draggable={false}
            onError={() => setBroken(true)}
            onLoad={() => setBroken(false)}
          />
          <span className="focal__mark" style={{ insetInlineStart: `${x}%`, insetBlockStart: `${y}%` }} />
        </div>
        <p className="focal__hint">
          Click the subject — a face, usually. The card below crops around that point.
        </p>
      </div>

      <div className="focal__preview">
        <span className="focal__preview-label">How a card will look</span>
        <img src={src} alt="" style={{ objectPosition: `${x}% ${y}%` }} />
        <div className="focal__actions">
          <code>
            {x}% {y}%
          </code>
          <button type="button" className="btn btn--small btn--ghost" onClick={() => onChange('')}>
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}

/** "50 30" → [50, 30]. Anything unreadable falls back to the old default. */
function parse(value) {
  const parts = String(value || '').replace(/%/g, '').trim().split(/[\s,]+/)
  const x = Number(parts[0])
  const y = Number(parts[1])
  return Number.isFinite(x) && Number.isFinite(y) ? [clamp(x), clamp(y)] : [50, 30]
}

const clamp = (value) => Math.min(100, Math.max(0, Math.round(value)))

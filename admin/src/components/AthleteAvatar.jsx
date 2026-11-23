import { useContext, useEffect, useState } from 'react'
import { BracketPhotoContext } from './bracketPhotoContext'
import { tournamentsApi } from '../api/resources'

/**
 * Athlete profile photos in the bracket.
 *
 * The photo comes from the bracket's own photo route, by tournament entry
 * (never by name), and only when the bracket says the athlete has one
 * (`photoKey`). Each photo is fetched once per page and shared by every card
 * the athlete appears in; at most a few are fetched at a time, so a large
 * bracket does not flood the API. Until it arrives, and if it fails, the
 * neutral avatar is shown at the same size, so nothing moves.
 */

const MAX_PARALLEL = 4
const cache = new Map() // `${division}:${entry}:${key}` -> Promise<objectURL | null>
const queue = []
let running = 0

function pump() {
  while (running < MAX_PARALLEL && queue.length > 0) {
    const job = queue.shift()
    running += 1
    job().finally(() => {
      running -= 1
      pump()
    })
  }
}

function load(divisionId, entryId, key) {
  const id = `${divisionId}:${entryId}:${key}`
  if (!cache.has(id)) {
    cache.set(
      id,
      new Promise((resolve) => {
        queue.push(() =>
          tournamentsApi
            .drawBracketPhoto(divisionId, entryId, key)
            .then((blob) => resolve(blob?.type?.startsWith('image/') ? URL.createObjectURL(blob) : null))
            .catch(() => resolve(null)),
        )
        pump()
      }),
    )
  }
  return cache.get(id)
}

/** The neutral avatar: no photo on file, a photo that failed, or a winner not yet known. */
function DefaultAvatar() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="14" fill="#e5e7eb" />
      <circle cx="14" cy="11" r="4.6" fill="#a3a9b3" />
      <path
        d="M5.6 23.2c1.3-4.3 4.6-6.6 8.4-6.6s7.1 2.3 8.4 6.6A13.9 13.9 0 0 1 14 28c-3.2 0-6.1-1.1-8.4-2.8z"
        fill="#a3a9b3"
      />
    </svg>
  )
}

/** A 28 px circular photo for `entry`, or the neutral avatar when `entry` is null. */
export default function AthleteAvatar({ entry }) {
  const divisionId = useContext(BracketPhotoContext)
  const key = entry?.photoKey
  const [state, setState] = useState({ id: null, url: null, failed: false })
  const id = entry && key ? `${divisionId}:${entry.id}:${key}` : null

  useEffect(() => {
    if (!id) return undefined
    let live = true
    load(divisionId, entry.id, key).then((url) => live && setState({ id, url, failed: false }))
    return () => {
      live = false
    }
  }, [id, divisionId, entry?.id, key])

  const url = state.id === id && !state.failed ? state.url : null
  return (
    <span className="db-avatar" data-entry={entry?.id ?? ''} data-photo={url ? 'yes' : 'no'} aria-hidden="true">
      {url ? (
        <img src={url} alt="" draggable="false" onError={() => setState((s) => ({ ...s, failed: true }))} />
      ) : (
        <DefaultAvatar />
      )}
    </span>
  )
}

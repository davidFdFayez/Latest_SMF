import { useEffect, useRef, useState } from 'react'
import { tournamentsApi } from '../api/resources'
import { drawError } from '../drawLabels'
import { AlertIcon, CloseIcon } from './Icons'

/**
 * Confirms publication, naming the tournament and the division. Sends the
 * lists the publisher saw, so the server refuses if either changed meanwhile;
 * one request at a time, and a refusal or failure stays in the dialog with
 * the way to try again.
 */
export default function PublishDrawDialog({ updated = false, data, title, tournamentName, onClose, onPublished, onStale }) {
  const ref = useRef(null)
  const sent = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const pending = data.sync?.pending || []

  useEffect(() => {
    ref.current?.focus()
    const onKey = (event) => event.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function publish() {
    if (sent.current) return
    sent.current = true
    setBusy(true)
    setError(null)
    try {
      await tournamentsApi.publishDraw(data.division.id, {
        expectedDrawEntryIds: data.sync.drawEntryIds,
        expectedEntryIds: data.sync.eligibleEntryIds,
      })
      onPublished()
    } catch (err) {
      const code = err?.response?.data?.code || null
      const ineligible = err?.response?.data?.ineligible || []
      setError({ message: drawError(err, 'The draw could not be published.'), code, ineligible })
      sent.current = false
      setBusy(false)
      // The page may be out of date: show what is saved now behind the dialog.
      if (code) onStale()
    }
  }

  return (
    <div className="db-dialog" role="presentation" onClick={() => !busy && onClose()}>
      <div
        className="db-dialog__panel dd-regen"
        role="dialog"
        aria-modal="true"
        aria-labelledby="db-publish-title"
        tabIndex={-1}
        ref={ref}
        data-testid="publish-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="db-publish-title">{updated ? 'Publish Updated Draw' : 'Publish Draw'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" disabled={busy}>
            <CloseIcon />
          </button>
        </header>
        <p className="dd-regen__lead">
          Publish the draw for <strong>{title}</strong> in <strong>{tournamentName}</strong>?
        </p>
        <dl className="db-dialog__facts">
          <div>
            <dt>Tournament</dt>
            <dd data-testid="publish-tournament">{tournamentName}</dd>
          </div>
          <div>
            <dt>Division</dt>
            <dd data-testid="publish-division">{title}</dd>
          </div>
          <div>
            <dt>Bracket</dt>
            <dd>
              {data.stats.athletes} athletes, {data.stats.byes} BYEs, {data.stats.bouts} bouts
            </dd>
          </div>
        </dl>
        <ul className="db-publish-effects">
          <li>The bracket becomes visible on the public Website for this division.</li>
          <li>It is no longer a Draft: later athlete changes need Regenerate Draw on Draw Preparation and a new publication.</li>
          <li>No bout schedule is generated or approved by publishing.</li>
        </ul>
        {pending.length > 0 && (
          <p className="db-publish-pending" role="note">
            <AlertIcon aria-hidden="true" />
            {pending.length} {pending.length === 1 ? 'athlete is' : 'athletes are'} assigned to this division but not
            yet eligible, and {pending.length === 1 ? 'is' : 'are'} not in this draw:{' '}
            {pending.map((a) => `${a.nameEn || a.nameAr || `Entry #${a.entryId}`} (${a.reason})`).join('; ')}.
          </p>
        )}
        {error && (
          <div className="dd-regen__error" role="alert" data-testid="publish-error">
            {error.message}
            {error.ineligible.length > 0 && (
              <ul>
                {error.ineligible.map((i) => (
                  <li key={i.entryId}>
                    {i.name || `Entry #${i.entryId}`}: {i.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="dd-regen__actions">
          <button type="button" className="dd-btn dd-btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="dd-btn dd-btn--primary"
            data-testid="publish-confirm"
            disabled={busy || error?.code === 'already_published'}
            onClick={publish}
          >
            {busy ? 'Publishing…' : error && !error.code ? 'Try again' : updated ? 'Publish Updated Draw' : 'Publish Draw'}
          </button>
        </div>
      </div>
    </div>
  )
}

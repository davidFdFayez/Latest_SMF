import { useRef, useState } from 'react'
import { tournamentsApi } from '../api/resources'
import { drawError } from '../drawLabels'
import { CloseIcon } from './Icons'

/**
 * Regenerates a PUBLISHED draw whose eligible athletes changed: a simple confirmation listing the changes by
 * name, then a new Draft bracket of the athletes eligible now. The published version stays on the website until
 * the updated draw is published. The server re-checks everything (eligibility, results, scheduling) and refuses
 * with the reason when it is not safe. Opened from Draw Preparation, beside View Bracket.
 */
export default function RegeneratePublishedDialog({ divisionId, sync, title, onClose, onConfirmed }) {
  const sent = useRef(false)
  const [reason, setReason] = useState('Athletes changed after the draw was published.')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const name = (a) => a.nameEn || a.nameAr || 'An athlete'

  async function confirm() {
    if (sent.current) return
    sent.current = true
    setBusy(true)
    setError('')
    const request = {
      expectedEntryIds: sync.eligibleEntryIds,
      expectedDrawEntryIds: sync.drawEntryIds,
      reason: reason.trim(),
      confirmed: true,
      revisePublished: true,
    }
    try {
      // The server checks everything first (a dry run writes nothing); the generation screen then sends the real
      // request once, with the same animation as a first generation, and opens the new bracket for review.
      await tournamentsApi.regenerateDraw(divisionId, { ...request, dryRun: true })
      onConfirmed(request)
    } catch (err) {
      setError(drawError(err, 'The draw could not be regenerated.'))
      setBusy(false)
      sent.current = false
    }
  }

  return (
    <div className="db-dialog" role="presentation" onClick={() => !busy && onClose()}>
      <div
        className="db-dialog__panel dd-regen"
        role="dialog"
        aria-modal="true"
        aria-labelledby="db-regen-title"
        data-testid="regenerate-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="db-regen-title">Regenerate Draw</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" disabled={busy}>
            <CloseIcon />
          </button>
        </header>
        <p className="dd-regen__lead">
          A new draft bracket for <strong>{title}</strong> will be made with the {sync.eligibleEntryIds.length} athletes
          eligible now. The published draw stays on the website until you publish the updated draw.
        </p>
        <ul className="db-regen-changes">
          {(sync.added || []).map((a) => (
            <li key={`a-${a.entryId}`}>{name(a)} was added after the draw was published.</li>
          ))}
          {(sync.removed || []).map((a) => (
            <li key={`r-${a.entryId}`}>{name(a)} is no longer eligible for the draw.</li>
          ))}
        </ul>
        <label className="dd-regen__field">
          <span>
            Reason <em aria-hidden="true">*</em>
          </span>
          <textarea rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        {error && (
          <p className="dd-regen__error" role="alert" data-testid="regenerate-error">
            {error}
          </p>
        )}
        <div className="dd-regen__actions">
          <button type="button" className="dd-btn dd-btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="dd-btn dd-btn--primary"
            data-testid="regenerate-confirm"
            disabled={busy || !reason.trim()}
            onClick={confirm}
          >
            {busy ? 'Checking…' : 'Regenerate Draw'}
          </button>
        </div>
      </div>
    </div>
  )
}

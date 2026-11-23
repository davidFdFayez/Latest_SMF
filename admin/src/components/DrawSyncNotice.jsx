import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { tournamentsApi } from '../api/resources'
import { drawError } from '../drawLabels'
import DrawStatusSummary, { drawText } from './DrawStatusSummary'
import { CloseIcon } from './Icons'

/**
 * A division's athletes against its saved draw, compactly: the counters and
 * one freshness message (DrawStatusSummary), from the server's comparison by
 * entry identity — never by count or name. The saved bracket is never changed
 * by it.
 *
 * "Review changes" opens the details on demand: who is eligible now but not in
 * the draw, who is in the draw but no longer eligible, and who is assigned but
 * not eligible yet (with the exact missing requirements). On the preparation
 * page an authorised administrator can regenerate an outdated Draft — with a
 * written reason and an explicit confirmation, checked by the server (a dry
 * run) before the generation screen sends the real request.
 */
export default function DrawSyncNotice({
  sync,
  plan,
  divisionId,
  canRegenerate = false,
  published = false,
  reviewLink,
  onConfirmRegeneration,
}) {
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState(false)
  if (!sync) return null
  const changed = sync.hasDraw && sync.changed
  const pending = sync.pending || []
  // Outdated: "Review changes" (the differences). Otherwise "View eligibility details" (who is
  // eligible, who is not yet and why), whenever there is a draw or someone not yet eligible.
  const reviewable = changed || sync.hasDraw || pending.length > 0
  const t = drawText()
  const label = changed ? (open ? t.hide : t.review) : open ? t.hideDetails : t.viewDetails

  return (
    <div className="dd-sync-summary" data-sync={changed ? 'changed' : 'current'}>
      <DrawStatusSummary
        participants={sync.participants}
        eligible={sync.eligibleEntryIds.length}
        saved={sync.draw?.athletes}
        hasDraw={sync.hasDraw}
        published={published}
        changed={changed}
        actions={
          <>
            {reviewable && (
              <button
                type="button"
                className="dd-sync__link"
                aria-expanded={open}
                data-testid="review-changes"
                onClick={() => setOpen((v) => !v)}
              >
                {label}
              </button>
            )}
            {changed && canRegenerate && (
              <button
                type="button"
                className="dd-sync__link dd-sync__link--strong"
                data-testid="regenerate-draft"
                onClick={() => setDialog(true)}
              >
                {drawText().regenerate}
              </button>
            )}
          </>
        }
      />
      {open && (
        <div className="dd-sync-review">
          <Changes sync={sync} />
          {changed && reviewLink && (
            <Link className="dd-sync__link" to={reviewLink.to} state={reviewLink.state}>
              Open Draw Preparation to regenerate
            </Link>
          )}
        </div>
      )}
      {dialog && (
        <RegenerateDialog
          sync={sync}
          plan={plan}
          divisionId={divisionId}
          onClose={() => setDialog(false)}
          onConfirmed={(request) => {
            setDialog(false)
            onConfirmRegeneration?.(request)
          }}
        />
      )}
    </div>
  )
}

function who(a) {
  return (
    <>
      <strong>{a.nameEn || a.nameAr || 'Unnamed athlete'}</strong> · Entry #{a.entryId}
      {a.reference ? ` · ${a.reference}` : ''}
    </>
  )
}

function Changes({ sync, dialog = false }) {
  const pending = sync.pending || []
  return (
    <div className="dd-sync__changes" data-testid="sync-changes">
      <div>
        <h4>Eligible now, not in the Draft ({sync.added.length})</h4>
        {sync.added.length === 0 ? (
          <p>None</p>
        ) : (
          <ul>
            {sync.added.map((a) => (
              <li key={a.entryId} data-entry={a.entryId} data-side="added">
                {who(a)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h4>In the Draft, no longer eligible ({sync.removed.length})</h4>
        {sync.removed.length === 0 ? (
          <p>None</p>
        ) : (
          <ul>
            {sync.removed.map((a) => (
              <li key={a.entryId} data-entry={a.entryId} data-side="removed">
                {who(a)} — {a.reason}
              </li>
            ))}
          </ul>
        )}
      </div>
      {!dialog && pending.length > 0 && (
        <div>
          <h4>Assigned, not eligible yet ({pending.length})</h4>
          <ul>
            {pending.map((a) => (
              <li key={a.entryId} data-entry={a.entryId} data-side="pending">
                {who(a)} — {a.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Collects the reason and the confirmation, has the server check them (a dry
 * run: nothing is written), then hands the request to the generation screen,
 * which sends it once and shows the same animation as a first generation.
 */
export function RegenerateDialog({ sync, plan, divisionId, onClose, onConfirmed }) {
  const ref = useRef(null)
  const sent = useRef(false)
  const [reason, setReason] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    ref.current?.focus()
    const onKey = (event) => event.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function confirm() {
    // A second click before React re-renders the disabled button must not start a second check.
    if (sent.current) return
    sent.current = true
    setBusy(true)
    setError('')
    const request = {
      expectedEntryIds: sync.eligibleEntryIds,
      expectedDrawEntryIds: sync.drawEntryIds,
      reason: reason.trim(),
      confirmed: true,
    }
    try {
      await tournamentsApi.regenerateDraw(divisionId, { ...request, dryRun: true })
      onConfirmed(request)
    } catch (err) {
      setError(drawError(err, 'The draft cannot be regenerated.'))
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
        aria-labelledby="dd-regen-title"
        tabIndex={-1}
        ref={ref}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="dd-regen-title">Regenerate Draft</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" disabled={busy}>
            <CloseIcon />
          </button>
        </header>
        <p className="dd-regen__lead">
          The saved Draft ({sync.draw.athletes} athletes, {sync.draw.byes} BYEs, {sync.draw.bouts} bouts) will be
          replaced by a new random draw of the {sync.eligibleEntryIds.length} athletes eligible now
          {plan?.kind === 'bracket' ? ` (${plan.byes} BYEs, ${plan.totalBouts} bouts)` : ''}. It stays a Draft: nothing
          is approved, published or scheduled.
        </p>
        <Changes sync={sync} dialog />
        <label className="dd-regen__field">
          <span>
            Reason for regenerating <em aria-hidden="true">*</em>
          </span>
          <textarea rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <label className="dd-regen__check">
          <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I have
          reviewed the athletes added and removed.
        </label>
        {error && (
          <p className="dd-regen__error" role="alert">
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
            disabled={busy || !reason.trim() || !reviewed}
            onClick={confirm}
          >
            {busy ? 'Checking…' : 'Confirm Regeneration'}
          </button>
        </div>
      </div>
    </div>
  )
}

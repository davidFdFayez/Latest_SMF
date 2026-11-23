import { useState } from 'react'
import { RegenerateDialog } from './DrawSyncNotice'

/**
 * The changes between the athletes eligible now and the saved draw, in plain words — shown only when there are
 * any: "Name was added after the draw was published." / "Name is no longer eligible for the draw." No entry
 * numbers, references or technical terms. For a Draft, an authorised administrator can regenerate it here (the
 * existing confirmed flow); a published draw is regenerated from its bracket page.
 */
export default function DrawChanges({ sync, plan, divisionId, published, canRegenerate, onConfirmRegeneration }) {
  const [dialog, setDialog] = useState(false)
  if (!sync?.hasDraw) return null
  const added = sync.added || []
  const removed = sync.removed || []
  // In the division (e.g. moved here from Participants) but not in the saved draw and not eligible yet.
  const pending = sync.pending || []
  if (added.length === 0 && removed.length === 0 && pending.length === 0) return null
  const name = (a) => a.nameEn || a.nameAr || 'An athlete'
  const moment = published ? 'published' : 'generated'

  return (
    <section className="dd-changes" data-testid="draw-changes" aria-labelledby="dd-changes-title">
      <h3 id="dd-changes-title">Changes since the draw was {moment}</h3>
      <ul>
        {added.map((a) => (
          <li key={`added-${a.entryId}`} data-side="added">
            {name(a)} was added after the draw was {moment}.
          </li>
        ))}
        {removed.map((a) => (
          <li key={`removed-${a.entryId}`} data-side="removed">
            {a.reason === 'no longer in this weight class'
              ? `${name(a)} was moved to another division and is no longer eligible for this draw.`
              : `${name(a)} is no longer eligible for the draw.`}
          </li>
        ))}
        {pending.map((a) => (
          <li key={`pending-${a.entryId}`} data-side="pending">
            {name(a)} is in this division but not in the draw yet{a.reason ? ` (${a.reason})` : ''}.
          </li>
        ))}
      </ul>
      {!published && canRegenerate && sync.changed && (
        <div className="dd-changes__actions">
          <button
            type="button"
            className="dd-btn dd-btn--primary"
            data-testid="regenerate-draft"
            onClick={() => setDialog(true)}
          >
            Regenerate Draw
          </button>
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
    </section>
  )
}

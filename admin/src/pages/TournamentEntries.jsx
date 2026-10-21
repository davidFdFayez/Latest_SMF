import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { tournamentsApi } from '../api/resources'
import { extractErrorMessage } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'

/**
 * The readiness desk — Phase 3 REQ-03, REQ-08 and REQ-09.
 *
 * One screen for what is actually one queue of people: an athlete arrives,
 * checks in, is examined, is weighed, and is approved. Splitting those across
 * four pages would mean finding the same person four times.
 *
 * Each row shows where that athlete has got to and offers only the next step,
 * because the API refuses the others anyway and a button that always fails is
 * worse than no button.
 */

const STATUS_TONE = {
  registered: 'neutral',
  checked_in: 'gold',
  qualified: 'green',
  not_eligible: 'red',
  disqualified: 'red',
  withdrawn: 'neutral',
}

export default function TournamentEntries() {
  const { id } = useParams()

  const [entries, setEntries] = useState([])
  const [tournament, setTournament] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(0)

  // The two steps that need something typed before they can be recorded.
  const [medicalFor, setMedicalFor] = useState(null)
  const [weighFor, setWeighFor] = useState(null)

  const load = useCallback(async () => {
    const [detail, list] = await Promise.all([
      tournamentsApi.get(id),
      tournamentsApi.entries(id, { status: status || undefined }),
    ])
    setTournament(detail.tournament)
    setEntries(list)
  }, [id, status])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    load()
      .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Could not load the entries.')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [load])

  async function run(entryId, action, message) {
    setError('')
    setNotice('')
    setBusy(entryId)
    try {
      await action()
      await load()
      if (message) setNotice(message)
    } catch (err) {
      setError(extractErrorMessage(err, 'That did not work.'))
    } finally {
      setBusy(0)
    }
  }

  const counts = useMemo(() => {
    const by = (value) => entries.filter((e) => e.status === value).length
    return {
      total: entries.length,
      qualified: by('qualified'),
      waiting: by('registered') + by('checked_in'),
      out: by('not_eligible') + by('disqualified') + by('withdrawn'),
    }
  }, [entries])

  if (loading) return <Spinner label="Loading the entries…" />

  return (
    <div>
      <PageHeader
        title={tournament ? `${tournament.nameEn} — entries` : 'Entries'}
        description="Check athletes in, record the examination and the weigh-in, and approve them for the draw."
        actions={
          <Link to={`/tournaments/${id}`} className="btn btn--ghost">
            Tournament
          </Link>
        }
      />

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>
      <Alert type="success" onDismiss={() => setNotice('')}>
        {notice}
      </Alert>

      <div className="toolbar">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="toolbar__select"
          aria-label="Filter by stage"
        >
          <option value="">Everyone</option>
          <option value="registered">Not yet checked in</option>
          <option value="checked_in">Checked in</option>
          <option value="qualified">Qualified for the draw</option>
          <option value="not_eligible">Not eligible</option>
          <option value="disqualified">Disqualified</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
      </div>

      {entries.length > 0 && (
        <p className="form-card__intro">
          {counts.total} entered · {counts.qualified} qualified · {counts.waiting} still to come through ·{' '}
          {counts.out} out
        </p>
      )}

      {entries.length === 0 ? (
        <EmptyState title="Nobody has entered yet" description="Entries appear here as athletes, clubs and coaches make them." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Athlete</th>
                <th>Division</th>
                <th>Documents</th>
                <th>Stage</th>
                <th className="data-table__actions-col">Next step</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <div className="data-table__primary">{entry.nameEn || entry.nameAr}</div>
                    <div className="data-table__subtext">
                      {entry.membershipNumber || entry.reference}
                      {entry.clubName ? ` · ${entry.clubName}` : ''}
                    </div>
                  </td>
                  <td>
                    {entry.divisionLabelEn || <span className="data-table__subtext">No weight class</span>}
                    {entry.actualWeightKg != null && (
                      <div className="data-table__subtext">weighed {entry.actualWeightKg} kg</div>
                    )}
                  </td>
                  <td>
                    {entry.medicalComplete ? (
                      <Badge tone="green">Complete</Badge>
                    ) : (
                      <>
                        <Badge tone="gold">{entry.medicalMissing.length} missing</Badge>
                        <div className="data-table__subtext">
                          {entry.medicalMissing.map((m) => m.en).join(', ')}
                        </div>
                      </>
                    )}
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[entry.status] || 'neutral'}>{entry.statusEn}</Badge>
                    <div className="data-table__subtext">
                      {entry.checkedInAt ? 'in' : '—'} · {entry.medicalResult || '—'} ·{' '}
                      {entry.weighInResult || '—'}
                    </div>
                  </td>
                  <td className="data-table__actions">
                    {entry.status === 'withdrawn' || entry.status === 'disqualified' ? (
                      <span className="data-table__subtext">—</span>
                    ) : !entry.checkedInAt ? (
                      <button
                        type="button"
                        className="btn btn--small"
                        disabled={busy === entry.id}
                        onClick={() => run(entry.id, () => tournamentsApi.checkIn(entry.id), 'Checked in.')}
                      >
                        Check in
                      </button>
                    ) : !entry.medicalResult ? (
                      <button type="button" className="btn btn--small" onClick={() => setMedicalFor(entry)}>
                        Record examination
                      </button>
                    ) : entry.medicalResult === 'failed' ? (
                      <span className="data-table__subtext">Failed the examination</span>
                    ) : !entry.weighInResult ? (
                      <button type="button" className="btn btn--small" onClick={() => setWeighFor(entry)}>
                        Weigh in
                      </button>
                    ) : entry.weighInResult === 'failed' ? (
                      <span className="data-table__subtext">Failed the weigh-in</span>
                    ) : entry.status !== 'qualified' ? (
                      <button
                        type="button"
                        className="btn btn--small btn--primary"
                        disabled={busy === entry.id}
                        onClick={() =>
                          run(entry.id, () => tournamentsApi.approveReadiness(entry.id), 'Approved for the draw.')
                        }
                      >
                        Approve for the draw
                      </button>
                    ) : (
                      <span className="data-table__subtext">Ready</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {medicalFor && (
        <MedicalDialog
          entry={medicalFor}
          onClose={() => setMedicalFor(null)}
          onDone={async (body) => {
            await run(medicalFor.id, () => tournamentsApi.recordMedical(medicalFor.id, body), 'Examination recorded.')
            setMedicalFor(null)
          }}
        />
      )}

      {weighFor && (
        <WeighInDialog
          entry={weighFor}
          onClose={() => setWeighFor(null)}
          onDone={async (body) => {
            await run(weighFor.id, () => tournamentsApi.recordWeighIn(weighFor.id, body), 'Weigh-in recorded.')
            setWeighFor(null)
          }}
        />
      )}
    </div>
  )
}

/** REQ-08 rules 5 and 6. */
function MedicalDialog({ entry, onClose, onDone }) {
  const [result, setResult] = useState('passed')
  const [note, setNote] = useState('')
  const missing = entry.medicalMissing.length > 0

  return (
    <section className="form-card">
      <h3 className="form-section-title form-section-title--first">
        Medical examination — {entry.nameEn || entry.nameAr}
      </h3>

      {missing && (
        <Alert type="info">
          Still missing: {entry.medicalMissing.map((m) => m.en).join(', ')}. You may still pass this athlete,
          but the reason is recorded against your name.
        </Alert>
      )}

      <div className="form-grid">
        <label className="field">
          <span>Result</span>
          <select value={result} onChange={(event) => setResult(event.target.value)}>
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
          </select>
        </label>
      </div>

      <label className="field">
        <span>
          {result === 'passed' && missing
            ? 'Why are you passing with documents missing? — required'
            : 'Note — optional'}
        </span>
        <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>

      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={result === 'passed' && missing && !note.trim()}
          onClick={() => onDone({ result, note: note.trim() || null, documentsMissing: missing })}
        >
          Record
        </button>
      </div>
    </section>
  )
}

/** REQ-09 rules 2 to 6. */
function WeighInDialog({ entry, onClose, onDone }) {
  const [weight, setWeight] = useState('')
  const [preview, setPreview] = useState(null)
  const [moveTo, setMoveTo] = useState('')

  useEffect(() => {
    const value = Number(weight)
    if (!Number.isFinite(value) || value <= 0) {
      setPreview(null)
      return
    }

    let cancelled = false
    const timer = setTimeout(() => {
      tournamentsApi
        .previewWeighIn(entry.id, value)
        .then((data) => !cancelled && setPreview(data))
        .catch(() => {})
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [entry.id, weight])

  const outside = preview && !preview.withinRegisteredClass

  return (
    <section className="form-card">
      <h3 className="form-section-title form-section-title--first">
        Weigh-in — {entry.nameEn || entry.nameAr}
      </h3>
      <p className="form-card__intro">Entered in {entry.divisionLabelEn || '—'}.</p>

      <div className="form-grid">
        <label className="field">
          <span>Weight on the scales (kg)</span>
          <input
            type="number"
            step="0.1"
            min="0"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === '-') event.preventDefault()
            }}
          />
        </label>
      </div>

      {preview && (
        <Alert type={outside ? 'info' : 'success'}>
          {outside
            ? `${preview.actualWeightKg} kg is outside ${preview.registeredClassLabel}. ` +
              (preview.actualClassLabel ? `It belongs in ${preview.actualClassLabel}. ` : '') +
              'Move them to a class that fits, or record a failure.'
            : `${preview.actualWeightKg} kg is inside ${preview.registeredClassLabel}.`}
        </Alert>
      )}

      {outside && preview.alternatives.length > 0 && (
        <label className="field">
          <span>Move to another weight class</span>
          <select value={moveTo} onChange={(event) => setMoveTo(event.target.value)}>
            <option value="">Do not move them</option>
            {preview.alternatives.map((division) => (
              <option key={division.id} value={division.id}>
                {division.labelEn}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--danger-ghost"
          onClick={() => onDone({ noShow: true })}
        >
          Did not appear (DSQ)
        </button>
        <button
          type="button"
          className="btn btn--danger-ghost"
          disabled={!preview}
          onClick={() => onDone({ weightKg: Number(weight), result: 'failed', noShow: false })}
        >
          Failed
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!preview || (outside && !moveTo)}
          onClick={() =>
            onDone({
              weightKg: Number(weight),
              result: 'passed',
              moveToDivisionId: moveTo ? Number(moveTo) : null,
              noShow: false,
            })
          }
        >
          Passed
        </button>
      </div>
    </section>
  )
}

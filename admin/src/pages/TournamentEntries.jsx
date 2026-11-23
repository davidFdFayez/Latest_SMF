import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { athleteMedicalApi, tournamentsApi } from '../api/resources'
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

  // The step that needs something typed before it can be recorded here. The
  // weigh-in is recorded on Check-in & Medical, where the server's verdict,
  // the move and the Failed reason all live; this page links there.
  const [medicalFor, setMedicalFor] = useState(null)

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
                      <Link className="btn btn--small" to={`/tournaments/readiness?tournament=${id}`}>
                        Weigh in
                      </Link>
                    ) : entry.weighInResult === 'failed' ? (
                      <span className="data-table__subtext">Failed the weigh-in</span>
                    ) : entry.staleWeighIn ? (
                      // Passed for another class, or under an earlier rule: the server will not
                      // approve it or put it in a draw.
                      <span className="data-table__subtext">Weigh-in not valid for the current class</span>
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
          onUploaded={load}
          onDone={async (body) => {
            await run(medicalFor.id, () => tournamentsApi.recordMedical(medicalFor.id, body), 'Examination recorded.')
            setMedicalFor(null)
          }}
        />
      )}

    </div>
  )
}

/** REQ-08 rules 5 and 6. */
function MedicalDialog({ entry, onClose, onDone, onUploaded }) {
  const [result, setResult] = useState('passed')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const missing = entry.medicalMissing.length > 0

  /* REQ-08 rule 3 — the desk can put a missing document on the record while
     the athlete is standing in front of them. It applies at once: this is an
     official entering it, not the athlete replacing their own. */
  async function record(field, value) {
    setUploadError('')
    setSaving(true)
    try {
      await athleteMedicalApi.save(entry.athleteRegistrationId, value)
      await onUploaded()
    } catch (err) {
      setUploadError(extractErrorMessage(err, 'Could not record that.'))
    } finally {
      setSaving(false)
    }
  }

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

      {uploadError && <Alert type="error">{uploadError}</Alert>}

      {/* Rule 3 — record a document the athlete has brought with them. */}
      <div className="desk-docs">
        <label className="field">
          <span>Medical certificate seen — date on it</span>
          <input
            type="date"
            disabled={saving}
            onChange={(event) =>
              event.target.value &&
              record('certificate', {
                certificateAttachmentId: `desk-${entry.athleteRegistrationId}-${Date.now()}`,
                certificateDate: event.target.value,
              })
            }
          />
        </label>
        <label className="field">
          <span>HIV / HBV / HCV screening seen — date on it</span>
          <input
            type="date"
            disabled={saving}
            onChange={(event) =>
              event.target.value &&
              record('screening', {
                screeningAttachmentId: `desk-${entry.athleteRegistrationId}-${Date.now()}`,
                screeningDate: event.target.value,
              })
            }
          />
        </label>
        <a
          className="btn btn--small"
          href={athleteMedicalApi.guardianConsentUrl(entry.athleteRegistrationId)}
          target="_blank"
          rel="noreferrer"
        >
          Print guardian consent
        </a>
      </div>

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

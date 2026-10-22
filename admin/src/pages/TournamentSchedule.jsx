import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { tournamentsApi } from '../api/resources'
import { extractErrorMessage, formatDate } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'

/**
 * The running order — Phase 3 REQ-11.
 *
 * Laid out the way rule 2 asks it to read: by category, divisions inside it
 * lightest class first, bouts under each. Rule 3's presentation is taken
 * literally — the red corner on the left, the blue on the right, with the day
 * and the ring underneath.
 *
 * Athletes cannot be changed here (rule 8). That is the draw page's job, and
 * this one follows it.
 */
export default function TournamentSchedule() {
  const { id } = useParams()

  const [view, setView] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [working, setWorking] = useState(false)
  const [ringName, setRingName] = useState('')
  const [ringTime, setRingTime] = useState('17:00')
  const [ringInterval, setRingInterval] = useState(30)

  const load = useCallback(async () => {
    setView(await tournamentsApi.schedule(id))
  }, [id])

  useEffect(() => {
    let cancelled = false
    load()
      .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Could not load the schedule.')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [load])

  async function act(action, message) {
    setError('')
    setNotice('')
    setWorking(true)
    try {
      await action()
      await load()
      if (message) setNotice(message)
    } catch (err) {
      setError(extractErrorMessage(err, 'That did not work.'))
    } finally {
      setWorking(false)
    }
  }

  if (loading) return <Spinner label="Loading the schedule…" />
  if (!view) return <Alert type="error">{error || 'No schedule.'}</Alert>

  const days = view.tournament.days || []
  const anyBouts = view.categories.some((c) => c.divisions.some((d) => d.bouts.length > 0))

  return (
    <div>
      <PageHeader
        title={`${view.tournament.nameEn} — schedule`}
        description="Distribute the drawn bouts across the days and the rings; the times are generated."
        actions={
          <div className="chip-list">
            <Link to={`/tournaments/${id}/draw`} className="btn btn--ghost">
              Draw
            </Link>
            <button
              type="button"
              className="btn btn--primary"
              disabled={working}
              onClick={() => act(() => tournamentsApi.generateSchedule(id), 'Schedule regenerated.')}
            >
              Regenerate
            </button>
            {/* Rule 14 — approving is a separate act from making, and a
                regeneration undoes it, so the button comes back. */}
            {!view.tournament.scheduleApprovedAt && (
              <button
                type="button"
                className="btn btn--primary"
                disabled={working || view.clashes.length > 0}
                title={
                  view.clashes.length > 0
                    ? 'Clear the clashes first — a schedule that cannot happen cannot be approved.'
                    : undefined
                }
                onClick={() => act(() => tournamentsApi.approveSchedule(id), 'Schedule approved.')}
              >
                Approve
              </button>
            )}
          </div>
        }
      />

      {/* Rule 14 — nothing proceeds to the next stage on an unapproved order. */}
      <Alert type={view.tournament.scheduleApprovedAt ? 'success' : 'info'}>
        {view.tournament.scheduleApprovedAt
          ? `Approved${
              view.tournament.scheduleApprovedBy ? ` by ${view.tournament.scheduleApprovedBy}` : ''
            } on ${formatDate(view.tournament.scheduleApprovedAt)}. Regenerating it will need a new approval.`
          : 'Not approved yet. The stage after this one has nothing to work from until it is.'}
      </Alert>

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>
      <Alert type="success" onDismiss={() => setNotice('')}>
        {notice}
      </Alert>

      {/* Rules 14 to 16 — anything the running order gets wrong for an athlete. */}
      {view.clashes.length > 0 && (
        <Alert type="error">
          <strong>{view.clashes.length} problem(s) with the running order:</strong>
          <ul className="clash-list">
            {view.clashes.map((clash, index) => (
              <li key={index}>{clash.messageEn}</li>
            ))}
          </ul>
        </Alert>
      )}

      {/* Rule 5 — rings are added here, not when the tournament is created. */}
      <section className="form-card">
        <h3 className="form-section-title form-section-title--first">Rings</h3>
        <p className="form-card__intro">
          Each ring runs to its own start time and interval, and they run side by side.
        </p>

        {view.rings.length === 0 ? (
          <p className="form-card__intro">No rings yet. Add one before generating the schedule.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ring</th>
                  <th>First bout</th>
                  <th>Interval</th>
                  <th className="data-table__actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {view.rings.map((ring) => (
                  <tr key={ring.id}>
                    <td className="data-table__primary">{ring.name}</td>
                    <td>{String(ring.firstBoutTime).slice(0, 5)}</td>
                    <td>{ring.intervalMinutes} min</td>
                    <td className="data-table__actions">
                      <button
                        type="button"
                        className="btn btn--small btn--danger-ghost"
                        disabled={working}
                        onClick={() => act(() => tournamentsApi.removeRing(ring.id), 'Ring removed.')}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="ring-add">
          <label className="field">
            <span>Name</span>
            <input
              type="text"
              placeholder="Ring A"
              value={ringName}
              onChange={(event) => setRingName(event.target.value)}
            />
          </label>
          <label className="field">
            <span>First bout</span>
            <input type="time" value={ringTime} onChange={(event) => setRingTime(event.target.value)} />
          </label>
          <label className="field">
            <span>Interval (minutes)</span>
            <input
              type="number"
              min="1"
              value={ringInterval}
              onChange={(event) => setRingInterval(Number(event.target.value))}
            />
          </label>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={working || !ringName.trim()}
            onClick={() =>
              act(
                () =>
                  tournamentsApi.addRing(id, {
                    name: ringName.trim(),
                    firstBoutTime: `${ringTime}:00`,
                    intervalMinutes: ringInterval,
                  }),
                'Ring added.',
              ).then(() => setRingName(''))
            }
          >
            Add ring
          </button>
        </div>
      </section>

      {view.categories.length === 0 ? (
        <EmptyState
          title="No published draws yet"
          description="A division appears here once its draw has been published."
        />
      ) : (
        view.categories.map((category) => (
          <section className="form-card" key={category.category}>
            <h3 className="form-section-title form-section-title--first">{category.categoryEn}</h3>

            {category.divisions.map((division) => (
              <div className="sched-division" key={division.id}>
                <div className="sched-division__head">
                  <h4>{division.labelEn}</h4>

                  <div className="sched-division__settings">
                    <label className="field">
                      <span>Ring</span>
                      <select
                        value={division.defaultRingId || ''}
                        disabled={working || view.rings.length === 0}
                        onChange={(event) =>
                          act(
                            () =>
                              tournamentsApi.setDivisionSchedule(division.id, {
                                ringId: Number(event.target.value),
                              }),
                            'Ring applied to the division.',
                          )
                        }
                      >
                        <option value="">Choose…</option>
                        {view.rings.map((ring) => (
                          <option key={ring.id} value={ring.id}>
                            {ring.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      <span>Day</span>
                      <select
                        value={division.scheduledDate ? String(division.scheduledDate).slice(0, 10) : ''}
                        disabled={working || days.length === 0}
                        onChange={(event) =>
                          act(
                            () =>
                              tournamentsApi.setDivisionSchedule(division.id, { date: event.target.value }),
                            'Day applied to the division.',
                          )
                        }
                      >
                        <option value="">Choose…</option>
                        {days.map((day, index) => (
                          <option key={day} value={String(day).slice(0, 10)}>
                            Day {index + 1} — {formatDate(day)}
                          </option>
                        ))}
                      </select>
                    </label>

                    {/* Rule 5 — a division may run to its own start time and
                        interval rather than its ring's; rule 17 makes both
                        editable, and the times regenerate. */}
                    <label className="field">
                      <span>First bout</span>
                      <input
                        type="time"
                        defaultValue={
                          division.firstBoutTime ? String(division.firstBoutTime).slice(0, 5) : ''
                        }
                        disabled={working}
                        onBlur={(event) =>
                          event.target.value &&
                          act(
                            () =>
                              tournamentsApi.setDivisionSchedule(division.id, {
                                firstBoutTime: `${event.target.value}:00`,
                              }),
                            'Start time applied.',
                          )
                        }
                      />
                    </label>

                    <label className="field">
                      <span>Interval (min)</span>
                      <input
                        type="number"
                        min="1"
                        defaultValue={division.boutIntervalMinutes || ''}
                        disabled={working}
                        onBlur={(event) =>
                          event.target.value &&
                          act(
                            () =>
                              tournamentsApi.setDivisionSchedule(division.id, {
                                intervalMinutes: Number(event.target.value),
                              }),
                            'Interval applied.',
                          )
                        }
                      />
                    </label>
                  </div>
                </div>

                {division.bouts.length === 0 ? (
                  <p className="form-card__intro">No bouts to run — every athlete here has a bye.</p>
                ) : (
                  <ul className="bout-list">
                    {division.bouts.map((bout) => (
                      <li className="bout" key={bout.id}>
                        <span className="bout__number">{bout.boutNumber ?? '—'}</span>

                        <div className="bout__pair">
                          <span className="bout__fighter bout__fighter--red">
                            {bout.red.nameEn || bout.red.nameAr || '—'}
                            <span className="bout__corner" aria-hidden="true" />
                          </span>
                          <span className="bout__vs">VS</span>
                          <span className="bout__fighter bout__fighter--blue">
                            <span className="bout__corner" aria-hidden="true" />
                            {bout.blue.nameEn || bout.blue.nameAr || '—'}
                          </span>
                        </div>

                        <div className="bout__when">
                          <span>{bout.scheduledDate ? formatDate(bout.scheduledDate) : '—'}</span>
                          <span>
                            {bout.ringName || '—'}
                            {bout.ringPinned && <Badge tone="gold">pinned</Badge>}
                          </span>
                          <span>{bout.startTime ? String(bout.startTime).slice(0, 5) : '—'}</span>
                        </div>

                        <select
                          className="bout__move"
                          value={bout.ringId || ''}
                          disabled={working}
                          aria-label="Move this bout to another ring"
                          onChange={(event) =>
                            act(
                              () =>
                                tournamentsApi.moveBout(bout.id, { ringId: Number(event.target.value) }),
                              'Bout moved.',
                            )
                          }
                        >
                          <option value="">Move to…</option>
                          {view.rings.map((ring) => (
                            <option key={ring.id} value={ring.id}>
                              {ring.name}
                            </option>
                          ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        ))
      )}

      {!anyBouts && view.categories.length > 0 && (
        <p className="form-card__intro">
          Nothing is scheduled yet. Give each division a ring and a day, or press Regenerate.
        </p>
      )}
    </div>
  )
}

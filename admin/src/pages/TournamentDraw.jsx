import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { tournamentsApi } from '../api/resources'
import { extractErrorMessage } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'

/**
 * The draw — Phase 3 REQ-10.
 *
 * A division at a time, because that is the unit a draw is made for. The
 * bracket is drawn as columns of rounds so the path to the final is visible,
 * which is the thing a delegate is actually checking when they look at it.
 */
export default function TournamentDraw() {
  const { id } = useParams()

  const [tournament, setTournament] = useState(null)
  const [divisions, setDivisions] = useState([])
  const [selected, setSelected] = useState(null)
  const [bracket, setBracket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    let cancelled = false
    tournamentsApi
      .get(id)
      .then((detail) => {
        if (cancelled) return
        setTournament(detail.tournament)
        // Only divisions somebody has entered can be drawn.
        const withEntries = detail.divisions.filter((d) => d.entries > 0)
        setDivisions(withEntries)
        if (withEntries.length > 0) setSelected(withEntries[0].id)
      })
      .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Could not load the tournament.')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id])

  const loadBracket = useCallback(async (divisionId) => {
    if (!divisionId) return
    setBracket(await tournamentsApi.draw(divisionId))
  }, [])

  useEffect(() => {
    if (!selected) return
    loadBracket(selected).catch((err) => setError(extractErrorMessage(err, 'Could not load the draw.')))
  }, [selected, loadBracket])

  async function act(action, message) {
    setError('')
    setNotice('')
    setWorking(true)
    try {
      await action()
      await loadBracket(selected)
      const detail = await tournamentsApi.get(id)
      setDivisions(detail.divisions.filter((d) => d.entries > 0))
      if (message) setNotice(message)
    } catch (err) {
      setError(extractErrorMessage(err, 'That did not work.'))
    } finally {
      setWorking(false)
    }
  }

  if (loading) return <Spinner label="Loading…" />

  const published = Boolean(bracket?.division?.drawPublishedAt)
  const hasDraw = (bracket?.totalRounds || 0) > 0

  return (
    <div>
      <PageHeader
        title={tournament ? `${tournament.nameEn} — draw` : 'Draw'}
        description="Single elimination from the qualified athletes, with byes placed automatically."
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

      {divisions.length === 0 ? (
        <EmptyState
          title="Nothing to draw yet"
          description="A division can be drawn once athletes have entered it and come through the weigh-in."
        />
      ) : (
        <>
          <div className="toolbar">
            <select
              value={selected || ''}
              onChange={(event) => setSelected(Number(event.target.value))}
              className="toolbar__select"
              aria-label="Division"
            >
              {divisions.map((division) => (
                <option key={division.id} value={division.id}>
                  {division.labelEn} — {division.entries} entered
                  {division.drawPublishedAt ? ' (drawn)' : ''}
                </option>
              ))}
            </select>
          </div>

          <section className="form-card">
            <div className="draw-head">
              <div>
                <h3 className="form-section-title form-section-title--first">
                  {bracket?.division?.labelEn}
                </h3>
                {published ? (
                  <Badge tone="green">Published</Badge>
                ) : hasDraw ? (
                  <Badge tone="gold">Drawn, not published</Badge>
                ) : (
                  <Badge tone="neutral">Not drawn</Badge>
                )}
              </div>

              <div className="chip-list">
                {published && (
                  <input
                    type="text"
                    className="draw-reason"
                    placeholder="Reason for redrawing — required"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                )}
                <button
                  type="button"
                  className="btn btn--small"
                  disabled={working || (published && !reason.trim())}
                  onClick={() =>
                    act(
                      () => tournamentsApi.createDraw(selected, { reason: reason.trim() || null }),
                      'Drawn.',
                    ).then(() => setReason(''))
                  }
                >
                  {hasDraw ? 'Redraw' : 'Make the draw'}
                </button>
                {hasDraw && !published && (
                  <button
                    type="button"
                    className="btn btn--small btn--primary"
                    disabled={working}
                    onClick={() => act(() => tournamentsApi.publishDraw(selected), 'Published.')}
                  >
                    Publish the draw
                  </button>
                )}
              </div>
            </div>

            {!hasDraw ? (
              <p className="form-card__intro">
                No draw yet. Only athletes who have passed check-in, the examination and the weigh-in, and
                been approved, take part.
              </p>
            ) : (
              <div className="bracket">
                {bracket.rounds.map((round) => (
                  <div className="bracket__round" key={round.round}>
                    <h4 className="bracket__round-name">{round.nameEn}</h4>
                    {round.bouts.map((bout) => (
                      <div
                        className={`bracket__bout${bout.isBye ? ' is-bye' : ''}`}
                        key={bout.id}
                      >
                        {bout.boutNumber && <span className="bracket__number">#{bout.boutNumber}</span>}
                        <div className="bracket__corner bracket__corner--red">
                          <span className="bracket__dot" aria-hidden="true" />
                          {bout.red ? (bout.red.nameEn || bout.red.nameAr) : <em>—</em>}
                          {bout.red?.club && <span className="bracket__club">{bout.red.club}</span>}
                        </div>
                        <div className="bracket__corner bracket__corner--blue">
                          <span className="bracket__dot" aria-hidden="true" />
                          {bout.blue ? (bout.blue.nameEn || bout.blue.nameAr) : <em>—</em>}
                          {bout.blue?.club && <span className="bracket__club">{bout.blue.club}</span>}
                        </div>
                        {bout.isWalkover && <span className="bracket__tag">Walkover</span>}
                        {bout.isBye && !bout.isWalkover && <span className="bracket__tag">Bye</span>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

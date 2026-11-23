import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { tournamentsApi } from '../api/resources'
import { extractErrorMessage } from '../api/utils'
import { useAuth } from '../context/AuthContext'
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
  const { hasPermission } = useAuth()
  // Draw Management's "Manage Draw" opens a given division (?division=).
  const [searchParams] = useSearchParams()
  const wanted = Number(searchParams.get('division')) || 0

  const [tournament, setTournament] = useState(null)
  const [divisions, setDivisions] = useState([])
  const [selected, setSelected] = useState(null)
  const [bracket, setBracket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  // Publication refused: the athletes in the draft who are no longer eligible.
  const [ineligible, setIneligible] = useState([])
  const [notice, setNotice] = useState('')
  const [reason, setReason] = useState('')
  // REQ-10 rule 6 — the corner being amended, and the reason it is.
  const [editing, setEditing] = useState(null)

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
        if (withEntries.length > 0) setSelected(withEntries.some((d) => d.id === wanted) ? wanted : withEntries[0].id)
      })
      .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Could not load the tournament.')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // Only when the tournament changes; the division asked for is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // A user who may not read the draw is told so, not shown "No draw yet" (DRW-006).
  const [forbidden, setForbidden] = useState(false)
  const loadBracket = useCallback(async (divisionId) => {
    if (!divisionId) return
    try {
      setBracket(await tournamentsApi.draw(divisionId))
      setForbidden(false)
    } catch (err) {
      if (err?.response?.status === 403) {
        setBracket(null)
        setForbidden(true)
        return
      }
      throw err
    }
  }, [])

  useEffect(() => {
    if (!selected) return
    loadBracket(selected).catch((err) => setError(extractErrorMessage(err, 'Could not load the draw.')))
  }, [selected, loadBracket])

  async function act(action, message) {
    setError('')
    setIneligible([])
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
      setIneligible(err?.response?.data?.ineligible || [])
    } finally {
      setWorking(false)
    }
  }

  if (loading) return <Spinner label="Loading…" />

  const published = Boolean(bracket?.division?.drawPublishedAt)
  const hasDraw = (bracket?.totalRounds || 0) > 0
  /* DRW-006 / D1 — presentation only; the API refuses with 403 regardless.
     Drawing and changing a Draft need Draw permission; changing a published
     draw is the Technical Delegate's (Draw Approval); publishing needs Draw Approval. */
  const canPublish = hasPermission('tournament.draw.approve')
  const canChange = hasPermission('tournament.draw') && (!published || canPublish)
  // A walkover (a withdrawal) or a result fixes the draw: no redraw, no swaps (D4).
  const fixed = Boolean(bracket?.rounds?.some((r) => r.bouts.some((b) => b.isWalkover || b.winnerEntryId)))
  // The athletes in the draw — the only ones a corner may be exchanged with (D6: no replacement from outside).
  const drawn = (bracket?.rounds?.[0]?.bouts || []).flatMap((b) => [b.red, b.blue]).filter(Boolean)

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

      {error && (
        <Alert
          type="error"
          onDismiss={() => {
            setError('')
            setIneligible([])
          }}
        >
          {error}
          {ineligible.length > 0 && (
            <ul className="draw-ineligible">
              {ineligible.map((i) => (
                <li key={i.entryId}>
                  <strong>{i.name || `Entry #${i.entryId}`}</strong> {i.memberId ? `(${i.memberId})` : ''} — {i.reason}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}
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
                <h3 className="form-section-title form-section-title--first">{bracket?.division?.labelEn}</h3>
                {/* A user who may not read the draw is not told it is "Not drawn" (DRW-006). */}
                {forbidden ? null : published ? (
                  <Badge tone="green">Published</Badge>
                ) : hasDraw ? (
                  <Badge tone="gold">Drawn, not published</Badge>
                ) : (
                  <Badge tone="neutral">Not drawn</Badge>
                )}
              </div>

              <div className="chip-list">
                {published && canChange && !fixed && (
                  <input
                    type="text"
                    className="draw-reason"
                    placeholder="Reason for redrawing — required"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                )}
                {canChange && !fixed && (
                  <button
                    type="button"
                    className="btn btn--small"
                    disabled={working || (published && !reason.trim())}
                    onClick={() =>
                      act(() => tournamentsApi.createDraw(selected, { reason: reason.trim() || null }), 'Drawn.').then(
                        () => setReason(''),
                      )
                    }
                  >
                    {hasDraw ? 'Redraw' : 'Make the draw'}
                  </button>
                )}
                {hasDraw && !published && canPublish && (
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

            {forbidden ? (
              <p className="form-card__intro">You do not have permission to view this draw.</p>
            ) : !hasDraw ? (
              <p className="form-card__intro">
                No draw yet. Only athletes who have passed check-in, the examination and the weigh-in, and been
                approved, take part.
              </p>
            ) : (
              <div className="bracket">
                {bracket.rounds.map((round) => (
                  <div className="bracket__round" key={round.round}>
                    <h4 className="bracket__round-name">{round.nameEn}</h4>
                    {round.bouts.map((bout) => (
                      <div className={`bracket__bout${bout.isBye ? ' is-bye' : ''}`} key={bout.id}>
                        {bout.boutNumber && <span className="bracket__number">#{bout.boutNumber}</span>}
                        <div className="bracket__corner bracket__corner--red">
                          <span className="bracket__dot" aria-hidden="true" />
                          {bout.red ? bout.red.nameEn || bout.red.nameAr : <em>—</em>}
                          {bout.red?.club && <span className="bracket__club">{bout.red.club}</span>}
                        </div>
                        <div className="bracket__corner bracket__corner--blue">
                          <span className="bracket__dot" aria-hidden="true" />
                          {bout.blue ? bout.blue.nameEn || bout.blue.nameAr : <em>—</em>}
                          {bout.blue?.club && <span className="bracket__club">{bout.blue.club}</span>}
                        </div>
                        {bout.isWalkover && <span className="bracket__tag">Walkover</span>}
                        {bout.isBye && !bout.isWalkover && <span className="bracket__tag">Bye</span>}

                        {/* Rule 6 — first-round positions only (later rounds are
                            filled by advancement), by someone who may change this
                            draw, and never on a draw a walkover or result has fixed.
                            A BYE has no blue corner to fill. */}
                        {round.round === 1 && canChange && !fixed && (
                          <div className="bracket__edit">
                            <button
                              type="button"
                              className="btn btn--tiny"
                              onClick={() => setEditing({ bout, corner: 'red' })}
                            >
                              Red
                            </button>
                            {!bout.isBye && (
                              <button
                                type="button"
                                className="btn btn--tiny"
                                onClick={() => setEditing({ bout, corner: 'blue' })}
                              >
                                Blue
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>

          {editing && (
            <CornerDialog
              editing={editing}
              entries={drawn}
              busy={working}
              onClose={() => setEditing(null)}
              onSave={(entryId, why) =>
                act(
                  () =>
                    tournamentsApi.setCorner(editing.bout.id, {
                      corner: editing.corner,
                      entryId,
                      reason: why,
                    }),
                  'Draw amended.',
                ).then(() => setEditing(null))
              }
            />
          )}
        </>
      )}
    </div>
  )
}

/**
 * Changing who is in a corner — REQ-10 rule 6. The athlete here changes places
 * with another athlete of this draw (the same bout, or another first-round
 * position). Nobody is added from outside the draw and nobody is removed: a
 * removal is a withdrawal, with its reason, and the opponent advances by
 * walkover. The reason is compulsory, and it is what the audit trail carries.
 */
function CornerDialog({ editing, entries, busy, onClose, onSave }) {
  const here = editing.corner === 'red' ? editing.bout.red?.id : editing.bout.blue?.id
  const [entryId, setEntryId] = useState('')
  const [why, setWhy] = useState('')

  return (
    <section className="form-card">
      <h3 className="form-section-title form-section-title--first">
        {editing.corner === 'red' ? 'Red' : 'Blue'} corner
      </h3>
      <p className="form-card__intro">
        Choose the athlete this one changes places with. To take an athlete out of the draw, withdraw their entry
        instead (a reason is required); their opponent then advances by walkover. The reason is recorded in the activity
        log against your name.
      </p>

      <div className="form-grid">
        <label className="field">
          <span>Athlete</span>
          <select value={entryId} onChange={(event) => setEntryId(event.target.value)}>
            <option value="">— choose an athlete —</option>
            {entries
              .filter((entry) => entry.id !== here)
              .map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.nameEn || entry.nameAr}
                  {entry.club ? ` · ${entry.club}` : ''}
                </option>
              ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Why — required</span>
        <textarea rows={2} value={why} onChange={(event) => setWhy(event.target.value)} />
      </label>

      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy || !why.trim() || !entryId}
          onClick={() => onSave(Number(entryId), why.trim())}
        >
          Save
        </button>
      </div>
    </section>
  )
}

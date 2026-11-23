import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { tournamentsApi } from '../api/resources'
import { drawError } from '../drawLabels'
import { AlertIcon, BracketIcon, ChevronLeftIcon, ShuffleIcon } from '../components/Icons'

/** The shortest time the generation screen is shown, whatever the server's speed. */
const MINIMUM_MS = 6000

/** Refusals that need the list or the bracket reviewed again: retrying the same request cannot succeed. */
const REVIEW_FIRST = new Set([
  'existing_draw',
  'stale_athletes',
  'not_enough_athletes',
  'over_capacity',
  // regeneration
  'no_draw',
  'published',
  'protected',
  'unchanged',
  'draw_changed',
  'schedule_approved',
])

/**
 * Draw Management — Phase 3: the generation screen, for a first draw and for
 * a Draft regeneration alike.
 *
 * The draw itself is made by the server (DrawService.GenerateDraftAsync, or
 * RegenerateDraftAsync with the reason and both reviewed lists the
 * Regenerate dialog confirmed); this page only asks for it once and shows the
 * animation for at least six seconds, then opens the Draft bracket. A refusal
 * is shown as it is — never a pretend bracket; a failure that may be
 * temporary (no response, a server error) can be tried again, and the server
 * refuses a request whose lists no longer match, so a retry never draws
 * twice. Opened without a request (a reload, a copied link), it draws nothing
 * and offers the way back.
 */
export default function DrawGenerate() {
  const { divisionId } = useParams()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const tournamentId = searchParams.get('tournament')
  const expectedEntryIds = location.state?.expectedEntryIds
  const regenerate = location.state?.regenerate
  const hasRequest = Boolean(expectedEntryIds || regenerate)
  const from = location.state?.from
  const preparation = `/draw-management/divisions/${divisionId}${tournamentId ? `?tournament=${tournamentId}` : ''}`
  const bracket = `/draw-management/divisions/${divisionId}/bracket${tournamentId ? `?tournament=${tournamentId}` : ''}`

  const [failure, setFailure] = useState(null)
  const started = useRef(false)
  const inFlight = useRef(false)

  const generate = useCallback(async () => {
    // One request at a time: a double click on "Try again" sends nothing more.
    if (inFlight.current) return
    inFlight.current = true
    setFailure(null)
    const began = Date.now()
    const wait = () => new Promise((done) => setTimeout(done, Math.max(0, MINIMUM_MS - (Date.now() - began))))
    try {
      if (regenerate) await tournamentsApi.regenerateDraw(divisionId, regenerate)
      else await tournamentsApi.generateDraw(divisionId, { expectedEntryIds })
      // Read the new bracket while the animation still runs, so the bracket page opens with it
      // (no loading flash). If that read fails, the bracket page simply loads it itself.
      const ready = await tournamentsApi.drawBracket(divisionId).catch(() => null)
      // The screen stays until both the request and the minimum time are complete.
      await wait()
      // Replace this page in the history, so Back never returns to a spent generation.
      navigate(bracket, { replace: true, state: { from, bracket: ready } })
    } catch (err) {
      setFailure({
        message: drawError(
          err,
          regenerate ? 'The draft could not be regenerated.' : 'The draw could not be generated.',
        ),
        code: err?.response?.data?.code || null,
      })
    } finally {
      inFlight.current = false
    }
  }, [divisionId, expectedEntryIds, regenerate, navigate, bracket, from])

  useEffect(() => {
    // One request per visit, even when React mounts the page twice in development.
    if (!hasRequest || started.current) return
    started.current = true
    // The browser keeps this entry's state across a reload: take the request
    // (athlete list, reason) out of it now, so a reload never sends it a second time.
    const { state } = window.history
    if (state?.usr) window.history.replaceState({ ...state, usr: { from } }, '')
    generate()
  }, [hasRequest, generate, from])

  // Opened without a request (a reload, a copied link): if the division has a
  // draw by now, open it; otherwise offer the way back. Nothing is generated.
  const [lookup, setLookup] = useState(hasRequest ? 'done' : 'checking')
  useEffect(() => {
    if (hasRequest) return undefined
    let cancelled = false
    tournamentsApi
      .drawBracket(divisionId)
      .then(() => !cancelled && navigate(bracket, { replace: true, state: { from } }))
      .catch(() => !cancelled && setLookup('done'))
    return () => {
      cancelled = true
    }
  }, [hasRequest, divisionId, navigate, bracket, from])

  if (!hasRequest && lookup === 'checking') return <div className="dg-screen" aria-busy="true" />

  if (!hasRequest) {
    return (
      <div className="dg-screen">
        <div className="dg-card dg-card--message" role="alert">
          <AlertIcon className="dg-message__icon" aria-hidden="true" />
          <h1 className="dg-title">No draw is being generated</h1>
          <p className="dg-sub">A draw is started from its division page, after its athletes have been checked.</p>
          <div className="dg-actions">
            <Link className="dd-btn dd-btn--primary" to={preparation}>
              <ChevronLeftIcon aria-hidden="true" /> Back to the division
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (failure) {
    // A regeneration refused because the saved draw changed may mean an earlier attempt did go
    // through (its answer was lost): the bracket shows what is saved now.
    const showBracket = failure.code === 'existing_draw' || (regenerate && REVIEW_FIRST.has(failure.code))
    const reviewFirst = REVIEW_FIRST.has(failure.code)
    return (
      <div className="dg-screen">
        <div className="dg-card dg-card--message" role="alert">
          <AlertIcon className="dg-message__icon" aria-hidden="true" />
          <h1 className="dg-title">{regenerate ? 'The Draft was not regenerated' : 'The draw was not generated'}</h1>
          <p className="dg-sub">{failure.message}</p>
          <div className="dg-actions">
            <Link className="dd-btn dd-btn--ghost" to={preparation} replace>
              <ChevronLeftIcon aria-hidden="true" /> Back to the division
            </Link>
            {showBracket && (
              <Link className="dd-btn dd-btn--ghost" to={bracket} replace>
                <BracketIcon aria-hidden="true" /> View Bracket
              </Link>
            )}
            {!reviewFirst && (
              <button type="button" className="dd-btn dd-btn--primary" onClick={generate}>
                Try again
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dg-screen" aria-busy="true">
      <div className="dg-card" role="status" aria-live="polite">
        <div className="dg-orbit" aria-hidden="true">
          <svg className="dg-ring dg-ring--outer" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="92" pathLength="100" />
          </svg>
          <svg className="dg-ring dg-ring--inner" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="80" pathLength="100" />
          </svg>
          <div className="dg-core">
            <ShuffleIcon className="dg-shuffle" />
          </div>
        </div>
        <h1 className="dg-title">{regenerate ? 'Regenerating Draft...' : 'Generating Draw...'}</h1>
        <p className="dg-sub">Randomly arranging athletes and preparing the bracket</p>
        <div className="dg-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <svg className="dg-waves" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 70 C 120 30, 240 110, 360 70 S 540 40, 600 60 L 600 120 L 0 120 Z" />
          <path d="M0 90 C 140 60, 260 120, 400 90 S 560 70, 600 85 L 600 120 L 0 120 Z" />
        </svg>
      </div>
    </div>
  )
}

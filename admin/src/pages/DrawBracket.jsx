import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { tournamentsApi } from '../api/resources'
import Alert from '../components/Alert'
import Spinner from '../components/Spinner'
import AthleteAvatar from '../components/AthleteAvatar'
import PublishDrawDialog from '../components/PublishDrawDialog'
import { BracketPhotoContext } from '../components/bracketPhotoContext'
import { useAuth } from '../context/AuthContext'
import { divisionTitle, drawError } from '../drawLabels'
import { buildLayout, GEOMETRY } from '../bracketLayout'
import {
  AlertIcon,
  CheckIcon,
  ChevronLeftIcon,
  CloseIcon,
  EventsIcon,
  FemaleIcon,
  InfoIcon,
  MaleIcon,
  ShuffleIcon,
  TournamentIcon,
  UsersIcon,
} from '../components/Icons'

/**
 * Draw Management — a division's bracket, read-only.
 *
 * Drawn from the stored bouts exactly as saved (DrawService.BracketAsync),
 * laid out by bracketLayout.js: one column per round from left to right,
 * then the Champion endpoint. Cards are placed and connected by the bout
 * each winner goes to. A BYE is shown as a matchup card of the same size —
 * the athlete's row, then a grey BYE row — with a line from the athlete to
 * the bout they enter, but it is not a bout and is not counted as one. No
 * bout numbers are shown here; they belong to the Bout Schedule. Nobody is
 * shown as a winner or champion.
 */
export default function DrawBracket() {
  const { divisionId } = useParams()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const tournamentId = searchParams.get('tournament')
  const overview = location.state?.from || `/draw-management${tournamentId ? `?tournament=${tournamentId}` : ''}`
  const { hasPermission } = useAuth()
  // The generation screen hands over the bracket it fetched during its animation, so the new
  // Draft appears at once, with no loading flash; it is read again below all the same.
  const [data, setData] = useState(location.state?.bracket || null)
  const [error, setError] = useState('')
  const [details, setDetails] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(
    () =>
      tournamentsApi
        .drawBracket(divisionId)
        .then((result) => setData(result))
        .catch((err) => setError(drawError(err, 'Could not load this bracket.'))),
    [divisionId],
  )

  useEffect(() => {
    // The handed-over bracket is for this arrival only: never keep it in the history entry.
    const { state } = window.history
    if (state?.usr?.bracket) window.history.replaceState({ ...state, usr: { ...state.usr, bracket: undefined } }, '')
    let cancelled = false
    tournamentsApi
      .drawBracket(divisionId)
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(drawError(err, 'Could not load this bracket.')))
    return () => {
      cancelled = true
    }
  }, [divisionId])

  const layout = useMemo(() => (data ? buildLayout(data.bracket) : null), [data])

  if (!data && !error) return <Spinner label="Loading…" />
  if (!data) {
    return (
      <div className="pt-page dm-page">
        <Alert type="error">{error}</Alert>
        <Link className="dm-back" to={overview}>
          <ChevronLeftIcon aria-hidden="true" /> Back to Divisions
        </Link>
      </div>
    )
  }

  const { tournament, division, stats, status } = data
  const GenderIcon = division.gender === 'female' ? FemaleIcon : MaleIcon
  const title = divisionTitle(division.gender, division.categoryEn, division.weightEn)
  const tournamentName = tournament.nameEn || tournament.nameAr

  // Publishing is the Technical Delegate's (Draw Approval); the server enforces the same permission
  // and every check below again, under its write lock.
  const canPublish = hasPermission('tournament.draw.approve')
  // An outdated Draft is already stated by the status message below the counters; only the
  // other reasons need a line of their own.
  const outdated = Boolean(data.sync?.changed)
  // An updated Draft of a published draw (regenerated from Draw Preparation): the published version stays on
  // the website until the updated draw is published here.
  const live = data.livePublication
  const publishBlocked = outdated
    ? 'Draw outdated — Regeneration required'
    : data.scheduleApproved
      ? 'The bout schedule is approved. A schedule approver must withdraw the approval, with a reason, before a new draw can be published.'
      : layout?.issues?.length > 0
        ? 'The saved draw does not form a valid bracket, so it cannot be published.'
        : ''

  return (
    <div className="pt-page dm-page db-page">
      <header className="db-head">
        <Link className="dm-back" to={overview}>
          <ChevronLeftIcon aria-hidden="true" /> Back to Divisions
        </Link>
        <div className="db-head__title">
          <GenderIcon className={`db-head__gender dd-header__gender--${division.gender}`} aria-hidden="true" />
          <div>
            <h1>{title}</h1>
            <p>{tournament.nameEn || tournament.nameAr}</p>
          </div>
        </div>
        <div className="db-head__side">
          {status === 'draft' ? (
            <span className="dm-status dm-status--blue" data-testid="draft-status">
              <span className="dm-status__dot" aria-hidden="true" />
              {live ? 'Updated Draft · Not Published Yet' : 'Draft · Pending Approval'}
            </span>
          ) : (
            <span className="dm-status dm-status--green" data-testid="published-status">
              <span className="dm-status__dot" aria-hidden="true" />
              Published
              {data.drawPublishedAt && (
                <span className="db-published-at">
                  {' · '}
                  {new Date(
                    `${data.drawPublishedAt}`.endsWith('Z') ? data.drawPublishedAt : `${data.drawPublishedAt}Z`,
                  ).toLocaleString('en-GB', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              )}
            </span>
          )}
          <button type="button" className="db-details-btn" onClick={() => setDetails(true)}>
            <InfoIcon aria-hidden="true" /> View Details
          </button>
          {/* An updated draw of a published division is published from Draw Preparation, beside View Bracket. */}
          {status === 'draft' && canPublish && !live && (
            <button
              type="button"
              className="dd-btn dd-btn--primary db-publish-btn"
              data-testid="publish-draw"
              disabled={Boolean(publishBlocked)}
              aria-describedby={publishBlocked && !outdated ? 'db-publish-blocked' : undefined}
              title={publishBlocked || undefined}
              onClick={() => setPublishing(true)}
            >
              <CheckIcon aria-hidden="true" /> Publish Draw
            </button>
          )}
        </div>
      </header>

      {live && status === 'draft' && (
        <p className="db-update-note" role="note" data-testid="update-note">
          <InfoIcon aria-hidden="true" /> The published draw (version {live.version}) stays on the website until the
          updated draw is published from{' '}
          <Link to={`/draw-management/divisions/${division.id}${tournamentId ? `?tournament=${tournamentId}` : ''}`} state={{ from: overview }}>
            Draw Preparation
          </Link>
          .
        </p>
      )}

      {status === 'draft' && canPublish && !live && publishBlocked && !outdated && (
        <p id="db-publish-blocked" className="db-publish-blocked" role="note">
          <AlertIcon aria-hidden="true" /> {publishBlocked}
        </p>
      )}
      <Alert type="success" onDismiss={() => setNotice('')}>
        {notice}
      </Alert>

      <div className="db-stats">
        <Stat icon={UsersIcon} label="Total Athletes" value={stats.athletes} />
        <Stat icon={ShuffleIcon} label="BYEs" value={stats.byes} />
        <Stat icon={EventsIcon} label="Total Bouts" value={stats.bouts} />
        <Stat icon={TournamentIcon} label="Competition Format" value={stats.format} text />
      </div>


      <BracketPhotoContext.Provider value={Number(divisionId)}>
        <BracketCanvas layout={layout} />
      </BracketPhotoContext.Provider>

      {data.publications?.length > 0 && (
        <section className="db-versions" aria-label="Published versions" data-testid="published-versions">
          <h3>Published versions</h3>
          <ul>
            {data.publications.map((v) => (
              <li key={v.version}>
                <strong>Version {v.version}</strong> · {formatWhen(v.publishedAt)} by {v.publishedBy} ·{' '}
                {v.supersededAt ? `replaced ${formatWhen(v.supersededAt)}` : 'on the website'}
              </li>
            ))}
          </ul>
        </section>
      )}

      {details && <DetailsDialog data={data} layout={layout} onClose={() => setDetails(false)} />}
      {publishing && (
        <PublishDrawDialog
          updated={Boolean(live)}
          data={data}
          title={title}
          tournamentName={tournamentName}
          onClose={() => setPublishing(false)}
          onPublished={() => {
            setPublishing(false)
            setNotice(live ? `The updated ${title} draw is published.` : `The ${title} draw is published.`)
            load()
          }}
          onStale={() => load()}
        />
      )}
    </div>
  )
}

function formatWhen(value) {
  if (!value) return ''
  return new Date(`${value}`.endsWith('Z') ? value : `${value}Z`).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function Stat({ icon: Icon, label, value, text = false }) {
  return (
    <div className="db-stat">
      <Icon className="db-stat__icon" aria-hidden="true" />
      <div>
        <span className="db-stat__label">{label}</span>
        <span className={`db-stat__value${text ? ' db-stat__value--text' : ''}`}>{value}</span>
      </div>
    </div>
  )
}

/* ── The canvas: a plain scrollable area, left to right ─────────────────── */

function BracketCanvas({ layout }) {
  if (layout.empty) {
    return (
      <section className="db-canvas-wrap" aria-label="Bracket">
        <p className="db-empty">This division has no bouts to show.</p>
      </section>
    )
  }
  return (
    <section className="db-canvas-wrap" aria-label="Bracket">
      {layout.issues.length > 0 && (
        <div className="db-issues" role="alert">
          <strong>The stored draw does not form a valid single-elimination tree.</strong>
          <ul>
            {layout.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="db-viewport" tabIndex={0} aria-label="Bracket, scroll to see all rounds">
        <div className="db-canvas" style={{ width: layout.width, height: layout.height }}>
          <div className="db-rounds" style={{ width: layout.width, height: GEOMETRY.HEADINGS_H }}>
            {layout.headings.map((h) => (
              <h3 key={h.key} className="db-round" style={{ left: h.x, width: h.w }}>
                {h.name}
              </h3>
            ))}
          </div>

          <svg className="db-lines" width={layout.width} height={layout.height} aria-hidden="true">
            <defs>
              <marker
                id="db-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M0 0L10 5L0 10z" />
              </marker>
            </defs>
            {layout.lines.map((l) => (
              <path key={l.key} d={l.d} markerEnd="url(#db-arrow)" data-from={l.from} data-to={l.to} />
            ))}
          </svg>

          {layout.nodes.map((n) =>
            n.kind === 'bye' ? <ByeCard key={n.id} node={n} /> : <BoutCard key={n.id} node={n} />,
          )}

          {layout.champion && <Champion champion={layout.champion} />}
        </div>
      </div>
    </section>
  )
}

function nameOf(entry) {
  return entry?.nameEn || entry?.nameAr || `Entry #${entry?.id}`
}

function Slot({ slot }) {
  if (slot.kind === 'athlete') {
    const name = nameOf(slot.entry)
    return (
      <>
        <AthleteAvatar entry={slot.entry} />
        <span className="db-row__name" title={slot.entry?.club ? `${name} — ${slot.entry.club}` : name}>
          {name}
        </span>
        {slot.tag && (
          <span className={`db-tag${slot.tag === 'WO' ? ' db-tag--wo' : ''}`} title="Advanced by walkover">
            {slot.tag}
          </span>
        )}
      </>
    )
  }
  // Not yet known: the neutral avatar, never a real athlete's photo.
  // Bout numbers are not shown in the bracket: a waiting corner names the round it comes from.
  const text =
    slot.kind === 'winner'
      ? `Winner of ${slot.ofRound || 'the previous round'}`
      : slot.kind === 'withdrawn'
        ? 'Withdrawn'
        : '—'
  return (
    <>
      <AthleteAvatar entry={null} />
      <span className="db-row__name db-row__name--waiting">{text}</span>
    </>
  )
}

function slotText(slot) {
  if (slot.kind === 'athlete') return `${nameOf(slot.entry)}${slot.tag ? ` (${slot.tag})` : ''}`
  if (slot.kind === 'winner') return `Winner of ${slot.ofRound || 'the previous round'}`
  return slot.kind === 'withdrawn' ? 'Withdrawn' : 'Not set'
}

function BoutCard({ node }) {
  const { bout } = node
  return (
    <article
      className="db-card"
      style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
      data-bout-id={bout.id}
      data-number={node.number}
      data-round={bout.round}
      data-feeds={bout.winnerToBoutId ? `${bout.winnerToBoutId}:${bout.winnerToCorner}` : ''}
      data-red={bout.red?.id ?? ''}
      data-blue={bout.blue?.id ?? ''}
      aria-label={`${node.roundName}: red ${slotText(node.red)}, blue ${slotText(node.blue)}`}
    >
      <div className="db-row db-row--red">
        <Slot slot={node.red} />
      </div>
      <div className="db-row db-row--blue">
        <Slot slot={node.blue} />
      </div>
    </article>
  )
}

/**
 * A BYE holder in the opening column: drawn as a matchup card of the same size
 * (the athlete's row, then a grey BYE row), but not a bout — not numbered, not
 * counted. The line to the next round leaves from the athlete's row.
 */
function ByeCard({ node }) {
  const name = nameOf(node.entry)
  return (
    <article
      className="db-card db-card--bye"
      style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
      data-bye-row={node.id}
      data-entry={node.entry?.id ?? ''}
      data-feeds={`${node.bout.winnerToBoutId}:${node.bout.winnerToCorner}`}
      aria-label={`${name}, BYE: enters the ${node.corner} corner of the next round`}
    >
      <div className={`db-row db-row--${node.corner}`}>
        <AthleteAvatar entry={node.entry} />
        <span className="db-row__name" title={node.entry?.club ? `${name} — ${node.entry.club}` : name}>
          {name}
        </span>
      </div>
      <div className="db-row db-row--bye" aria-hidden="true">
        <span className="db-bye-icon">BYE</span>
        <span className="db-row__name db-bye-label">BYE</span>
      </div>
    </article>
  )
}

/** The endpoint after the Final. Decorative: no champion is shown until one is confirmed. */
function Champion({ champion }) {
  return (
    <div
      className="db-champion"
      style={{ left: champion.x + 18, top: champion.y - GEOMETRY.MEDAL / 2, height: GEOMETRY.MEDAL }}
    >
      <Medal />
      <span className="db-champion__bar" aria-hidden="true" />
      <span className="db-champion__label">Champion</span>
    </div>
  )
}

function Medal() {
  return (
    <svg className="db-medal" viewBox="0 0 64 72" width={GEOMETRY.MEDAL} height={GEOMETRY.MEDAL} aria-hidden="true">
      <defs>
        <radialGradient id="db-gold" cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset="0.45" stopColor="#f7c531" />
          <stop offset="1" stopColor="#c98a0b" />
        </radialGradient>
        <linearGradient id="db-ribbon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ef4444" />
          <stop offset="1" stopColor="#b91c1c" />
        </linearGradient>
      </defs>
      <path d="M17 40 L8 66 L17 61 L22 70 L30 46 Z" fill="url(#db-ribbon)" />
      <path d="M47 40 L56 66 L47 61 L42 70 L34 46 Z" fill="url(#db-ribbon)" />
      <circle cx="32" cy="27" r="25" fill="#d69e16" />
      <circle cx="32" cy="27" r="22.5" fill="url(#db-gold)" />
      <circle cx="32" cy="27" r="17" fill="none" stroke="#e8a913" strokeWidth="1.5" opacity="0.8" />
      <path
        d="M32 14.5l3.7 7.6 8.3 1.2-6 5.9 1.4 8.3L32 33.6l-7.4 3.9 1.4-8.3-6-5.9 8.3-1.2z"
        fill="#fbbf24"
        stroke="#d4930c"
        strokeWidth="1"
      />
      <ellipse cx="24" cy="16" rx="7" ry="3.5" fill="#fff" opacity="0.35" transform="rotate(-30 24 16)" />
    </svg>
  )
}

function DetailsDialog({ data, layout, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current?.focus()
    const onKey = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const seed = /seed (\d+)/.exec(data.generated?.details || '')?.[1]
  return (
    <div className="db-dialog" role="presentation" onClick={onClose}>
      <div
        className="db-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="db-dialog-title"
        tabIndex={-1}
        ref={ref}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="db-dialog-title">Draw Details</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>
        <dl className="db-dialog__facts">
          <div>
            <dt>Status</dt>
            <dd>{data.status === 'draft' ? 'Draft — pending approval (not published, not scheduled)' : 'Published'}</dd>
          </div>
          {data.generated && (
            <div>
              <dt>Generated</dt>
              <dd>
                {new Date(`${data.generated.at}Z`).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}{' '}
                by {data.generated.by}
              </dd>
            </div>
          )}
          {seed && (
            <div>
              <dt>Draw seed</dt>
              <dd>{seed} (reproduces this draw on review)</dd>
            </div>
          )}
          <div>
            <dt>Bracket size</dt>
            <dd>
              {data.stats.bracketSize} ({data.stats.athletes} athletes, {data.stats.byes} BYEs, {data.stats.bouts}{' '}
              bouts)
            </dd>
          </div>
        </dl>
        <h3>Bouts per round</h3>
        <table className="db-dialog__table">
          <tbody>
            {layout.summary.map((r) => (
              <tr key={r.name}>
                <th scope="row">{r.name}</th>
                <td>{r.bouts}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Total</th>
              <td>{layout.summary.reduce((s, r) => s + r.bouts, 0)}</td>
            </tr>
          </tbody>
        </table>
        {layout.byeHolders.length > 0 && (
          <>
            <h3>BYE holders ({layout.byeHolders.length}), in draw order</h3>
            <ol className="db-dialog__byes">
              {layout.byeHolders.map((e) => (
                <li key={e.id}>
                  {e.nameEn || e.nameAr || `Entry #${e.id}`}
                  {e.club ? ` — ${e.club}` : ''}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  )
}

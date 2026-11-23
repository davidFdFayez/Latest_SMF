import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { tournamentsApi } from '../api/resources'
import { extractErrorMessage } from '../api/utils'
import Alert from '../components/Alert'
import Spinner from '../components/Spinner'
import DrawChanges from '../components/DrawChanges'
import RegeneratePublishedDialog from '../components/RegeneratePublishedDialog'
import PublishDrawDialog from '../components/PublishDrawDialog'
import { useAuth } from '../context/AuthContext'
import { divisionTitle, drawError } from '../drawLabels'
import {
  AlertIcon,
  BracketIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FemaleIcon,
  InfoIcon,
  MaleIcon,
  ShuffleIcon,
  TournamentIcon,
  UsersIcon,
} from '../components/Icons'

/**
 * Draw Management — Phase 2: one division, ready for its draw.
 *
 * The athletes with Final Draw Approval (the server's IsQualified rule — the
 * same one the draw itself takes its pool from), in a stable order, with the
 * BYEs a single-elimination bracket of that size needs. Nothing is drawn
 * here: Generate Draw asks the server to check the request (a dry run that
 * writes nothing) and, if it would succeed, opens the generation page with
 * the exact athletes shown, which the server checks again before drawing.
 */
export default function DrawDivision() {
  const { divisionId } = useParams()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [bracket, setBracket] = useState(null)
  const [notice, setNotice] = useState('')

  const tournamentId = searchParams.get('tournament') || data?.tournament?.id
  // Back to the overview as it was left (tournament, filters, open category).
  const overview = location.state?.from || `/draw-management${tournamentId ? `?tournament=${tournamentId}` : ''}`

  // keepError: a refusal stays on screen while the list refreshes beneath it.
  const load = useCallback(
    async ({ keepError = false } = {}) => {
      if (!keepError) setError('')
      try {
        const prep = await tournamentsApi.drawPreparation(divisionId)
        setData(prep)
        // A Draft of a division whose earlier version is published (an updated draw): its bracket data feeds the
        // Publish Updated Draw confirmation shown beside View Bracket.
        const saved = prep.division
        setBracket(
          saved.drawGenerated && !saved.drawPublishedAt
            ? await tournamentsApi.drawBracket(divisionId).catch(() => null)
            : null,
        )
      } catch (err) {
        setError(extractErrorMessage(err, 'Could not load this division.'))
      }
    },
    [divisionId],
  )

  // Fresh on arrival, and again whenever the window regains focus, so a
  // Final Approval given or withdrawn elsewhere shows here before a draw.
  useEffect(() => {
    load()
    const refresh = () => document.visibilityState === 'visible' && load({ keepError: true })
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [load])

  if (!data && !error) return <Spinner label="Loading…" />

  if (!data) {
    return (
      <div className="pt-page dm-page">
        <Alert type="error">{error}</Alert>
        <Link className="dm-back" to={overview}>
          <ChevronLeftIcon /> Back to Divisions
        </Link>
      </div>
    )
  }

  const { tournament, division, athletes, plan } = data
  const title = divisionTitle(division.gender, division.categoryEn, division.weightEn)
  const tournamentName = tournament.nameEn || tournament.nameAr
  const status = statusOf(division, plan)
  const GenderIcon = division.gender === 'female' ? FemaleIcon : MaleIcon
  const hasDraw = division.drawGenerated || Boolean(division.drawPublishedAt)
  const canGenerate = plan.canDraw && hasPermission('tournament.draw') && !hasDraw
  // A published draw whose eligible athletes changed: regenerate it here (as a Draft — the published version
  // stays on the website until the updated draw is published from View Bracket).
  const canRegeneratePublished =
    Boolean(division.drawPublishedAt) && Boolean(data.sync?.hasDraw && data.sync?.changed) && hasPermission('tournament.draw')
  // After regeneration: the updated Draft is published here, explicitly, with the existing confirmation.
  const updatedDraft = Boolean(bracket?.livePublication) && bracket?.status === 'draft'
  const canPublishUpdated = updatedDraft && hasPermission('tournament.draw.approve')
  const publishUpdatedBlocked = !updatedDraft
    ? ''
    : bracket.sync?.changed
      ? 'The eligible athletes changed again. Regenerate the draw before publishing.'
      : bracket.scheduleApproved
        ? 'The bout schedule is approved. Withdraw the approval before publishing the updated draw.'
        : ''
  const blockedReason = hasDraw
    ? 'This division already has a draw. Open it with View Bracket; it is never replaced from here.'
    : !plan.canDraw
      ? plan.kind === 'none'
        ? 'There are no eligible athletes in this division.'
        : plan.kind === 'no_contest'
          ? 'A single eligible athlete is a No Contest: there is no draw to make.'
          : `This division has more than ${plan.maxAthletes} eligible athletes, which the current competition rules do not provide for.`
      : !hasPermission('tournament.draw')
        ? 'Generating a draw needs the draw permission.'
        : ''

  /* Step A: the server checks everything (permission, athletes, an existing
     draw, capacity, a changed list) without drawing. Only then the generation
     page opens, carrying the athletes shown here; on refusal, stay here. */
  async function startGeneration() {
    const expectedEntryIds = athletes.map((a) => a.entryId)
    setChecking(true)
    setError('')
    try {
      await tournamentsApi.generateDraw(division.id, { expectedEntryIds, dryRun: true })
      navigate(`/draw-management/divisions/${division.id}/generate?tournament=${tournamentId}`, {
        state: { expectedEntryIds, from: overview },
      })
    } catch (err) {
      setError(drawError(err, 'The draw cannot be generated.'))
      // The list may have changed: show the current one, keeping the reason.
      load({ keepError: true })
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="pt-page dm-page">
      <div className="dm-head">
        <div>
          <h1 className="dm-title">Draw Management</h1>
          <nav className="dm-crumbs" aria-label="Breadcrumb">
            <Link to={overview}>Draw Management</Link>
            <ChevronRightIcon className="dm-crumbs__sep" aria-hidden="true" />
            <Link to={overview}>{tournamentName}</Link>
            <ChevronRightIcon className="dm-crumbs__sep" aria-hidden="true" />
            <strong>{title}</strong>
          </nav>
        </div>
      </div>

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>
      <Alert type="success" onDismiss={() => setNotice('')}>
        {notice}
      </Alert>

      <section className="dd-panel" aria-labelledby="dd-title">
        <Link className="dm-back" to={overview}>
          <ChevronLeftIcon aria-hidden="true" /> Back to Divisions
        </Link>

        <header className="dd-header">
          <GenderIcon className={`dd-header__gender dd-header__gender--${division.gender}`} aria-hidden="true" />
          <div className="dd-header__text">
            <h2 id="dd-title" className="dd-header__title">
              {title}
            </h2>
            <p className="dd-header__tournament">{tournamentName}</p>
          </div>
          <span className={`dm-status dm-status--${status.tone} dd-header__status`}>
            <span className="dm-status__dot" aria-hidden="true" />
            {status.label}
          </span>
        </header>

        <div className="dd-cards">
          <Card icon={UsersIcon} label="Approved Athletes" value={plan.athletes} />
          <Card icon={ShuffleIcon} label="Bye" value={plan.byes ?? '—'} />
          <Card icon={TournamentIcon} label="Competition Format" value={plan.format} text />
        </div>

        {plan.kind === 'over_capacity' && (
          <p className="dd-warning" role="alert">
            <AlertIcon aria-hidden="true" />
            This division has {plan.athletes} eligible athletes — more than the {plan.maxAthletes} the current
            competition rules provide for. A draw cannot be generated until those rules are reviewed.
          </p>
        )}

        <section className="dd-athletes" aria-labelledby="dd-athletes-title">
          <div className="dd-athletes__head">
            <UsersIcon className="dd-athletes__icon" aria-hidden="true" />
            <h3 id="dd-athletes-title" className="dd-athletes__title">
              Eligible Athletes <span>(Final Draw Approval)</span>
            </h3>
            <span className="dd-athletes__count">
              {athletes.length} {athletes.length === 1 ? 'athlete' : 'athletes'}
            </span>
          </div>
          {athletes.length === 0 ? (
            <p className="dd-empty">No athlete in this division has Final Draw Approval yet.</p>
          ) : (
            <div className="dd-table-wrap">
              <table className="dd-table">
                <thead>
                  <tr>
                    <th scope="col" className="dd-table__num">
                      #
                    </th>
                    <th scope="col">Athlete Name</th>
                    <th scope="col">Club</th>
                    <th scope="col">Approval Status</th>
                  </tr>
                </thead>
                <tbody>
                  {athletes.map((athlete, index) => (
                    <tr key={athlete.entryId}>
                      <td className="dd-table__num">{index + 1}</td>
                      <th scope="row" className="dd-table__name">
                        {athlete.nameEn || athlete.nameAr || `Entry #${athlete.entryId}`}
                      </th>
                      <td>{athlete.club || '—'}</td>
                      <td>
                        <span className="dd-approved">
                          <CheckIcon aria-hidden="true" /> Approved
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Below the athletes: what changed since the draw was made, in plain words (only when something did). */}
        <DrawChanges
          sync={data.sync}
          plan={plan}
          divisionId={division.id}
          published={Boolean(division.drawPublishedAt)}
          canRegenerate={hasPermission('tournament.draw') && !division.drawPublishedAt}
          // The confirmed request goes to the generation screen, which sends it once and shows
          // the same animation as a first generation before opening the new Draft.
          onConfirmRegeneration={(regenerate) =>
            navigate(`/draw-management/divisions/${division.id}/generate?tournament=${tournamentId}`, {
              state: { regenerate, from: overview },
            })
          }
        />

        <p className="dd-note">
          <InfoIcon aria-hidden="true" />
          Only athletes with Final Draw Approval are included in the draw.
        </p>

        <div className="dd-actions">
          <button type="button" className="dd-btn dd-btn--ghost" onClick={() => navigate(overview)}>
            Cancel
          </button>
          {canRegeneratePublished && (
            <button
              type="button"
              className="dd-btn dd-btn--primary"
              data-testid="regenerate-published"
              onClick={() => setRegenerating(true)}
            >
              <ShuffleIcon aria-hidden="true" /> Regenerate Draw
            </button>
          )}
          {canPublishUpdated && (
            <button
              type="button"
              className="dd-btn dd-btn--primary"
              data-testid="publish-updated"
              disabled={Boolean(publishUpdatedBlocked)}
              title={publishUpdatedBlocked || undefined}
              onClick={() => setPublishing(true)}
            >
              <CheckIcon aria-hidden="true" /> Publish Updated Draw
            </button>
          )}
          {hasDraw ? (
            <Link
              className="dd-btn dd-btn--primary"
              to={bracketLink(division.id, tournamentId)}
              state={{ from: overview }}
            >
              <BracketIcon aria-hidden="true" /> View Bracket
            </Link>
          ) : (
            <span title={blockedReason || undefined}>
              <button
                type="button"
                className="dd-btn dd-btn--primary"
                disabled={!canGenerate || checking}
                aria-describedby={blockedReason ? 'dd-blocked' : undefined}
                onClick={startGeneration}
              >
                <BracketIcon aria-hidden="true" /> {checking ? 'Checking…' : 'Generate Draw'}
              </button>
            </span>
          )}
        </div>
        {blockedReason && !hasDraw && (
          <p id="dd-blocked" className="dd-blocked">
            {blockedReason}
          </p>
        )}
      </section>
      {publishing && bracket && (
        <PublishDrawDialog
          updated
          data={bracket}
          title={title}
          tournamentName={tournamentName}
          onClose={() => setPublishing(false)}
          onPublished={() => {
            setPublishing(false)
            setNotice(`The updated ${title} draw is published.`)
            load()
          }}
          onStale={() => load()}
        />
      )}
      {regenerating && (
        <RegeneratePublishedDialog
          divisionId={division.id}
          sync={data.sync}
          title={title}
          onClose={() => setRegenerating(false)}
          // The same generation screen and animation as a first draw: it sends the confirmed request once and then
          // opens the new (unpublished) bracket for review, where Publish Updated Draw is offered.
          onConfirmed={(regenerate) =>
            navigate(`/draw-management/divisions/${division.id}/generate?tournament=${tournamentId}`, {
              state: { regenerate, from: overview },
            })
          }
        />
      )}
    </div>
  )
}

function Card({ icon: Icon, label, value, text = false }) {
  return (
    <div className="dd-card">
      <Icon className="dd-card__icon" aria-hidden="true" />
      <div className="dd-card__text">
        <span className="dd-card__label">{label}</span>
        <span className={`dd-card__value${text ? ' dd-card__value--text' : ''}`}>{value}</span>
      </div>
    </div>
  )
}

/** The division's state: its draw if one exists, otherwise what its count allows. */
function statusOf(division, plan) {
  if (division.drawPublishedAt) return { label: 'Published', tone: 'green' }
  if (division.drawGenerated) return { label: 'Draft', tone: 'blue' }
  if (plan.kind === 'none') return { label: 'No Eligible Athletes', tone: 'muted' }
  if (plan.kind === 'no_contest') return { label: 'No Contest (NC)', tone: 'amber' }
  if (plan.kind === 'over_capacity') return { label: 'Over Capacity', tone: 'amber' }
  return { label: 'Not Generated', tone: 'neutral' }
}

function bracketLink(divisionId, tournamentId) {
  return `/draw-management/divisions/${divisionId}/bracket${tournamentId ? `?tournament=${tournamentId}` : ''}`
}

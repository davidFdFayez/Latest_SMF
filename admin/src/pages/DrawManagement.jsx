import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { tournamentsApi } from '../api/resources'
import { extractErrorMessage, formatDate } from '../api/utils'
import Alert from '../components/Alert'
import EmptyState from '../components/EmptyState'
import Spinner from '../components/Spinner'
import { categoryName } from '../drawLabels'
import {
  AlertIcon,
  ArrowDownIcon,
  BracketIcon,
  CheckIcon,
  ChevronRightIcon,
  DrawIcon,
  FemaleIcon,
  MaleIcon,
  SearchIcon,
  UploadIcon,
  UsersIcon,
} from '../components/Icons'

/**
 * Draw Management — Phase 1: the overview.
 *
 * A tournament's divisions grouped by gender and age category (Female first,
 * youngest to oldest, then Male), each group an accordion of its weight
 * classes. For each division: how many athletes have Final Draw Approval —
 * the same rule the draw takes its pool from — the BYEs a single-elimination
 * bracket of that size needs, and where its draw stands.
 *
 * Read-only: nothing is generated, assigned or recorded from this page.
 * "Manage Draw" opens the division's own page (DrawDivision). The search,
 * gender filter and open category live in the URL with the tournament, so
 * coming back from a division finds the page as it was left.
 */
export default function DrawManagement() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tournamentId = Number(searchParams.get('tournament')) || 0

  const [tournaments, setTournaments] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState('')
  const location = useLocation()
  const search = searchParams.get('q') || ''
  const gender = searchParams.get('gender') || ''
  // null: nothing chosen yet; '': everything closed on purpose.
  const open = searchParams.has('open') ? searchParams.get('open') : null
  function setView(changes) {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || (value === '' && key !== 'open')) next.delete(key)
      else next.set(key, value)
    }
    setSearchParams(next, { replace: true })
  }
  const setSearch = (value) => setView({ q: value, open: null })
  const setGender = (value) => setView({ gender: value, open: null })
  const setOpen = (value) => setView({ open: value })

  // The tournaments to choose from; the choice itself lives in the URL, so it
  // survives going to a division's draw and coming back.
  useEffect(() => {
    let cancelled = false
    tournamentsApi
      .list()
      .then((list) => {
        if (cancelled) return
        setTournaments(list)
        if (!tournamentId && list.length) setSearchParams({ tournament: String(list[0].id) }, { replace: true })
      })
      .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Could not load the tournaments.')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // Only once: the selection itself lives in the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!tournamentId) return undefined
    let cancelled = false
    setLoadingData(true)
    setError('')
    tournamentsApi
      .drawOverview(tournamentId)
      .then((result) => !cancelled && setData(result))
      .catch((err) => {
        if (cancelled) return
        setData(null)
        setError(extractErrorMessage(err, 'Could not load the divisions.'))
      })
      .finally(() => !cancelled && setLoadingData(false))
    return () => {
      cancelled = true
    }
  }, [tournamentId])

  // A transfer, weigh-in or Final Draw Approval made elsewhere: read the counts again when the
  // window regains focus, keeping the page as it is.
  const refresh = useCallback(() => {
    if (!tournamentId || document.visibilityState !== 'visible') return
    tournamentsApi
      .drawOverview(tournamentId)
      .then((result) => setData((current) => (current?.tournament?.id === result.tournament.id ? result : current)))
      .catch(() => {})
  }, [tournamentId])
  useEffect(() => {
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [refresh])

  function chooseTournament(value) {
    setSearchParams({ tournament: String(value) })
  }

  // Gender + age category groups, in the API's order (Female first, youngest
  // to oldest, lightest class first), filtered by gender and search.
  const groups = useMemo(() => {
    if (!data) return []
    const query = search.trim().toLowerCase()
    const result = []
    for (const division of data.divisions) {
      const key = `${division.gender}|${division.category}`
      let group = result[result.length - 1]
      if (!group || group.key !== key) {
        group = {
          key,
          gender: division.gender,
          title: `${division.gender === 'female' ? 'Female' : 'Male'} — ${categoryName(division.categoryEn)}`,
          aliases: `${division.categoryEn} ${categoryName(division.categoryEn)}`,
          all: [],
        }
        result.push(group)
      }
      group.all.push(division)
    }
    return result
      .filter((group) => !gender || group.gender === gender)
      .map((group) => {
        if (!query) return { ...group, divisions: group.all, matchedWeights: false }
        // A search for the category (or gender) keeps the whole group; one
        // for a weight keeps just the classes it matches.
        if (`${group.title} ${group.aliases}`.toLowerCase().includes(query)) {
          return { ...group, divisions: group.all, matchedWeights: false }
        }
        const weightQuery = query.replace(/\s*kg$/, '')
        const divisions = group.all.filter((d) =>
          d.weightEn
            .toLowerCase()
            .replace(/\s*kg$/, '')
            .includes(weightQuery),
        )
        return { ...group, divisions, matchedWeights: true }
      })
      .filter((group) => group.divisions.length > 0)
  }, [data, search, gender])

  // A search that found particular weights opens the first group it found them in.
  const searching = search.trim().length > 0
  const firstWeightMatch = searching ? groups.find((group) => group.matchedWeights)?.key : null
  const expanded = open ?? firstWeightMatch ?? null

  const summary = useMemo(() => {
    const divisions = data?.divisions || []
    return {
      total: divisions.length,
      approved: divisions.reduce((sum, d) => sum + d.approvedAthletes, 0),
      generated: divisions.filter((d) => d.drawGenerated).length,
      published: divisions.filter((d) => d.drawPublishedAt).length,
      // Divisions that have, or can have, a draw (two or more approved, or one already made).
      drawable: divisions.filter((d) => d.drawGenerated || d.approvedAthletes >= 2).length,
    }
  }, [data])

  // The tournament's draws at a glance, for the pill beside the title.
  const overall =
    summary.drawable > 0 && summary.published === summary.drawable
      ? { label: 'Published', tone: 'green' }
      : summary.generated > 0
        ? { label: 'In Progress', tone: 'blue' }
        : { label: 'Not Generated', tone: 'neutral' }
  const tournamentName = data?.tournament?.nameEn || data?.tournament?.nameAr

  if (loading) return <Spinner label="Loading…" />

  return (
    <div className="pt-page dm-page">
      <div className="dm-head">
        <div>
          <h1 className="dm-title">Draw Management</h1>
          <nav className="dm-crumbs" aria-label="Breadcrumb">
            <Link to="/tournaments">Tournaments</Link>
            <ChevronRightIcon className="dm-crumbs__sep" aria-hidden="true" />
            {tournamentName ? (
              <Link to={`/tournaments/${tournamentId}`}>{tournamentName}</Link>
            ) : (
              <span>Tournament</span>
            )}
            <ChevronRightIcon className="dm-crumbs__sep" aria-hidden="true" />
            <strong>Draw</strong>
          </nav>
        </div>
        <div className="dm-head__side">
          {data && <StatusPill tone={overall.tone}>{overall.label}</StatusPill>}
          {tournaments.length > 0 && (
            <label className="pt-tournament">
              <span>Tournament</span>
              <select value={tournamentId || ''} onChange={(event) => chooseTournament(event.target.value)}>
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nameEn || t.nameAr} — {formatDate(t.startDate)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>

      {tournaments.length === 0 ? (
        <EmptyState title="No tournaments yet" description="Create a tournament in Tournament Management first." />
      ) : (
        <>
          <div className="dm-cards">
            <SummaryCard icon={DrawIcon} label="Total Divisions" value={summary.total} />
            <SummaryCard icon={UsersIcon} label="Approved Athletes" value={summary.approved} />
            <SummaryCard icon={BracketIcon} label="Generated Draws" value={summary.generated} />
            <SummaryCard icon={CheckIcon} circled label="Published Draws" value={summary.published} />
          </div>

          <div className="dm-toolbar">
            <label className="dm-search">
              <SearchIcon className="dm-search__icon" aria-hidden="true" />
              <input
                type="search"
                placeholder="Search age category or weight..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                }}
                aria-label="Search age category or weight"
              />
            </label>
            <label className="dm-gender">
              <span className="visually-hidden">Gender</span>
              <select
                value={gender}
                onChange={(event) => {
                  setGender(event.target.value)
                }}
              >
                <option value="">All Genders</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </label>
          </div>

          {loadingData && !data ? (
            <Spinner label="Loading divisions…" />
          ) : !data || data.divisions.length === 0 ? (
            <EmptyState
              title="No divisions yet"
              description="This tournament has no divisions. Set up its competition categories in Tournament Management."
            />
          ) : groups.length === 0 ? (
            <p className="dm-empty">No divisions match this search.</p>
          ) : (
            <div className="dm-groups">
              {groups.map((group) => (
                <DivisionGroup
                  key={group.key}
                  group={group}
                  tournamentId={tournamentId}
                  from={`${location.pathname}${location.search}`}
                  open={expanded === group.key}
                  // Only one open at a time; opening the open one closes it.
                  onToggle={() => setOpen(expanded === group.key ? '' : group.key)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StatusPill({ tone, children }) {
  return (
    <span className={`dm-status dm-status--${tone}`}>
      <span className="dm-status__dot" aria-hidden="true" />
      {children}
    </span>
  )
}

function SummaryCard({ icon: Icon, label, value, circled = false }) {
  return (
    <div className="dm-card">
      <Icon className={`dm-card__icon${circled ? ' dm-card__icon--circled' : ''}`} aria-hidden="true" />
      <div className="dm-card__text">
        <span className="dm-card__label">{label}</span>
        <span className="dm-card__value">{value}</span>
      </div>
    </div>
  )
}

function DivisionGroup({ group, tournamentId, from, open, onToggle }) {
  const GenderIcon = group.gender === 'female' ? FemaleIcon : MaleIcon
  const panelId = `dm-group-${group.key.replace(/[^a-z0-9]+/gi, '-')}`
  const count = group.divisions.length
  const countLabel =
    count === group.all.length
      ? `${count} ${count === 1 ? 'division' : 'divisions'}`
      : `${count} of ${group.all.length} divisions`

  return (
    <div className={`dm-group${open ? ' is-open' : ''}`}>
      <button type="button" className="dm-group__head" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <ArrowDownIcon className="dm-group__chevron" aria-hidden="true" />
        <GenderIcon className={`dm-group__gender dm-group__gender--${group.gender}`} aria-hidden="true" />
        <span className="dm-group__title">{group.title}</span>
        <span className="dm-group__count">{countLabel}</span>
      </button>
      {open && (
        <div className="dm-group__body" id={panelId}>
          <table className="dm-table">
            <thead>
              <tr>
                <th scope="col">Weight</th>
                <th scope="col" className="dm-num">
                  Approved Athletes
                </th>
                <th scope="col" className="dm-num">
                  Bye
                </th>
                <th scope="col">Draw Status</th>
                <th scope="col" className="dm-action">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {group.divisions.map((division) => (
                <DivisionRow key={division.id} division={division} tournamentId={tournamentId} from={from} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function DivisionRow({ division, tournamentId, from }) {
  const athletes = division.approvedAthletes
  const status = drawStatus(division)
  // From the server's bracket arithmetic (DrawMath), the same the division page shows.
  const byes = division.byes ?? null

  return (
    <tr>
      <th scope="row" className="dm-weight">
        {division.weightEn}
      </th>
      <td className="dm-num">{athletes}</td>
      <td className="dm-num">
        <span title="Potential BYEs for the athletes eligible now">{byes ?? '—'}</span>
        {division.drawByes != null && (
          // The saved draw's own BYEs, which can differ when eligibility has changed since.
          <span className="dm-sub" title="BYEs assigned in the saved draw">
            Draft: {division.drawByes}
          </span>
        )}
      </td>
      <td>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
        {/* Only when the saved draw's athletes differ from those eligible now (the server compares
            exact entries); details stay on the division's own page. */}
        {division.eligibleChanged && (
          <span className="dm-changed" role="note" data-testid="outdated-warning">
            <AlertIcon aria-hidden="true" /> Eligible athletes changed — Regeneration required
          </span>
        )}
      </td>
      <td className="dm-action">
        {status.manage ? (
          <Link
            className="dm-manage"
            to={`/draw-management/divisions/${division.id}?tournament=${tournamentId}`}
            state={{ from }}
          >
            Manage Draw
            <ChevronRightIcon className="dm-manage__icon" aria-hidden="true" />
          </Link>
        ) : status.key === 'nc' ? (
          // The participation certificate comes in a later phase: shown, not usable.
          <span className="dm-upload" title="Participation Certificate — Coming Soon">
            <button
              type="button"
              className="icon-btn dm-upload__btn"
              aria-disabled="true"
              aria-label="Participation Certificate — Coming Soon"
              onClick={(event) => event.preventDefault()}
            >
              <UploadIcon />
            </button>
          </span>
        ) : (
          <button type="button" className="dm-manage" disabled title="Needs at least two approved athletes">
            Manage Draw
            <ChevronRightIcon className="dm-manage__icon" aria-hidden="true" />
          </button>
        )}
      </td>
    </tr>
  )
}

/**
 * Where a division's draw stands. A division that already has a draw keeps
 * its draw state and its Manage Draw, whatever the count is now, so the draw
 * is never out of reach. Otherwise: no approved athletes — nothing to draw;
 * exactly one — No Contest (shown from the current count, nothing recorded);
 * two or more — not generated yet.
 */
function drawStatus(division) {
  if (division.drawPublishedAt) return { key: 'published', label: 'Published', tone: 'green', manage: true }
  // A published draw being updated: the published version stays on the website until the update is published.
  if (division.updatePending) return { key: 'generated', label: 'Update in Draft', tone: 'blue', manage: true }
  if (division.drawGenerated) return { key: 'generated', label: 'Draft', tone: 'blue', manage: true }
  if (division.approvedAthletes === 0)
    return { key: 'none', label: 'No Eligible Athletes', tone: 'muted', manage: false }
  if (division.approvedAthletes === 1) return { key: 'nc', label: 'No Contest (NC)', tone: 'amber', manage: false }
  if (division.overCapacity) return { key: 'over', label: 'Over Capacity', tone: 'amber', manage: true }
  return { key: 'pending', label: 'Not Generated', tone: 'neutral', manage: true }
}

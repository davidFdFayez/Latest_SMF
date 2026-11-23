import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { tournamentsApi } from '../api/resources'
import { extractErrorMessage, formatDate, formatDateTime } from '../api/utils'
import { useAuth } from '../context/AuthContext'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import EmptyState from '../components/EmptyState'
import {
  AlertIcon,
  ArrowDownIcon,
  BuildingIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  CloseIcon,
  DrawIcon,
  EyeIcon,
  FemaleIcon,
  FileIcon,
  HelpIcon,
  InfoIcon,
  MaleIcon,
  ScaleIcon,
  SearchIcon,
  StethoscopeIcon,
  UploadIcon,
  UserIcon,
} from '../components/Icons'

/**
 * Check-in & Medical Examination — REQ-08 and REQ-09 as one workflow.
 *
 * Three steps for the selected athlete (Check-in, Medical Examination,
 * Weigh-in), with the athlete list beside them so the desk can finish one
 * athlete and pick the next without leaving the page. The steps are states of
 * the athlete, not routes: the step shown is the one their saved record is
 * on, and each successful save moves it on in place.
 *
 * The server decides everything that matters — order of steps, whether a
 * weight fits a class, which classes a move may go to, corrections and locks.
 * This page only shows what it says and asks.
 */

const PER_PAGE = [10, 25, 50, 100]

const STEPS = [
  { n: 1, label: 'Check-in' },
  { n: 2, label: 'Medical Examination' },
  { n: 3, label: 'Weigh-in' },
]

const STATES = [
  { value: 'checkin', label: 'Awaiting Check-in' },
  { value: 'medical', label: 'Medical Examination' },
  { value: 'weighin', label: 'Weigh-in' },
  { value: 'ready', label: 'Ready · awaiting approval' },
  { value: 'qualified', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'failed', label: 'Failed' },
  { value: 'dsq', label: 'Disqualified (DSQ)' },
]

// Through all three steps: the summary, its tabs and Draw Approval take over.
const COMPLETE = ['ready', 'qualified', 'rejected']

export default function TournamentReadiness() {
  const { hasPermission } = useAuth()
  // Recording is the technical team's; approval for the draw is the director's.
  const canRecord = hasPermission('tournament.technical')
  const canApprove = hasPermission('tournament.director')
  const [searchParams, setSearchParams] = useSearchParams()

  const [tournaments, setTournaments] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingList, setLoadingList] = useState(false)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [division, setDivision] = useState('')
  const [state, setState] = useState('')
  const [collapsed, setCollapsed] = useState({})
  const [selectedId, setSelectedId] = useState(0)
  const [viewStep, setViewStep] = useState(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const dirty = useRef(false)
  const panelRef = useRef(null)

  const tournamentId = Number(searchParams.get('tournament')) || 0

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

  const load = useCallback(async () => {
    if (!tournamentId) return
    setData(await tournamentsApi.readiness(tournamentId))
  }, [tournamentId])

  useEffect(() => {
    let cancelled = false
    setLoadingList(true)
    setError('')
    load()
      .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Could not load the athletes.')))
      .finally(() => !cancelled && setLoadingList(false))
    return () => {
      cancelled = true
    }
  }, [load])

  /** Unsaved edits are never dropped silently. */
  function mayLeave() {
    if (!dirty.current) return true
    if (!window.confirm('You have unsaved changes for this athlete. Discard them?')) return false
    dirty.current = false
    return true
  }

  function chooseTournament(value) {
    if (!mayLeave()) return
    setSearchParams({ tournament: value })
    setData(null)
    setDivision('')
    setCollapsed({})
    setSelectedId(0)
    setViewStep(null)
    setPage(1)
  }

  const athletes = useMemo(() => data?.athletes ?? [], [data])

  const divisions = useMemo(() => {
    const seen = new Map()
    for (const a of athletes) {
      const key = a.division ? String(a.division.id) : 'none'
      if (!seen.has(key)) seen.set(key, a.division?.heading || 'No weight class')
    }
    return [...seen.entries()]
  }, [athletes])

  // Filtered, still in division order (the API's).
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return athletes.filter(
      (a) =>
        (!term ||
          [a.nameEn, a.nameAr, a.membershipNumber, a.reference].some(
            (v) => v && String(v).toLowerCase().includes(term),
          )) &&
        (!division || (a.division ? String(a.division.id) : 'none') === division) &&
        (!state || a.state === state),
    )
  }, [athletes, search, division, state])

  const pages = Math.max(1, Math.ceil(filtered.length / perPage))
  const currentPage = Math.min(page, pages)

  const groups = useMemo(() => {
    const totals = new Map()
    for (const a of filtered) {
      const key = a.division ? String(a.division.id) : 'none'
      totals.set(key, (totals.get(key) || 0) + 1)
    }
    const byKey = new Map()
    const offset = (currentPage - 1) * perPage
    for (const a of filtered.slice(offset, offset + perPage)) {
      const key = a.division ? String(a.division.id) : 'none'
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          heading: a.division?.heading || 'No weight class',
          gender: a.division?.gender,
          total: totals.get(key),
          rows: [],
        })
      }
      byKey.get(key).rows.push(a)
    }
    return [...byKey.values()]
  }, [filtered, currentPage, perPage])

  const numberInDivision = useMemo(() => {
    const numbers = new Map()
    const seen = new Map()
    for (const a of filtered) {
      const key = a.division ? a.division.id : 'none'
      const next = (seen.get(key) || 0) + 1
      seen.set(key, next)
      numbers.set(a.id, next)
    }
    return numbers
  }, [filtered])

  // Somebody is always on the desk: the first athlete until one is chosen.
  useEffect(() => {
    if (!selectedId && filtered.length) setSelectedId(filtered[0].id)
  }, [filtered, selectedId])

  const selected = athletes.find((a) => a.id === selectedId) || null
  const index = filtered.findIndex((a) => a.id === selectedId)

  function select(id, { scroll = true } = {}) {
    if (id === selectedId || !mayLeave()) return
    setSelectedId(id)
    setViewStep(null)
    const at = filtered.findIndex((a) => a.id === id)
    if (at >= 0) setPage(Math.floor(at / perPage) + 1)
    // Stacked layout: bring the panel into view.
    if (scroll && window.matchMedia('(max-width: 1179px)').matches)
      requestAnimationFrame(() =>
        panelRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        }),
      )
  }

  function resetPage(setter) {
    return (value) => {
      setter(value)
      setPage(1)
    }
  }

  async function saved() {
    dirty.current = false
    await load()
    // Back to wherever the saved record now stands.
    setViewStep(null)
  }

  if (loading) return <Spinner label="Loading tournaments…" />

  const from = filtered.length ? (currentPage - 1) * perPage + 1 : 0
  const to = Math.min(currentPage * perPage, filtered.length)

  return (
    <div className="pt-page rd-page">
      <div className="pt-head">
        <div>
          <nav className="pt-crumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span aria-hidden="true">/</span>
            <Link to="/tournaments">Tournaments</Link>
            <span aria-hidden="true">/</span>
            <strong>Check-in &amp; Medical</strong>
          </nav>
          <h1 className="pt-title">
            <ClipboardCheckIcon className="pt-title__icon" />
            Check-in &amp; Medical Examination
          </h1>
        </div>
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

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>

      {tournaments.length === 0 ? (
        <EmptyState title="No tournaments yet" description="Create a tournament in Tournament Management first." />
      ) : (
        <>
          <Stepper
            athlete={selected}
            shown={selected ? (viewStep ?? (COMPLETE.includes(selected.state) ? null : selected.step)) : null}
            onStep={(n) => mayLeave() && setViewStep(n)}
          />

          <div className="rd-layout">
            <section className="rd-list" aria-label="Athletes">
              <label className="pt-search rd-search">
                <SearchIcon className="rd-search__icon" />
                <input
                  type="search"
                  placeholder="Search by name or ID…"
                  value={search}
                  onChange={(event) => resetPage(setSearch)(event.target.value)}
                  aria-label="Search by athlete name or member ID"
                />
              </label>
              <div className="rd-filters">
                <label className="pt-filter">
                  <span>Division</span>
                  <select value={division} onChange={(event) => resetPage(setDivision)(event.target.value)}>
                    <option value="">All</option>
                    {divisions.map(([key, heading]) => (
                      <option key={key} value={key}>
                        {heading}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="pt-filter">
                  <span>Status</span>
                  <select value={state} onChange={(event) => resetPage(setState)(event.target.value)}>
                    <option value="">All</option>
                    {STATES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {loadingList && !data ? (
                <Spinner label="Loading athletes…" fullWidth={false} />
              ) : athletes.length === 0 ? (
                <EmptyState title="No athletes yet" description="Registered entries appear here." />
              ) : groups.length === 0 ? (
                <EmptyState title="No matching athletes" description="No athlete matches these filters." />
              ) : (
                <>
                  <div className="pt-groups">
                    {groups.map((group) => {
                      const open = !collapsed[group.key]
                      const GenderIcon = group.gender === 'female' ? FemaleIcon : MaleIcon
                      return (
                        <section key={group.key} className={`pt-group${open ? ' pt-group--open' : ''}`}>
                          <button
                            type="button"
                            className="pt-group__head"
                            aria-expanded={open}
                            onClick={() =>
                              setCollapsed((prev) => ({
                                ...prev,
                                [group.key]: open,
                              }))
                            }
                          >
                            <ArrowDownIcon className={`pt-group__chevron${open ? '' : ' pt-group__chevron--closed'}`} />
                            {group.gender && (
                              <span className={`pt-gender pt-gender--${group.gender}`}>
                                <GenderIcon />
                              </span>
                            )}
                            <span className="pt-group__title">{group.heading}</span>
                            <span className="pt-group__count">
                              {group.total} {group.total === 1 ? 'Athlete' : 'Athletes'}
                            </span>
                          </button>
                          {open && (
                            <div className="pt-group__body">
                              <table className="pt-table rd-table">
                                <thead>
                                  <tr>
                                    <th className="pt-table__num">#</th>
                                    <th>Athlete</th>
                                    <th>Club / Training Center</th>
                                    <th className="rd-table__progress">Progress</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.rows.map((a) => (
                                    <tr
                                      key={a.id}
                                      className={`pt-row${a.id === selectedId ? ' pt-row--selected' : ''}`}
                                      onClick={() => select(a.id)}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                          event.preventDefault()
                                          select(a.id)
                                        }
                                      }}
                                      tabIndex={0}
                                      aria-selected={a.id === selectedId}
                                      aria-label={`Open readiness for ${a.nameEn || a.nameAr}`}
                                    >
                                      <td className="pt-table__num" data-label="#">
                                        {numberInDivision.get(a.id)}
                                      </td>
                                      <td data-label="Athlete">
                                        <div className="pt-athlete">
                                          <span className="pt-athlete__name">{a.nameEn || a.nameAr || '—'}</span>
                                          <span className="pt-athlete__id">
                                            {a.membershipNumber || a.reference || '—'}
                                          </span>
                                        </div>
                                      </td>
                                      <td data-label="Club / Training Center">{a.club || '—'}</td>
                                      <td className="rd-table__progress" data-label="Progress">
                                        <ProgressPill athlete={a} />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </section>
                      )
                    })}
                  </div>

                  <div className="pt-pager rd-pager">
                    <span className="pt-pager__range">
                      Showing {from}–{to} of {filtered.length}
                    </span>
                    <label className="rd-pager__size">
                      <span>Rows per page</span>
                      <select
                        className="pt-pager__size"
                        value={perPage}
                        onChange={(event) => resetPage(setPerPage)(Number(event.target.value))}
                      >
                        {PER_PAGE.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="pt-pager__pages">
                      <button
                        type="button"
                        aria-label="Previous page"
                        disabled={currentPage <= 1}
                        onClick={() => setPage(currentPage - 1)}
                      >
                        <ChevronLeftIcon />
                      </button>
                      <button type="button" className="pt-pager__current" aria-current="page">
                        {currentPage}
                      </button>
                      <button
                        type="button"
                        aria-label="Next page"
                        disabled={currentPage >= pages}
                        onClick={() => setPage(currentPage + 1)}
                      >
                        <ChevronRightIcon />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>

            <section className="rd-panel" ref={panelRef} aria-label="Selected athlete">
              {selected ? (
                <AthletePanel
                  key={selected.id}
                  athlete={selected}
                  viewStep={viewStep}
                  onViewStep={(n) => mayLeave() && setViewStep(n)}
                  canRecord={canRecord}
                  canApprove={canApprove}
                  onDirty={(value) => {
                    dirty.current = value
                  }}
                  onSaved={saved}
                />
              ) : (
                <EmptyState title="No athlete selected" description="Choose an athlete from the list." />
              )}

              <div className="rd-nav">
                <button
                  type="button"
                  className="rd-nav__btn"
                  disabled={index <= 0}
                  onClick={() => select(filtered[index - 1].id, { scroll: false })}
                >
                  <ChevronLeftIcon /> Previous Athlete
                </button>
                <button
                  type="button"
                  className="rd-nav__btn rd-nav__btn--primary"
                  disabled={index < 0 || index >= filtered.length - 1}
                  onClick={() => select(filtered[index + 1].id, { scroll: false })}
                >
                  Next Athlete <ChevronRightIcon />
                </button>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}

/* ── the step indicator ─────────────────────────────────────────────────── */

/** Done = passed. A failed step is marked as such; the rest follow the athlete's step. */
function stepStatus(athlete, n) {
  if (!athlete) return 'upcoming'
  // Never arrived: a No Show at check-in blocks every step.
  if (athlete.state === 'dsq' && !athlete.checkIn) return 'failed'
  if (n === 1) return athlete.checkIn ? 'done' : 'current'
  if (n === 2) {
    if (athlete.medical?.result === 'passed') return 'done'
    if (athlete.medical?.result === 'failed') return 'failed'
    return athlete.checkIn ? 'current' : 'upcoming'
  }
  // A failed examination blocks the weigh-in, so it reads as failed too.
  if (athlete.medical?.result === 'failed') return 'failed'
  if (athlete.weighIn?.result === 'passed') return 'done'
  if (athlete.weighIn?.result === 'failed' || athlete.weighIn?.result === 'no_show') return 'failed'
  return athlete.medical?.result === 'passed' ? 'current' : 'upcoming'
}

function Stepper({ athlete, shown, onStep }) {
  return (
    <ol className="rd-steps" aria-label="Readiness steps">
      {STEPS.map((s, i) => {
        const status = stepStatus(athlete, s.n)
        // A step shown red only because an earlier one stopped the athlete has nothing to open.
        const blockedByEarlier =
          athlete &&
          ((athlete.state === 'dsq' && !athlete.checkIn && s.n > 1) ||
            (athlete.medical?.result === 'failed' && s.n === 3))
        const reachable = athlete && status !== 'upcoming' && !blockedByEarlier
        const next = i < STEPS.length - 1 ? stepStatus(athlete, s.n + 1) : null
        return (
          <li
            key={s.n}
            className={`rd-step rd-step--${status}${shown === s.n ? ' rd-step--shown' : ''}${
              status === 'done' && next && next !== 'upcoming' ? ' rd-step--linked' : ''
            }`}
          >
            <button
              type="button"
              className="rd-step__btn"
              disabled={!reachable}
              onClick={() => onStep(s.n)}
              aria-current={shown === s.n ? 'step' : undefined}
            >
              <span className="rd-step__circle">
                {status === 'done' ? <CheckIcon /> : status === 'failed' ? <CloseIcon /> : s.n}
              </span>
              <span className="rd-step__label">{s.label}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

const PROGRESS = {
  checkin: null,
  medical: { label: 'Medical Examination', tone: 'progress' },
  weighin: { label: 'Weigh-in', tone: 'progress' },
  ready: { label: 'Ready', tone: 'ready' },
  qualified: { label: 'Approved', tone: 'good' },
  rejected: { label: 'Rejected', tone: 'bad' },
  failed: { label: 'Failed', tone: 'bad' },
  dsq: { label: 'DSQ', tone: 'bad' },
}

function ProgressPill({ athlete: a }) {
  const p = PROGRESS[a.state]
  if (!p) return <span className="rd-pill">Step 1 / 3</span>
  return <span className={`rd-pill rd-pill--${p.tone}`}>{p.label}</span>
}

/* ── the selected athlete ───────────────────────────────────────────────── */

function AthletePanel({ athlete: a, viewStep, onViewStep, canRecord, canApprove, onDirty, onSaved }) {
  const complete = COMPLETE.includes(a.state)
  const shown = viewStep ?? (complete ? null : a.step)
  const GenderIcon = a.gender === 'female' ? FemaleIcon : MaleIcon
  const [medical, setMedical] = useState(null)
  const [medicalError, setMedicalError] = useState('')
  // After Final Approval the final-approval authority may read the file too.
  const canReadMedical = canRecord || ((Boolean(a.qualified) || Boolean(a.medicalLocked)) && canApprove)

  // Answers and declarations are medical data: the technical team's, as on Participants.
  useEffect(() => {
    if (!complete || !canReadMedical) return undefined
    let cancelled = false
    tournamentsApi
      .entryMedical(a.id)
      .then((file) => !cancelled && setMedical(file))
      .catch((err) => !cancelled && setMedicalError(extractErrorMessage(err, 'Could not load the medical file.')))
    return () => {
      cancelled = true
    }
  }, [complete, canReadMedical, a.id])

  return (
    <>
      <header className="rd-who">
        <span className="rd-who__avatar" aria-hidden="true">
          <UserIcon />
        </span>
        <div className="rd-who__text">
          <strong className="rd-who__name">{a.nameEn || a.nameAr || '—'}</strong>
          <span className="rd-who__id">{a.membershipNumber || a.reference || '—'}</span>
          <span className="rd-who__meta">
            <span>
              <BuildingIcon /> {a.club || '—'}
            </span>
            <span className="rd-who__sep" aria-hidden="true">
              |
            </span>
            <span className={`rd-who__division rd-who__division--${a.gender}`}>
              <GenderIcon /> {a.division?.heading || 'No weight class'}
            </span>
          </span>
        </div>
      </header>

      {a.locked && !complete && (
        <p className="rd-locked">This division’s draw is published — readiness can no longer be changed here.</p>
      )}

      {complete && viewStep && (
        <button type="button" className="rd-back" onClick={() => onViewStep(null)}>
          <ChevronLeftIcon /> Back to Readiness Summary
        </button>
      )}

      {shown === null ? (
        <>
          <Summary athlete={a} canRecord={canReadMedical} medical={medical} medicalError={medicalError} />
          <DrawApproval athlete={a} canApprove={canApprove} onSaved={onSaved} />
        </>
      ) : shown === 1 ? (
        <CheckInStep athlete={a} canRecord={canRecord} onSaved={onSaved} />
      ) : shown === 2 ? (
        <MedicalStep
          key={`${a.medical?.result}-${a.medical?.at}`}
          athlete={a}
          canRecord={canRecord}
          canApprove={canApprove}
          onDirty={onDirty}
          onSaved={onSaved}
        />
      ) : (
        <div className="rd-weighin">
          <WeighInStep
            key={`${a.weighIn?.result}-${a.weighIn?.at}-${a.division?.id}`}
            athlete={a}
            canRecord={canRecord}
            onDirty={onDirty}
            onSaved={onSaved}
          />
          <AcceptedRange athlete={a} />
        </div>
      )}
    </>
  )
}

function StepCard({ icon: Icon, title, description, children }) {
  return (
    <section className="rd-card">
      <header className="rd-card__head">
        <span className="rd-card__icon" aria-hidden="true">
          <Icon />
        </span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <div className="rd-card__body">{children}</div>
    </section>
  )
}

function Recorded({ at, by }) {
  if (!at) return null
  return (
    <span className="rd-recorded">
      Recorded {formatDateTime(at)}
      {by ? ` by ${by}` : ''}
    </span>
  )
}

function useAction(onSaved) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // A ref, not the busy state: a second click can land before React has
  // re-rendered the disabled button, and must not send a second request.
  const inFlight = useRef(false)
  async function run(action, fallback) {
    if (inFlight.current) return false
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      await action()
      await onSaved()
      return true
    } catch (err) {
      setError(extractErrorMessage(err, fallback))
      return false
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  return { busy, error, setError, run }
}

function ErrorLine({ children }) {
  if (!children) return null
  return (
    <p className="pt-error" role="alert">
      {children}
    </p>
  )
}

/* ── Step 1: Check-in ───────────────────────────────────────────────────── */

function CheckInStep({ athlete: a, canRecord, onSaved }) {
  const { busy, error, run } = useAction(onSaved)
  const [confirming, setConfirming] = useState(false)
  const [correcting, setCorrecting] = useState(false)
  const [reason, setReason] = useState('')
  const noShow = a.state === 'dsq' && !a.checkIn
  const blocked = !noShow && (a.status === 'withdrawn' || a.status === 'disqualified')
  const canChange = canRecord && !a.locked

  return (
    <StepCard
      icon={ClipboardCheckIcon}
      title="Check-in (Attendance)"
      description="Record the athlete's attendance for the tournament."
    >
      {a.checkIn ? (
        <div className="rd-result rd-result--good">
          <CheckIcon />
          <div>
            <strong>Checked in</strong>
            <Recorded at={a.checkIn.at} by={a.checkIn.by} />
          </div>
        </div>
      ) : noShow ? (
        <>
          <div className="rd-result rd-result--bad">
            <AlertIcon />
            <div>
              <strong>Disqualified (DSQ) — No Show</strong>
              <span>{a.statusReason || 'T05 — No show at check-in (DSQ).'}</span>
              <span>The athlete cannot continue to the Medical Examination, the Weigh-in or the Draw.</span>
              <Recorded at={a.weighIn?.at} by={a.weighIn?.by} />
            </div>
            {canChange && !correcting && (
              <button type="button" className="pt-btn rd-result__edit" onClick={() => setCorrecting(true)}>
                Correct No Show
              </button>
            )}
          </div>
          {correcting && (
            <div className="rd-panelbox">
              <p>
                Correcting records the athlete as checked in now. The No Show stays in the audit log with your reason.
              </p>
              <label className="pt-field">
                <span>
                  Reason for the correction <em aria-hidden="true">*</em>
                </span>
                <textarea rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
              </label>
              <div className="pt-edit__actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  disabled={busy}
                  onClick={() => {
                    setCorrecting(false)
                    setReason('')
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--small"
                  disabled={busy || !reason.trim()}
                  onClick={() =>
                    run(() => tournamentsApi.checkIn(a.id, reason.trim()), 'Could not correct the No Show.')
                  }
                >
                  {busy ? 'Saving…' : 'Confirm Check-in'}
                </button>
              </div>
            </div>
          )}
        </>
      ) : blocked ? (
        <p className="rd-muted">A withdrawn or disqualified athlete cannot be checked in.</p>
      ) : !canRecord ? (
        <p className="rd-muted">Recording check-in requires the technical team permission.</p>
      ) : confirming ? (
        <div className="rd-panelbox rd-panelbox--danger">
          <p>
            <strong>Record No Show?</strong> The athlete is disqualified (DSQ, code T05) and cannot continue to the
            Medical Examination, the Weigh-in or the Draw.
          </p>
          <div className="pt-edit__actions">
            <button
              type="button"
              className="btn btn--ghost btn--small"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--danger btn--small"
              disabled={busy}
              onClick={() =>
                run(() => tournamentsApi.recordWeighIn(a.id, { noShow: true }), 'Could not record the No Show.')
              }
            >
              {busy ? 'Saving…' : 'Confirm No Show — DSQ'}
            </button>
          </div>
        </div>
      ) : (
        <div className="rd-center">
          <div className="rd-actions">
            <button
              type="button"
              className="rd-cta"
              disabled={busy}
              onClick={() => run(() => tournamentsApi.checkIn(a.id), 'Could not record the check-in.')}
            >
              <CheckIcon /> {busy ? 'Recording…' : 'Record Check-in'}
            </button>
            <button type="button" className="rd-cta rd-cta--danger" disabled={busy} onClick={() => setConfirming(true)}>
              <CloseIcon /> No Show
            </button>
          </div>
        </div>
      )}
      <ErrorLine>{error}</ErrorLine>
    </StepCard>
  )
}

/* ── Step 2: Medical Examination ────────────────────────────────────────── */

const DOC_STATUS = {
  approved: { label: 'Approved', tone: 'good' },
  // On file, uploaded by the athlete, not yet approved by an authorised user.
  uploaded: { label: 'Awaiting approval', tone: 'info' },
  declared: { label: 'Declared', tone: 'good' },
  accepted: { label: 'Accepted', tone: 'good' },
  missing: { label: 'Missing', tone: 'warn' },
}

/**
 * The right-hand side of every document or declaration row: a fixed-width
 * badge area and a fixed-width action area, so badges and buttons line up
 * from row to row whether or not a row has actions or a second badge.
 */
function DocSide({ children, actions = null, noActions = false }) {
  return (
    <span className="rd-doc__side">
      <span className="rd-doc__badges">{children}</span>
      {/* A list where no row has actions does not reserve room for them. */}
      {!noActions && <span className="rd-doc__actions">{actions}</span>}
    </span>
  )
}

function DocPill({ status }) {
  const s = DOC_STATUS[status] || DOC_STATUS.missing
  return <span className={`rd-doc__status rd-doc__status--${s.tone}`}>{s.label}</span>
}

/*
 * Each document has one place. Medical Documents holds the certificate and
 * the tests; the signed forms (guardian consent, the signed non-pregnancy
 * declaration) and the electronic non-pregnancy declaration are Declarations.
 * Only where they are shown changes — the data and its rules do not.
 */
const SIGNED_FORMS = ['guardian_consent', 'pregnancy_declaration']
const isDeclaration = (key) => SIGNED_FORMS.includes(key) || key === 'pregnancy'
const medicalDocuments = (docs) => docs.filter((d) => !isDeclaration(d.key))
const declarationRequirements = (requirements) => requirements.filter((r) => isDeclaration(r.key))

function documentsMeta(a, medical) {
  const docs = medicalDocuments(medical ? medical.documents : a.requirements)
  const onFile = docs.filter((d) => d.status !== 'missing').length
  return `${onFile} of ${docs.length} on file`
}

function questionsMeta(medical) {
  const answered = medical.questions.filter((q) => q.answer !== null && q.answer !== undefined)
  const yes = answered.filter((q) => q.answer === true).length
  return `${answered.length} of ${medical.questions.length} answered${yes ? ` · ${yes} Yes` : ''}`
}

function declarationsMeta(medical) {
  const { ticked, signed } = declarationRows(medical)
  const all = [...ticked, ...signed]
  if (!all.length) return 'None apply'
  return `${all.filter((d) => d.status !== 'missing').length} of ${all.length} complete`
}

function MedicalStep({ athlete: a, canRecord, canApprove, onDirty, onSaved }) {
  const saved = a.medical
  const [editing, setEditing] = useState(!saved)
  const [choice, setChoice] = useState(null)
  // One reason per action: optional notes for a first Passed, the Reason for
  // Failure for any Failed (it also explains a change), and the Reason for
  // Correction only when a saved result is changed to Passed.
  const [text, setText] = useState('')
  const [correction, setCorrection] = useState('')
  // REQ-08 rule 6 — a Passed result while required documents are missing
  // needs the reason, kept apart from a Failed result's reason.
  const [missingReason, setMissingReason] = useState(saved?.missingDocumentsReason || '')
  const [medical, setMedical] = useState(null)
  const [medicalError, setMedicalError] = useState('')
  const [notice, setNotice] = useState('')
  const [questionsDirty, setQuestionsDirty] = useState(false)
  const [declarationsDirty, setDeclarationsDirty] = useState(false)
  const { busy, error, run } = useAction(onSaved)
  // The examination result: the technical team, until readiness is decided.
  const canChange = canRecord && !a.locked
  // The Medical File itself (answers, declarations, documents): the technical
  // team before Final Approval, only the final-approval authority after it,
  // nobody once the draw is published. The API enforces the same rule.
  // Final Approval here or in another tournament holds the shared Medical File.
  const approved = Boolean(a.qualified) || Boolean(a.medicalLocked)
  const canRead = canRecord || (approved && canApprove)
  const canEditFile = (approved ? canApprove : canRecord) && !a.division?.drawPublished

  // The documents come from the athlete's own Medical File.
  useEffect(() => {
    if (!canRead) return
    let cancelled = false
    tournamentsApi
      .entryMedical(a.id)
      .then((file) => !cancelled && setMedical(file))
      .catch((err) => !cancelled && setMedicalError(extractErrorMessage(err, 'Could not load the medical file.')))
    return () => {
      cancelled = true
    }
  }, [canRead, a.id])

  useEffect(() => {
    onDirty(
      questionsDirty ||
        declarationsDirty ||
        (editing &&
          (choice !== null ||
            text.trim() !== '' ||
            correction.trim() !== '' ||
            missingReason.trim() !== (saved?.missingDocumentsReason || ''))),
    )
  }, [editing, choice, text, correction, missingReason, saved, questionsDirty, declarationsDirty, onDirty])

  const incomplete = medical ? !medical.complete : !a.requirementsComplete
  const correcting = Boolean(saved)
  const failing = choice === 'failed'
  // A first Passed saves at once: no notes, no confirmation. Failed always
  // asks for its reason; a correction to Passed asks for the correction's.
  const showText = failing
  const showCorrection = choice === 'passed' && correcting
  // Passed with documents still missing: the reason is asked for, and the
  // result is confirmed rather than saved on the first click. Re-evaluated as
  // documents are uploaded; the server checks the same thing itself.
  const needsMissingReason = choice === 'passed' && incomplete
  const [passing, setPassing] = useState(false)

  function pick(value) {
    setChoice(value)
    setText('')
  }

  function cancelEdit() {
    setEditing(false)
    setChoice(null)
    setText('')
    setCorrection('')
    setMissingReason(saved?.missingDocumentsReason || '')
  }

  async function passNow() {
    setChoice('passed')
    setPassing(true)
    const ok = await run(
      () =>
        tournamentsApi.recordMedical(a.id, {
          result: 'passed',
          note: null,
          documentsMissing: incomplete,
          correctionReason: null,
        }),
      'Could not record the examination result.',
    )
    // On success the athlete moves on to Weigh-in; on failure stay here.
    if (!ok) setChoice(null)
    setPassing(false)
  }

  function submit() {
    return run(
      () =>
        tournamentsApi.recordMedical(a.id, {
          result: choice,
          note: showText ? text.trim() || null : null,
          documentsMissing: incomplete,
          correctionReason: showCorrection ? correction.trim() : null,
          missingDocumentsReason: needsMissingReason ? missingReason.trim() : null,
        }),
      'Could not record the examination result.',
    )
  }

  return (
    <StepCard
      icon={StethoscopeIcon}
      title="Medical Examination"
      description="Review the athlete's documents, health answers and declarations, then record the result."
    >
      <div className="rd-folds">
        <Collapsible icon={FileIcon} title="Medical Documents" meta={documentsMeta(a, medical)}>
          {notice && (
            <p className="pt-success" role="status">
              {notice}
            </p>
          )}
          {approved && canEditFile && (
            <p className="rd-hint">
              This athlete has Final Approval
              {a.qualified ? '' : ' in another active tournament'}: changes to the medical file are made as the
              final-approval authority and recorded as post-approval changes. The examination result and the approval
              stay as they are.
            </p>
          )}
          {!canRead ? (
            <ul className="rd-doclist">
              {medicalDocuments(a.requirements).map((r) => (
                <li key={r.key} className="rd-doc">
                  <div className="rd-doc__row">
                    <FileIcon className="rd-doc__icon" />
                    <span className="rd-doc__name">{r.label}</span>
                    <DocSide noActions>
                      <DocPill status={r.status} />
                    </DocSide>
                  </div>
                </li>
              ))}
            </ul>
          ) : medicalError ? (
            <ErrorLine>{medicalError}</ErrorLine>
          ) : !medical ? (
            <Spinner label="Loading the medical file…" fullWidth={false} />
          ) : (
            <ul className="rd-doclist">
              {medicalDocuments(medical.documents).map((doc) => (
                <DocumentRow
                  key={doc.key}
                  entryId={a.id}
                  doc={doc}
                  canUpload={canEditFile}
                  onUploaded={async (result) => {
                    setMedical(result.medical)
                    setNotice(
                      `${doc.label} ${result.replaced ? 'replaced' : 'uploaded'} and approved.` +
                        (result.supersededPendingReplacement
                          ? ' The athlete’s pending replacement for this document was withdrawn.'
                          : ''),
                    )
                    await onSaved()
                  }}
                />
              ))}
            </ul>
          )}
          <p className="rd-hint">Document approval is not a medical clearance; the result below is.</p>
        </Collapsible>
        <Collapsible icon={HelpIcon} title="Health Questions" meta={medical ? questionsMeta(medical) : null}>
          {!canRead ? (
            <p className="rd-muted">Viewing medical answers requires the technical team permission.</p>
          ) : medicalError ? (
            <ErrorLine>{medicalError}</ErrorLine>
          ) : !medical ? (
            <Spinner label="Loading the medical file…" fullWidth={false} />
          ) : (
            <QuestionsEditor
              entryId={a.id}
              medical={medical}
              canEdit={canEditFile}
              onDirty={setQuestionsDirty}
              onSaved={(fresh) => setMedical(fresh)}
            />
          )}
        </Collapsible>
        <Collapsible icon={ClipboardCheckIcon} title="Declarations" meta={medical ? declarationsMeta(medical) : null}>
          {!canRead ? (
            <DeclarationStatuses athlete={a}>
              Viewing declarations requires the technical team permission.
            </DeclarationStatuses>
          ) : medicalError ? (
            <ErrorLine>{medicalError}</ErrorLine>
          ) : !medical ? (
            <Spinner label="Loading the medical file…" fullWidth={false} />
          ) : (
            <DeclarationsEditor
              entryId={a.id}
              medical={medical}
              canEdit={canEditFile}
              onDirty={setDeclarationsDirty}
              onSaved={(fresh) => setMedical(fresh)}
              onUploaded={async (result) => {
                setMedical(result.medical)
                await onSaved()
              }}
            />
          )}
        </Collapsible>
      </div>

      {saved && !editing ? (
        <div className={`rd-result rd-result--${saved.result === 'passed' ? 'good' : 'bad'}`}>
          {saved.result === 'passed' ? <CheckIcon /> : <CloseIcon />}
          <div>
            <strong>
              {saved.result === 'passed' ? 'Medical Examination — Passed' : 'Medical Examination — Failed'}
            </strong>
            {saved.result === 'failed' && (
              <span>The athlete is not eligible to continue to the Weigh-in or the Draw.</span>
            )}
            {saved.note && (
              <span>
                {saved.result === 'failed' ? 'Reason for Failure' : 'Notes'}: {saved.note}
              </span>
            )}
            {saved.result === 'passed' && saved.missingDocumentsReason && (
              <span>Reason for Missing Documents: {saved.missingDocumentsReason}</span>
            )}
            <Recorded at={saved.at} by={saved.by} />
          </div>
          {canChange && (
            <button type="button" className="pt-btn rd-result__edit" onClick={() => setEditing(true)}>
              Edit result
            </button>
          )}
        </div>
      ) : canChange ? (
        <div className="rd-decide">
          {correcting && (
            <p className="rd-hint">
              Correcting the saved result: <strong>{saved.result === 'passed' ? 'Passed' : 'Failed'}</strong>
              {saved.note ? ` — ${saved.note}` : ''}. The previous and new results, with the reason, are kept in the
              audit log.
            </p>
          )}
          <h3 className="rd-subhead">
            Examination Result <em aria-hidden="true">*</em>
          </h3>
          <div className="rd-choices" role="radiogroup" aria-label="Examination result">
            <button
              type="button"
              role="radio"
              aria-checked={choice === 'passed'}
              className={`rd-choice rd-choice--pass${choice === 'passed' ? ' rd-choice--on' : ''}`}
              disabled={busy}
              aria-busy={passing}
              // Complete documents: a first Passed saves at once, as before.
              // Missing documents: it is chosen, and the reason asked for first.
              onClick={() => (correcting || incomplete ? pick('passed') : passNow())}
            >
              <CheckIcon /> {passing ? 'Saving…' : 'Passed'}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={failing}
              className={`rd-choice rd-choice--fail${failing ? ' rd-choice--on' : ''}`}
              disabled={busy}
              onClick={() => pick('failed')}
            >
              <CloseIcon /> Failed
            </button>
          </div>

          {failing && (
            <p className="rd-warn">
              A Failed result makes the athlete ineligible: they cannot continue to the Weigh-in or the Draw.
            </p>
          )}

          {needsMissingReason && (
            <label className="pt-field">
              <span>
                Reason for Missing Documents <em aria-hidden="true">*</em>
              </span>
              <span className="rd-hint rd-hint--field">
                One or more required documents are missing. A reason is required to pass the medical examination.
              </span>
              <textarea
                rows={2}
                maxLength={500}
                value={missingReason}
                onChange={(event) => setMissingReason(event.target.value)}
                placeholder="Explain why the missing documents have not been uploaded..."
                aria-required="true"
              />
            </label>
          )}

          {showText && (
            <label className="pt-field">
              <span>
                Reason for Failure <em aria-hidden="true">*</em>
              </span>
              <textarea rows={2} maxLength={500} value={text} onChange={(event) => setText(event.target.value)} />
            </label>
          )}

          {showCorrection && (
            <label className="pt-field">
              <span>
                Reason for Correction <em aria-hidden="true">*</em>
              </span>
              <textarea
                rows={2}
                maxLength={500}
                value={correction}
                onChange={(event) => setCorrection(event.target.value)}
                placeholder="Why the saved result is being changed"
              />
            </label>
          )}

          {((choice && (failing || correcting || (choice === 'passed' && !passing))) || correcting) && (
            <div className="pt-edit__actions">
              {correcting && (
                <button type="button" className="btn btn--ghost btn--small" disabled={busy} onClick={cancelEdit}>
                  Cancel
                </button>
              )}
              {choice && (failing || correcting || (choice === 'passed' && !passing)) && (
                <button
                  type="button"
                  className={`btn btn--small ${failing ? 'btn--danger' : 'btn--primary'}`}
                  disabled={
                    busy ||
                    (failing && !text.trim()) ||
                    (showCorrection && !correction.trim()) ||
                    (needsMissingReason && !missingReason.trim())
                  }
                  onClick={submit}
                >
                  {busy ? 'Saving…' : failing ? 'Confirm Failed' : 'Confirm Passed'}
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="rd-muted">
          {a.locked
            ? 'No examination result was changed.'
            : 'Recording the result requires the technical team permission.'}
        </p>
      )}
      <ErrorLine>{error}</ErrorLine>
    </StepCard>
  )
}

function DocumentRow({ entryId, doc, canUpload, onUploaded, layout = 'row' }) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState(null)
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const present = doc.status !== 'missing'

  async function view() {
    setError('')
    try {
      await tournamentsApi.openEntryMedicalDocument(entryId, doc.key)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not open the document.'))
    }
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      const result = await tournamentsApi.uploadEntryMedicalDocument(entryId, doc.key, file, doc.dated ? date : null)
      setOpen(false)
      setFile(null)
      setDate('')
      await onUploaded(result)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not upload the document.'))
    } finally {
      setBusy(false)
    }
  }

  const name = (
    <>
      {doc.label}
      {/* The API sends a date only with a document on file. */}
      {doc.date && <span className="rd-doc__meta"> · {formatDate(doc.date)}</span>}
      {present && !doc.viewable && (
        <span className="rd-doc__meta rd-doc__meta--block">Recorded at the desk; no copy stored</span>
      )}
    </>
  )
  const buttons = (
    <>
      {/* View only when a stored file exists — never for a missing document. */}
      {present && doc.viewable && (
        <button type="button" className="pt-btn" onClick={view}>
          <EyeIcon /> View
        </button>
      )}
      {canUpload && !open && (
        <button type="button" className="pt-btn" onClick={() => setOpen(true)}>
          <UploadIcon /> {present ? 'Replace' : 'Upload'}
        </button>
      )}
    </>
  )
  const below = (
    <>
      {doc.replacementPending && (
        <p className="rd-doc__pending">
          The athlete has a replacement waiting for approval. Uploading here withdraws it.
        </p>
      )}
      {open && (
        <div className="pt-doc__form rd-doc__form">
          <label className="pt-field">
            <span>File (PDF, JPG, PNG or WEBP, up to 1 MB)</span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>
          {doc.dated && (
            <label className="pt-field">
              <span>
                Document date <em aria-hidden="true">*</em>
              </span>
              <input type="date" max={today} value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
          )}
          <div className="pt-edit__actions">
            <button
              type="button"
              className="btn btn--ghost btn--small"
              disabled={busy}
              onClick={() => {
                setOpen(false)
                setError('')
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary btn--small"
              onClick={save}
              disabled={busy || !file || (doc.dated && !date)}
            >
              {busy ? 'Uploading…' : present ? 'Replace & approve' : 'Upload & approve'}
            </button>
          </div>
        </div>
      )}
      <ErrorLine>{error}</ErrorLine>
    </>
  )

  // A signed form among the declarations: the same row as the declarations
  // beside it, the badge in their status column, its actions under its name.
  if (layout === 'status')
    return (
      <li className="rd-statusrow">
        <span className="rd-statusrow__lead">
          <FileIcon />
        </span>
        <div className="rd-statusrow__text">
          {name}
          {(present && doc.viewable) || canUpload ? <span className="rd-statusrow__actions">{buttons}</span> : null}
          {below}
        </div>
        <span className="rd-status-cell">
          <DocPill status={doc.status} />
        </span>
      </li>
    )

  return (
    <li className="rd-doc">
      <div className="rd-doc__row">
        <FileIcon className="rd-doc__icon" />
        <span className="rd-doc__name">{name}</span>
        <span className="rd-doc__side">
          <span className="rd-doc__badges">
            <DocPill status={doc.status} />
            {doc.replacementPending && (
              <span className="rd-doc__status rd-doc__status--pending">Replacement pending</span>
            )}
          </span>
          <span className="rd-doc__actions">{buttons}</span>
        </span>
      </div>
      {below}
    </li>
  )
}

/* ── Step 3: Weigh-in ───────────────────────────────────────────────────── */

const RESULT_LABEL = {
  passed: 'Passed',
  failed: 'Failed',
  no_show: 'No Show (DSQ)',
}

/** 45.51 → "45.51", 45.5 → "45.5", 45 → "45.0", 45.123 → "45.123": never rounds a measured weight. */
function kgText(value) {
  const n = Number(value)
  return Number.isInteger(n) ? n.toFixed(1) : String(n)
}

function classLabel(text) {
  return text ? text.replace('kg', 'KG') : '—'
}

/* The server judges every weight against the registered class's accepted
   range (first class: limit − 2 kg to the limit; later classes: above the
   preceding official limit up to their own; open class: above the preceding
   limit) and sends the verdict; the page only shows it. */
const VERDICT = {
  matches: { label: 'Matches Class', tone: 'good' },
  below_minimum: { label: 'Below Minimum Weight', tone: 'bad' },
  exceeds_class: { label: 'Exceeds Weight Class', tone: 'bad' },
  not_configured: { label: 'Weight Rule Not Configured', tone: 'neutral' },
  // The server sent no verdict (it predates the accepted range): nothing is judged here.
  unavailable: { label: 'Validation Unavailable', tone: 'neutral' },
}

const UNAVAILABLE = 'The weight cannot be validated right now, so Passed cannot be recorded.'

/** A range limit as entered: 45.5 → "45.5", 48 → "48", never rounded. */
function kgLimit(value) {
  return String(Number(value))
}

/** One short, plain line for a division whose class the rules cannot judge. */
function ruleMessage(range) {
  return range?.issue || 'The weight classes for this division are not configured.'
}

/** Why a weight does not match, in words, from the range the server judged it on. */
function mismatchText(verdict, kg, range, weightLabel) {
  const cls = classLabel(weightLabel)
  if (verdict === 'exceeds_class') {
    return `The actual weight of ${kgText(kg)} kg exceeds the ${cls} class limit of ${kgLimit(range?.maxKg)} kg.`
  }
  // The first class has an inclusive minimum; every other class starts above the preceding limit.
  if (range?.lowerBoundInclusive) {
    return `The actual weight of ${kgText(kg)} kg is below the ${kgLimit(range.lowerBoundKg)} kg minimum for the ${cls} class.`
  }
  return `The actual weight of ${kgText(kg)} kg is not above ${kgLimit(range?.lowerBoundKg)} kg, so it is below the ${cls} class.`
}

/**
 * The accepted weight range for the athlete on screen — read-only, from the
 * server, for their own gender, category and registered class.
 */
function AcceptedRange({ athlete: a }) {
  const range = a.division?.weighInRange
  // Every official class has a range now (first, bounded and open); only a
  // division that does not agree with the official list has none.
  const bounded = Boolean(range?.resolved && range?.label)
  // A division without the field: the server did not send a range (it predates it).
  const unavailable = Boolean(a.division) && range === undefined
  return (
    <aside className={`rd-range${bounded ? '' : ' rd-range--neutral'}`} aria-label="Accepted weight range">
      <header className="rd-range__head">
        <InfoIcon />
        <h3>Accepted Weight Range</h3>
      </header>
      {bounded ? (
        <div className="rd-range__value" data-min={range.minKg} data-max={range.maxKg ?? ''}>
          <ScaleIcon />
          <strong>{range.label}</strong>
        </div>
      ) : (
        <div className="rd-range__value rd-range__value--neutral">
          <strong>{unavailable ? 'Validation Unavailable' : 'Not Configured'}</strong>
          <span className="rd-range__note">
            {unavailable ? UNAVAILABLE : a.division ? ruleMessage(range) : 'No registered weight class.'}
          </span>
        </div>
      )}
    </aside>
  )
}

function WeighInStep({ athlete: a, canRecord, onDirty, onSaved }) {
  const saved = a.weighIn?.result ? a.weighIn : null
  const [editing, setEditing] = useState(!saved)
  const [weight, setWeight] = useState(a.weighIn?.actualWeightKg != null ? String(a.weighIn.actualWeightKg) : '')
  const [preview, setPreview] = useState(null)
  const [mode, setMode] = useState(null) // null | 'move' | 'failed'
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState('')
  // Failed carries its own reason, which is also the explanation of a change.
  const [failure, setFailure] = useState('')
  const { busy, error, setError, run } = useAction(onSaved)
  const canChange = canRecord && !a.locked
  const correcting = Boolean(saved)
  const initialWeight = a.weighIn?.actualWeightKg != null ? String(a.weighIn.actualWeightKg) : ''

  const kg = Number(weight)
  const validWeight = weight !== '' && Number.isFinite(kg) && kg > 0 && kg <= 300
  const divisionId = a.division?.id

  // The server compares the weight with the class's accepted range; the page only shows its answer.
  useEffect(() => {
    if (!validWeight || !editing) {
      setPreview(null)
      return undefined
    }
    let cancelled = false
    const timer = setTimeout(() => {
      tournamentsApi
        .previewWeighIn(a.id, kg)
        .then((view) => !cancelled && setPreview(view))
        // The server's English message (the Admin is English-only), e.g. more than two decimal places.
        .catch(
          (err) =>
            !cancelled &&
            setError(err?.response?.data?.messageEn || extractErrorMessage(err, 'Could not check the weight.')),
        )
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [a.id, kg, validWeight, editing, divisionId, setError])

  useEffect(() => {
    onDirty(editing && (weight !== initialWeight || mode !== null || reason.trim() !== '' || failure.trim() !== ''))
  }, [editing, weight, initialWeight, mode, reason, failure, onDirty])

  // matches | below_minimum | exceeds_class | not_configured, for the weight now in the box.
  const current = preview && Number(preview.actualWeightKg) === kg ? preview : null
  // No verdict from the server means no validation: never fall back to a rule of our own.
  const verdict = !current ? null : VERDICT[current.verdict] ? current.verdict : 'unavailable'
  const matches =
    verdict === 'matches' ? true : verdict === 'below_minimum' || verdict === 'exceeds_class' ? false : null
  const moveOptions = (preview?.classes || []).filter((c) => !c.current)
  const reasonMissing = correcting && !reason.trim()

  function record(result) {
    // Passed only on the server's own match; Failed only on its own mismatch.
    if ((result === 'passed' && matches !== true) || (result === 'failed' && matches !== false)) return undefined
    return run(
      () =>
        tournamentsApi.recordWeighIn(a.id, {
          weightKg: kg,
          result,
          noShow: false,
          reason: (result === 'failed' ? failure : reason).trim() || null,
        }),
      'Could not record the weigh-in.',
    )
  }

  async function move() {
    const ok = await run(
      () =>
        tournamentsApi.moveAtWeighIn(a.id, {
          weightKg: kg,
          divisionId: Number(target),
          reason: reason.trim() || null,
        }),
      'Could not change the weight class.',
    )
    if (ok) {
      setMode(null)
      setTarget('')
    }
  }

  if (saved && !editing) {
    const tone = saved.result === 'passed' ? 'good' : 'bad'
    return (
      <StepCard
        icon={ScaleIcon}
        title="Weigh-in"
        description="Record the athlete's actual weight and verify the weight class."
      >
        <div className="rd-weigh">
          <Readout label="Registered Weight Class" value={classLabel(a.division?.weightLabel)} />
          <Readout
            label="Actual Weight"
            value={a.weighIn.actualWeightKg != null ? `${kgText(a.weighIn.actualWeightKg)} kg` : '—'}
          />
          <Readout label="Result" value={RESULT_LABEL[saved.result] || saved.result} tone={tone} />
        </div>
        <div className={`rd-result rd-result--${tone}`}>
          {tone === 'good' ? <CheckIcon /> : <AlertIcon />}
          <div>
            <strong>
              {saved.result === 'passed'
                ? 'Weigh-in Passed'
                : saved.result === 'no_show'
                  ? 'Disqualified (DSQ) — No Show'
                  : 'Weigh-in Failed'}
            </strong>
            {saved.result !== 'passed' && <span>The athlete is excluded from the Draw.</span>}
            {a.statusReason && saved.result !== 'passed' && <span>{a.statusReason}</span>}
            <Recorded at={saved.at} by={saved.by} />
          </div>
          {canChange && (
            <button type="button" className="pt-btn rd-result__edit" onClick={() => setEditing(true)}>
              Edit Weigh-in
            </button>
          )}
        </div>
        <ErrorLine>{error}</ErrorLine>
      </StepCard>
    )
  }

  return (
    <StepCard
      icon={ScaleIcon}
      title="Weigh-in"
      description="Record the athlete's actual weight and verify the weight class."
    >
      <div className="rd-weigh">
        <Readout label="Registered Weight Class" value={classLabel(a.division?.weightLabel)} />
        <label className="rd-readout">
          <span className="rd-readout__label">
            Actual Weight <em aria-hidden="true">*</em>
          </span>
          <span className="rd-weight">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              max="300"
              step="0.01"
              value={weight}
              disabled={!canChange || busy}
              onChange={(event) => {
                setWeight(event.target.value)
                setMode(null)
              }}
              aria-label="Actual weight in kilograms"
            />
            <span className="rd-weight__unit">kg</span>
          </span>
        </label>
        <Readout
          label="Result"
          value={VERDICT[verdict]?.label || '—'}
          tone={VERDICT[verdict]?.tone || null}
          verdict={verdict}
        />
      </div>

      {matches === false && (
        <div className="rd-mismatch" role="alert" id={`rd-mismatch-${a.id}`}>
          <AlertIcon />
          <div>
            <strong>{VERDICT[verdict].label}</strong>
            <span>
              {mismatchText(verdict, kg, preview?.range, a.division?.weightLabel)} Passed is unavailable; move the
              athlete to a class the weight makes, or record Failed. The registered class is not changed automatically.
            </span>
          </div>
        </div>
      )}

      {verdict === 'unavailable' && (
        <div className="rd-unresolved" role="status">
          <InfoIcon />
          <div>
            <strong>Validation Unavailable</strong>
            <span>{UNAVAILABLE}</span>
          </div>
        </div>
      )}

      {verdict === 'not_configured' && (
        <div className="rd-unresolved" role="status">
          <InfoIcon />
          <div>
            <strong>Weight Rule Not Configured</strong>
            <span>{ruleMessage(preview?.range)} The weigh-in cannot be passed or failed until it is corrected.</span>
          </div>
        </div>
      )}

      {canChange && correcting && mode !== 'failed' && (
        <label className="pt-field">
          <span>
            Reason for the correction <em aria-hidden="true">*</em>
          </span>
          <textarea rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
      )}

      {!canChange ? (
        <p className="rd-muted">Recording the weigh-in requires the technical team permission.</p>
      ) : mode === 'move' ? (
        <div className="rd-panelbox">
          <label className="pt-field">
            <span>Move to Another Available Weight Class</span>
            <select value={target} onChange={(event) => setTarget(event.target.value)}>
              <option value="">Choose a weight class…</option>
              {moveOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {classLabel(c.label)}
                  {c.fits ? ` — matches ${kgText(kg)} kg` : ''}
                </option>
              ))}
            </select>
          </label>
          <p className="rd-hint">
            Only {a.division?.categoryLabel} {a.gender === 'female' ? 'Female' : 'Male'} classes this tournament runs,
            with no bout started, are listed. A published draw is not changed by a move. Category and gender do not change; the actual weight is kept.
          </p>
          <div className="pt-edit__actions">
            <button type="button" className="btn btn--ghost btn--small" disabled={busy} onClick={() => setMode(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary btn--small"
              disabled={busy || !target || reasonMissing}
              onClick={move}
            >
              {busy ? 'Saving…' : 'Confirm Weight Class Change'}
            </button>
          </div>
        </div>
      ) : mode === 'failed' ? (
        <div className="rd-panelbox rd-panelbox--danger">
          <p>
            <strong>Record Failed?</strong> The weight does not match the registered class. Failed makes the athlete
            ineligible for the Draw; the measured weight is kept.
          </p>
          <label className="pt-field">
            <span>
              Reason for Failure <em aria-hidden="true">*</em>
            </span>
            <textarea rows={2} maxLength={500} value={failure} onChange={(event) => setFailure(event.target.value)} />
          </label>
          <div className="pt-edit__actions">
            <button type="button" className="btn btn--ghost btn--small" disabled={busy} onClick={() => setMode(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--danger btn--small"
              disabled={busy || !validWeight || matches !== false || !failure.trim()}
              onClick={() => record('failed')}
            >
              {busy ? 'Saving…' : 'Confirm Failed'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="rd-center">
            {matches === false ? (
              <div className="rd-actions">
                {/* Pass stays visible but disabled outside the accepted range; the alert above says why. */}
                <button
                  type="button"
                  className="rd-cta"
                  disabled
                  aria-describedby={`rd-mismatch-${a.id}`}
                  title={`Outside the accepted ${preview?.range?.label || 'range'} for ${classLabel(a.division?.weightLabel)}`}
                  data-testid="weighin-pass-disabled"
                >
                  <CheckIcon /> Record Weigh-in (Pass)
                </button>
                {moveOptions.length > 0 && (
                  <button
                    type="button"
                    className="rd-cta rd-cta--outline"
                    disabled={busy || reasonMissing}
                    onClick={() => setMode('move')}
                  >
                    Move to Another Available Weight Class
                  </button>
                )}
                <button
                  type="button"
                  className="rd-cta rd-cta--danger"
                  disabled={busy}
                  onClick={() => setMode('failed')}
                >
                  <CloseIcon /> Failed
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="rd-cta"
                disabled={busy || matches !== true || reasonMissing}
                onClick={() => record('passed')}
              >
                <CheckIcon /> {busy ? 'Recording…' : 'Record Weigh-in'}
              </button>
            )}
          </div>
          {matches === false && moveOptions.length === 0 && (
            <p className="rd-hint rd-hint--center">
              This tournament runs no other {a.division?.categoryLabel} {a.gender === 'female' ? 'Female' : 'Male'}{' '}
              weight class that is open for changes, so the athlete cannot be moved.
            </p>
          )}
          {/* No Show is recorded at Check-in only; an older weigh-in No Show
              still shows as such and can be corrected from here. */}
          {correcting && (
            <div className="rd-noshow">
              <button
                type="button"
                className="btn btn--ghost btn--small"
                disabled={busy}
                onClick={() => {
                  setEditing(false)
                  setReason('')
                  setWeight(initialWeight)
                }}
              >
                Cancel editing
              </button>
            </div>
          )}
        </>
      )}
      <ErrorLine>{error}</ErrorLine>
    </StepCard>
  )
}

function Readout({ label, value, tone, verdict }) {
  return (
    <div className="rd-readout">
      <span className="rd-readout__label">{label}</span>
      <span
        className={`rd-readout__value${tone ? ` rd-readout__value--${tone}` : ''}`}
        data-verdict={verdict || undefined}
      >
        {tone === 'good' && <CheckIcon />}
        {tone === 'bad' && <AlertIcon />}
        {tone === 'neutral' && <InfoIcon />}
        {value}
      </span>
    </div>
  )
}

/* ── after all three: the summary, its tabs, and Draw Approval ─────────── */

function Summary({ athlete: a, canRecord, medical, medicalError }) {
  const moves = a.weighIn?.moves || []
  // A server that sends no verdict has not validated the recorded weight.
  const recordedVerdict =
    a.weighIn?.actualWeightKg == null ? null : VERDICT[a.weighIn?.verdict] ? a.weighIn.verdict : 'unavailable'
  return (
    <section className="rd-card">
      <header className="rd-card__head">
        <span className="rd-card__icon" aria-hidden="true">
          <CheckIcon />
        </span>
        <div>
          <h2>Readiness Summary</h2>
          <p>Check-in, Medical Examination and Weigh-in are complete. Review everything before the decision below.</p>
        </div>
      </header>
      <div className="rd-card__body rd-card__body--flush">
        <div className="rd-folds">
          <Collapsible icon={ClipboardCheckIcon} title="Check-in" meta="Checked in" defaultOpen={false}>
            <dl className="rd-facts">
              <div>
                <dt>Attendance</dt>
                <dd className="rd-ok">Checked in</dd>
              </div>
              <div>
                <dt>Recorded</dt>
                <dd>
                  {formatDateTime(a.checkIn?.at)} by {a.checkIn?.by}
                </dd>
              </div>
            </dl>
          </Collapsible>

          <Collapsible icon={StethoscopeIcon} title="Medical Examination" meta="Passed">
            <dl className="rd-facts">
              <div>
                <dt>Result</dt>
                <dd className="rd-ok">Passed</dd>
              </div>
              <div>
                <dt>Recorded</dt>
                <dd>
                  {formatDateTime(a.medical?.at)} by {a.medical?.by}
                </dd>
              </div>
              <div className="rd-facts__full">
                <dt>Notes</dt>
                <dd>{a.medical?.note || 'No notes recorded.'}</dd>
              </div>
              {a.medical?.missingDocumentsReason && (
                <div className="rd-facts__full">
                  <dt>Reason for Missing Documents</dt>
                  <dd>{a.medical.missingDocumentsReason}</dd>
                </div>
              )}
            </dl>
            <h3 className="rd-subhead rd-subhead--section">Medical Documents</h3>
            {canRecord && medical ? (
              <ul className="rd-doclist">
                {medicalDocuments(medical.documents).map((doc) => (
                  <DocumentRow key={doc.key} entryId={a.id} doc={doc} canUpload={false} onUploaded={() => {}} />
                ))}
              </ul>
            ) : (
              <ul className="rd-doclist">
                {medicalDocuments(a.requirements).map((r) => (
                  <li key={r.key} className="rd-doc">
                    <div className="rd-doc__row">
                      <FileIcon className="rd-doc__icon" />
                      <span className="rd-doc__name">{r.label}</span>
                      <DocSide noActions>
                        <DocPill status={r.status} />
                      </DocSide>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {!canRecord && (
              <>
                <h3 className="rd-subhead rd-subhead--section">Declarations</h3>
                {/* MedicalData below says why the rest is not shown. */}
                <DeclarationStatuses athlete={a} />
              </>
            )}
            <MedicalData canRecord={canRecord} medical={medical} error={medicalError} inline>
              {(file) => (
                <>
                  <h3 className="rd-subhead rd-subhead--section">Health Questions</h3>
                  <QuestionsList medical={file} />
                  <h3 className="rd-subhead rd-subhead--section">Declarations</h3>
                  <DeclarationsList entryId={a.id} medical={file} />
                </>
              )}
            </MedicalData>
          </Collapsible>

          <Collapsible icon={ScaleIcon} title="Weigh-in" meta="Passed">
            <dl className="rd-facts">
              <div>
                <dt>Registered Weight Class</dt>
                <dd>{a.division?.heading || '—'}</dd>
              </div>
              <div>
                <dt>Actual Weight</dt>
                <dd>{a.weighIn?.actualWeightKg != null ? `${kgText(a.weighIn.actualWeightKg)} kg` : '—'}</dd>
              </div>
              <div>
                <dt>Match</dt>
                <dd
                  className={
                    VERDICT[recordedVerdict]?.tone === 'good'
                      ? 'rd-ok'
                      : VERDICT[recordedVerdict]?.tone === 'bad'
                        ? 'rd-bad'
                        : ''
                  }
                >
                  {VERDICT[recordedVerdict]?.label || '—'}
                  {a.division?.weighInRange?.label && ` (accepted ${a.division.weighInRange.label})`}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                {/* A Passed recorded for another class (or under an earlier rule) does not hold for the draw. */}
                {a.staleWeighIn ? (
                  <dd className="rd-bad" data-testid="stale-weigh-in">
                    Passed — not valid for the current class: {a.staleWeighIn}. Not eligible for the draw.
                  </dd>
                ) : (
                  <dd className="rd-ok">Passed</dd>
                )}
              </div>
              <div>
                <dt>Recorded</dt>
                <dd>
                  {formatDateTime(a.weighIn?.at)} by {a.weighIn?.by}
                </dd>
              </div>
              <div>
                <dt>Class moves</dt>
                <dd>
                  {moves.length === 0 ? (
                    'None'
                  ) : (
                    <ul className="rd-moves">
                      {moves.map((m, i) => (
                        <li key={i}>
                          {m.from} → {m.to}
                          <span className="rd-recorded">
                            {' '}
                            {formatDateTime(m.at)} by {m.by}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
            </dl>
          </Collapsible>
        </div>
      </div>
    </section>
  )
}

/** Questions and declarations need the technical team's permission, as on Participants. */
function MedicalData({ canRecord, medical, error, inline = false, children }) {
  const wrap = (content) =>
    inline ? (
      content
    ) : (
      <section className="rd-card">
        <div className="rd-card__body">{content}</div>
      </section>
    )
  if (!canRecord)
    return wrap(
      <p className="rd-muted">
        Health answers, declarations and document files need the technical team permission (medical data).
      </p>,
    )
  if (error) return wrap(<ErrorLine>{error}</ErrorLine>)
  if (!medical) return <Spinner label="Loading the medical file…" fullWidth={false} />
  return children(medical)
}

function Answer({ value }) {
  if (value === true) return <span className="rd-answer rd-answer--yes">Yes</span>
  if (value === false) return <span className="rd-answer rd-answer--no">No</span>
  return <span className="rd-answer">Not answered</span>
}

/** The eight health questions with the athlete's answers, and any medication details. */
function QuestionsList({ medical }) {
  return (
    <>
      <ol className="rd-statuslist">
        {medical.questions.map((q, i) => (
          <StatusRow key={q.key} lead={i + 1} status={<Answer value={q.answer} />}>
            {q.label}
          </StatusRow>
        ))}
      </ol>
      {medical.medications && (
        <p className="rd-qa__extra">
          <strong>Medications / details:</strong> {medical.medications}
        </p>
      )}
    </>
  )
}

/**
 * The declarations that apply at the athlete's competition age and gender:
 * the adult tick-box declarations and the electronic non-pregnancy one, and
 * under 18 the signed forms (guardian consent, and the signed non-pregnancy
 * declaration for girls) — View only; uploading stays with the documents.
 */
function declarationRows(medical) {
  const signed = medical.documents.filter((d) => d.key === 'guardian_consent' || d.key === 'pregnancy_declaration')
  const ticked = [
    ...(medical.declarations || []).map((d) => ({
      key: d.key,
      label: d.label,
      status: d.accepted ? 'accepted' : 'missing',
    })),
    ...(medical.electronicPregnancyDeclaration
      ? [
          {
            key: 'pregnancy-electronic',
            label: 'Non-Pregnancy Declaration (electronic)',
            status: medical.electronicPregnancyDeclaration.done ? 'declared' : 'missing',
          },
        ]
      : []),
  ]
  return { ticked, signed }
}

function DeclarationsList({ entryId, medical }) {
  const { ticked, signed } = declarationRows(medical)

  if (ticked.length === 0 && signed.length === 0)
    return <p className="rd-muted">No declarations apply to this athlete.</p>

  return (
    <>
      <ul className="rd-statuslist">
        {ticked.map((r) => (
          <StatusRow key={r.key} lead={<CheckIcon />} status={<DocPill status={r.status} />}>
            {r.label}
          </StatusRow>
        ))}
        {signed.map((d) => (
          <DocumentRow
            key={d.key}
            layout="status"
            entryId={entryId}
            doc={{ ...d, label: signedLabel(d.label) }}
            canUpload={false}
            onUploaded={() => {}}
          />
        ))}
      </ul>
    </>
  )
}

const ANSWERS = [
  { value: true, label: 'Yes' },
  { value: false, label: 'No' },
  { value: null, label: 'Not answered' },
]

/**
 * The health questions at the examination desk. Read first; Edit opens
 * Yes / No / Not answered for each, and the medication details when the
 * medication answer is Yes. Saves to the athlete's own Medical File; the
 * examination result is not touched.
 */
function QuestionsEditor({ entryId, medical, canEdit, onDirty, onSaved }) {
  const [editing, setEditing] = useState(false)
  const initial = useMemo(() => Object.fromEntries(medical.questions.map((q) => [q.key, q.answer ?? null])), [medical])
  const [draft, setDraft] = useState(initial)
  const [medications, setMedications] = useState(medical.medications || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const changed =
    editing &&
    (medical.questions.some((q) => draft[q.key] !== (q.answer ?? null)) ||
      (draft.medication_now === true && medications.trim() !== (medical.medications || '')))

  useEffect(() => {
    onDirty(changed)
    return () => onDirty(false)
  }, [changed, onDirty])

  function start() {
    setDraft(initial)
    setMedications(medical.medications || '')
    setNotice('')
    setEditing(true)
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      const fresh = await tournamentsApi.updateEntryMedicalAnswers(entryId, {
        healthAnswers: draft,
        medications: draft.medication_now === true ? medications.trim() : '',
      })
      setEditing(false)
      setNotice('Health answers saved to the athlete’s Medical File.')
      onSaved(fresh)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not save the answers.'))
    } finally {
      setBusy(false)
    }
  }

  if (!editing)
    return (
      <>
        {notice && (
          <p className="pt-success" role="status">
            {notice}
          </p>
        )}
        <QuestionsList medical={medical} />
        {canEdit && (
          <div className="rd-fold__actions">
            <button type="button" className="pt-btn" onClick={start}>
              Edit answers
            </button>
          </div>
        )}
      </>
    )

  return (
    <div className="rd-editor">
      <ol className="rd-statuslist rd-statuslist--editing">
        {medical.questions.map((q, i) => (
          <StatusRow
            key={q.key}
            lead={i + 1}
            status={
              <span className="rd-seg" role="radiogroup" aria-label={q.label}>
                {ANSWERS.map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    role="radio"
                    aria-checked={draft[q.key] === o.value}
                    className={`rd-seg__opt${draft[q.key] === o.value ? ' rd-seg__opt--on' : ''}`}
                    onClick={() => setDraft((prev) => ({ ...prev, [q.key]: o.value }))}
                  >
                    {o.label}
                  </button>
                ))}
              </span>
            }
          >
            {q.label}
          </StatusRow>
        ))}
      </ol>
      {draft.medication_now === true && (
        <label className="pt-field">
          <span>Medications / details</span>
          <textarea
            rows={2}
            maxLength={500}
            value={medications}
            onChange={(event) => setMedications(event.target.value)}
          />
        </label>
      )}
      <div className="pt-edit__actions">
        <button type="button" className="btn btn--ghost btn--small" disabled={busy} onClick={() => setEditing(false)}>
          Cancel
        </button>
        <button type="button" className="btn btn--primary btn--small" disabled={busy || !changed} onClick={save}>
          {busy ? 'Saving…' : 'Save answers'}
        </button>
      </div>
      <ErrorLine>{error}</ErrorLine>
    </div>
  )
}

/**
 * The declarations at the examination desk. Electronic declarations can be
 * changed and saved to the Medical File; signed forms are viewed, uploaded or
 * replaced through the secure document upload — never edited.
 */
function DeclarationsEditor({ entryId, medical, canEdit, onDirty, onSaved, onUploaded }) {
  const { ticked, signed } = declarationRows(medical)
  const [editing, setEditing] = useState(false)
  const initial = useMemo(
    () => ({
      declarations: Object.fromEntries((medical.declarations || []).map((d) => [d.key, d.accepted])),
      pregnancy: medical.electronicPregnancyDeclaration ? medical.electronicPregnancyDeclaration.done : null,
    }),
    [medical],
  )
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const changed =
    editing &&
    (Object.keys(initial.declarations).some((k) => draft.declarations[k] !== initial.declarations[k]) ||
      draft.pregnancy !== initial.pregnancy)

  useEffect(() => {
    onDirty(changed)
    return () => onDirty(false)
  }, [changed, onDirty])

  async function save() {
    setBusy(true)
    setError('')
    try {
      const fresh = await tournamentsApi.updateEntryMedicalAnswers(entryId, {
        declarations: Object.keys(draft.declarations).length ? draft.declarations : null,
        notPregnantDeclared: medical.electronicPregnancyDeclaration ? draft.pregnancy : null,
      })
      setEditing(false)
      setNotice('Declarations saved to the athlete’s Medical File.')
      onSaved(fresh)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not save the declarations.'))
    } finally {
      setBusy(false)
    }
  }

  function toggle(key, value) {
    setDraft((prev) =>
      key === 'pregnancy-electronic'
        ? { ...prev, pregnancy: value }
        : { ...prev, declarations: { ...prev.declarations, [key]: value } },
    )
  }

  if (ticked.length === 0 && signed.length === 0)
    return <p className="rd-muted">No declarations apply to this athlete.</p>

  return (
    <>
      {notice && (
        <p className="pt-success" role="status">
          {notice}
        </p>
      )}
      <ul className={`rd-statuslist${editing ? ' rd-statuslist--editing' : ''}`}>
        {ticked.map((r) => {
          const value = r.key === 'pregnancy-electronic' ? draft.pregnancy : draft.declarations[r.key]
          const yes = r.key === 'pregnancy-electronic' ? 'Declared' : 'Accepted'
          return (
            <StatusRow
              key={r.key}
              lead={<CheckIcon />}
              status={
                editing ? (
                  <span className="rd-seg rd-seg--wide" role="radiogroup" aria-label={r.label}>
                    {[
                      { v: true, l: yes },
                      { v: false, l: 'Not given' },
                    ].map((o) => (
                      <button
                        key={o.l}
                        type="button"
                        role="radio"
                        aria-checked={value === o.v}
                        className={`rd-seg__opt${value === o.v ? ' rd-seg__opt--on' : ''}`}
                        onClick={() => toggle(r.key, o.v)}
                      >
                        {o.l}
                      </button>
                    ))}
                  </span>
                ) : (
                  <DocPill status={r.status} />
                )
              }
            >
              {r.label}
            </StatusRow>
          )
        })}
        {signed.map((d) => (
          <DocumentRow
            key={d.key}
            layout="status"
            entryId={entryId}
            doc={{ ...d, label: signedLabel(d.label) }}
            canUpload={canEdit}
            onUploaded={onUploaded}
          />
        ))}
      </ul>
      {canEdit && ticked.length > 0 && (
        <div className="rd-fold__actions">
          {editing ? (
            <>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button type="button" className="btn btn--primary btn--small" disabled={busy || !changed} onClick={save}>
                {busy ? 'Saving…' : 'Save declarations'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="pt-btn"
              onClick={() => {
                setDraft(initial)
                setNotice('')
                setEditing(true)
              }}
            >
              Edit declarations
            </button>
          )}
        </div>
      )}
      <ErrorLine>{error}</ErrorLine>
    </>
  )
}

/**
 * One row of Health Questions or Declarations: a lead (number or icon), the
 * text, and the status in one fixed column. Both sections use this row and
 * the .rd-statuslist grid, so their badges share the same edges.
 */
function StatusRow({ lead, status, children }) {
  return (
    <li className="rd-statusrow">
      <span className="rd-statusrow__lead">{lead}</span>
      <div className="rd-statusrow__text">{children}</div>
      <span className="rd-status-cell">{status}</span>
    </li>
  )
}

const signedLabel = (label) => (/signed/i.test(label) ? label : `${label} (signed form)`)

/** Declaration statuses only, for a viewer without access to the medical file itself. */
function DeclarationStatuses({ athlete: a, children }) {
  const rows = declarationRequirements(a.requirements)
  return (
    <>
      {rows.length > 0 && (
        <ul className="rd-statuslist">
          {rows.map((r) => (
            <StatusRow key={r.key} lead={<CheckIcon />} status={<DocPill status={r.status} />}>
              {r.label}
            </StatusRow>
          ))}
        </ul>
      )}
      {children && <p className="rd-muted">{children}</p>}
    </>
  )
}

/** A section of the examination that opens and closes in place. */
function Collapsible({ icon: Icon, title, meta, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={`rd-fold${open ? ' rd-fold--open' : ''}`}>
      <button type="button" className="rd-fold__head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon className="rd-fold__icon" />
        <span className="rd-fold__title">{title}</span>
        {meta && <span className="rd-fold__meta">{meta}</span>}
        <ArrowDownIcon className={`rd-fold__chevron${open ? '' : ' rd-fold__chevron--closed'}`} />
      </button>
      {open && <div className="rd-fold__body">{children}</div>}
    </section>
  )
}

/**
 * The readiness approver's decision, below the review: Approve releases the
 * athlete to the draw, Reject (with its reason) keeps them out. Until the
 * division's draw is published the decision can be changed — Rejected to
 * Approved with a reason for the correction, Approved to Rejected with the
 * rejection reason. The server checks all of it; viewers without the
 * permission see the status only.
 */
/** The readiness steps not yet passed, in order — what stands between the athlete and Final Draw Approval. */
function approvalMissing(a) {
  const missing = []
  if (!a.checkIn?.at) missing.push('Check-in')
  if (a.medical?.result !== 'passed')
    missing.push(a.medical?.result === 'failed' ? 'Medical Examination (Failed)' : 'Medical Examination')
  if (a.weighIn?.result !== 'passed')
    missing.push(
      a.weighIn?.result === 'failed'
        ? 'Weigh-in (Failed)'
        : a.weighIn?.result === 'no_show'
          ? 'Weigh-in (No Show)'
          : `Weigh-in Pass for ${classLabel(a.division?.weightLabel)}`,
    )
  return missing
}

/** The missing requirements as one short line: "Weigh-in Pass", "Check-in and Medical Examination Pass", … */
function requirementList(a) {
  const items = []
  if (!a.checkIn?.at) items.push('Check-in')
  if (a.medical?.result !== 'passed') items.push('Medical Examination Pass')
  if (a.weighIn?.result !== 'passed') items.push('Weigh-in Pass')
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0] || ''
}

function DrawApproval({ athlete: a, canApprove, onSaved }) {
  const [mode, setMode] = useState(null) // null | 'reject' | 'approve-change'
  const [reason, setReason] = useState('')
  const [redraw, setRedraw] = useState(false)
  const { busy, error, run } = useAction(onSaved)
  const state = a.state
  const published = Boolean(a.division?.drawPublished)
  const mayAct = canApprove && !published
  // A Passed weigh-in recorded for another class (or under a replaced rule) cannot be approved; the server refuses it too.
  const stale = state === 'ready' && Boolean(a.staleWeighIn)
  const missing = approvalMissing(a)

  function close() {
    setMode(null)
    setReason('')
  }

  async function confirm() {
    if (mode === 'reject') {
      let inDraw = false
      const ok = await run(async () => {
        const body = await tournamentsApi.rejectReadiness(a.id, reason.trim())
        inDraw = Boolean(body?.inUnpublishedDraw)
      }, 'Could not reject the athlete.')
      if (ok) {
        setRedraw(inDraw)
        close()
      }
    } else {
      const ok = await run(() => tournamentsApi.approveReadiness(a.id, reason.trim()), 'Could not change the decision.')
      if (ok) close()
    }
  }

  return (
    <section className="rd-approval" aria-label="Draw Approval">
      <header className="rd-approval__head">
        <span className="rd-approval__icon" aria-hidden="true">
          <DrawIcon />
        </span>
        <div className="rd-approval__title">
          <h2>Draw Approval</h2>
        </div>
        {state === 'qualified' && <span className="rd-pill rd-pill--good">Approved</span>}
        {state === 'rejected' && <span className="rd-pill rd-pill--bad">Rejected</span>}
        {mayAct && mode === null && (
          <div className="rd-approval__actions">
            {state === 'ready' && (
              <button
                type="button"
                className="rd-approve"
                disabled={busy || stale}
                title={stale ? 'The weigh-in does not hold for the current class' : undefined}
                onClick={() => run(() => tournamentsApi.approveReadiness(a.id), 'Could not approve the athlete.')}
              >
                <CheckIcon /> {busy ? 'Approving…' : 'Approve for Draw'}
              </button>
            )}
            {state === 'rejected' && (
              <button type="button" className="rd-approve" disabled={busy} onClick={() => setMode('approve-change')}>
                <CheckIcon /> Change to Approved
              </button>
            )}
            {(state === 'ready' || state === 'qualified') && (
              <button type="button" className="rd-reject" disabled={busy} onClick={() => setMode('reject')}>
                <CloseIcon /> {state === 'qualified' ? 'Change to Rejected' : 'Reject'}
              </button>
            )}
          </div>
        )}
      </header>

      <div className="rd-approval__body">
        {state === 'qualified' && (
          <div className="rd-approval__status">
            <span>Approved for the Draw.</span>
            <Recorded at={a.qualified?.at} by={a.qualified?.by} />
          </div>
        )}
        {state === 'rejected' && (
          <div className="rd-approval__status">
            <span>
              <strong>Reason for Rejection:</strong> {a.rejected?.reason}
            </span>
            <Recorded at={a.rejected?.at} by={a.rejected?.by} />
            <span className="rd-hint">The athlete is not eligible for the Draw.</span>
          </div>
        )}
        {redraw && state === 'rejected' && (
          <p className="rd-warn">
            This athlete was placed in the division’s unpublished draw. Redraw the division before publishing it.
          </p>
        )}
        {published && <p className="rd-approval__status">Draw published — the decision is locked.</p>}
        {state === 'ready' && !canApprove && !published && (
          <p className="rd-approval__status">Awaiting approval by an authorized user.</p>
        )}
        {state === 'ready' && mayAct && mode === null && !stale && (
          <p className="rd-approval__status">Ready for approval.</p>
        )}
        {stale && (
          <p className="rd-warn" data-testid="approval-gate">
            Draw Approval unavailable — Weigh-in Pass for the current class required.
          </p>
        )}
        {missing.length > 0 && !['qualified', 'rejected'].includes(state) && (
          <p className="rd-approval__status rd-approval__gate" data-testid="approval-gate">
            Draw Approval unavailable — {requirementList(a)} required.
          </p>
        )}
        {mode && (
          <div className="rd-approval__reject">
            <label className="pt-field">
              <span>
                {mode === 'reject' ? 'Reason for Rejection' : 'Reason for Correction'} <em aria-hidden="true">*</em>
              </span>
              <span className="rd-counted">
                <textarea
                  rows={2}
                  maxLength={500}
                  value={reason}
                  placeholder={
                    mode === 'reject'
                      ? 'Enter the reason for rejection…'
                      : 'Why the Rejected decision is being changed…'
                  }
                  onChange={(event) => setReason(event.target.value)}
                />
                <span className="rd-counted__n">{reason.length} / 500</span>
              </span>
            </label>
            <div className="pt-edit__actions">
              <button type="button" className="btn btn--ghost btn--small" disabled={busy} onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                className={`btn btn--small ${mode === 'reject' ? 'btn--danger' : 'btn--primary'}`}
                disabled={busy || !reason.trim()}
                onClick={confirm}
              >
                {busy ? 'Saving…' : mode === 'reject' ? 'Confirm Rejection' : 'Confirm Approval'}
              </button>
            </div>
          </div>
        )}
        <ErrorLine>{error}</ErrorLine>
      </div>
    </section>
  )
}

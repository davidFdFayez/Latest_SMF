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
  CloseIcon,
  DownloadIcon,
  EditIcon,
  EyeIcon,
  FemaleIcon,
  FileIcon,
  MaleIcon,
  SearchIcon,
  UploadIcon,
  UserIcon,
  UsersIcon,
} from '../components/Icons'

/**
 * Participants — who is registered in a tournament, by division, with the
 * selected athlete's registration beside the list.
 *
 * A split view, not a drawer: the list and the details are both part of the
 * page and both stay usable, so moving from one athlete to the next is one
 * click. On narrow screens the details take the list's place, with a Back
 * action that returns to the list where it was.
 *
 * The API returns the entries already in division order (Female before Male,
 * categories in the official order, weights lightest first — the order the
 * tournament set-up uses), so grouping here only has to keep that order.
 *
 * "Incomplete" is tracking only: it counts what the athlete's Medical File
 * still owes for this tournament and never changes the entry.
 */

const PER_PAGE = [10, 25, 50, 100]
const NARROW = '(max-width: 1179px)'

export default function TournamentParticipants() {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('tournament.entries', 'tournament.technical')
  // Medical documents and answers are the technical team's (the API enforces it).
  const canMedical = hasPermission('tournament.technical')
  // After Final Approval the medical file is the final-approval authority's (the API enforces it).
  const canDirector = hasPermission('tournament.director')
  const [searchParams, setSearchParams] = useSearchParams()

  const [tournaments, setTournaments] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingList, setLoadingList] = useState(false)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)

  const [search, setSearch] = useState('')
  const [club, setClub] = useState('')
  const [requirements, setRequirements] = useState('')
  const [collapsed, setCollapsed] = useState({})
  const [selectedId, setSelectedId] = useState(0)
  const [tab, setTab] = useState('registration')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const listScroll = useRef(0)

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
    setData(await tournamentsApi.participants(tournamentId))
  }, [tournamentId])

  useEffect(() => {
    let cancelled = false
    setLoadingList(true)
    setError('')
    load()
      .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Could not load the participants.')))
      .finally(() => !cancelled && setLoadingList(false))
    return () => {
      cancelled = true
    }
  }, [load])

  function chooseTournament(value) {
    setSearchParams({ tournament: value })
    setData(null)
    setClub('')
    setCollapsed({})
    setSelectedId(0)
    setPage(1)
  }

  const participants = useMemo(() => data?.participants ?? [], [data])

  const clubs = useMemo(() => {
    const seen = new Map()
    for (const p of participants) {
      if (p.club && !seen.has(p.club.toLowerCase())) seen.set(p.club.toLowerCase(), p.club)
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b))
  }, [participants])

  const kpis = useMemo(
    () => ({
      athletes: participants.length,
      clubs: clubs.length,
      incomplete: participants.filter((p) => !p.requirementsComplete).length,
    }),
    [participants, clubs],
  )

  // Filtered, still in division order.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return participants.filter(
      (p) =>
        (!term ||
          [p.nameEn, p.nameAr, p.membershipNumber, p.reference].some((v) => v && String(v).toLowerCase().includes(term))) &&
        (!club || (p.club || '').toLowerCase() === club.toLowerCase()) &&
        (!requirements || (requirements === 'complete') === p.requirementsComplete),
    )
  }, [participants, search, club, requirements])

  const pages = Math.max(1, Math.ceil(filtered.length / perPage))
  const currentPage = Math.min(page, pages)

  // The page's rows, grouped; each header counts its whole (filtered) division.
  const groups = useMemo(() => {
    const totals = new Map()
    for (const p of filtered) {
      const key = p.division ? String(p.division.id) : 'none'
      totals.set(key, (totals.get(key) || 0) + 1)
    }
    const byKey = new Map()
    const offset = (currentPage - 1) * perPage
    for (const p of filtered.slice(offset, offset + perPage)) {
      const key = p.division ? String(p.division.id) : 'none'
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          heading: p.division?.heading || 'No weight class',
          gender: p.division?.gender,
          total: totals.get(key),
          rows: [],
        })
      }
      byKey.get(key).rows.push(p)
    }
    return [...byKey.values()]
  }, [filtered, currentPage, perPage])

  // Row numbers run within each division, across pages.
  const numberInDivision = useMemo(() => {
    const numbers = new Map()
    const seen = new Map()
    for (const p of filtered) {
      const key = p.division ? p.division.id : 'none'
      const next = (seen.get(key) || 0) + 1
      seen.set(key, next)
      numbers.set(p.id, next)
    }
    return numbers
  }, [filtered])

  const selected = participants.find((p) => p.id === selectedId) || null

  function select(id) {
    if (id === selectedId) return
    const narrow = window.matchMedia(NARROW).matches
    // On a narrow screen the details replace the list: remember where the
    // list was so Back returns to it.
    if (narrow && !selectedId) listScroll.current = window.scrollY
    setSelectedId(id)
    if (narrow) window.scrollTo(0, 0)
  }

  function closeDetails() {
    const narrow = window.matchMedia(NARROW).matches
    setSelectedId(0)
    if (narrow) requestAnimationFrame(() => window.scrollTo(0, listScroll.current))
  }

  function resetPage(setter) {
    return (value) => {
      setter(value)
      setPage(1)
    }
  }

  async function exportCsv() {
    setExporting(true)
    setError('')
    try {
      await tournamentsApi.exportParticipants(tournamentId)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not export the participants.'))
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <Spinner label="Loading tournaments…" />

  const from = filtered.length ? (currentPage - 1) * perPage + 1 : 0
  const to = Math.min(currentPage * perPage, filtered.length)

  return (
    <div className={`pt-page${selected ? ' pt-page--selected' : ''}`}>
      <div className={`pt-layout${selected ? ' pt-layout--split' : ''}`}>
        <div className="pt-main">
          <div className="pt-head">
            <div>
              <nav className="pt-crumbs" aria-label="Breadcrumb">
                <Link to="/">Home</Link>
                <span aria-hidden="true">/</span>
                <Link to="/tournaments">Tournaments</Link>
                <span aria-hidden="true">/</span>
                <strong>Participants</strong>
              </nav>
              <h1 className="pt-title">
                <UsersIcon className="pt-title__icon" />
                Participants
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
              <div className="pt-kpis">
                <Kpi tone="red" icon={AlertIcon} value={kpis.incomplete} label="Incomplete Requirements" />
                <Kpi tone="blue" icon={BuildingIcon} value={kpis.clubs} label="Clubs / Training Centers" />
                <Kpi tone="purple" icon={UsersIcon} value={kpis.athletes} label="Registered Athletes" />
              </div>

              <div className="pt-filters">
                <button
                  type="button"
                  className="pt-export"
                  onClick={exportCsv}
                  disabled={exporting || !participants.length}
                >
                  <DownloadIcon />
                  {exporting ? 'Exporting…' : 'Export'}
                </button>
                <label className="pt-filter">
                  <span>Requirements Status</span>
                  <select value={requirements} onChange={(event) => resetPage(setRequirements)(event.target.value)}>
                    <option value="">All</option>
                    <option value="complete">Complete</option>
                    <option value="incomplete">Incomplete</option>
                  </select>
                </label>
                <label className="pt-filter">
                  <span>Club / Training Center</span>
                  <select value={club} onChange={(event) => resetPage(setClub)(event.target.value)}>
                    <option value="">All</option>
                    {clubs.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="pt-search">
                  <input
                    type="search"
                    placeholder="Search name or ID…"
                    value={search}
                    onChange={(event) => resetPage(setSearch)(event.target.value)}
                    aria-label="Search by athlete name or member ID"
                  />
                  <SearchIcon className="pt-search__icon" />
                </label>
              </div>

              {loadingList && !data ? (
                <Spinner label="Loading participants…" />
              ) : participants.length === 0 ? (
                <EmptyState
                  title="No participants yet"
                  description="Registrations appear here as athletes, clubs and coaches enter the tournament."
                />
              ) : groups.length === 0 ? (
                <EmptyState title="No matching participants" description="No registration matches these filters." />
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
                            onClick={() => setCollapsed((prev) => ({ ...prev, [group.key]: open }))}
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
                              <table className="pt-table">
                                <thead>
                                  <tr>
                                    <th className="pt-table__num">#</th>
                                    <th>Athlete</th>
                                    <th className="pt-table__age">Age</th>
                                    <th>Club / Training Center</th>
                                    <th className="pt-table__status">Requirements Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.rows.map((p) => (
                                    <tr
                                      key={p.id}
                                      className={`pt-row${p.id === selectedId ? ' pt-row--selected' : ''}`}
                                      onClick={() => select(p.id)}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                          event.preventDefault()
                                          select(p.id)
                                        }
                                      }}
                                      tabIndex={0}
                                      aria-selected={p.id === selectedId}
                                      aria-label={`Show registration details for ${p.nameEn || p.nameAr}`}
                                    >
                                      <td className="pt-table__num" data-label="#">
                                        {numberInDivision.get(p.id)}
                                      </td>
                                      <td data-label="Athlete">
                                        <div className="pt-athlete">
                                          <span className="pt-athlete__name">{p.nameEn || p.nameAr || '—'}</span>
                                          <span className="pt-athlete__id">{p.membershipNumber || p.reference || '—'}</span>
                                        </div>
                                      </td>
                                      <td className="pt-table__age" data-label="Age">
                                        {p.competitionAge ?? '—'}
                                      </td>
                                      <td data-label="Club / Training Center">{p.club || '—'}</td>
                                      <td className="pt-table__status" data-label="Requirements Status">
                                        <StatusPill complete={p.requirementsComplete} />
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

                  <div className="pt-pager">
                    <div className="pt-pager__pages">
                      <button
                        type="button"
                        aria-label="Previous page"
                        disabled={currentPage <= 1}
                        onClick={() => setPage(currentPage - 1)}
                      >
                        <ChevronLeftIcon />
                      </button>
                      {pageNumbers(currentPage, pages).map((n, i) =>
                        n === '…' ? (
                          <span key={`gap-${i}`} className="pt-pager__gap">
                            …
                          </span>
                        ) : (
                          <button
                            key={n}
                            type="button"
                            className={n === currentPage ? 'pt-pager__current' : ''}
                            aria-current={n === currentPage ? 'page' : undefined}
                            onClick={() => setPage(n)}
                          >
                            {n}
                          </button>
                        ),
                      )}
                      <button
                        type="button"
                        aria-label="Next page"
                        disabled={currentPage >= pages}
                        onClick={() => setPage(currentPage + 1)}
                      >
                        <ChevronRightIcon />
                      </button>
                    </div>
                    <span className="pt-pager__range">
                      {from} – {to} of {filtered.length} registrations
                    </span>
                    <select
                      className="pt-pager__size"
                      value={perPage}
                      onChange={(event) => resetPage(setPerPage)(Number(event.target.value))}
                      aria-label="Registrations per page"
                    >
                      {PER_PAGE.map((n) => (
                        <option key={n} value={n}>
                          {n} per page
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {selected && (
          <DetailsPanel
            key={selected.id}
            participant={selected}
            tab={tab}
            onTab={setTab}
            canEdit={canEdit}
            canMedical={canMedical}
            canDirector={canDirector}
            onClose={closeDetails}
            onChanged={load}
          />
        )}
      </div>
    </div>
  )
}

/** 1 … 4 5 6 … 12 */
function pageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const list = [...new Set([1, total, current - 1, current, current + 1])]
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b)
  const out = []
  list.forEach((n, i) => {
    if (i && n - list[i - 1] > 1) out.push('…')
    out.push(n)
  })
  return out
}

function Kpi({ tone, icon: Icon, value, label }) {
  return (
    <div className={`pt-kpi pt-kpi--${tone}`}>
      <span className="pt-kpi__value">{value}</span>
      <span className="pt-kpi__label">{label}</span>
      <Icon className="pt-kpi__icon" />
    </div>
  )
}

function StatusPill({ complete }) {
  return complete ? (
    <span className="pt-pill pt-pill--complete">
      Complete <CheckIcon />
    </span>
  ) : (
    <span className="pt-pill pt-pill--incomplete">
      Incomplete <AlertIcon />
    </span>
  )
}

const TABS = [
  { key: 'registration', label: 'Registration' },
  { key: 'medical', label: 'Medical Requirements' },
  { key: 'qa', label: 'Q&A & Declarations' },
]

/**
 * The right-hand panel. Part of the page layout: no backdrop, nothing behind
 * it blocked. Keyed by entry, so moving to another athlete starts it afresh
 * — except the tab, which the page keeps.
 */
function DetailsPanel({ participant: p, tab, onTab, canEdit, canMedical: technical, canDirector, onClose, onChanged }) {
  // Technical team before Final Approval; the director may also read, and is
  // the only one who may change, the file of an approved athlete.
  const approved = p.status === 'qualified' || Boolean(p.medicalLocked)
  const canMedical = technical || (approved && canDirector)
  const canChangeMedical = approved ? canDirector : technical
  const [medical, setMedical] = useState(null)
  const [medicalError, setMedicalError] = useState('')

  useEffect(() => {
    if (!canMedical) return
    let cancelled = false
    tournamentsApi
      .entryMedical(p.id)
      .then((file) => !cancelled && setMedical(file))
      .catch((err) => !cancelled && setMedicalError(extractErrorMessage(err, 'Could not load the medical file.')))
    return () => {
      cancelled = true
    }
  }, [canMedical, p.id])

  return (
    <aside className="pt-panel" aria-label="Registration Details">
      <div className="pt-panel__bar">
        <button type="button" className="pt-panel__back" onClick={onClose}>
          <ChevronLeftIcon /> Back to participants
        </button>
        <button type="button" className="pt-panel__close" onClick={onClose} aria-label="Close details">
          <CloseIcon />
        </button>
        <h2>Registration Details</h2>
      </div>

      <div className="pt-panel__who">
        <div className="pt-panel__ident">
          <strong className="pt-panel__name">{p.nameEn || p.nameAr || '—'}</strong>
          <span className="pt-panel__id">{p.membershipNumber || p.reference || '—'}</span>
          {p.requirementsComplete ? (
            <span className="pt-pill pt-pill--complete">
              <CheckIcon /> Requirements Complete
            </span>
          ) : (
            <span className="pt-pill pt-pill--incomplete">
              <AlertIcon /> Incomplete Requirements
            </span>
          )}
        </div>
        <span className="pt-panel__avatar" aria-hidden="true">
          <UserIcon />
        </span>
      </div>

      <div className="pt-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`pt-tabs__tab${tab === t.key ? ' pt-tabs__tab--active' : ''}`}
            onClick={() => onTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="pt-panel__body" role="tabpanel">
        {tab === 'registration' && <RegistrationTab participant={p} canEdit={canEdit} onChanged={onChanged} />}
        {tab === 'medical' && (
          <MedicalTab
            participant={p}
            canMedical={canMedical}
            canChange={canChangeMedical}
            medical={medical}
            error={medicalError}
            onUploaded={async (fresh) => {
              setMedical(fresh)
              await onChanged()
            }}
          />
        )}
        {tab === 'qa' && <QaTab participant={p} canMedical={canMedical} medical={medical} error={medicalError} />}
      </div>
    </aside>
  )
}

/* ── Registration ───────────────────────────────────────────────────────── */

function RegistrationTab({ participant: p, canEdit, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')

  const rows = [
    ['Club / Training Center', p.club],
    ['Coach', p.coachName],
    ['Coach Mobile', p.coachPhone],
    ['Current Weight', p.declaredWeightKg == null ? null : `${p.declaredWeightKg} kg`],
    ['Height', p.heightCm == null ? null : `${p.heightCm} cm`],
    ['Registration Date', formatDateTime(p.registeredAt)],
    ['Registered By', p.registeredBy],
  ]

  return (
    <section className="pt-card">
      <header className="pt-card__head">
        <h3>Registration Information</h3>
        {canEdit && !editing && (
          <button
            type="button"
            className="pt-link"
            onClick={() => {
              setEditing(true)
              setNotice('')
            }}
          >
            <EditIcon /> Edit
          </button>
        )}
      </header>

      {notice && (
        <p className="pt-success" role="status">
          {notice}
        </p>
      )}

      {editing ? (
        <CategoryEditor
          participant={p}
          onCancel={() => setEditing(false)}
          onSaved={async () => {
            await onChanged()
            setEditing(false)
            setNotice('Category and weight class updated for this entry. The athlete’s profile is unchanged.')
          }}
        />
      ) : (
        <div className="pt-pair">
          <Fact label="Category" value={p.categoryLabel} />
          <Fact label="Weight Class" value={p.division?.weightLabel || 'No weight class'} />
        </div>
      )}

      <dl className="pt-facts">
        {rows.map(([label, value]) => (
          <div key={label} className="pt-facts__row">
            <dt>{label}</dt>
            <dd>{value || '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function Fact({ label, value }) {
  return (
    <div className="pt-fact">
      <span className="pt-fact__label">{label}</span>
      <span className="pt-fact__value">{value || '—'}</span>
    </div>
  )
}

/**
 * Category and Weight Class for this entry only. The options are what the API
 * says the athlete may be moved to; the API checks the choice again.
 */
function CategoryEditor({ participant: p, onCancel, onSaved }) {
  const options = p.editOptions
  const [category, setCategory] = useState(p.category)
  const [divisionId, setDivisionId] = useState(p.division ? String(p.division.id) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')

  const classes = options.find((o) => o.value === category)?.weightClasses ?? []
  const valid = Boolean(category && divisionId && classes.some((c) => String(c.divisionId) === divisionId))
  const changed = category !== p.category || divisionId !== (p.division ? String(p.division.id) : '')
  // A weigh-in result or Final Draw Approval belongs to the class it was given
  // for: the server clears it on a change, and asks why.
  const clears = Boolean(p.classChangeClearsReadiness) && changed

  async function save() {
    setSaving(true)
    setError('')
    try {
      await tournamentsApi.changeEntryCategory(p.id, {
        category,
        divisionId: Number(divisionId),
        reason: reason.trim(),
      })
      await onSaved()
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not update the entry.'))
      setSaving(false)
    }
  }

  if (options.length === 0) {
    return (
      <div className="pt-edit">
        <p className="pt-hint">No category in this tournament is open to this athlete.</p>
        <button type="button" className="btn btn--ghost btn--small" onClick={onCancel}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="pt-edit">
      <div className="pt-pair">
        <label className="pt-field">
          <span>
            Category <em aria-hidden="true">*</em>
          </span>
          <select
            value={options.some((o) => o.value === category) ? category : ''}
            onChange={(event) => {
              setCategory(event.target.value)
              setDivisionId('')
            }}
          >
            {!options.some((o) => o.value === category) && <option value="">Choose a category</option>}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="pt-field">
          <span>
            Weight Class <em aria-hidden="true">*</em>
          </span>
          <select value={divisionId} onChange={(event) => setDivisionId(event.target.value)} disabled={!classes.length}>
            <option value="">Choose…</option>
            {classes.map((c) => (
              <option key={c.divisionId} value={c.divisionId}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="pt-hint">Changes this tournament entry only. The athlete’s profile is not modified.</p>
      {changed && (
        <>
          {clears && (
            <p className="pt-hint">
              This entry’s weigh-in result and Final Draw Approval apply to its current class and will be cleared. The
              measured weight is kept; the weigh-in must be recorded again for the new class.
            </p>
          )}
          <label className="pt-field">
            <span>
              Reason for the change <em aria-hidden="true">*</em>
            </span>
            <textarea
              rows={2}
              maxLength={500}
              value={reason}
              data-testid="class-change-reason"
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        </>
      )}
      {error && (
        <p className="pt-error" role="alert">
          {error}
        </p>
      )}
      <div className="pt-edit__actions">
        <button type="button" className="btn btn--ghost btn--small" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--primary btn--small"
          onClick={save}
          disabled={!valid || !changed || saving || !reason.trim()}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

/* ── Medical Requirements ───────────────────────────────────────────────── */

const DOC_STATUS = {
  approved: { label: 'Approved', tone: 'complete' },
  uploaded: { label: 'Uploaded · not approved', tone: 'info' },
  missing: { label: 'Missing', tone: 'missing' },
  declared: { label: 'Declared', tone: 'complete' },
}

function MedicalTab({ participant: p, canMedical, canChange, medical, error, onUploaded }) {
  const [notice, setNotice] = useState('')

  if (!canMedical) {
    // Status only: the documents themselves need the technical team's permission.
    return (
      <section className="pt-card">
        <header className="pt-card__head">
          <h3>Medical Requirements</h3>
        </header>
        <p className="pt-hint">Competition age {p.competitionAge ?? '—'} · only the requirements that apply are listed.</p>
        <ul className="pt-checks">
          {p.requirements.map((r) => (
            <li key={r.key} className={r.done ? 'pt-checks__item--done' : ''}>
              <span className="pt-checks__mark" aria-hidden="true">
                {r.done ? <CheckIcon /> : <CloseIcon />}
              </span>
              {r.label}
              <span className="pt-checks__state">{(DOC_STATUS[r.status] || DOC_STATUS.missing).label}</span>
            </li>
          ))}
        </ul>
        <p className="pt-note">Viewing and uploading medical documents requires the technical team permission.</p>
      </section>
    )
  }

  if (error)
    return (
      <p className="pt-error" role="alert">
        {error}
      </p>
    )
  if (!medical) return <Spinner label="Loading the medical file…" fullWidth={false} />

  return (
    <section className="pt-card">
      <header className="pt-card__head">
        <h3>Medical Requirements</h3>
      </header>
      <p className="pt-hint">
        Competition age {medical.competitionAge ?? '—'} · only the documents that apply are listed. An approved document
        is not a medical clearance.
      </p>
      {notice && (
        <p className="pt-success" role="status">
          {notice}
        </p>
      )}
      <ul className="pt-docs">
        {medical.documents.map((doc) => (
          <DocumentCard
            key={doc.key}
            entryId={p.id}
            doc={doc}
            canUpload={canChange}
            onUploaded={async (result) => {
              await onUploaded(result.medical)
              setNotice(
                `${doc.label} ${result.replaced ? 'replaced' : 'uploaded'} and approved.` +
                  (result.supersededPendingReplacement
                    ? ' The athlete’s pending replacement for this document was withdrawn.'
                    : ''),
              )
            }}
          />
        ))}
        {medical.electronicPregnancyDeclaration && (
          <li className="pt-doc">
            <div className="pt-doc__main">
              <FileIcon className="pt-doc__icon" />
              <div className="pt-doc__text">
                <span className="pt-doc__name">Non-Pregnancy Declaration</span>
                <span className="pt-doc__meta">Electronic declaration made by the athlete</span>
              </div>
              <DocStatus status={medical.electronicPregnancyDeclaration.done ? 'declared' : 'missing'} />
            </div>
          </li>
        )}
      </ul>
    </section>
  )
}

function DocStatus({ status }) {
  const s = DOC_STATUS[status] || DOC_STATUS.missing
  return <span className={`pt-doc__status pt-doc__status--${s.tone}`}>{s.label}</span>
}

function DocumentCard({ entryId, doc, canUpload = true, onUploaded }) {
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
      // Success is shown only once the API has stored and approved it.
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

  const meta = [
    doc.date ? `Dated ${formatDate(doc.date)}` : null,
    doc.approvedAt ? `Approved ${formatDate(doc.approvedAt)} by ${doc.approvedBy}` : null,
  ].filter(Boolean)

  return (
    <li className={`pt-doc pt-doc--${doc.status}`}>
      <div className="pt-doc__main">
        <FileIcon className="pt-doc__icon" />
        <div className="pt-doc__text">
          <span className="pt-doc__name">{doc.label}</span>
          {meta.length > 0 && <span className="pt-doc__meta">{meta.join(' · ')}</span>}
        </div>
        <DocStatus status={doc.status} />
      </div>

      {doc.replacementPending && (
        <p className="pt-doc__pending">The athlete has a replacement waiting for approval. Uploading here withdraws it.</p>
      )}

      {!open && (
        <div className="pt-doc__actions">
          {present && doc.viewable && (
            <button type="button" className="pt-btn" onClick={view}>
              <EyeIcon /> View
            </button>
          )}
          {canUpload && (
            <button
              type="button"
              className={`pt-btn${present ? '' : ' pt-btn--primary'}`}
              onClick={() => setOpen(true)}
            >
              <UploadIcon /> {present ? 'Replace' : 'Upload'}
            </button>
          )}
        </div>
      )}

      {open && (
        <div className="pt-doc__form">
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
              onClick={() => {
                setOpen(false)
                setError('')
              }}
              disabled={busy}
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
      {error && (
        <p className="pt-error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}

/* ── Q&A & Declarations ─────────────────────────────────────────────────── */

function QaTab({ participant: p, canMedical, medical, error }) {
  return (
    <section className="pt-card">
      <header className="pt-card__head">
        <h3>Q&amp;A &amp; Declarations</h3>
      </header>
      <div className="pt-counts">
        <span className={`pt-count${p.healthQuestions.answered === p.healthQuestions.total ? ' pt-count--done' : ''}`}>
          <strong>
            {p.healthQuestions.answered} of {p.healthQuestions.total}
          </strong>
          Health Questions
        </span>
        {p.declarations && (
          <span className={`pt-count${p.declarations.accepted === p.declarations.total ? ' pt-count--done' : ''}`}>
            <strong>
              {p.declarations.accepted} of {p.declarations.total}
            </strong>
            Declarations
          </span>
        )}
      </div>
      {!p.declarations && (
        <p className="pt-hint">
          Under 18: no electronic declarations. The guardian’s signed documents are under Medical Requirements.
        </p>
      )}

      {!canMedical ? (
        <p className="pt-note">The answers themselves require the technical team permission.</p>
      ) : error ? (
        <p className="pt-error" role="alert">
          {error}
        </p>
      ) : !medical ? (
        <Spinner label="Loading…" fullWidth={false} />
      ) : (
        <>
          <h4 className="pt-sub">Health Questions</h4>
          <ol className="pt-qa">
            {medical.questions.map((q) => (
              <li key={q.key}>
                <span>{q.label}</span>
                <span className={`pt-answer pt-answer--${q.answer == null ? 'none' : q.answer ? 'yes' : 'no'}`}>
                  {q.answer == null ? 'Not answered' : q.answer ? 'Yes' : 'No'}
                </span>
              </li>
            ))}
          </ol>
          {medical.medications && (
            <p className="pt-hint">
              <strong>Medications:</strong> {medical.medications}
            </p>
          )}

          {medical.declarations && (
            <>
              <h4 className="pt-sub">Declarations</h4>
              <ul className="pt-checks">
                {medical.declarations.map((d) => (
                  <li key={d.key} className={d.accepted ? 'pt-checks__item--done' : ''}>
                    <span className="pt-checks__mark" aria-hidden="true">
                      {d.accepted ? <CheckIcon /> : <CloseIcon />}
                    </span>
                    {d.label}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  )
}

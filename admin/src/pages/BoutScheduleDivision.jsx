import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { boutScheduleApi } from '../api/resources'
import Alert from '../components/Alert'
import ScheduleConflicts from '../components/ScheduleConflicts'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import AthleteAvatar from '../components/AthleteAvatar'
import { BracketPhotoContext } from '../components/bracketPhotoContext'
import { categoryName, drawError } from '../drawLabels'
import { countryCode, flagEmoji } from '../countryCodes'
import {
  draftTimes,
  isExactTime,
  normalize,
  othersShifted,
  placeAt,
  syncTiming,
  timeOrderProblems,
  timeOptions,
  times12h,
  timingFor,
  to12h,
} from '../divisionPlan'
import {
  AlertIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  EventsIcon,
  FemaleIcon,
  GlovesIcon,
  InfoIcon,
  LockIcon,
  MaleIcon,
  PinIcon,
  PlusIcon,
  ResetIcon,
  ResultsIcon,
  SaveIcon,
  SettingsIcon,
} from '../components/Icons'
import { DivisionStatusPill, dayLabel, divisionsWithStatus } from './BoutSchedule'

/**
 * Bout Schedule — Division Schedule: /bout-schedule/divisions/:divisionId?tournament=:id
 *
 * One division's bouts with their Ring | Date | Time, edited as a local draft
 * and saved in ONE request through the existing engine (Save Division
 * Schedule). Opening the page never writes. Times are always slots of the
 * ring's shared day timeline (first bout time + interval × place); the server
 * re-checks everything — dates, rings, results lock, athlete safety and
 * progression, permissions and the approval lock — and recalculates numbers.
 * Saving never submits, approves or publishes.
 */

const INTERVALS = [5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 45, 60, 90, 120]
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
// 24-hour first-bout times every 5 minutes, 06:00–23:55.
// Every 5 minutes of the day. The value stays the stored 24-hour "HH:mm"; the label is 12-hour with AM/PM.
const START_TIMES = Array.from({ length: 288 }, (_, i) => {
  const m = i * 5
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
})
function Nationality({ iso }) {
  const code = countryCode(iso)
  if (!code) return null
  return (
    <span className="ds-nat" data-testid="ds-nat">
      <span className="ds-nat__flag" aria-hidden="true">
        {flagEmoji(iso)}
      </span>
      {code}
    </span>
  )
}

function Avatar({ athlete, divisionId }) {
  const known = athlete?.nameEn || athlete?.nameAr
  return (
    <BracketPhotoContext.Provider value={divisionId}>
      <span className="ds-avatar">
        <AthleteAvatar entry={known ? { id: athlete.entryId, photoKey: athlete.photo } : null} />
      </span>
    </BracketPhotoContext.Provider>
  )
}

/**
 * Build the editing draft from what is saved. A bout never saved gets the default ring; its date is filled only
 * when the tournament has a single day — on a multi-day tournament the administrator chooses every date.
 */
function initialDraft(data, division, fought) {
  const days = data.tournament.days
  const active = data.rings.filter((r) => r.isActive)
  const used = {}
  for (const b of fought) if (b.ringId) used[b.ringId] = (used[b.ringId] || 0) + 1
  const mostUsed = Object.entries(used).sort((a, b) => b[1] - a[1])[0]?.[0]
  const defaultRingId =
    (mostUsed && Number(mostUsed)) ||
    (active.some((r) => r.id === division.defaultRingId) ? division.defaultRingId : null) ||
    active[0]?.id ||
    null
  const bouts = {}
  for (const b of fought) {
    bouts[b.id] =
      b.date && b.ringId && b.queuePosition != null
        ? { ringId: b.ringId, date: b.date, position: b.queuePosition, saved: true, manual: b.manualTime || null, timeText: b.manualTime || '' }
        : { ringId: defaultRingId, date: days.length === 1 ? days[0] : null, position: null, saved: false, manual: null, timeText: '' }
  }
  const draft = { bouts, timing: {}, defaultRingId }
  const firstDate = Object.values(bouts).find((v) => v.ringId === defaultRingId && v.date)?.date || days[0]
  const t = defaultRingId ? timingFor(data, draft, defaultRingId, firstDate) : { first: '09:00', interval: 10 }
  return { ...draft, first: t.first, interval: t.interval }
}

export default function BoutScheduleDivision() {
  const { divisionId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const tournamentId = Number(searchParams.get('tournament')) || 0
  const id = Number(divisionId)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState(null)
  const [byesOpen, setByesOpen] = useState(true)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [addingRing, setAddingRing] = useState(false)

  const division = useMemo(() => divisionsWithStatus(data).find((d) => d.id === id) || null, [data, id])
  const mine = useMemo(() => (data ? data.bouts.filter((b) => b.divisionId === id) : []), [data, id])
  const fought = useMemo(
    () => mine.filter((b) => !b.isBye && !b.isWalkover).sort((a, b) => a.round - b.round || a.position - b.position),
    [mine],
  )
  const byes = useMemo(
    () => mine.filter((b) => b.isBye).sort((a, b) => a.round - b.round || a.position - b.position),
    [mine],
  )
  const order = useCallback((boutId) => fought.findIndex((b) => b.id === boutId), [fought])
  const byId = useMemo(() => Object.fromEntries((data?.bouts || []).map((b) => [b.id, b])), [data])

  const load = useCallback(
    async (keepDraft = false) => {
      if (!tournamentId) return null
      try {
        const view = await boutScheduleApi.view(tournamentId)
        setData(view)
        setError('')
        return view
      } catch (err) {
        setError(drawError(err, 'Could not load the division.'))
        return null
      } finally {
        setLoading(false)
        if (!keepDraft) setDraft(null)
      }
    },
    [tournamentId],
  )
  useEffect(() => {
    if (!tournamentId) setLoading(false)
    load()
  }, [load, tournamentId])

  // The persisted state (plus suggestions for unsaved bouts), always from the latest server data — so
  // Reset and the "unsaved changes" check reflect rings added since the page opened.
  const initial = useMemo(
    () => (data && division ? normalize(data, initialDraft(data, division, fought), order) : null),
    [data, division, fought, order],
  )
  // Start editing from it whenever fresh data arrives without a draft.
  useEffect(() => {
    if (initial && !draft) setDraft(initial)
  }, [initial, draft])

  const schedule = data?.schedule || {}
  const perms = data?.permissions || {}
  const approved = schedule.status === 'approved'
  const published = !!data?.publication
  // The published version is live on the website (a stored snapshot); a change here goes to the working revision.
  const live = published && data.publication.current !== false
  // Always editable with the schedule permission: an approved schedule may change, which cancels its approval (a
  // reason is required); the published version stays on the website until an updated one is published.
  const canEdit = !!perms.edit
  const dirty = !!draft && !!initial && JSON.stringify(draft) !== JSON.stringify(initial)
  const unsaved = !!draft && Object.values(draft.bouts).some((v) => !v.saved)
  const times = useMemo(() => (data && draft ? draftTimes(data, draft) : {}), [data, draft])
  const disorder = useMemo(() => (data && draft ? timeOrderProblems(data, draft, order) : {}), [data, draft, order])
  const badTimes = draft ? Object.values(draft.bouts).filter((v) => v.timeText && !isExactTime(v.timeText)).length : 0
  const shifted = useMemo(
    () => (data && draft && dirty ? othersShifted(data, draft, order) : []),
    [data, draft, dirty, order],
  )
  const activeRings = (data?.rings || []).filter((r) => r.isActive)
  const issueBouts = new Set((saveError?.issues || []).flatMap((i) => i.boutIds || []))
  const overview = tournamentId ? `/bout-schedule?tournament=${tournamentId}` : '/bout-schedule'

  // Unsaved-change protection.
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty
  useEffect(() => {
    const onUnload = (event) => {
      if (!dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])
  const leave = (to) => {
    if (dirty && !window.confirm('You have unsaved schedule changes. Leave without saving?')) return
    navigate(to)
  }

  const update = (fn) => {
    setSaveError(null)
    setNotice('')
    // Applied Division Settings follow every date change (see syncTiming).
    setDraft((d) => syncTiming(fn(d)))
  }
  // Moving an already scheduled bout to another ring or day is the Technical Delegate's permission.
  const crossBlocked = (b) => b.ringId != null && b.queuePosition != null && !perms.crossRing
  // An exact time belongs to the slot it was entered for: choosing another ring, day or slot clears it.
  const clearExact = (d, id) => ({ ...d, bouts: { ...d.bouts, [id]: { ...d.bouts[id], manual: null, timeText: '' } } })
  const setRing = (b, ringId) =>
    update((d) => placeAt(data, clearExact(d, b.id), b.id, Number(ringId), d.bouts[b.id].date, null, order))
  const setDate = (b, date) => update((d) => placeAt(data, clearExact(d, b.id), b.id, d.bouts[b.id].ringId, date, null, order))
  const setTime = (b, index) =>
    update((d) =>
      placeAt(data, clearExact(d, b.id), b.id, d.bouts[b.id].ringId, d.bouts[b.id].date, Number(index), order),
    )
  // An exact time for this bout only: its place (and every other bout) stays as it is. Kept exactly as typed;
  // an invalid entry is shown as an error and blocks saving — it is never corrected silently.
  const setExact = (b, text) =>
    update((d) => ({
      ...d,
      bouts: {
        ...d.bouts,
        [b.id]: { ...d.bouts[b.id], timeText: text, manual: isExactTime(text) ? text : null },
      },
    }))

  const applyToAll = () =>
    update((d) => {
      if (!d.defaultRingId) return d
      let next = { ...d, timing: { ...d.timing } }
      for (const b of fought) {
        if (b.locked || (crossBlocked(b) && b.ringId !== d.defaultRingId)) continue
        // Apply to All Bouts is the one action that replaces exact times with the applied timing.
        if (next.bouts[b.id].manual || next.bouts[b.id].timeText)
          next = { ...next, bouts: { ...next.bouts, [b.id]: { ...next.bouts[b.id], manual: null, timeText: '' } } }
        if (next.bouts[b.id].ringId !== d.defaultRingId)
          next = {
            ...next,
            bouts: { ...next.bouts, [b.id]: { ...next.bouts[b.id], ringId: d.defaultRingId, position: null } },
          }
      }
      // The ring, first-bout time and interval now apply to every day this division uses on that ring —
      // the days already chosen and any chosen later. No date is filled in.
      next.applied = { ringId: d.defaultRingId, first: d.first, interval: Number(d.interval) }
      return normalize(data, next, order)
    })

  const reset = () => {
    setSaveError(null)
    setNotice('')
    setDraft(initial)
  }

  const body = (extra = {}) => ({
    bouts: fought.map((b) => ({
      boutId: b.id,
      ringId: draft.bouts[b.id].ringId,
      date: draft.bouts[b.id].date,
      position: draft.bouts[b.id].position,
      time: draft.bouts[b.id].manual || null,
    })),
    timing: Object.entries(draft.timing).map(([k, v]) => ({
      ringId: Number(k.split('|')[0]),
      date: k.split('|')[1],
      firstBoutTime: v.first,
      intervalMinutes: Number(v.interval),
    })),
    defaultRingId: draft.defaultRingId,
    expectedRevision: schedule.revision ?? 0,
    ...extra,
  })

  const failed = async (err) => {
    const d = err?.response?.data
    setSaveError({ message: drawError(err, 'The division schedule was not saved.'), issues: d?.issues || [] })
    if (d?.code === 'stale_revision') await load(true)
  }

  const commit = async (extra) => {
    setBusy(true)
    try {
      await boutScheduleApi.saveDivision(tournamentId, id, body({ dryRun: false, ...extra }))
      setConfirm(null)
      const view = await load(false)
      const saved = view && divisionsWithStatus(view).find((d) => d.id === id)
      setNotice(`Division schedule saved. Bout numbers were generated. Status: ${saved?.status.label || 'updated'}.`)
    } catch (err) {
      setConfirm(null)
      await failed(err)
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    const label = (b) => `${b.roundEn} · Bracket Match ${b.position}`
    const noDate = fought.filter((b) => !draft.bouts[b.id].date)
    const noRing = fought.filter((b) => !draft.bouts[b.id].ringId)
    if (noDate.length || noRing.length) {
      setSaveError({
        message: 'Every bout needs a ring and a day before the division can be saved.',
        issues: [
          ...(noDate.length
            ? [
                {
                  code: 'missing_date',
                  subject: `${noDate.length === 1 ? '1 bout has' : `${noDate.length} bouts have`} no day`,
                  messageEn: `Select a day for: ${noDate.map(label).join(', ')}.`,
                  boutIds: noDate.map((b) => b.id),
                },
              ]
            : []),
          ...(noRing.length
            ? [
                {
                  code: 'missing_ring',
                  subject: `${noRing.length === 1 ? '1 bout has' : `${noRing.length} bouts have`} no ring`,
                  messageEn: `Select a ring for: ${noRing.map(label).join(', ')}.`,
                  boutIds: noRing.map((b) => b.id),
                },
              ]
            : []),
        ],
      })
      return
    }
    setBusy(true)
    setSaveError(null)
    setNotice('')
    try {
      const result = await boutScheduleApi.saveDivision(tournamentId, id, body({ dryRun: true }))
      setBusy(false)
      if (result.preview?.needsConfirmation) setConfirm(result.preview)
      else await commit({})
    } catch (err) {
      setBusy(false)
      await failed(err)
    }
  }

  const addRing = async (name, approvalChangeReason) => {
    try {
      const ring = await boutScheduleApi.addRing(tournamentId, {
        name,
        expectedRevision: schedule.revision ?? 0,
        approvalChangeReason: approved ? approvalChangeReason : undefined,
      })
      const view = await load(true)
      if (view) setDraft((d) => (d ? { ...d, defaultRingId: ring.id } : d))
      setAddingRing(false)
      setNotice(`${ring.name} added. Apply it to the bouts, then save.`)
      return null
    } catch (err) {
      return drawError(err, 'The ring was not added.')
    }
  }

  const name = division
    ? `${division.gender === 'female' ? 'Female' : 'Male'} — ${categoryName(division.categoryEn)} — ${division.weightEn}`
    : 'Division'
  const GenderIcon = division?.gender === 'female' ? FemaleIcon : MaleIcon
  // How many bracket positions each round has (real bouts and BYEs), for "Bracket Match 3 of 4".
  const slotsInRound = useMemo(() => {
    const n = {}
    for (const b of mine) n[b.round] = (n[b.round] || 0) + 1
    return n
  }, [mine])
  const roundNames = useMemo(() => {
    const names = {}
    for (const b of mine) if (!b.isBye || !names[b.round]) names[b.round] = b.roundEn
    return names
  }, [mine])
  /** "Day 2" for a tournament date (the backend keeps the real date). */
  const dayOf = (iso) => {
    const i = data?.tournament.days.indexOf(iso)
    return i >= 0 ? `Day ${i + 1}` : iso
  }
  /** One line per bout for the conflict summary: what it is and where/when it would be. */
  const describeBout = (boutId) => {
    const b = byId[boutId]
    if (!b) return `Bout ${boutId}`
    const v = draft?.bouts[boutId]
    const ringId = v ? v.ringId : b.ringId
    const date = v ? v.date : b.date
    const time = v ? times[boutId] : b.startTime
    const ring = data.rings.find((r) => r.id === ringId)?.name
    const what = `${b.divisionId === id ? '' : `${b.divisionEn} · `}${b.roundEn} · Bracket Match ${b.position}`
    const where = [ring, date ? dayOf(date) : null, time ? to12h(time) : null].filter(Boolean).join(', ')
    return where ? `${what} — ${where}` : what
  }
  const placeholder = (p) => {
    if (p?.kind === 'winner') {
      const from = byId[p.fromBoutId]
      if (from?.officialNumber != null) return `Winner of Bout ${from.officialNumber}`
      return `Winner of ${from?.roundEn || `Round ${p.fromRound}`} · Match ${p.fromPosition}`
    }
    if (p?.kind === 'bye') return 'Advances via BYE'
    return 'To be decided'
  }

  return (
    <div className="pt-page ds-page" data-testid="bs-division-page" data-division={id}>
      <header className="ds-head">
        <button
          type="button"
          className="ds-back"
          aria-label="Back to Published Divisions"
          onClick={() => leave(overview)}
          data-testid="bs-back"
        >
          <ArrowLeftIcon />
        </button>
        <div>
          <h1 className="ds-head__title">Division Schedule</h1>
          <nav className="dm-crumbs" aria-label="Breadcrumb">
            <Link to="/tournaments">Tournaments</Link>
            {data?.tournament && (
              <>
                <ChevronRightIcon className="dm-crumbs__sep" aria-hidden="true" />
                <span data-testid="bs-ctx-tournament">{data.tournament.nameEn || data.tournament.nameAr}</span>
              </>
            )}
            <ChevronRightIcon className="dm-crumbs__sep" aria-hidden="true" />
            <Link
              to={overview}
              onClick={(e) => {
                e.preventDefault()
                leave(overview)
              }}
            >
              Bout Schedule
            </Link>
            {division && (
              <>
                <ChevronRightIcon className="dm-crumbs__sep" aria-hidden="true" />
                <strong data-testid="ds-crumb-division">{name}</strong>
              </>
            )}
          </nav>
        </div>
      </header>

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>

      {!tournamentId ? (
        <EmptyState title="No tournament selected" description="Open the division from the Bout Schedule overview." />
      ) : loading ? (
        <Spinner label="Loading the division…" />
      ) : !data ? null : !division ? (
        <EmptyState
          title="Division not available"
          description="This division has no published bracket with bouts in this tournament."
        />
      ) : !draft ? (
        <Spinner label="Loading the division…" />
      ) : (
        <>
          <section className="ds-card ds-division" data-testid="bs-division-context">
            <div className="ds-division__top">
              <GenderIcon
                className={`ds-division__gender ds-division__gender--${division.gender}`}
                aria-hidden="true"
              />
              <h2 className="ds-division__name" data-testid="bs-division-title">
                {name}
              </h2>
              <span className="ds-pill ds-pill--bracket" title="The source bracket is published (not the schedule)">
                Published Draw
              </span>
              <span className="ds-division__facts">
                <span className="ds-chip" data-testid="bs-ctx-bouts">
                  {plural(division.bouts, 'Bout')}
                </span>
                <span className="ds-chip" data-testid="bs-ctx-byes">
                  {plural(division.byes, 'BYE')}
                </span>
                {live ? (
                  <span className="ds-state ds-state--published" data-testid="ds-state">
                    <LockIcon aria-hidden="true" /> Published v{data.publication.version}
                  </span>
                ) : (
                  <DivisionStatusPill status={division.status} />
                )}
                {published && !live && (
                  <span className="ds-state ds-state--published" data-testid="ds-state-live">
                    v{data.publication.version} on website
                  </span>
                )}
                {approved && (
                  <span className="ds-state ds-state--approved" data-testid="ds-state">
                    Approved — Changes Require Reapproval
                  </span>
                )}
              </span>
            </div>

            <DivisionSettings
              data={data}
              draft={draft}
              canEdit={canEdit}
              rings={activeRings}
              onRing={(ringId) => update((d) => ({ ...d, defaultRingId: Number(ringId) || null }))}
              onFirst={(first) => update((d) => ({ ...d, first }))}
              onInterval={(interval) => update((d) => ({ ...d, interval: Number(interval) }))}
              onApply={applyToAll}
              addingRing={addingRing}
              onAddRing={() => setAddingRing(true)}
              onCancelRing={() => setAddingRing(false)}
              onCreateRing={addRing}
              approved={approved}
            />
          </section>

          {!perms.edit && (
            <p className="ds-banner" data-testid="ds-readonly">
              <InfoIcon aria-hidden="true" /> Read-only: changing the schedule needs the schedule permission.
            </p>
          )}
          {schedule.requiresReview && (
            <p className="ds-banner ds-banner--amber">
              <AlertIcon aria-hidden="true" /> The published brackets changed since the schedule was last reviewed.
            </p>
          )}
          <Alert type="success" onDismiss={() => setNotice('')}>
            {notice}
          </Alert>
          {saveError && (
            <div data-testid="ds-save-error">
              <ScheduleConflicts
                verb="Save"
                issues={saveError.issues}
                message={times12h(saveError.message)}
                describeBout={describeBout}
                dayOf={dayOf}
              />
            </div>
          )}

          {byes.length > 0 && (
            <section className="ds-card ds-byes" data-testid="ds-byes">
              <button
                type="button"
                className="ds-byes__head"
                aria-expanded={byesOpen}
                onClick={() => setByesOpen((o) => !o)}
                data-testid="ds-byes-toggle"
              >
                <ArrowDownIcon className={`ds-byes__chevron${byesOpen ? '' : ' is-closed'}`} aria-hidden="true" />
                <span className="ds-byes__title">BYEs ({byes.length})</span>
                <span className="ds-byes__note">
                  <InfoIcon aria-hidden="true" /> Automatic Advancement
                </span>
              </button>
              {byesOpen && (
                <ul className="ds-byes__list">
                  {byes.map((b) => {
                    const athlete = b.red?.nameEn || b.red?.nameAr ? b.red : b.blue
                    return (
                      <li key={b.id} className="ds-bye" data-bout={b.id} data-testid="ds-bye">
                        <span className="ds-bye__tag">BYE</span>
                        <Avatar athlete={athlete} divisionId={id} />
                        <span className="ds-bye__who">
                          <strong>{athlete?.nameEn || athlete?.nameAr || 'No athlete'}</strong>
                          <Nationality iso={athlete?.nationality} />
                        </span>
                        <span className="ds-bye__ref" data-testid="ds-bye-ref">
                          Bracket Match {b.position} of {slotsInRound[b.round]}
                        </span>
                        <span className="ds-bye__to">→ Advances to {roundNames[b.round + 1] || 'the next round'}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )}

          <h3 className="ds-bouts-title">
            <GlovesIcon aria-hidden="true" /> Bouts ({fought.length})
          </h3>
          {dirty && shifted.length > 0 && (
            <p className="ds-banner ds-banner--amber" data-testid="ds-shift-note">
              <AlertIcon aria-hidden="true" /> These changes also move {plural(shifted.length, 'bout')} of other
              divisions to a new time on a shared ring. You will be asked to confirm when saving.
            </p>
          )}
          <ol className="ds-bouts">
            {fought.map((b) => {
              const v = draft.bouts[b.id]
              const changed = v.saved && (v.ringId !== b.ringId || v.date !== b.date || v.position !== b.queuePosition)
              const options = timeOptions(data, draft, b.id, order)
              const disabled = !canEdit || b.locked
              const numbered = b.officialNumber != null
              return (
                <li
                  key={b.id}
                  className={`ds-row${issueBouts.has(b.id) ? ' has-issue' : ''}`}
                  data-bout={b.id}
                  data-testid="ds-bout"
                >
                  <div className="ds-card ds-fight">
                    <div className="ds-fight__id">
                      <span className="ds-round" data-testid="ds-round">
                        {b.roundEn}
                      </span>
                      {numbered && (
                        <span className="ds-official" data-testid="ds-official">
                          Bout #{b.officialNumber}
                        </span>
                      )}
                      <span className="ds-ref" data-testid="ds-ref">
                        Bracket Match {b.position} of {slotsInRound[b.round]}
                      </span>
                    </div>
                    <Side side="red" athlete={b.red} text={placeholder(b.redPlaceholder)} divisionId={id} />
                    <span className="ds-vs" aria-hidden="true">
                      VS
                    </span>
                    <Side side="blue" athlete={b.blue} text={placeholder(b.bluePlaceholder)} divisionId={id} />
                  </div>
                  <div className="ds-card ds-slot" data-testid="ds-slot">
                    <label className="ds-field">
                      <span>
                        <PinIcon aria-hidden="true" /> Ring
                      </span>
                      <select
                        value={v.ringId || ''}
                        disabled={disabled || crossBlocked(b)}
                        onChange={(e) => setRing(b, e.target.value)}
                        data-testid="ds-ring"
                      >
                        {!v.ringId && <option value="">Select ring</option>}
                        {data.rings.map((r) => (
                          <option key={r.id} value={r.id} disabled={!r.isActive}>
                            {r.name}
                            {r.isActive ? '' : ' (inactive)'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="ds-field">
                      <span>
                        <EventsIcon aria-hidden="true" /> Day
                      </span>
                      <select
                        value={v.date || ''}
                        disabled={disabled || crossBlocked(b)}
                        onChange={(e) => setDate(b, e.target.value)}
                        data-testid="ds-date"
                      >
                        {!v.date && (
                          <option value="" disabled>
                            Select Day
                          </option>
                        )}
                        {data.tournament.days.map((d, i) => (
                          <option key={d} value={d}>
                            Day {i + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="ds-field ds-field--time">
                      <span>
                        <ClockIcon aria-hidden="true" /> Time
                      </span>
                      <select
                        value={v.manual ? 'exact' : v.position != null ? v.position - 1 : ''}
                        disabled={disabled || !v.ringId || !v.date}
                        onChange={(e) => setTime(b, e.target.value)}
                        data-testid="ds-time"
                      >
                        {v.position == null && !v.manual && <option value="">—</option>}
                        {v.manual && (
                          <option value="exact" disabled>
                            {to12h(v.manual)}
                          </option>
                        )}
                        {options.map((o) => (
                          <option key={o.index} value={o.index}>
                            {to12h(o.time)}
                          </option>
                        ))}
                      </select>
                      <span className="ds-exact">
                        <span className="ds-exact__label">Exact time</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="HH:mm"
                          maxLength={5}
                          value={v.timeText || ''}
                          disabled={disabled || !v.ringId || !v.date}
                          onChange={(e) => setExact(b, e.target.value.trim())}
                          aria-label={`Exact start time for ${b.roundEn}, Bracket Match ${b.position} (HH:mm, 24-hour)`}
                          aria-invalid={Boolean((v.timeText && !isExactTime(v.timeText)) || disorder[b.id])}
                          data-testid="ds-exact-time"
                        />
                      </span>
                    </label>
                    {v.timeText && !isExactTime(v.timeText) && (
                      <p className="ds-slot__error" role="alert" data-testid="ds-time-error">
                        “{v.timeText}” is not a valid time. Enter it as HH:mm (00:00–23:59), for example 09:07.
                      </p>
                    )}
                    {isExactTime(v.timeText) && disorder[b.id] && (
                      <p className="ds-slot__error" role="alert" data-testid="ds-time-error">
                        {to12h(disorder[b.id].time)} is not after the bout before it in this ring on this day (
                        {to12h(disorder[b.id].previousTime)}). Enter a later time or choose another slot.
                      </p>
                    )}
                    {changed && <span className="ds-slot__tag ds-slot__tag--changed">Changed — not saved</span>}
                    {b.locked && <span className="ds-slot__tag">Result recorded — slot protected</span>}
                    <span className="ds-sr" data-testid="ds-time-value">
                      {times[b.id] || ''}
                    </span>
                  </div>
                </li>
              )
            })}
          </ol>

          <footer className="ds-actions">
            <button type="button" className="ds-btn" onClick={() => leave(overview)} data-testid="ds-back-bottom">
              <ArrowLeftIcon aria-hidden="true" /> Back to Published Divisions
            </button>
            {canEdit && (
              <span className="ds-actions__main">
                <button
                  type="button"
                  className="ds-btn"
                  onClick={reset}
                  disabled={!dirty || busy}
                  data-testid="ds-reset"
                >
                  <ResetIcon aria-hidden="true" /> Reset Changes
                </button>
                <button
                  type="button"
                  className="ds-btn ds-btn--primary"
                  onClick={save}
                  disabled={
                    busy ||
                    (!dirty && !unsaved && division.status.key !== 'not_scheduled') ||
                    !activeRings.length ||
                    badTimes > 0 ||
                    Object.keys(disorder).length > 0
                  }
                  title={
                    badTimes > 0 || Object.keys(disorder).length > 0
                      ? 'Correct the highlighted bout times before saving.'
                      : undefined
                  }
                  data-testid="ds-save"
                >
                  <SaveIcon aria-hidden="true" /> {busy ? 'Saving…' : 'Save Division Schedule'}
                </button>
              </span>
            )}
          </footer>
        </>
      )}

      {confirm && (
        <ConfirmSave
          preview={confirm}
          data={data}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={(reason) => commit({ confirm: true, reason, approvalChangeReason: reason })}
        />
      )}
    </div>
  )
}

function Side({ side, athlete, text, divisionId }) {
  const known = athlete?.nameEn || athlete?.nameAr
  return (
    <div className={`ds-side ds-side--${side}`} data-corner={side}>
      <span className={`ds-side__bar ds-side__bar--${side}`} aria-hidden="true" />
      {known ? (
        <Avatar athlete={athlete} divisionId={divisionId} />
      ) : (
        <span className="ds-avatar ds-avatar--tbd" aria-hidden="true">
          <ResultsIcon />
        </span>
      )}
      <div className="ds-side__text">
        <span className="ds-side__label">{side === 'red' ? 'RED CORNER' : 'BLUE CORNER'}</span>
        <strong className="ds-side__name" data-testid={`ds-${side}-name`}>
          {known ? athlete.nameEn || athlete.nameAr : text}
        </strong>
        {known && <Nationality iso={athlete.nationality} />}
      </div>
    </div>
  )
}

function DivisionSettings({
  data,
  draft,
  canEdit,
  rings,
  onRing,
  onFirst,
  onInterval,
  onApply,
  addingRing,
  onAddRing,
  onCancelRing,
  onCreateRing,
  approved,
}) {
  const [ringName, setRingName] = useState('')
  const [ringReason, setRingReason] = useState('')
  const [ringError, setRingError] = useState('')
  const intervals = INTERVALS.includes(Number(draft.interval))
    ? INTERVALS
    : [...INTERVALS, Number(draft.interval)].sort((a, b) => a - b)
  return (
    <div className="ds-settings" data-testid="ds-settings">
      <div className="ds-settings__label">
        <SettingsIcon aria-hidden="true" /> Division Settings
      </div>
      <div className="ds-settings__group">
        <label className="ds-field">
          <span>Ring (default for all bouts)</span>
          <select
            value={draft.defaultRingId || ''}
            disabled={!canEdit}
            onChange={(e) => onRing(e.target.value)}
            data-testid="ds-default-ring"
          >
            {!draft.defaultRingId && <option value="">No ring yet</option>}
            {rings.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        {canEdit && !addingRing && (
          <button type="button" className="ds-btn ds-btn--light" onClick={onAddRing} data-testid="ds-add-ring">
            <PlusIcon aria-hidden="true" /> Add New Ring
          </button>
        )}
        {canEdit && addingRing && (
          <form
            className="ds-addring"
            onSubmit={async (e) => {
              e.preventDefault()
              setRingError('')
              const err = await onCreateRing(ringName.trim(), ringReason.trim())
              if (err) setRingError(err)
              else {
                setRingName('')
                setRingReason('')
              }
            }}
          >
            <input
              value={ringName}
              onChange={(e) => setRingName(e.target.value)}
              placeholder={`Ring ${String.fromCharCode(65 + data.rings.length)}`}
              aria-label="New ring name"
              maxLength={60}
              autoFocus
              data-testid="ds-ring-name"
            />
            {approved && (
              <input
                value={ringReason}
                onChange={(e) => setRingReason(e.target.value)}
                placeholder="Reason (cancels the approval)"
                aria-label="Reason for changing the approved schedule"
                maxLength={500}
                className="ds-addring__reason"
                data-testid="ds-ring-reason"
              />
            )}
            <button
              type="submit"
              className="ds-btn ds-btn--light"
              disabled={!ringName.trim() || (approved && !ringReason.trim())}
              data-testid="ds-ring-create"
            >
              Add
            </button>
            <button type="button" className="ds-btn ds-btn--ghost" onClick={onCancelRing}>
              Cancel
            </button>
            {ringError && <span className="ds-addring__error">{ringError}</span>}
          </form>
        )}
      </div>
      <div className="ds-settings__group">
        <label className="ds-field">
          <span>First Bout Start Time</span>
          <span className="ds-input">
            <ClockIcon aria-hidden="true" />
            <select
              value={draft.first}
              disabled={!canEdit}
              onChange={(e) => onFirst(e.target.value)}
              data-testid="ds-first"
            >
              {[
                ['AM — morning', (t) => t < '12:00'],
                ['PM — afternoon & evening', (t) => t >= '12:00'],
              ].map(([group, inGroup]) => (
                <optgroup key={group} label={group}>
                  {(START_TIMES.includes(draft.first) ? START_TIMES : [...START_TIMES, draft.first].sort())
                    .filter(inGroup)
                    .map((t) => (
                      <option key={t} value={t}>
                        {to12h(t)}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </span>
        </label>
      </div>
      <div className="ds-settings__group">
        <label className="ds-field">
          <span>Bout Interval (minutes)</span>
          <span className="ds-input">
            <ClockIcon aria-hidden="true" />
            <select
              value={draft.interval}
              disabled={!canEdit}
              onChange={(e) => onInterval(e.target.value)}
              data-testid="ds-interval"
            >
              {intervals.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </span>
        </label>
      </div>
      {canEdit && (
        <button
          type="button"
          className="ds-btn ds-btn--apply"
          onClick={onApply}
          disabled={!draft.defaultRingId}
          data-testid="ds-apply"
          title="Assign the default ring to every bout and use this start time and interval for that ring on the bouts' days"
        >
          <CheckIcon aria-hidden="true" /> Apply to All Bouts
        </button>
      )}
    </div>
  )
}

function ConfirmSave({ preview, busy, onCancel, onConfirm }) {
  const [reason, setReason] = useState('')
  const cancelsApproval = !!preview.invalidatesApproval
  const needsReason = preview.crossing > 0 || cancelsApproval
  return (
    <div className="ds-modal" role="dialog" aria-modal="true" data-testid="ds-confirm">
      <div className="ds-modal__box">
        <h2>Confirm the effects of this save</h2>
        {preview.createsSchedule && <p>This first save creates the tournament&rsquo;s schedule Draft.</p>}
        {cancelsApproval && (
          <p className="ds-modal__warn" data-testid="ds-confirm-approval">
            This schedule is approved. Saving these changes cancels the approval: the schedule returns to Draft and must
            be submitted for review and approved again before it can be published.
          </p>
        )}
        {preview.timingChanges.length > 0 && (
          <>
            <h3>Shared ring timing</h3>
            <ul data-testid="ds-confirm-timing">
              {preview.timingChanges.map((t, i) => (
                <li key={i}>
                  {t.ring} on {dayLabel(t.date)}: {times12h(t.from)} → <strong>{times12h(t.to)}</strong>
                  {t.otherBouts > 0 && ` — also used by ${plural(t.otherBouts, 'bout')} of other divisions`}
                </li>
              ))}
            </ul>
          </>
        )}
        {preview.othersAffected.length > 0 && (
          <>
            <h3>Other divisions&rsquo; bouts that change</h3>
            <ul className="ds-modal__list" data-testid="ds-confirm-others">
              {preview.othersAffected.map((o) => (
                <li key={o.boutId}>
                  {o.division}: {times12h(o.from)} → <strong>{times12h(o.to)}</strong>
                </li>
              ))}
            </ul>
          </>
        )}
        {needsReason && (
          <label className="ds-field">
            <span>
              Reason (required)
              {cancelsApproval && ' — for changing the approved schedule'}
              {preview.crossing > 0 && ` — ${plural(preview.crossing, 'scheduled bout')} move to another ring or day`}
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              data-testid="ds-confirm-reason"
            />
          </label>
        )}
        <p className="bs-muted">Saving never approves or publishes the schedule.</p>
        <div className="ds-modal__actions">
          <button type="button" className="ds-btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="ds-btn ds-btn--primary"
            disabled={busy || (needsReason && !reason.trim())}
            onClick={() => onConfirm(reason.trim() || undefined)}
            data-testid="ds-confirm-save"
          >
            <SaveIcon aria-hidden="true" /> {busy ? 'Saving…' : 'Confirm and Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

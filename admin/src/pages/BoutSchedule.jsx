import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { boutScheduleApi, tournamentsApi } from '../api/resources'
import { extractErrorMessage } from '../api/utils'
import Alert from '../components/Alert'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import AthleteAvatar from '../components/AthleteAvatar'
import { BracketPhotoContext } from '../components/bracketPhotoContext'
import { categoryName, divisionTitle, drawError } from '../drawLabels'
import { divisionScheduleStatus, orderDivisions } from '../boutScheduleStatus'
import { times12h, to12h } from '../divisionPlan'
import ScheduleConflicts from '../components/ScheduleConflicts'
import {
  AlertIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BracketIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  EditIcon,
  FemaleIcon,
  HistoryIcon,
  InfoIcon,
  LayersIcon,
  LockIcon,
  ClockIcon,
  MaleIcon,
  MoveIcon,
  PlusIcon,
  ScheduleIcon,
  TrashIcon,
} from '../components/Icons'

/**
 * Stage 5 — REQ-11 Bout Schedule.
 *
 * A vertical list of bout cards for one tournament day and one ring (Red on
 * the left, Blue on the right), made only from published brackets. The
 * server owns every rule: numbering grouped by ring and restarting each day,
 * start times from each ring's own timing for that day, athlete limits and
 * rest (progression-aware), permissions and the Draft → Review → Approved
 * lifecycle. This page shows what the server returns and sends each change
 * with the revision it is showing, so a stale page can never overwrite a newer
 * schedule.
 */

const TABS = [
  { key: 'divisions', label: 'Divisions Overview' },
  { key: 'schedule', label: 'Day & Ring Schedule' },
  { key: 'setup', label: 'Rings & Divisions' },
  { key: 'validation', label: 'Validation' },
  { key: 'exceptions', label: 'Exceptions' },
  { key: 'history', label: 'Change History' },
]

/** "2026-12-15" → "15 Dec 2026", with no time-zone shift. */
export function dayLabel(iso, withWeekday = false) {
  if (!iso) return '—'
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withWeekday ? { weekday: 'short' } : {}),
  })
}

function statusOf(schedule) {
  if (!schedule?.status) return { label: 'Not Created', tone: 'muted' }
  if (schedule.requiresReview) return { label: 'Requires Review', tone: 'amber' }
  if (schedule.status === 'approved') return { label: 'Approved', tone: 'green' }
  if (schedule.status === 'review') return { label: 'In Review', tone: 'blue' }
  return { label: 'Draft', tone: 'neutral' }
}

function StatusPill({ tone, children }) {
  return (
    <span className={`dm-status dm-status--${tone}`}>
      <span className="dm-status__dot" aria-hidden="true" />
      {children}
    </span>
  )
}

export default function BoutSchedule() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tournamentId = Number(searchParams.get('tournament')) || 0
  // The Divisions overview is the entry point. A link that already names a day
  // or ring (from before it existed) still opens the day/ring viewer; the other
  // tools stay at ?tab=… exactly as they were.
  const tabParam = searchParams.get('tab')
  const tab = TABS.some((t) => t.key === tabParam)
    ? tabParam
    : searchParams.get('day') || searchParams.get('ring')
      ? 'schedule'
      : 'divisions'
  const openDivision = Number(searchParams.get('division')) || null
  const [tournaments, setTournaments] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState(null)
  const dirty = useRef(false)

  const setView = useCallback(
    (changes) => {
      const next = new URLSearchParams(searchParams)
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '' || value === undefined) next.delete(key)
        else next.set(key, String(value))
      }
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  /** Unsaved-change protection for switching day, ring, tab or tournament. */
  const guarded = useCallback((go) => {
    if (dirty.current && !window.confirm('You have unsaved changes. Leave them and continue?')) return
    dirty.current = false
    go()
  }, [])

  useEffect(() => {
    const onUnload = (event) => {
      if (!dirty.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

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
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = useCallback(async () => {
    if (!tournamentId) return
    try {
      setData(await boutScheduleApi.view(tournamentId))
      setError('')
    } catch (err) {
      setError(drawError(err, 'Could not load the bout schedule.'))
    } finally {
      setLoading(false)
    }
  }, [tournamentId])

  useEffect(() => {
    setLoading(true)
    setData(null)
    load()
  }, [load])

  // Others may change the schedule (or the brackets): re-read when the window regains focus.
  useEffect(() => {
    const refresh = () => document.visibilityState === 'visible' && !dirty.current && load()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [load])

  /**
   * Runs one server change. On success the page reloads the schedule and
   * shows `done`; on failure the server's message is shown. Returns
   * { ok, error } so dialogs can keep their own error line.
   */
  const act = useCallback(
    async (fn, done) => {
      try {
        await fn()
        await load()
        if (done) setNotice(done)
        return { ok: true }
      } catch (err) {
        const message = drawError(err, 'That did not work.')
        const issues = err?.response?.data?.issues || []
        if (err?.response?.data?.code === 'stale_revision') await load()
        return { ok: false, error: message, issues, code: err?.response?.data?.code }
      }
    },
    [load],
  )

  const days = data?.tournament?.days || []
  const day = days.includes(searchParams.get('day')) ? searchParams.get('day') : days[0]
  const rings = data?.rings || []
  const activeRings = rings.filter((r) => r.isActive)
  const ringParam = Number(searchParams.get('ring'))
  const ring = rings.find((r) => r.id === ringParam) || activeRings[0] || rings[0] || null
  const schedule = data?.schedule
  const perms = data?.permissions || {}
  const status = statusOf(schedule)
  const approved = schedule?.status === 'approved'
  const canEdit = perms.edit && !!schedule?.status && !approved
  const blocking = (data?.issues || []).filter((i) => i.severity === 'blocking')

  if (!tournamentId && tournaments.length === 0 && !error) return <Spinner label="Loading…" />

  // An address from the earlier inline-expansion version (?division=…) opens that division's own page.
  if (tab === 'divisions' && openDivision && tournamentId)
    return <Navigate replace to={`/bout-schedule/divisions/${openDivision}?tournament=${tournamentId}`} />

  if (tab === 'divisions')
    return (
      <DivisionsLanding
        tournaments={tournaments}
        tournamentId={tournamentId}
        data={data}
        loading={loading}
        error={error}
        onDismissError={() => setError('')}
        onTournament={(value) => guarded(() => setSearchParams({ tournament: value }))}
        onReload={load}
      />
    )

  return (
    <div className="pt-page dm-page bs-page">
      <header className="bs-head">
        <div className="bs-head__main">
          <h1 className="dm-title">
            <ScheduleIcon className="bs-head__icon" aria-hidden="true" /> Bout Schedule
          </h1>
          <nav className="dm-crumbs" aria-label="Breadcrumb">
            <Link to="/tournaments">Tournaments</Link>
            <ChevronRightIcon className="dm-crumbs__sep" aria-hidden="true" />
            <span>{data?.tournament?.nameEn || data?.tournament?.nameAr || 'Tournament'}</span>
            <ChevronRightIcon className="dm-crumbs__sep" aria-hidden="true" />
            <strong>Bout Schedule</strong>
          </nav>
          {data && (
            <p className="bs-head__meta" data-testid="bs-tournament">
              <strong>{data.tournament.nameEn || data.tournament.nameAr}</strong>
              <span>
                {dayLabel(data.tournament.startDate)} – {dayLabel(data.tournament.endDate)}
              </span>
              <StatusPill tone={status.tone}>{status.label}</StatusPill>
              {schedule?.status && <span className="bs-muted">Revision {schedule.revision}</span>}
              {approved && schedule.approvedBy && (
                <span className="bs-muted">
                  Approved by {schedule.approvedBy} · {new Date(`${schedule.approvedAt}Z`).toLocaleString('en-GB')}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="bs-head__side">
          {tournaments.length > 0 && (
            <label className="pt-tournament">
              <span>Tournament</span>
              <select
                value={tournamentId || ''}
                onChange={(event) => guarded(() => setSearchParams({ tournament: event.target.value }))}
              >
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nameEn || t.nameAr}
                  </option>
                ))}
              </select>
            </label>
          )}
          {data && (
            <LifecycleActions
              data={data}
              perms={perms}
              blocking={blocking}
              onAct={act}
              openDialog={setDialog}
              tournamentId={tournamentId}
            />
          )}
        </div>
      </header>

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>
      <Alert type="success" onDismiss={() => setNotice('')}>
        {notice}
      </Alert>

      {loading && !data ? (
        <Spinner label="Loading the schedule…" />
      ) : !data ? null : !schedule?.status ? (
        <>
          <p className="bs-back">
            <button type="button" className="dd-sync__link" onClick={() => setView({ tab: 'divisions' })}>
              ← Divisions Overview
            </button>
          </p>
          <NoSchedule
            data={data}
            perms={perms}
            onCreate={() => act(() => boutScheduleApi.create(tournamentId), 'Draft created.')}
          />
        </>
      ) : (
        <>
          {schedule.requiresReview && (
            <p className="bs-banner bs-banner--amber" role="alert" data-testid="bs-requires-review">
              <AlertIcon aria-hidden="true" /> The source brackets changed since this schedule was last reviewed.
              {approved ? ' A schedule approver must withdraw the approval before it can be updated.' : ' '}
              <button
                type="button"
                className="dd-sync__link"
                onClick={() => guarded(() => setView({ tab: 'validation' }))}
              >
                Review the changes
              </button>
            </p>
          )}
          {approved && (
            <p className="bs-banner bs-banner--green">
              <CheckIcon aria-hidden="true" /> This schedule is approved and locked. Changes need an approver to
              withdraw the approval (with a reason) and a new review and approval.
            </p>
          )}

          <div className="bs-tabs" role="tablist" aria-label="Bout Schedule sections">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                className={`bs-tab${tab === t.key ? ' is-active' : ''}`}
                onClick={() => guarded(() => setView({ tab: t.key }))}
              >
                {t.label}
                {t.key === 'validation' && blocking.length > 0 && (
                  <span className="bs-count bs-count--bad">{blocking.length}</span>
                )}
              </button>
            ))}
          </div>

          {tab === 'schedule' && (
            <ScheduleTab
              data={data}
              day={day}
              ring={ring}
              canEdit={canEdit}
              perms={perms}
              tournamentId={tournamentId}
              onDay={(value) => guarded(() => setView({ day: value }))}
              onRing={(value) => guarded(() => setView({ ring: value }))}
              onAct={act}
              openDialog={setDialog}
            />
          )}
          {tab === 'setup' && (
            <SetupTab data={data} canEdit={canEdit} tournamentId={tournamentId} onAct={act} dirty={dirty} />
          )}
          {tab === 'validation' && (
            <ValidationTab data={data} canEdit={canEdit} tournamentId={tournamentId} onAct={act} />
          )}
          {tab === 'exceptions' && (
            <ExceptionsTab
              data={data}
              perms={perms}
              approved={approved}
              tournamentId={tournamentId}
              onAct={act}
              dirty={dirty}
            />
          )}
          {tab === 'history' && <HistoryTab tournamentId={tournamentId} revision={schedule.revision} />}
        </>
      )}

      {dialog?.kind === 'move' && (
        <MoveDialog
          {...dialog}
          data={data}
          perms={perms}
          tournamentId={tournamentId}
          onAct={act}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'reason' && <ReasonDialog {...dialog} onClose={() => setDialog(null)} />}
    </div>
  )
}

/* ── lifecycle ─────────────────────────────────────────────────────────── */

function LifecycleActions({ data, perms, blocking, onAct, openDialog, tournamentId }) {
  const s = data.schedule
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!s?.status) return null
  const run = async (fn, done) => {
    if (busy) return
    setBusy(true)
    setError('')
    const r = await onAct(fn, done)
    if (!r.ok) setError(r.error)
    setBusy(false)
  }
  return (
    <div className="bs-lifecycle">
      {perms.edit && s.status === 'draft' && (
        <button
          type="button"
          className="dd-btn dd-btn--ghost"
          disabled={busy}
          title={blocking.length ? `${blocking.length} blocking issue(s) to resolve first` : undefined}
          onClick={() =>
            run(() => boutScheduleApi.submit(tournamentId, { expectedRevision: s.revision }), 'Submitted for review.')
          }
          data-testid="bs-submit"
        >
          Submit for Review
        </button>
      )}
      {perms.approve && s.status === 'review' && (
        <button
          type="button"
          className="dd-btn dd-btn--primary"
          disabled={busy}
          data-testid="bs-approve"
          onClick={() =>
            openDialog({
              kind: 'reason',
              title: 'Approve Bout Schedule',
              text: `Approve revision ${s.revision} of the bout schedule for ${data.tournament.nameEn}? Every review check runs again before approval; nothing changes if one fails.`,
              confirm: 'Approve Schedule',
              needsReason: false,
              onConfirm: async () =>
                onAct(
                  () => boutScheduleApi.approve(tournamentId, { expectedRevision: s.revision }),
                  'Schedule approved.',
                ),
            })
          }
        >
          <CheckIcon aria-hidden="true" /> Approve Schedule
        </button>
      )}
      {perms.approve && s.status === 'approved' && (
        <button
          type="button"
          className="dd-btn dd-btn--ghost"
          disabled={busy}
          onClick={() =>
            openDialog({
              kind: 'reason',
              title: 'Withdraw Approval',
              text: 'The schedule returns to Draft. Nothing in it changes; it must be reviewed and approved again.',
              confirm: 'Withdraw Approval',
              needsReason: true,
              onConfirm: async (reason) =>
                onAct(
                  () => boutScheduleApi.withdraw(tournamentId, { reason, expectedRevision: s.revision }),
                  'Approval withdrawn; the schedule is a Draft again.',
                ),
            })
          }
        >
          Withdraw Approval
        </button>
      )}
      {error && (
        <p className="bs-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function NoSchedule({ data, perms, onCreate }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const published = data.categories.reduce((n, c) => n + c.divisions.length, 0)
  const bouts = data.bouts.filter((b) => !b.isBye && !b.isWalkover).length
  if (published === 0) {
    return (
      <EmptyState
        title="No published bracket yet"
        description={`A bout schedule is made from published brackets only. ${
          data.unpublishedDivisions.length
            ? `${data.unpublishedDivisions.length} division(s) have a Draft bracket that is not published yet; publish it in Draw Management first.`
            : 'Generate and publish a bracket in Draw Management first.'
        }`}
      />
    )
  }
  return (
    <section className="bs-card bs-empty" data-testid="bs-no-schedule">
      <ScheduleIcon aria-hidden="true" />
      <h2>No schedule yet</h2>
      <p>
        {published} published bracket(s) with {bouts} bout(s) to schedule. Create the Draft, add rings, set each
        ring&rsquo;s timing for each day, then assign the bouts.
      </p>
      {perms.edit ? (
        <button
          type="button"
          className="dd-btn dd-btn--primary"
          disabled={busy}
          data-testid="bs-create"
          onClick={async () => {
            setBusy(true)
            const r = await onCreate()
            if (!r.ok) setError(r.error)
            setBusy(false)
          }}
        >
          <PlusIcon aria-hidden="true" /> {busy ? 'Creating…' : 'Create Schedule Draft'}
        </button>
      ) : (
        <p className="bs-muted">Creating the schedule needs the schedule permission.</p>
      )}
      {error && <p className="bs-error">{error}</p>}
    </section>
  )
}

/* ── Divisions overview (the landing page) ─────────────────────────────── */

/** Every published division with its overview status, derived from the saved schedule records. */
export function divisionsWithStatus(data) {
  if (!data) return []
  const changed = new Set((data.sourceChanges || []).map((c) => c.divisionId))
  const boutsOf = new Map()
  for (const b of data.bouts) {
    if (!boutsOf.has(b.divisionId)) boutsOf.set(b.divisionId, [])
    boutsOf.get(b.divisionId).push(b)
  }
  return orderDivisions(data.categories).map((d) => ({
    ...d,
    status: divisionScheduleStatus({
      scheduleExists: !!data.schedule?.status,
      // Persisted by Save Division Schedule (or the one-time migration from explicit history).
      // Only a save on the Division Schedule page counts — never a marker inferred from old history.
      saved: !!d.scheduleSavedAt && d.scheduleSavedSource === 'division_page',
      bouts: boutsOf.get(d.id) || [],
      issues: data.issues || [],
      bracketChanged: changed.has(d.id),
      // Published only while the tournament's current publication is the saved revision (Step 3).
      publication: data.publication
        ? { publishedAt: data.publication.publishedAt, current: data.publication.current }
        : null,
    }),
  }))
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "Under 8 — 16 kg": the gender is given by the group header. */
export const ageWeightLabel = (d) => `${categoryName(d.categoryEn)} — ${d.weightEn}`

const STATUS_ICON = { not_scheduled: ClockIcon, scheduled: ScheduleIcon, published: CheckIcon }

export function DivisionStatusPill({ status }) {
  const Icon = STATUS_ICON[status.key]
  return (
    <span className={`bs-dstatus bs-dstatus--${status.tone}`} data-testid="bs-division-status" data-status={status.key}>
      <Icon aria-hidden="true" />
      {status.label}
    </span>
  )
}

/** The internal Draft → Review → Approved state (not the public publication). */
function lifecycleOf(schedule, publication) {
  if (publication?.current !== false && publication)
    return { label: `Published (v${publication.version})`, tone: 'green', lock: true }
  // An update is being prepared while the published version stays on the website.
  if (publication) {
    const base = lifecycleOf(schedule, null)
    return { ...base, label: `Update ${base.label} · v${publication.version} on website` }
  }
  if (!schedule?.status) return { label: 'No Schedule Yet', tone: 'muted' }
  if (schedule.requiresReview) return { label: 'Requires Review', tone: 'amber' }
  // Approved schedules stay editable until published (a change cancels the approval).
  if (schedule.status === 'approved') return { label: 'Approved', tone: 'green' }
  if (schedule.status === 'review') return { label: 'In Review', tone: 'blue' }
  return { label: 'Draft', tone: 'neutral' }
}

/**
 * Tournament-level schedule actions on the landing page (Step 3): the existing
 * Draft → Review → Approved workflow plus the single, tournament-wide Publish
 * Schedule — each shown only when it applies and the user holds its
 * permission. The server checks everything again; refusals are summarised by
 * ScheduleConflicts.
 */
function ScheduleActions({ data, tournamentId, onDone, onBlocked, onNotice }) {
  const [dialog, setDialog] = useState(null)
  const s = data.schedule || {}
  const perms = data.permissions || {}
  const pub = data.publication
  const revision = s.revision ?? 0
  const run = async (fn, done, verb) => {
    try {
      const r = await fn()
      onBlocked(null)
      await onDone()
      onNotice(typeof done === 'function' ? done(r) : done)
      return { ok: true }
    } catch (err) {
      const body = err?.response?.data
      const issues = body?.issues || []
      if (issues.length || body?.code === 'publish_blocked' || body?.code === 'blocking_issues') {
        onBlocked({ verb, issues, message: drawError(err, 'That did not work.') })
        return { ok: true } // close the dialog; the summary explains what to fix
      }
      return { ok: false, error: drawError(err, 'That did not work.') }
    }
  }
  const actions = []
  if (perms.edit && (!s.status || s.status === 'draft'))
    actions.push({
      key: 'submit',
      label: 'Submit for Review',
      onClick: () =>
        run(
          () => boutScheduleApi.submit(tournamentId, { expectedRevision: revision }),
          'Submitted for review.',
          'Submit',
        ),
    })
  if (perms.approve && s.status === 'review')
    actions.push({
      key: 'approve',
      label: 'Approve Schedule',
      onClick: () =>
        setDialog({
          title: 'Approve the schedule',
          text: 'Approving locks the whole tournament schedule. It does not publish it or assign official bout numbers.',
          confirm: 'Approve',
          onConfirm: () =>
            run(
              () => boutScheduleApi.approve(tournamentId, { expectedRevision: revision }),
              'Schedule approved.',
              'Approve',
            ),
        }),
    })
  if (perms.approve && s.status === 'approved')
    actions.push({
      key: 'withdraw',
      label: 'Withdraw Approval',
      ghost: true,
      onClick: () =>
        setDialog({
          title: 'Withdraw the approval',
          text: pub
            ? `The schedule becomes a Draft again so it can be changed, then reviewed and approved again. Published version ${pub.version} stays on the public website until an updated version is published.`
            : 'The schedule becomes a Draft again so it can be changed, then reviewed and approved again.',
          confirm: 'Withdraw Approval',
          needsReason: true,
          onConfirm: (reason) =>
            run(() => boutScheduleApi.withdraw(tournamentId, { reason }), 'Approval withdrawn.', 'Withdraw'),
        }),
    })
  if (perms.publish && (!pub || pub.current === false))
    actions.push({
      key: 'publish',
      label: pub ? 'Publish Updated Schedule' : 'Publish Schedule',
      primary: true,
      onClick: () =>
        setDialog({
          title: pub ? 'Publish the updated schedule' : 'Publish the tournament schedule',
          text: pub
            ? `The whole approved schedule is checked again and every bout receives its official number (Day 1 first, then each ring in order, then each bout’s place in its ring). It replaces version ${pub.version} on the public website; version ${pub.version} stays in the publication history.`
            : 'The whole approved schedule is checked again, every bout receives its official number (Day 1 first, then each ring in order, then each bout’s place in its ring), and the schedule appears on the public website.',
          confirm: pub ? 'Publish Updated Schedule' : 'Publish Schedule',
          onConfirm: () =>
            run(
              () => boutScheduleApi.publish(tournamentId, { expectedRevision: revision }),
              (r) =>
                r.alreadyPublished
                  ? `Already published (version ${r.version}). Nothing changed.`
                  : `Schedule published — version ${r.version}: official bouts #1–#${r.boutCount} across ${plural(r.divisionCount, 'division')}.`,
              'Publish',
            ),
        }),
    })
  if (perms.publish && pub)
    actions.push({
      key: 'unpublish',
      label: 'Unpublish',
      ghost: true,
      onClick: () =>
        setDialog({
          title: 'Unpublish the schedule',
          text: `Version ${pub.version} is removed from the public website and its official numbers are cleared from the bouts (they stay on record in that version). The schedule remains approved.`,
          confirm: 'Unpublish',
          needsReason: true,
          onConfirm: (reason) =>
            run(() => boutScheduleApi.unpublish(tournamentId, { reason }), 'Schedule unpublished.', 'Unpublish'),
        }),
    })
  return (
    <>
      {actions.map((a) => (
        <button
          key={a.key}
          type="button"
          className={`ds-btn${a.primary ? ' ds-btn--primary' : a.ghost ? ' ds-btn--light' : ''}`}
          onClick={a.onClick}
          data-testid={`bs-action-${a.key}`}
        >
          {a.label}
        </button>
      ))}
      {dialog && <ReasonDialog {...dialog} onClose={() => setDialog(null)} />}
    </>
  )
}

function DivisionsLanding({ tournaments, tournamentId, data, loading, error, onDismissError, onTournament, onReload }) {
  const divisions = useMemo(() => divisionsWithStatus(data), [data])
  const [blocked, setBlocked] = useState(null)
  const [notice, setNotice] = useState('')
  const byId = useMemo(() => Object.fromEntries((data?.bouts || []).map((b) => [b.id, b])), [data])
  const dayOf = (iso) => {
    const i = data?.tournament.days.indexOf(iso)
    return i >= 0 ? `Day ${i + 1}` : iso
  }
  const describeBout = (id) => {
    const b = byId[id]
    if (!b) return `Bout ${id}`
    const where = [b.ringName, b.date ? dayOf(b.date) : null, b.startTime ? to12h(b.startTime) : null].filter(Boolean)
    return `${b.officialNumber ? `Bout #${b.officialNumber} · ` : ''}${b.divisionEn} · ${b.roundEn} · Bracket Match ${b.position}${where.length ? ` — ${where.join(', ')}` : ''}`
  }
  const groups = ['female', 'male']
    .map((gender) => ({ gender, divisions: divisions.filter((d) => d.gender === gender) }))
    .filter((g) => g.divisions.length > 0)
  const sum = (list, key) => list.reduce((n, d) => n + d[key], 0)
  const lifecycle = lifecycleOf(data?.schedule, data?.publication)
  const name = data?.tournament?.nameEn || data?.tournament?.nameAr
  // Draw changes since the schedule was published (read-only; refreshed whenever the schedule data reloads).
  const [changes, setChanges] = useState(null)
  useEffect(() => {
    let cancelled = false
    if (!tournamentId || !data) return undefined
    boutScheduleApi
      .changes(tournamentId)
      .then((c) => !cancelled && setChanges(c))
      .catch(() => !cancelled && setChanges(null))
    return () => {
      cancelled = true
    }
  }, [tournamentId, data])
  const affected = new Map(changes?.updateRequired ? changes.divisions.map((d) => [d.divisionId, d]) : [])
  // Opened from a notification: ?highlight=<division ids> — those rows are highlighted and the first is scrolled to.
  const [searchParams] = useSearchParams()
  const highlight = useMemo(
    () => new Set((searchParams.get('highlight') || '').split(',').map(Number).filter(Boolean)),
    [searchParams],
  )
  useEffect(() => {
    if (!highlight.size || !data || !changes) return
    const first = document.querySelector('.bs-drow-item--highlight')
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlight, data, changes])
  const showChanges = (id) =>
    (document.getElementById(id ? `bs-changes-${id}` : 'bs-changes') || document.getElementById('bs-changes'))?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })

  return (
    <div className="pt-page bs-page bs-landing" data-testid="bs-landing">
      <header className="bs-lhead">
        <div className="bs-lhead__title">
          <ScheduleIcon className="bs-lhead__icon" aria-hidden="true" />
          <div>
            <h1 className="bs-lhead__h1">Bout Schedule</h1>
            <nav className="dm-crumbs" aria-label="Breadcrumb">
              <Link to="/tournaments">Tournaments</Link>
              {name && (
                <>
                  <ChevronRightIcon className="dm-crumbs__sep" aria-hidden="true" />
                  <span>{name}</span>
                </>
              )}
            </nav>
          </div>
        </div>
        {data && divisions.length > 0 && (
          <p className="bs-summary" data-testid="bs-summary">
            <LayersIcon className="bs-summary__icon" aria-hidden="true" />
            <span data-testid="bs-total-divisions">{plural(divisions.length, 'Division')}</span>
            <span className="bs-summary__sep" aria-hidden="true" />
            <span data-testid="bs-total-bouts">{plural(sum(divisions, 'bouts'), 'Bout')}</span>
            <span className="bs-summary__sep" aria-hidden="true" />
            <span data-testid="bs-total-byes">{plural(sum(divisions, 'byes'), 'BYE')}</span>
          </p>
        )}
      </header>

      <section className="bs-lcard bs-ltournament">
        {tournaments.length > 0 && (
          <label className="bs-lselect">
            <span>Tournament</span>
            <select
              value={tournamentId || ''}
              onChange={(event) => onTournament(event.target.value)}
              data-testid="bs-tournament-select"
            >
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nameEn || t.nameAr}
                </option>
              ))}
            </select>
          </label>
        )}
        {data && (
          <div className="bs-ltournament__side">
            <span
              className={`bs-lifecycle bs-lifecycle--${lifecycle.tone}`}
              data-testid="bs-lifecycle"
              title="The internal schedule review state (Draft → Review → Approved). It is not a public publication."
            >
              {lifecycle.lock && <LockIcon aria-hidden="true" />}
              {lifecycle.label}
            </span>
            <ScheduleActions
              data={data}
              tournamentId={tournamentId}
              onDone={onReload}
              onBlocked={setBlocked}
              onNotice={setNotice}
            />
          </div>
        )}
        {data?.publication && (
          <p className="bs-pubinfo" data-testid="bs-publication">
            Published version {data.publication.version} on{' '}
            {new Date(
              data.publication.publishedAt.endsWith('Z')
                ? data.publication.publishedAt
                : `${data.publication.publishedAt}Z`,
            ).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', hour12: true })}{' '}
            by {data.publication.publishedBy} · official bouts #1–#{data.publication.boutCount} ·{' '}
            {plural(data.publication.divisionCount, 'division')}
            {data.publication.current === false && (
              <span className="bs-pubinfo__update" data-testid="bs-update-in-progress">
                {' '}
                — an updated schedule is being prepared; version {data.publication.version} stays on the website until
                the update is approved and published.
              </span>
            )}
          </p>
        )}
      </section>

      {changes?.updateRequired && (
        <div className="bs-update" role="alert" data-testid="bs-update-required">
          <AlertIcon className="bs-update__icon" aria-hidden="true" />
          <div className="bs-update__text">
            <strong>Bout Schedule Update Required</strong>
            <span>
              Affected {changes.divisions.length === 1 ? 'division' : 'divisions'}:{' '}
              {changes.divisions.map((d, i) => (
                <span key={d.divisionId}>
                  {i > 0 && (i === changes.divisions.length - 1 ? ' and ' : ', ')}
                  <b data-testid="bs-update-division">{d.title}</b>
                </span>
              ))}
. The published schedule stays on the website as it is until an updated schedule is approved and
              published.
            </span>
          </div>
          <button
            type="button"
            className="btn btn--small bs-update__btn"
            data-testid="bs-view-changes"
            onClick={() => showChanges()}
          >
            View Changes
          </button>
        </div>
      )}

      <Alert type="success" onDismiss={() => setNotice('')}>
        {notice}
      </Alert>
      {blocked && (
        <div className="bs-blocked" data-testid="bs-blocked">
          <ScheduleConflicts
            verb={blocked.verb}
            issues={blocked.issues}
            message={times12h(blocked.message)}
            describeBout={describeBout}
            dayOf={dayOf}
          />
        </div>
      )}

      <Alert type="error" onDismiss={onDismissError}>
        {error}
      </Alert>

      {loading && !data ? (
        <Spinner label="Loading the divisions…" />
      ) : !data ? null : (
        <section className="bs-lcard bs-overview" aria-labelledby="bs-overview-title" data-testid="bs-overview">
          <h2 id="bs-overview-title" className="bs-overview__title">
            <BracketIcon aria-hidden="true" /> Divisions ({divisions.length})
          </h2>
          {divisions.length === 0 ? (
            <EmptyState
              title="No published draws yet"
              description="Only divisions with a published bracket appear here. Publish a bracket in Draw Management first."
            />
          ) : (
            groups.map((group) => {
              const GenderIcon = group.gender === 'female' ? FemaleIcon : MaleIcon
              return (
                <section
                  key={group.gender}
                  className={`bs-gender bs-gender--${group.gender}`}
                  data-gender={group.gender}
                  aria-label={`${group.gender === 'female' ? 'Female' : 'Male'} divisions`}
                >
                  <h3 className="bs-gender__head">
                    <GenderIcon className="bs-gender__icon" aria-hidden="true" />
                    <span className="bs-gender__title">
                      {group.gender === 'female' ? 'Female' : 'Male'} Divisions ({group.divisions.length})
                    </span>
                    <span className="bs-gender__totals">
                      {plural(sum(group.divisions, 'bouts'), 'Bout')} · {plural(sum(group.divisions, 'byes'), 'BYE')}
                    </span>
                  </h3>
                  <ul className="bs-gender__list">
                    {group.divisions.map((d) => (
                      <li
                        key={d.id}
                        className={highlight.has(d.id) && affected.has(d.id) ? 'bs-drow-item--highlight' : undefined}
                        data-highlight={highlight.has(d.id) && affected.has(d.id) ? 'true' : undefined}
                      >
                        <Link
                          className="bs-drow"
                          to={`/bout-schedule/divisions/${d.id}?tournament=${tournamentId}`}
                          data-division={d.id}
                          data-testid="bs-drow"
                        >
                          <span className="bs-drow__name">
                            <span data-testid="bs-drow-name">{ageWeightLabel(d)}</span>
                          </span>
                          <span className="bs-drow__counts">
                            <span data-testid="bs-drow-bouts">{plural(d.bouts, 'Bout')}</span>
                            <span className="bs-drow__sep" aria-hidden="true">
                              |
                            </span>
                            <span data-testid="bs-drow-byes">{plural(d.byes, 'BYE')}</span>
                          </span>
                          <DivisionStatusPill status={d.status} />
                          <ChevronRightIcon className="bs-drow__chevron" aria-hidden="true" />
                        </Link>
                        {affected.has(d.id) && (
                          <div className="bs-drow-warning" role="status" data-testid="bs-drow-update">
                            <AlertIcon aria-hidden="true" />
                            <span>
                              <strong>Update Required</strong> —{' '}
                              {affected.get(d.id).changes.some((c) => c.includes('must be recalculated'))
                                ? 'an earlier slot on its day changed, so its bout times must be recalculated.'
                                : affected.get(d.id).changes.some((c) => c.includes('were rescheduled'))
                                  ? 'its bouts were rescheduled; the updated schedule is not published yet.'
                                  : 'its draw changed since the schedule was published.'}
                            </span>
                            <button type="button" className="bs-drow-warning__link" onClick={() => showChanges(d.id)}>
                              View Changes
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })
          )}
        </section>
      )}

      {/* At the very bottom: what changed in the draws since the schedule was published. */}
      {changes?.updateRequired && (
        <section id="bs-changes" className="bs-lcard bs-changes" data-testid="bs-changes" aria-labelledby="bs-changes-title">
          <h2 id="bs-changes-title" className="bs-changes__title">
            Changes Since Schedule Publication
          </h2>
          {changes.divisions.map((d) => (
            <div
              key={d.divisionId}
              id={`bs-changes-${d.divisionId}`}
              className="bs-changes__division"
              data-testid="bs-changes-division"
            >
              <h3>{d.title}</h3>
              <ul>
                {d.changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

/**
 * Read-only: the bouts of one division's published bracket, by round. Nothing here writes.
 * Not shown on the overview any more; kept for the Division Scheduling Detail page (Step 2).
 */
export function DivisionBouts({ id, title, division, data, tournamentId, onShowInSchedule }) {
  const numberOf = useMemo(() => Object.fromEntries(data.bouts.map((b) => [b.id, b])), [data.bouts])
  const rounds = useMemo(() => {
    const mine = data.bouts.filter((b) => b.divisionId === division.id)
    const byRound = new Map()
    for (const b of [...mine].sort((a, c) => a.round - c.round || a.position - c.position)) {
      if (!byRound.has(b.round)) byRound.set(b.round, [])
      byRound.get(b.round).push(b)
    }
    return [...byRound.entries()].map(([round, bouts]) => ({
      round,
      name: bouts.find((b) => !b.isBye)?.roundEn || bouts[0].roundEn,
      bouts,
    }))
  }, [data.bouts, division.id])
  const nextRoundName = (round) => rounds.find((r) => r.round === round + 1)?.name
  const approved = data.schedule?.status === 'approved'

  return (
    <div className="bs-pd-panel" id={id} data-testid="bs-pd-panel">
      <div className="bs-pd-panel__bar">
        <strong className="bs-pd-panel__title" data-testid="bs-pd-panel-title">
          {title}
        </strong>
        {approved && (
          <span className="bs-tag bs-tag--green" data-testid="bs-pd-locked">
            Schedule approved — locked
          </span>
        )}
        <Link
          className="bs-act bs-pd-panel__bracket"
          to={`/draw-management/divisions/${division.id}/bracket?tournament=${tournamentId}`}
        >
          <BracketIcon aria-hidden="true" /> View Bracket
        </Link>
      </div>
      {rounds.map((r) => {
        const fought = r.bouts.filter((b) => !b.isBye)
        const byes = r.bouts.length - fought.length
        return (
          <section key={r.round} className="bs-pd-round" data-round={r.round}>
            <h4 className="bs-pd-round__title">
              {r.name}
              <span className="bs-muted">
                {plural(fought.length, 'bout')}
                {byes > 0 && ` · ${plural(byes, 'BYE')}`}
              </span>
            </h4>
            <ol className="bs-list">
              {r.bouts.map((bout) =>
                bout.isBye ? (
                  <ByeRow key={bout.id} bout={bout} next={nextRoundName(bout.round)} />
                ) : (
                  <DivisionBoutCard
                    key={bout.id}
                    bout={bout}
                    days={data.tournament.days}
                    numberOf={numberOf}
                    onShowInSchedule={data.schedule?.status ? onShowInSchedule : null}
                  />
                ),
              )}
            </ol>
          </section>
        )
      })}
    </div>
  )
}

/** In this list the bracket position stands in for a bout number the bout may not have yet. */
function divisionPlaceholder(p, numberOf) {
  if (p?.kind === 'winner') {
    const from = numberOf[p.fromBoutId]
    if (from?.officialNumber != null) return `Winner of Bout ${from.officialNumber}`
    return `Winner of ${from?.roundEn || `Round ${p.fromRound}`} · Match ${p.fromPosition}`
  }
  if (p?.kind === 'bye') return 'Advances via BYE'
  return 'To be decided'
}

function DivisionCorner({ side, athlete, placeholder, numberOf, divisionId, winner }) {
  const known = athlete?.nameEn || athlete?.nameAr
  if (known) return <Corner side={side} athlete={athlete} divisionId={divisionId} winner={winner} numberOf={numberOf} />
  return (
    <div className={`bs-corner bs-corner--${side}`} data-corner={side}>
      <span className={`bs-corner__bar bs-corner__bar--${side}`} aria-hidden="true" />
      <span className="bs-avatar">
        <AthleteAvatar entry={null} />
      </span>
      <div className="bs-corner__text">
        <span className="bs-corner__label">{side === 'red' ? 'Red corner' : 'Blue corner'}</span>
        <strong className="bs-corner__name bs-corner__name--tbd" data-testid={`bs-${side}-name`}>
          {divisionPlaceholder(placeholder, numberOf)}
        </strong>
      </div>
    </div>
  )
}

export function DivisionBoutCard({ bout, days, numberOf, onShowInSchedule }) {
  const scheduled = bout.number != null && bout.date && bout.ringId
  const status =
    bout.status === 'unscheduled' ? { label: 'Not Scheduled', tone: 'muted' } : STATUS[bout.status] || STATUS.scheduled
  const dayIndex = days.indexOf(bout.date)
  return (
    <li
      className={`bs-bout bs-bout--compact${scheduled ? '' : ' is-unscheduled'}`}
      data-bout={bout.id}
      data-number={bout.number ?? ''}
      data-testid="bs-pd-bout"
    >
      <header className="bs-bout__head">
        <h5 className="bs-bout__title" data-testid="bs-bout-title">
          {scheduled ? (
            <>
              <span className="bs-bout__number">
                {bout.officialNumber != null ? `#${bout.officialNumber}` : `Slot ${bout.queuePosition}`}
              </span>
              <span className="bs-bout__sep" aria-hidden="true">
                |
              </span>
              <span>{bout.roundEn}</span>
              <span className="bs-bout__sep" aria-hidden="true">
                |
              </span>
              <span>{bout.ringName}</span>
            </>
          ) : (
            <>
              <span>{bout.roundEn}</span>
              <span className="bs-bout__sep" aria-hidden="true">
                |
              </span>
              <span className="bs-muted">Match {bout.position}</span>
            </>
          )}
        </h5>
        <span className="bs-bout__time" data-testid="bs-bout-time">
          {scheduled ? (
            <>
              {dayIndex >= 0 ? `Day ${dayIndex + 1} · ` : ''}
              {dayLabel(bout.date, true)} · <strong>{bout.startTime}</strong>
            </>
          ) : null}
          <StatusPill tone={status.tone}>
            <span data-testid="bs-pd-bout-status">{status.label}</span>
          </StatusPill>
        </span>
      </header>
      <div className="bs-bout__body">
        <DivisionCorner
          side="red"
          athlete={bout.red}
          placeholder={bout.redPlaceholder}
          numberOf={numberOf}
          divisionId={bout.divisionId}
          winner={bout.winnerEntryId != null && bout.winnerEntryId === bout.red?.entryId}
        />
        <div className="bs-vs" aria-hidden="true">
          VS
        </div>
        <DivisionCorner
          side="blue"
          athlete={bout.blue}
          placeholder={bout.bluePlaceholder}
          numberOf={numberOf}
          divisionId={bout.divisionId}
          winner={bout.winnerEntryId != null && bout.winnerEntryId === bout.blue?.entryId}
        />
      </div>
      {scheduled && onShowInSchedule && (
        <footer className="bs-bout__actions">
          <button
            type="button"
            className="bs-act"
            onClick={() => onShowInSchedule(bout)}
            data-testid="bs-pd-show-in-schedule"
          >
            <ScheduleIcon aria-hidden="true" /> Show in Day &amp; Ring Schedule
          </button>
        </footer>
      )}
    </li>
  )
}

/** A BYE: shown in its division for context, never numbered, timed or scheduled. */
export function ByeRow({ bout, next }) {
  const athlete = bout.red?.nameEn || bout.red?.nameAr ? bout.red : bout.blue
  const name = athlete?.nameEn || athlete?.nameAr
  return (
    <li className="bs-bye" data-bout={bout.id} data-testid="bs-pd-bye">
      <span className="bs-bye__tag">BYE</span>
      <span className="bs-bye__text">
        <strong>{name || 'No athlete'}</strong>
        {athlete?.club && <span className="bs-muted"> · {athlete.club}</span>}
      </span>
      <span className="bs-muted bs-bye__note">
        {name && next ? `Advances to ${next} without a bout` : 'No bout'} · not scheduled
      </span>
    </li>
  )
}

/* ── schedule list ─────────────────────────────────────────────────────── */

function ScheduleTab({ data, day, ring, canEdit, perms, tournamentId, onDay, onRing, onAct, openDialog }) {
  const ringDay = ring?.days.find((d) => d.date === day)
  const list = useMemo(
    () =>
      data.bouts
        .filter((b) => b.date === day && b.ringId === ring?.id && b.number != null)
        .sort((a, b) => a.queuePosition - b.queuePosition),
    [data.bouts, day, ring],
  )
  const unscheduled = data.bouts.filter((b) => b.status === 'unscheduled').length
  const numberOf = useMemo(() => Object.fromEntries(data.bouts.map((b) => [b.id, b])), [data.bouts])

  return (
    <section aria-label="Scheduled bouts">
      <div className="bs-toolbar">
        <label className="bs-select">
          <span>Day</span>
          <select value={day || ''} onChange={(e) => onDay(e.target.value)} data-testid="bs-day">
            {data.tournament.days.map((d, i) => (
              <option key={d} value={d}>
                Day {i + 1} · {dayLabel(d, true)}
              </option>
            ))}
          </select>
        </label>
        <label className="bs-select">
          <span>Ring</span>
          <select
            value={ring?.id || ''}
            onChange={(e) => onRing(e.target.value)}
            data-testid="bs-ring"
            disabled={!data.rings.length}
          >
            {data.rings.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.days.find((d) => d.date === day)?.bouts ?? 0}){r.isActive ? '' : ' — inactive'}
              </option>
            ))}
          </select>
        </label>
        {ringDay && (
          <p className="bs-timing" data-testid="bs-timing">
            First bout <strong>{ringDay.firstBoutTime}</strong> · every <strong>{ringDay.intervalMinutes} min</strong>
            {!ringDay.configured && (
              <span className="bs-tag bs-tag--amber">default — set it in Rings &amp; Divisions</span>
            )}
          </p>
        )}
        {unscheduled > 0 && <span className="bs-tag bs-tag--amber">{unscheduled} bout(s) not scheduled yet</span>}
      </div>

      {!ring ? (
        <EmptyState title="No rings yet" description="Add rings in Rings & Divisions to start scheduling." />
      ) : list.length === 0 ? (
        <div className="bs-card bs-empty" data-testid="bs-empty-ring">
          <InfoIcon aria-hidden="true" />
          <p>
            No bouts on {ring.name} on {dayLabel(day)}.
          </p>
        </div>
      ) : (
        <ol className="bs-list" data-testid="bs-list">
          {list.map((bout, index) => (
            <BoutCard
              key={bout.id}
              bout={bout}
              numberOf={numberOf}
              canEdit={canEdit}
              perms={perms}
              first={index === 0}
              last={index === list.length - 1}
              tournamentId={tournamentId}
              onReorder={(delta) =>
                onAct(
                  () =>
                    boutScheduleApi.move(tournamentId, bout.id, {
                      date: bout.date,
                      ringId: bout.ringId,
                      position: bout.queuePosition + delta,
                      expectedRevision: data.schedule.revision,
                    }),
                  `Bout moved ${delta < 0 ? 'up' : 'down'}; numbers and times recalculated.`,
                )
              }
              onEdit={(mode) => openDialog({ kind: 'move', mode, bout })}
            />
          ))}
        </ol>
      )}
    </section>
  )
}

function placeholderText(p, numberOf) {
  if (!p) return null
  if (p.kind === 'winner') {
    const from = numberOf[p.fromBoutId]
    if (from?.officialNumber != null) return `Winner of Bout ${from.officialNumber}`
    return `Winner of ${from?.roundEn || 'Round ' + p.fromRound} #${p.fromPosition} (unscheduled)`
  }
  if (p.kind === 'bye') return 'Advances via BYE'
  return 'To be decided'
}

function Corner({ side, athlete, placeholder, numberOf, divisionId, winner }) {
  const known = athlete?.nameEn || athlete?.nameAr
  return (
    <div className={`bs-corner bs-corner--${side}${winner ? ' is-winner' : ''}`} data-corner={side}>
      <span className={`bs-corner__bar bs-corner__bar--${side}`} aria-hidden="true" />
      <BracketPhotoContext.Provider value={divisionId}>
        <span className="bs-avatar">
          <AthleteAvatar entry={known ? { id: athlete.entryId, photoKey: athlete.photo } : null} />
        </span>
      </BracketPhotoContext.Provider>
      <div className="bs-corner__text">
        <span className="bs-corner__label">{side === 'red' ? 'Red corner' : 'Blue corner'}</span>
        {known ? (
          <>
            <strong className="bs-corner__name" data-testid={`bs-${side}-name`}>
              {athlete.nameEn || athlete.nameAr}
            </strong>
            <span className="bs-corner__club">{athlete.club || '—'}</span>
            {athlete.reference && <span className="bs-corner__ref">{athlete.reference}</span>}
          </>
        ) : (
          <strong className="bs-corner__name bs-corner__name--tbd" data-testid={`bs-${side}-name`}>
            {placeholderText(placeholder, numberOf)}
          </strong>
        )}
        {winner && <span className="bs-tag bs-tag--green">Winner</span>}
      </div>
    </div>
  )
}

const STATUS = {
  scheduled: { label: 'Scheduled', tone: 'blue' },
  completed: { label: 'Result confirmed', tone: 'green' },
  walkover: { label: 'Walkover', tone: 'amber' },
  unscheduled: { label: 'Unscheduled', tone: 'muted' },
}

function BoutCard({ bout, numberOf, canEdit, perms, first, last, tournamentId, onReorder, onEdit }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const status = STATUS[bout.status] || STATUS.scheduled
  const reorder = async (delta) => {
    if (busy) return
    setBusy(true)
    setError('')
    const r = await onReorder(delta)
    if (!r.ok) setError(r.error)
    setBusy(false)
  }
  const GenderIcon = bout.gender === 'female' ? FemaleIcon : MaleIcon
  return (
    <li className="bs-bout" data-bout={bout.id} data-number={bout.number}>
      <header className="bs-bout__head">
        <h3 className="bs-bout__title" data-testid="bs-bout-title">
          <span className="bs-bout__number">
            {bout.officialNumber != null ? `#${bout.officialNumber}` : `Slot ${bout.queuePosition}`}
          </span>
          <span className="bs-bout__sep" aria-hidden="true">
            |
          </span>
          <span>{bout.roundEn}</span>
          <span className="bs-bout__sep" aria-hidden="true">
            |
          </span>
          <span>{bout.ringName}</span>
        </h3>
        <span className="bs-bout__time" data-testid="bs-bout-time">
          {dayLabel(bout.date)} · <strong>{bout.startTime}</strong>
        </span>
      </header>
      <p className="bs-bout__meta">
        <GenderIcon className={`bs-bout__gender dd-header__gender--${bout.gender}`} aria-hidden="true" />
        <span>{bout.categoryEn}</span>
        <span aria-hidden="true">·</span>
        <span>{bout.divisionEn}</span>
        <span aria-hidden="true">·</span>
        <span>{bout.weightEn}</span>
        <span aria-hidden="true">·</span>
        <span>{bout.roundEn}</span>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </p>
      <div className="bs-bout__body">
        <Corner
          side="red"
          athlete={bout.red}
          placeholder={bout.redPlaceholder}
          numberOf={numberOf}
          divisionId={bout.divisionId}
          winner={bout.winnerEntryId != null && bout.winnerEntryId === bout.red?.entryId}
        />
        <div className="bs-vs" aria-hidden="true">
          VS
        </div>
        <Corner
          side="blue"
          athlete={bout.blue}
          placeholder={bout.bluePlaceholder}
          numberOf={numberOf}
          divisionId={bout.divisionId}
          winner={bout.winnerEntryId != null && bout.winnerEntryId === bout.blue?.entryId}
        />
      </div>
      <footer className="bs-bout__actions">
        {canEdit && !bout.locked && (
          <>
            <button type="button" className="bs-act" onClick={() => onEdit('edit')} data-testid="bs-edit">
              <EditIcon aria-hidden="true" /> Edit Schedule
            </button>
            {perms.crossRing && (
              <button type="button" className="bs-act" onClick={() => onEdit('move')} data-testid="bs-move">
                <MoveIcon aria-hidden="true" /> Move Bout
              </button>
            )}
            <span className="bs-reorder">
              <button
                type="button"
                className="icon-btn"
                aria-label={`Move the bout in slot ${bout.queuePosition} up`}
                disabled={first || busy}
                onClick={() => reorder(-1)}
                data-testid="bs-up"
              >
                <ArrowUpIcon />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Move the bout in slot ${bout.queuePosition} down`}
                disabled={last || busy}
                onClick={() => reorder(1)}
                data-testid="bs-down"
              >
                <ArrowDownIcon />
              </button>
            </span>
          </>
        )}
        {bout.locked && <span className="bs-muted">Result recorded — slot protected</span>}
        <Link
          className="bs-act"
          to={`/draw-management/divisions/${bout.divisionId}/bracket?tournament=${tournamentId}`}
          data-testid="bs-view-bracket"
        >
          <BracketIcon aria-hidden="true" /> View Bracket
        </Link>
      </footer>
      {error && (
        <p className="bs-error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}

/* ── move / edit dialog ────────────────────────────────────────────────── */

function MoveDialog({ mode, bout, data, perms, tournamentId, onAct, onClose }) {
  const [date, setDate] = useState(bout.date)
  const [ringId, setRingId] = useState(bout.ringId)
  const queue = data.bouts.filter(
    (b) => b.date === date && b.ringId === Number(ringId) && b.number != null && b.id !== bout.id,
  )
  const sameQueue = date === bout.date && Number(ringId) === bout.ringId
  const maxPosition = queue.length + 1
  const [position, setPosition] = useState(sameQueue ? bout.queuePosition : maxPosition)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const crossing = !sameQueue
  const ref = useRef(null)

  useEffect(() => {
    ref.current?.focus()
    const onKey = (event) => event.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  useEffect(() => {
    setPosition((p) => Math.min(Math.max(1, p), sameQueue ? queue.length + 1 : maxPosition))
  }, [sameQueue, queue.length, maxPosition])

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    const r = await onAct(
      () =>
        boutScheduleApi.move(tournamentId, bout.id, {
          date,
          ringId: Number(ringId),
          position: Number(position),
          reason: reason.trim() || null,
          expectedRevision: data.schedule.revision,
        }),
      crossing
        ? 'Bout moved; both queues renumbered and retimed.'
        : 'Bout position changed; numbers and times recalculated.',
    )
    setBusy(false)
    if (r.ok) onClose()
    else setError(r.error)
  }

  return (
    <div className="db-dialog" role="presentation" onClick={() => !busy && onClose()}>
      <div
        className="db-dialog__panel dd-regen"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bs-move-title"
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        data-testid="bs-move-dialog"
      >
        <header>
          <h2 id="bs-move-title">{mode === 'move' ? 'Move Bout' : 'Edit Schedule'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" disabled={busy}>
            <CloseIcon />
          </button>
        </header>
        <p className="dd-regen__lead">
          <strong>{bout.officialNumber != null ? `Bout #${bout.officialNumber}` : `Slot ${bout.queuePosition}`}</strong>{' '}
          · {bout.divisionEn} · {bout.roundEn} — now {bout.ringName}, {dayLabel(bout.date)} {bout.startTime}. The
          athletes, corners and bracket never change here; the number and start time follow the new position.
        </p>
        <div className="bs-form">
          {mode === 'move' && perms.crossRing && (
            <>
              <label className="pt-field">
                <span>Day</span>
                <select value={date} onChange={(e) => setDate(e.target.value)} data-testid="bs-move-day">
                  {data.tournament.days.map((d, i) => (
                    <option key={d} value={d}>
                      Day {i + 1} · {dayLabel(d, true)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pt-field">
                <span>Ring</span>
                <select value={ringId} onChange={(e) => setRingId(Number(e.target.value))} data-testid="bs-move-ring">
                  {data.rings
                    .filter((r) => r.isActive)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}
          <label className="pt-field">
            <span>Position in the queue (1 – {sameQueue ? queue.length + 1 : maxPosition})</span>
            <input
              type="number"
              min="1"
              max={sameQueue ? queue.length + 1 : maxPosition}
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              data-testid="bs-move-position"
            />
          </label>
          <label className="pt-field">
            <span>
              Reason {crossing && <em aria-hidden="true">*</em>}
              {!crossing && <span className="bs-muted"> (optional)</span>}
            </span>
            <textarea
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="bs-move-reason"
            />
          </label>
        </div>
        {error && (
          <p className="dd-regen__error" role="alert" data-testid="bs-move-error">
            {error}
          </p>
        )}
        <div className="dd-regen__actions">
          <button type="button" className="dd-btn dd-btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="dd-btn dd-btn--primary"
            disabled={busy || (crossing && !reason.trim()) || !position}
            onClick={submit}
            data-testid="bs-move-confirm"
          >
            {busy ? 'Saving…' : mode === 'move' ? 'Move Bout' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReasonDialog({ title, text, confirm, needsReason, onConfirm, onClose }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [issues, setIssues] = useState([])
  const sent = useRef(false)
  const submit = async () => {
    if (sent.current) return
    sent.current = true
    setBusy(true)
    setError('')
    const r = await onConfirm(reason.trim())
    setBusy(false)
    sent.current = false
    if (r.ok) onClose()
    else {
      setError(r.error)
      setIssues(r.issues || [])
    }
  }
  return (
    <div className="db-dialog" role="presentation" onClick={() => !busy && onClose()}>
      <div
        className="db-dialog__panel dd-regen"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bs-reason-title"
        onClick={(e) => e.stopPropagation()}
        data-testid="bs-reason-dialog"
      >
        <header>
          <h2 id="bs-reason-title">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" disabled={busy}>
            <CloseIcon />
          </button>
        </header>
        <p className="dd-regen__lead">{text}</p>
        {needsReason && (
          <label className="dd-regen__field">
            <span>
              Reason <em aria-hidden="true">*</em>
            </span>
            <textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        )}
        {error && (
          <div className="dd-regen__error" role="alert" data-testid="bs-dialog-error">
            {error}
            {issues.length > 0 && (
              <ul className="bs-issue-list">
                {issues.slice(0, 8).map((i, k) => (
                  <li key={k}>{i.messageEn}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="dd-regen__actions">
          <button type="button" className="dd-btn dd-btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="dd-btn dd-btn--primary"
            disabled={busy || (needsReason && !reason.trim())}
            onClick={submit}
            data-testid="bs-dialog-confirm"
          >
            {busy ? 'Working…' : confirm}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── setup: rings, ring/day timing, divisions ──────────────────────────── */

function SetupTab({ data, canEdit, tournamentId, onAct, dirty }) {
  return (
    <div className="bs-setup">
      <RingsCard data={data} canEdit={canEdit} tournamentId={tournamentId} onAct={onAct} />
      <TimingCard data={data} canEdit={canEdit} tournamentId={tournamentId} onAct={onAct} dirty={dirty} />
      <DivisionsCard data={data} canEdit={canEdit} tournamentId={tournamentId} onAct={onAct} />
    </div>
  )
}

function useRunner(onAct) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (fn, done) => {
    if (busy) return { ok: false }
    setBusy(true)
    setError('')
    const r = await onAct(fn, done)
    if (!r.ok) setError(r.error)
    setBusy(false)
    return r
  }
  return { busy, error, run, setError }
}

function RingsCard({ data, canEdit, tournamentId, onAct }) {
  const [name, setName] = useState('')
  const { busy, error, run } = useRunner(onAct)
  const revision = data.schedule.revision
  const rings = data.rings
  return (
    <section className="bs-card" aria-labelledby="bs-rings">
      <h2 id="bs-rings" className="bs-card__title">
        Rings
      </h2>
      <p className="bs-muted">
        The ring order decides bout numbering each day: Ring 1&rsquo;s bouts first, then Ring 2&rsquo;s, and so on.
      </p>
      <ol className="bs-rings" data-testid="bs-rings">
        {rings.map((r, i) => (
          <li key={r.id} className={`bs-ring${r.isActive ? '' : ' is-inactive'}`} data-ring={r.id}>
            <span className="bs-ring__order">{i + 1}</span>
            <strong>{r.name}</strong>
            {!r.isActive && <span className="bs-tag">inactive</span>}
            <span className="bs-muted">{r.days.reduce((n, d) => n + d.bouts, 0)} bout(s)</span>
            {canEdit && (
              <span className="bs-ring__actions">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Move ${r.name} up`}
                  disabled={busy || i === 0}
                  onClick={() =>
                    run(
                      () => boutScheduleApi.updateRing(tournamentId, r.id, { moveBy: -1, expectedRevision: revision }),
                      'Ring order changed; every day renumbered.',
                    )
                  }
                >
                  <ArrowUpIcon />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Move ${r.name} down`}
                  disabled={busy || i === rings.length - 1}
                  onClick={() =>
                    run(
                      () => boutScheduleApi.updateRing(tournamentId, r.id, { moveBy: 1, expectedRevision: revision }),
                      'Ring order changed; every day renumbered.',
                    )
                  }
                >
                  <ArrowDownIcon />
                </button>
                <button
                  type="button"
                  className="bs-act"
                  disabled={busy}
                  onClick={() => {
                    const next = window.prompt('Rename ring', r.name)
                    if (next && next.trim() && next.trim() !== r.name)
                      run(
                        () =>
                          boutScheduleApi.updateRing(tournamentId, r.id, {
                            name: next.trim(),
                            expectedRevision: revision,
                          }),
                        'Ring renamed.',
                      )
                  }}
                >
                  <EditIcon aria-hidden="true" /> Rename
                </button>
                <button
                  type="button"
                  className="bs-act"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () =>
                        boutScheduleApi.updateRing(tournamentId, r.id, {
                          isActive: !r.isActive,
                          expectedRevision: revision,
                        }),
                      r.isActive ? 'Ring deactivated.' : 'Ring activated.',
                    )
                  }
                >
                  {r.isActive ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  type="button"
                  className="bs-act bs-act--danger"
                  disabled={busy}
                  aria-label={`Remove ${r.name}`}
                  onClick={() =>
                    window.confirm(`Remove ${r.name}? Only a ring without bouts can be removed.`) &&
                    run(() => boutScheduleApi.removeRing(tournamentId, r.id, revision), 'Ring removed.')
                  }
                >
                  <TrashIcon aria-hidden="true" />
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
      {canEdit && (
        <form
          className="bs-inline-form"
          onSubmit={async (e) => {
            e.preventDefault()
            const r = await run(
              () => boutScheduleApi.addRing(tournamentId, { name: name.trim(), expectedRevision: revision }),
              'Ring added.',
            )
            if (r.ok) setName('')
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Ring ${String.fromCharCode(65 + rings.length)}`}
            maxLength={60}
            aria-label="New ring name"
            data-testid="bs-ring-name"
          />
          <button
            type="submit"
            className="dd-btn dd-btn--primary"
            disabled={busy || !name.trim()}
            data-testid="bs-add-ring"
          >
            <PlusIcon aria-hidden="true" /> Add Ring
          </button>
        </form>
      )}
      {error && (
        <p className="bs-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function TimingCard({ data, canEdit, tournamentId, onAct, dirty }) {
  const [edits, setEdits] = useState({})
  const { busy, error, run } = useRunner(onAct)
  useEffect(() => {
    dirty.current = Object.keys(edits).length > 0
  }, [edits, dirty])
  useEffect(
    () => () => {
      dirty.current = false
    },
    [dirty],
  )
  const value = (ring, d) =>
    edits[`${ring.id}|${d.date}`] || { firstBoutTime: d.firstBoutTime, intervalMinutes: d.intervalMinutes }
  const change = (ring, d, patch) =>
    setEdits((e) => ({ ...e, [`${ring.id}|${d.date}`]: { ...value(ring, d), ...patch } }))
  const save = async (ring, d) => {
    const v = value(ring, d)
    const r = await run(
      () =>
        boutScheduleApi.setRingDay(tournamentId, {
          ringId: ring.id,
          date: d.date,
          firstBoutTime: v.firstBoutTime,
          intervalMinutes: Number(v.intervalMinutes),
          expectedRevision: data.schedule.revision,
        }),
      `${ring.name} on ${dayLabel(d.date)}: times recalculated.`,
    )
    if (r.ok)
      setEdits((e) => {
        const n = { ...e }
        delete n[`${ring.id}|${d.date}`]
        return n
      })
  }
  return (
    <section className="bs-card" aria-labelledby="bs-timing-title">
      <h2 id="bs-timing-title" className="bs-card__title">
        Ring timing for each day
      </h2>
      <p className="bs-muted">
        Each ring has its own first-bout time and interval on each day. The interval is the slot between bout starts —
        not an athlete&rsquo;s rest period.
      </p>
      {data.rings.length === 0 ? (
        <p className="bs-muted">Add a ring first.</p>
      ) : (
        <div className="bs-table-wrap">
          <table className="bs-timing-table" data-testid="bs-timing-table">
            <thead>
              <tr>
                <th scope="col">Day</th>
                {data.rings.map((r) => (
                  <th key={r.id} scope="col">
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.tournament.days.map((date, i) => (
                <tr key={date}>
                  <th scope="row">
                    Day {i + 1}
                    <span className="bs-muted"> {dayLabel(date)}</span>
                  </th>
                  {data.rings.map((ring) => {
                    const d = ring.days.find((x) => x.date === date)
                    const v = value(ring, d)
                    const changed = !!edits[`${ring.id}|${date}`]
                    return (
                      <td key={ring.id} data-ring={ring.id} data-date={date}>
                        <div className="bs-timing-cell">
                          <input
                            type="time"
                            value={v.firstBoutTime}
                            disabled={!canEdit}
                            onChange={(e) => change(ring, d, { firstBoutTime: e.target.value })}
                            aria-label={`${ring.name} first bout on ${dayLabel(date)}`}
                          />
                          <span className="bs-interval">
                            <input
                              type="number"
                              min="1"
                              max="240"
                              value={v.intervalMinutes}
                              disabled={!canEdit}
                              onChange={(e) => change(ring, d, { intervalMinutes: e.target.value })}
                              aria-label={`${ring.name} interval on ${dayLabel(date)}`}
                            />
                            min
                          </span>
                          {canEdit && (changed || !d.configured) && (
                            <button
                              type="button"
                              className="bs-act"
                              disabled={busy}
                              onClick={() => save(ring, d)}
                              data-testid="bs-save-timing"
                            >
                              {changed ? 'Save' : 'Confirm'}
                            </button>
                          )}
                          {!d.configured && !changed && <span className="bs-tag bs-tag--amber">default</span>}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && (
        <p className="bs-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function DivisionsCard({ data, canEdit, tournamentId, onAct }) {
  const [open, setOpen] = useState(null)
  return (
    <section className="bs-card" aria-labelledby="bs-divisions-title">
      <h2 id="bs-divisions-title" className="bs-card__title">
        Divisions (published brackets)
      </h2>
      <p className="bs-muted">
        Assign a division&rsquo;s bouts to a ring and day, round by round. The ring becomes the division&rsquo;s
        default; single bouts can still move later.
      </p>
      {data.unpublishedDivisions.length > 0 && (
        <p className="bs-muted" data-testid="bs-unpublished">
          Not schedulable until published in Draw Management:{' '}
          {data.unpublishedDivisions.map((d) => d.labelEn).join('; ')}.
        </p>
      )}
      {data.categories.map((c) => (
        <div key={c.category} className="bs-category">
          <h3>{c.categoryEn}</h3>
          <ul className="bs-divisions">
            {c.divisions.map((d) => (
              <li key={d.id} className="bs-division" data-division={d.id}>
                <button
                  type="button"
                  className="bs-division__head"
                  aria-expanded={open === d.id}
                  onClick={() => setOpen(open === d.id ? null : d.id)}
                >
                  <ArrowDownIcon className={`bs-chevron${open === d.id ? ' is-open' : ''}`} aria-hidden="true" />
                  <strong>{d.labelEn}</strong>
                  <span className="bs-muted">
                    {d.rounds} round(s) · {d.bouts} bout(s){d.byes ? ` · ${d.byes} BYE(s)` : ''}
                  </span>
                  <span className={`bs-tag ${d.scheduled === d.bouts ? 'bs-tag--green' : 'bs-tag--amber'}`}>
                    {d.scheduled}/{d.bouts} scheduled
                  </span>
                </button>
                {open === d.id && (
                  <DivisionDetail
                    division={d}
                    data={data}
                    canEdit={canEdit}
                    tournamentId={tournamentId}
                    onAct={onAct}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

function DivisionDetail({ division, data, canEdit, tournamentId, onAct }) {
  const bouts = data.bouts.filter((b) => b.divisionId === division.id)
  const rounds = [...new Set(bouts.map((b) => b.round))].sort((a, b) => a - b)
  const unscheduledRounds = rounds.filter((r) => bouts.some((b) => b.round === r && b.status === 'unscheduled'))
  const activeRings = data.rings.filter((r) => r.isActive)
  const [ringId, setRingId] = useState(division.defaultRingId || activeRings[0]?.id || '')
  const [date, setDate] = useState(division.defaultDate || data.tournament.days[0])
  const [chosen, setChosen] = useState(unscheduledRounds.slice(0, 1))
  const [review, setReview] = useState(false)
  const { busy, error, run } = useRunner(onAct)
  const pending = bouts.filter((b) => chosen.includes(b.round) && b.status === 'unscheduled')
  const nameOf = (a, p) =>
    a?.nameEn || a?.nameAr || placeholderText(p, Object.fromEntries(data.bouts.map((b) => [b.id, b])))
  return (
    <div className="bs-division__body">
      {rounds.map((round) => (
        <div key={round} className="bs-round">
          <h4>{bouts.find((b) => b.round === round)?.roundEn}</h4>
          <ul>
            {bouts
              .filter((b) => b.round === round)
              .map((b) =>
                b.isBye && !b.isWalkover ? (
                  <li key={b.id} className="bs-bye" data-bye={b.id}>
                    {nameOf(b.red?.nameEn ? b.red : b.blue)} — <strong>BYE</strong>{' '}
                    <span className="bs-muted">(advances; not a bout, never scheduled)</span>
                  </li>
                ) : (
                  <li key={b.id} data-bout={b.id}>
                    <span className="bs-red-dot" aria-hidden="true" /> {nameOf(b.red, b.redPlaceholder)}{' '}
                    <span className="bs-muted">v</span> <span className="bs-blue-dot" aria-hidden="true" />{' '}
                    {nameOf(b.blue, b.bluePlaceholder)}{' '}
                    {b.number != null ? (
                      <span className="bs-tag">
                        #{b.number} · {b.ringName} · {dayLabel(b.date)} {b.startTime}
                      </span>
                    ) : b.isWalkover ? (
                      <span className="bs-tag bs-tag--amber">walkover</span>
                    ) : (
                      <span className="bs-tag bs-tag--amber">unscheduled</span>
                    )}
                  </li>
                ),
              )}
          </ul>
        </div>
      ))}
      {canEdit && unscheduledRounds.length > 0 && (
        <div className="bs-assign" data-testid="bs-assign">
          <h4>Assign bouts to a ring</h4>
          <div className="bs-form bs-form--row">
            <label className="pt-field">
              <span>Ring</span>
              <select value={ringId} onChange={(e) => setRingId(Number(e.target.value))} data-testid="bs-assign-ring">
                {activeRings.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="pt-field">
              <span>Day</span>
              <select value={date} onChange={(e) => setDate(e.target.value)} data-testid="bs-assign-day">
                {data.tournament.days.map((d, i) => (
                  <option key={d} value={d}>
                    Day {i + 1} · {dayLabel(d)}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="bs-rounds">
              <legend>Rounds</legend>
              {unscheduledRounds.map((r) => (
                <label key={r}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(r)}
                    onChange={(e) => {
                      setReview(false)
                      setChosen((c) => (e.target.checked ? [...c, r] : c.filter((x) => x !== r)))
                    }}
                    data-round={r}
                  />
                  {bouts.find((b) => b.round === r)?.roundEn}
                </label>
              ))}
            </fieldset>
          </div>
          {review && (
            <div className="bs-review" data-testid="bs-assign-review">
              <p>
                {pending.length} bout(s) will join the end of {data.rings.find((r) => r.id === Number(ringId))?.name}
                &rsquo;s queue on {dayLabel(date)}:
              </p>
              <ol>
                {pending.map((b) => (
                  <li key={b.id}>
                    {b.roundEn}: {nameOf(b.red, b.redPlaceholder)} v {nameOf(b.blue, b.bluePlaceholder)}
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="dd-regen__actions">
            {!review ? (
              <button
                type="button"
                className="dd-btn dd-btn--ghost"
                disabled={!ringId || pending.length === 0}
                onClick={() => setReview(true)}
                data-testid="bs-assign-review-btn"
              >
                Review {pending.length} bout(s)
              </button>
            ) : (
              <button
                type="button"
                className="dd-btn dd-btn--primary"
                disabled={busy || pending.length === 0}
                data-testid="bs-assign-confirm"
                onClick={async () => {
                  const r = await run(
                    () =>
                      boutScheduleApi.assign(tournamentId, {
                        divisionId: division.id,
                        ringId: Number(ringId),
                        date,
                        rounds: chosen,
                        expectedRevision: data.schedule.revision,
                      }),
                    `${pending.length} bout(s) assigned; numbers and times calculated.`,
                  )
                  if (r.ok) setReview(false)
                }}
              >
                {busy ? 'Assigning…' : 'Confirm Assignment'}
              </button>
            )}
          </div>
          {error && (
            <p className="bs-error" role="alert" data-testid="bs-assign-error">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/* ── validation, exceptions, history ───────────────────────────────────── */

function ValidationTab({ data, canEdit, tournamentId, onAct }) {
  const { busy, error, run } = useRunner(onAct)
  const blocking = data.issues.filter((i) => i.severity === 'blocking')
  const warnings = data.issues.filter((i) => i.severity !== 'blocking')
  return (
    <section className="bs-card" aria-label="Validation" data-testid="bs-validation">
      <h2 className="bs-card__title">Review checks</h2>
      {data.sourceChanges.length > 0 && (
        <div className="bs-source" data-testid="bs-source-changes">
          <h3>Source bracket changes</h3>
          <ul>
            {data.sourceChanges.map((c) => (
              <li key={c.divisionId}>
                <strong>{c.label}</strong>: {c.kind} — {c.addedBoutIds.length} bout(s) added, {c.removedBoutIds.length}{' '}
                removed, {c.changedBoutIds.length} changed. Unaffected assignments are kept; new bouts appear as
                unscheduled.
              </li>
            ))}
          </ul>
          {canEdit && (
            <button
              type="button"
              className="dd-btn dd-btn--primary"
              disabled={busy}
              onClick={() =>
                run(
                  () => boutScheduleApi.acknowledgeSource(tournamentId, { expectedRevision: data.schedule.revision }),
                  'Source changes accepted.',
                )
              }
            >
              Accept reviewed changes
            </button>
          )}
        </div>
      )}
      {blocking.length === 0 ? (
        <p className="bs-ok">
          <CheckIcon aria-hidden="true" /> No blocking issues: the schedule can be reviewed and approved.
        </p>
      ) : (
        <>
          <h3>{blocking.length} blocking issue(s)</h3>
          <ul className="bs-issue-list">
            {blocking.map((i, k) => (
              <li key={k} className="bs-issue bs-issue--bad" data-code={i.code}>
                <AlertIcon aria-hidden="true" /> {i.messageEn}
                {i.potential && <span className="bs-tag bs-tag--amber">possible participant</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {warnings.length > 0 && (
        <>
          <h3>{warnings.length} warning(s)</h3>
          <ul className="bs-issue-list">
            {warnings.map((i, k) => (
              <li key={k} className="bs-issue" data-code={i.code}>
                <InfoIcon aria-hidden="true" /> {i.messageEn}
              </li>
            ))}
          </ul>
        </>
      )}
      {error && (
        <p className="bs-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function ExceptionsTab({ data, perms, approved, tournamentId, onAct, dirty }) {
  const [selected, setSelected] = useState([])
  const [filter, setFilter] = useState('')
  const [date, setDate] = useState(data.tournament.days[0])
  const [max, setMax] = useState(2)
  const [reason, setReason] = useState('')
  const { busy, error, run } = useRunner(onAct)
  useEffect(() => {
    dirty.current = selected.length > 0 || reason.trim().length > 0
  }, [selected, reason, dirty])
  useEffect(
    () => () => {
      dirty.current = false
    },
    [dirty],
  )
  const athletes = data.athletes.filter(
    (a) => !filter || `${a.name} ${a.divisions.join(' ')}`.toLowerCase().includes(filter.toLowerCase()),
  )
  const can = perms.exceptions && !approved
  return (
    <section className="bs-card" aria-label="Daily bout exceptions" data-testid="bs-exceptions">
      <h2 className="bs-card__title">Daily bout exceptions</h2>
      <p className="bs-muted">
        Default: one bout per athlete per day. An authorised exception allows 2 or 3 on one day; at least two
        hours&rsquo; rest and no overlapping bouts still apply across every ring.
      </p>
      {can ? (
        <div className="bs-grant">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search athletes…"
            aria-label="Search athletes"
          />
          <ul className="bs-athletes">
            {athletes.slice(0, 200).map((a) => (
              <li key={a.athleteId}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(a.athleteId)}
                    onChange={(e) =>
                      setSelected((s) => (e.target.checked ? [...s, a.athleteId] : s.filter((x) => x !== a.athleteId)))
                    }
                    data-athlete={a.athleteId}
                  />
                  {a.name} <span className="bs-muted">{a.divisions.join(', ')}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="bs-form bs-form--row">
            <label className="pt-field">
              <span>Day</span>
              <select value={date} onChange={(e) => setDate(e.target.value)}>
                {data.tournament.days.map((d, i) => (
                  <option key={d} value={d}>
                    Day {i + 1} · {dayLabel(d)}
                  </option>
                ))}
              </select>
            </label>
            <label className="pt-field">
              <span>Bouts allowed that day</span>
              <select value={max} onChange={(e) => setMax(Number(e.target.value))}>
                <option value={2}>2</option>
                <option value={3}>3 (maximum)</option>
              </select>
            </label>
          </div>
          <label className="pt-field">
            <span>
              Reason <em aria-hidden="true">*</em>
            </span>
            <textarea
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="bs-exception-reason"
            />
          </label>
          <button
            type="button"
            className="dd-btn dd-btn--primary"
            disabled={busy || selected.length === 0 || !reason.trim()}
            data-testid="bs-grant"
            onClick={async () => {
              const r = await run(
                () =>
                  boutScheduleApi.grantException(tournamentId, {
                    athleteIds: selected,
                    date,
                    maxBouts: max,
                    reason: reason.trim(),
                    expectedRevision: data.schedule.revision,
                  }),
                `Exception granted to ${selected.length} athlete(s).`,
              )
              if (r.ok) {
                setSelected([])
                setReason('')
              }
            }}
          >
            Authorise exception ({selected.length})
          </button>
        </div>
      ) : (
        <p className="bs-muted">
          {approved
            ? 'The schedule is approved; exceptions cannot change now.'
            : 'Authorising exceptions needs the daily bout exception permission.'}
        </p>
      )}
      <h3>Recorded exceptions</h3>
      {data.exceptions.length === 0 ? (
        <p className="bs-muted">None.</p>
      ) : (
        <table className="bs-history-table">
          <thead>
            <tr>
              <th>Athlete</th>
              <th>Day</th>
              <th>Max</th>
              <th>Reason</th>
              <th>Authorised</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.exceptions.map((x) => (
              <tr key={x.id}>
                <td>{x.athlete}</td>
                <td>{dayLabel(x.date)}</td>
                <td>{x.maxBouts}</td>
                <td>{x.reason}</td>
                <td>
                  {x.grantedBy} · {new Date(`${x.grantedAt}Z`).toLocaleString('en-GB')}
                </td>
                <td>{x.active ? 'Active' : `Revoked by ${x.revokedBy}: ${x.revokeReason}`}</td>
                <td>
                  {can && x.active && (
                    <button
                      type="button"
                      className="bs-act"
                      disabled={busy}
                      onClick={() => {
                        const why = window.prompt('Reason for revoking')
                        if (why && why.trim())
                          run(
                            () =>
                              boutScheduleApi.revokeException(tournamentId, x.id, {
                                reason: why.trim(),
                                expectedRevision: data.schedule.revision,
                              }),
                            'Exception revoked.',
                          )
                      }}
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {error && (
        <p className="bs-error" role="alert" data-testid="bs-exception-error">
          {error}
        </p>
      )}
    </section>
  )
}

const ACTION_LABEL = {
  'tournament.schedule_created': 'Draft created',
  'tournament.schedule_ring_changed': 'Ring changed',
  'tournament.schedule_timing_changed': 'Timing changed',
  'tournament.schedule_bouts_assigned': 'Bouts assigned',
  'tournament.schedule_bout_moved': 'Bout moved',
  'tournament.schedule_submitted': 'Submitted for review',
  'tournament.schedule_approved': 'Approved',
  'tournament.schedule_approval_withdrawn': 'Approval withdrawn',
  'tournament.schedule_exception_granted': 'Exception granted',
  'tournament.schedule_exception_revoked': 'Exception revoked',
  'tournament.schedule_source_acknowledged': 'Source changes accepted',
  'tournament.schedule_generated': 'Auto-arranged',
  'tournament.schedule_amended': 'Amended',
  'tournament.schedule_division_saved': 'Division schedule saved',
  'tournament.schedule_division_saved': 'Division schedule saved',
}

function HistoryTab({ tournamentId, revision }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    boutScheduleApi
      .history(tournamentId)
      .then((r) => live && setRows(r))
      .catch((err) => live && setError(drawError(err, 'Could not load the history.')))
    return () => {
      live = false
    }
  }, [tournamentId, revision])
  if (error) return <Alert type="error">{error}</Alert>
  if (!rows) return <Spinner label="Loading…" />
  return (
    <section className="bs-card" aria-label="Change history" data-testid="bs-history">
      <h2 className="bs-card__title">
        <HistoryIcon aria-hidden="true" /> Change history
      </h2>
      {rows.length === 0 ? (
        <p className="bs-muted">No changes recorded yet.</p>
      ) : (
        <ol className="bs-history">
          {rows.map((r) => (
            <li key={r.id} data-action={r.action}>
              <span className="bs-history__when">{new Date(`${r.createdAt}Z`).toLocaleString('en-GB')}</span>
              <strong>{ACTION_LABEL[r.action] || r.action}</strong> <span className="bs-muted">by {r.actorName}</span>
              {r.entityRef && <span className="bs-muted"> · {r.entityRef}</span>}
              {r.details && <p>{r.details}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { auditApi } from '../api/resources'
import { extractErrorMessage, formatDateTime } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'

/**
 * The activity log — the whole audit trail in one place.
 *
 * The API records every membership decision, every website/news/event change,
 * every user and role change, and every refused action. Until now none of it
 * was readable in the console unless you happened to open the one registration
 * it belonged to, which is exactly the QA finding this answers.
 *
 * The trail is written by machines, so it reads like one: `event.deleted`,
 * `admin_user.password_reset_requested`. Everything below translates those into
 * something a federation administrator can scan, while keeping the raw value on
 * a `title` so nothing is lost when an entry has to be quoted in a report.
 */

const PAGE_SIZE = 50

const ENTITY_LABEL = {
  registration: 'Membership',
  content: 'Website page',
  news: 'News',
  event: 'Event',
  admin_user: 'Admin user',
  admin_role: 'Role',
  media: 'Media',
}

/** The part of an action after the dot, in words. */
const VERB_LABEL = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  edited: 'edited',
  status_changed: 'status changed',
  renewed: 'renewed',
  suspended: 'suspended',
  reinstated: 'reinstated',
  expired: 'expired',
  exported: 'exported',
  reopened: 'reopened',
  reset: 'reset',
  uploaded: 'uploaded',
  attachment_viewed: 'document opened',
  attachment_added: 'document added',
  attachment_removed: 'document removed',
  term_realigned: 'term realigned',
  card_reissued: 'card link reissued',
  permission_denied: 'permission denied',
  password_reset: 'password reset',
  password_reset_requested: 'password reset requested',
  password_reset_completed: 'password reset completed',
}

/** What actually happened, for an administrator who did not do it. */
const SENTENCE = {
  'registration.status_changed': 'Moved a membership application to another stage of the approval chain.',
  'registration.edited': 'Edited the details of a membership application.',
  'registration.renewed': 'Renewed a membership term.',
  'registration.suspended': 'Suspended a membership.',
  'registration.reinstated': 'Reinstated a suspended membership.',
  'registration.expired': 'Marked a membership as expired.',
  'registration.exported': 'Exported membership data out of the register.',
  'registration.deleted': 'Deleted a membership application.',
  'registration.attachment_viewed': 'Opened a document attached to an application.',
  'registration.attachment_added': 'Added or replaced a document on an application.',
  'registration.attachment_removed': 'Removed a document from an application.',
  'registration.term_realigned': 'Moved a membership’s end date onto the current term length.',
  'registration.card_reissued': 'Issued a new membership-card link, revoking the previous one.',
  'registration.reopened': 'Reopened an application that had been closed.',
  'registration.permission_denied': 'Attempted an action they are not permitted to make. The API refused it.',
  'admin_user.created': 'Created a console user account.',
  'admin_user.updated': 'Changed a console user — roles, details or active state.',
  'admin_user.password_reset': 'Reset another user’s password.',
  'admin_user.password_reset_requested': 'Requested a password reset link for their own account.',
  'admin_user.password_reset_completed': 'Set a new password using a reset link.',
  'admin_role.created': 'Created a role.',
  'admin_role.updated': 'Changed a role — its permissions or its names.',
  'admin_role.deleted': 'Deleted a role.',
  'content.updated': 'Edited the content of a page on the public website.',
  'content.reset': 'Reset a page back to the content that ships with the site.',
  'media.uploaded': 'Uploaded a file to the media library.',
  'news.created': 'Added a news article.',
  'news.updated': 'Edited a news article.',
  'news.deleted': 'Deleted a news article.',
  'event.created': 'Added an event.',
  'event.updated': 'Edited an event.',
  'event.deleted': 'Deleted an event.',
}

function words(value) {
  return String(value || '').replace(/_/g, ' ')
}

function entityLabel(value) {
  if (!value) return 'Record'
  return ENTITY_LABEL[value] || words(value)
}

function verbOf(action) {
  const dot = String(action || '').indexOf('.')
  return dot === -1 ? String(action || '') : String(action).slice(dot + 1)
}

function entityOf(action) {
  const dot = String(action || '').indexOf('.')
  return dot === -1 ? '' : String(action).slice(0, dot)
}

/** "News · created", "Membership · status changed". */
function actionLabel(action) {
  const verb = verbOf(action)
  const verbText = VERB_LABEL[verb] || words(verb)
  const entity = entityOf(action)
  if (!entity) return verbText || '—'
  return `${entityLabel(entity)} · ${verbText}`
}

function actionSentence(entry) {
  if (SENTENCE[entry.action]) return SENTENCE[entry.action]
  const verb = verbOf(entry.action)
  return `${entityLabel(entry.entityType || entityOf(entry.action))} ${VERB_LABEL[verb] || words(verb)}.`
}

function actionTone(action) {
  const verb = verbOf(action)
  if (verb === 'permission_denied') return 'red'
  if (verb === 'deleted') return 'gold'
  if (verb === 'created') return 'green'
  return 'neutral'
}

/** "under review → approved", or just one side when only one is recorded. */
function statusText(entry) {
  const from = entry.fromStatus ? words(entry.fromStatus) : ''
  const to = entry.toStatus ? words(entry.toStatus) : ''
  if (from && to) return `${from} → ${to}`
  if (to) return `→ ${to}`
  if (from) return `${from} →`
  return ''
}

export default function AuditLog() {
  const [items, setItems] = useState([])
  // What the server said about the page it returned, so the range never
  // disagrees with the rows on screen.
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: PAGE_SIZE })
  const [entityTypes, setEntityTypes] = useState([])
  const [actions, setActions] = useState([])
  const [actors, setActors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [entityType, setEntityType] = useState('all')
  const [action, setAction] = useState('all')
  const [actor, setActor] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  // Typing should not fire a request per keystroke. Narrowing the trail always
  // starts again from the newest entry, here and in every filter below.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    auditApi
      .list({
        entityType: entityType === 'all' ? undefined : entityType,
        action: action === 'all' ? undefined : action,
        actor: actor === 'all' ? undefined : actor,
        search: search || undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      .then((data) => {
        if (cancelled) return
        const rows = Array.isArray(data?.items) ? data.items : []
        setItems(rows)
        setMeta({
          total: Number(data?.total) || 0,
          page: Number(data?.page) || page,
          pageSize: Number(data?.pageSize) || PAGE_SIZE,
        })
        // Entries can be added while the screen is open; if the page being
        // asked for has since fallen off the end, fall back to the last one.
        if (rows.length === 0 && page > 1) {
          const size = Number(data?.pageSize) || PAGE_SIZE
          const lastAvailable = Math.max(1, Math.ceil((Number(data?.total) || 0) / size))
          if (lastAvailable < page) setPage(lastAvailable)
        }
        // These two come back for the whole table, not the filtered page.
        if (Array.isArray(data?.entityTypes) && data.entityTypes.length) setEntityTypes(data.entityTypes)
        if (Array.isArray(data?.actions) && data.actions.length) setActions(data.actions)
        // The API offers no list of actors, so the choices grow as entries are
        // seen. Free-text search still reaches an actor not listed yet.
        setActors((previous) => {
          const next = new Set(previous)
          for (const row of rows) if (row?.actorName) next.add(row.actorName)
          return Array.from(next).sort((a, b) => a.localeCompare(b))
        })
      })
      .catch((err) => {
        if (cancelled) return
        setItems([])
        setError(extractErrorMessage(err, 'Could not load the activity log.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [entityType, action, actor, search, page])

  // Actions grouped under the area they belong to, so the list is scannable.
  const actionGroups = useMemo(() => {
    const groups = new Map()
    for (const value of actions) {
      const key = entityOf(value) || 'other'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(value)
    }
    return Array.from(groups.entries())
      .map(([key, values]) => ({
        key,
        label: entityLabel(key),
        values: values.slice().sort((a, b) => actionLabel(a).localeCompare(actionLabel(b))),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [actions])

  const filtered = entityType !== 'all' || action !== 'all' || actor !== 'all' || Boolean(search)

  const total = meta.total
  const size = meta.pageSize || PAGE_SIZE
  const first = total === 0 ? 0 : (meta.page - 1) * size + 1
  const last = total === 0 ? 0 : Math.min(meta.page * size, total)
  const lastPage = Math.max(1, Math.ceil(total / size))

  function resetFilters() {
    setEntityType('all')
    setAction('all')
    setActor('all')
    setSearchInput('')
    setSearch('')
    setPage(1)
  }

  return (
    <div>
      <PageHeader
        title="Activity Log"
        description="Who changed what, and when — memberships, website content, news, events, users and roles, plus every action the system refused."
      />

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>

      <div className="toolbar">
        <input
          type="search"
          className="toolbar__search"
          placeholder="Search reference, record or person…"
          aria-label="Search the activity log"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
        <select
          className="toolbar__select"
          aria-label="Filter by area"
          value={entityType}
          onChange={(event) => {
            setEntityType(event.target.value)
            setPage(1)
          }}
        >
          <option value="all">All areas</option>
          {entityTypes.map((value) => (
            <option key={value} value={value} title={value}>
              {entityLabel(value)}
            </option>
          ))}
        </select>
        <select
          className="toolbar__select"
          aria-label="Filter by action"
          value={action}
          onChange={(event) => {
            setAction(event.target.value)
            setPage(1)
          }}
        >
          <option value="all">All actions</option>
          {actionGroups.map((group) => (
            <optgroup key={group.key} label={group.label}>
              {group.values.map((value) => (
                <option key={value} value={value} title={value}>
                  {actionLabel(value)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          className="toolbar__select"
          aria-label="Filter by person"
          title="People who appear in the entries loaded so far. Use the search box for anyone else."
          value={actor}
          onChange={(event) => {
            setActor(event.target.value)
            setPage(1)
          }}
        >
          <option value="all">Anyone</option>
          {actors.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {filtered && (
          <button type="button" className="btn btn--ghost btn--small" onClick={resetFilters}>
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <Spinner label="Loading the activity log…" />
      ) : items.length === 0 ? (
        <EmptyState
          title={filtered ? 'Nothing matches these filters' : 'Nothing recorded yet'}
          description={
            filtered
              ? 'Try a wider area or action, or clear the filters to see the whole trail.'
              : 'Approvals, content edits, and user changes appear here as they happen.'
          }
          action={
            filtered ? (
              <button type="button" className="btn btn--secondary" onClick={resetFilters}>
                Clear filters
              </button>
            ) : null
          }
        />
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What happened</th>
                  <th>Record</th>
                  <th>Change / details</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => {
                  const change = statusText(entry)
                  const reference = entry.entityRef || ''
                  const entityId = Number(entry.entityId) || 0
                  return (
                    <tr key={entry.id}>
                      <td>{formatDateTime(entry.createdAt) || '—'}</td>
                      <td>
                        <div className="data-table__primary">{entry.actorName || 'System'}</div>
                        {entry.actorRole && <div className="data-table__subtext">{words(entry.actorRole)}</div>}
                      </td>
                      <td>
                        <span title={entry.action}>
                          <Badge tone={actionTone(entry.action)}>{actionLabel(entry.action)}</Badge>
                        </span>
                        <div className="data-table__subtext">{actionSentence(entry)}</div>
                      </td>
                      <td>
                        <div className="data-table__primary">
                          {reference || (entityId > 0 ? `#${entityId}` : '—')}
                        </div>
                        {reference && entityId > 0 && <div className="data-table__subtext">#{entityId}</div>}
                      </td>
                      <td>
                        {change && <div>{change}</div>}
                        {entry.details && <div className="data-table__subtext">{entry.details}</div>}
                        {!change && !entry.details && '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="toolbar" style={{ marginTop: 16, marginBottom: 0, alignItems: 'center' }}>
            <span className="data-table__subtext" aria-live="polite" style={{ marginRight: 'auto' }}>
              {first}–{last} of {total}
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              disabled={meta.page <= 1}
              onClick={() => setPage(Math.max(1, meta.page - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              disabled={meta.page >= lastPage}
              onClick={() => setPage(meta.page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  )
}

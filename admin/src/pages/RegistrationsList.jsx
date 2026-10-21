import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { registrationsApi } from '../api/resources'
import { useAuth } from '../context/AuthContext'
import { extractErrorMessage, formatDate, getId, pick } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'
import ConfirmDialog from '../components/ConfirmDialog'
import { TrashIcon } from '../components/Icons'

/**
 * The membership queue.
 *
 * This screen triages: it finds the request you need and hands it over. Every
 * decision about one record — its stage, documents, reason boxes, edits,
 * notifications and audit trail — belongs to the per-member review page at
 * /registrations/:id, which is where a reviewer can read one application top to
 * bottom instead of picking it out of an expanded table row.
 *
 * Nothing here is a security boundary. The API re-checks every permission, so
 * the §6 grants only decide what is worth showing.
 */

/**
 * Used until /statuses answers, so the status filter still lists the lifecycle
 * if that call fails. The review page keeps its own copy for the same reason.
 */
const FALLBACK_STATUSES = [
  { value: 'new', labelEn: 'New' },
  { value: 'under_review', labelEn: 'Under Review' },
  { value: 'awaiting_completion', labelEn: 'Awaiting Completion' },
  { value: 'awaiting_approval', labelEn: 'Awaiting Approval' },
  { value: 'approved', labelEn: 'Approved' },
  { value: 'rejected', labelEn: 'Rejected' },
  { value: 'cancelled', labelEn: 'Cancelled' },
  { value: 'completed', labelEn: 'Completed' },
  { value: 'suspended', labelEn: 'Suspended' },
  { value: 'expired', labelEn: 'Expired' },
]

const STATUS_TONE = {
  new: 'gold',
  under_review: 'gold',
  awaiting_completion: 'gold',
  awaiting_approval: 'gold',
  approved: 'green',
  rejected: 'red',
  cancelled: 'neutral',
  completed: 'green',
  suspended: 'red',
  expired: 'neutral',
}

const TYPE_LABEL = { athlete: 'Athlete', club: 'Club', coach: 'Coach', official: 'Referee / Official' }

export default function RegistrationsList() {
  const { can, user } = useAuth()
  const navigate = useNavigate()

  const [items, setItems] = useState([])
  const [statuses, setStatuses] = useState(FALLBACK_STATUSES)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [attentionOnly, setAttentionOnly] = useState(false)

  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setItems(await registrationsApi.list())
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not load registrations.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()

    registrationsApi
      .statuses()
      .then((data) => {
        if (Array.isArray(data) && data.length) setStatuses(data)
      })
      .catch(() => {
        /* Keep the fallback vocabulary. */
      })
  }, [load])

  const statusMap = useMemo(() => {
    const map = {}
    statuses.forEach((entry) => {
      map[entry.value] = entry
    })
    return map
  }, [statuses])

  const labelOf = useCallback((status) => statusMap[status]?.labelEn || status, [statusMap])

  const filtered = useMemo(() => {
    let list = items
    if (typeFilter !== 'all') list = list.filter((item) => pick(item, ['type'], '') === typeFilter)
    if (statusFilter !== 'all') list = list.filter((item) => pick(item, ['status'], 'new') === statusFilter)
    if (attentionOnly) list = list.filter((item) => item.isOverdue || item.isExpired)

    if (search.trim()) {
      const term = search.trim().toLowerCase()
      list = list.filter((item) =>
        [item.applicantName, item.contactEmail, item.referenceNumber, item.membershipNumber]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term)),
      )
    }
    return list
  }, [items, search, typeFilter, statusFilter, attentionOnly])

  const attentionCount = useMemo(
    () => items.filter((item) => item.isOverdue || item.isExpired).length,
    [items],
  )

  async function exportCsv() {
    setExporting(true)
    setError('')
    try {
      await registrationsApi.exportCsv({
        type: typeFilter === 'all' ? undefined : typeFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
      })
      setNotice('Export downloaded. This download is recorded in the audit trail.')
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not export the register.'))
    } finally {
      setExporting(false)
    }
  }

  async function handleDeleteConfirmed() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await registrationsApi.remove(getId(pendingDelete))
      setItems((prev) => prev.filter((item) => getId(item) !== getId(pendingDelete)))
      setPendingDelete(null)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not delete this registration.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Memberships"
        description="Athlete, coach, referee and club applications. Open one to review it, decide it and see what the applicant was told."
      />

      {/* §6 — what this account may do. Shown plainly so a reviewer who cannot
          find an approve button knows why, rather than assuming a fault. */}
      {user && (
        <p className="membership-role-note">
          Signed in as <strong>{user.displayName || user.username}</strong>
          {user.roles?.length ? <> · roles <code>{user.roles.map((role) => role.nameEn).join(', ')}</code></> : null}
          {' · '}
          {['view', 'review', 'request_completion', 'approve', 'reject', 'edit', 'suspend', 'export']
            .filter((action) => can(action))
            .join(', ') || 'no membership permissions'}
        </p>
      )}

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>
      <Alert type="success" onDismiss={() => setNotice('')}>
        {notice}
      </Alert>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search by name, email, reference or membership no.…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="toolbar__search"
        />
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="toolbar__select">
          <option value="all">All types</option>
          <option value="athlete">Athlete</option>
          <option value="coach">Coach</option>
          <option value="official">Referee / Official</option>
          <option value="club">Club</option>
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="toolbar__select">
          <option value="all">All statuses</option>
          {statuses.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.labelEn || entry.value}
            </option>
          ))}
        </select>
        {/* Overdue completions and lapsed terms are the two things §6 expects
            someone to chase, so they get a dedicated filter. */}
        <button
          type="button"
          className={`btn btn--small ${attentionOnly ? 'btn--primary' : ''}`}
          onClick={() => setAttentionOnly((value) => !value)}
          disabled={attentionCount === 0 && !attentionOnly}
        >
          Needs attention{attentionCount ? ` (${attentionCount})` : ''}
        </button>

        {/* §6 تصدير. Exports what the current filters show, and the download
            itself is written to the audit trail. */}
        {can('export') && (
          <button type="button" className="btn btn--small" onClick={exportCsv} disabled={exporting || !filtered.length}>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        )}
      </div>

      {loading ? (
        <Spinner label="Loading registrations…" />
      ) : filtered.length === 0 ? (
        <EmptyState title="No registrations found" description="Submissions from the public site will appear here." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Type</th>
                <th>Name / Contact</th>
                <th>Stage</th>
                <th>Status</th>
                <th>Term ends</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const id = getId(item)
                const status = pick(item, ['status'], 'new')
                const type = pick(item, ['type'], 'athlete')

                return (
                  <tr key={id} className="data-table__clickable" onClick={() => navigate(`/registrations/${id}`)}>
                    <td>
                      <code>{item.referenceNumber || `#${id}`}</code>
                      {item.membershipNumber && <div className="data-table__subtext">{item.membershipNumber}</div>}
                    </td>
                    <td>{TYPE_LABEL[type] || type}</td>
                    <td className="data-table__primary">
                      {item.applicantName || '—'}
                      <div className="data-table__subtext">{item.contactEmail || item.contactPhone || ''}</div>
                    </td>
                    <td>
                      {item.stageCount ? `${item.stageOrder} / ${item.stageCount}` : '—'}
                      <div className="data-table__subtext">{formatDate(item.createdAt)}</div>
                    </td>
                    <td>
                      <Badge tone={STATUS_TONE[status] || 'neutral'}>{labelOf(status)}</Badge>
                      {item.isOverdue && (
                        <div className="data-table__subtext data-table__subtext--alert">
                          Completion overdue since {formatDate(item.completionDueAt)}
                        </div>
                      )}
                    </td>
                    <td>
                      {item.expiresAt ? (
                        <>
                          {formatDate(item.expiresAt)}
                          {item.isExpired ? (
                            <div className="data-table__subtext data-table__subtext--alert">Expired</div>
                          ) : (
                            typeof item.daysUntilExpiry === 'number' &&
                            item.daysUntilExpiry <= 60 && (
                              <div className="data-table__subtext data-table__subtext--alert">
                                {item.daysUntilExpiry} days left
                              </div>
                            )
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="data-table__actions" onClick={(event) => event.stopPropagation()}>
                      {/* Every action on one request now lives on its own page,
                          so the queue offers one way in rather than a dozen
                          controls per row. */}
                      <Link to={`/registrations/${id}`} className="btn btn--small">
                        Open
                      </Link>

                      {can('suspend') && (
                        <button
                          type="button"
                          className="icon-btn icon-btn--danger"
                          title="Delete"
                          aria-label="Delete"
                          onClick={() => setPendingDelete(item)}
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this registration?"
        description="This permanently removes the application and the evidence behind any decision made on it. Suspending or cancelling the membership is usually the right action instead."
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDeleteConfirmed}
        busy={deleting}
      />
    </div>
  )
}

import { Fragment, useEffect, useMemo, useState } from 'react'
import { registrationsApi } from '../api/resources'
import { extractErrorMessage, formatDateTime, getId, pick } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'
import ConfirmDialog from '../components/ConfirmDialog'
import { TrashIcon } from '../components/Icons'

/**
 * The registration request lifecycle (§12 of the federation content
 * requirements). Loaded from the API at mount; this list is the fallback so the
 * screen still works if that call fails.
 */
const FALLBACK_STATUSES = [
  { value: 'new', labelEn: 'New', requiresReason: false },
  { value: 'under_review', labelEn: 'Under Review', requiresReason: false },
  { value: 'awaiting_completion', labelEn: 'Awaiting Completion', requiresReason: true },
  { value: 'awaiting_approval', labelEn: 'Awaiting Approval', requiresReason: false },
  { value: 'approved', labelEn: 'Approved', requiresReason: false },
  { value: 'rejected', labelEn: 'Rejected', requiresReason: true },
  { value: 'cancelled', labelEn: 'Cancelled', requiresReason: false },
  { value: 'completed', labelEn: 'Completed', requiresReason: false },
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
}

const TYPE_LABEL = { athlete: 'Athlete', club: 'Club', coach: 'Coach', official: 'Referee / Official' }

/** Keys that are rendered on their own rather than in the generic detail grid. */
const DETAIL_EXCLUDED = new Set(['attachments', 'consent', 'registrationType', 'submittedLanguage'])

function parsePayload(item) {
  const raw = pick(item, ['payloadJson', 'payload'], '{}')
  if (raw && typeof raw === 'object') return raw
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return {}
  }
}

/**
 * The portal now collects three name parts per script (REG-03) rather than one
 * combined field. Older requests still carry `fullNameAr` / `applicantName`, so
 * both shapes are read here — the list must keep working for everything already
 * in the database.
 */
function displayName(payload, suffix) {
  const parts = ['firstName', 'fatherName', 'familyName']
    .map((part) => pick(payload, [part + suffix], ''))
    .filter(Boolean)
  return parts.join(' ')
}

function payloadSummary(payload) {
  const name =
    displayName(payload, 'Ar') ||
    displayName(payload, 'En') ||
    pick(payload, ['fullNameAr', 'fullNameEn', 'nameAr', 'applicantName', 'fullName', 'name', 'clubName'], '')
  const email = pick(payload, ['email', 'applicantEmail', 'officialEmail'], '')
  const phone = pick(payload, ['phone', 'mobile', 'applicantPhone', 'phoneNumber'], '')
  return { name, email, phone }
}

function attachmentsOf(payload) {
  const attachments = payload?.attachments
  if (!attachments || typeof attachments !== 'object') return []
  return Object.entries(attachments)
    .filter(([, value]) => value && typeof value === 'object' && value.id)
    .map(([slot, value]) => ({ slot, ...value }))
}

export default function RegistrationsList() {
  const [items, setItems] = useState([])
  const [statuses, setStatuses] = useState(FALLBACK_STATUSES)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null)
  const [updatingId, setUpdatingId] = useState(null)
  const [pendingChange, setPendingChange] = useState(null) // { id, status, reason, membershipNumber }
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await registrationsApi.list()
      setItems(data)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not load registrations.'))
    } finally {
      setLoading(false)
    }
  }

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
  }, [])

  const statusLabel = useMemo(() => {
    const map = {}
    statuses.forEach((entry) => {
      map[entry.value] = entry.labelEn || entry.value
    })
    return map
  }, [statuses])

  const requiresReason = (status) => Boolean(statuses.find((entry) => entry.value === status)?.requiresReason)

  const filtered = useMemo(() => {
    let list = items
    if (typeFilter !== 'all') list = list.filter((item) => pick(item, ['type'], '') === typeFilter)
    if (statusFilter !== 'all') list = list.filter((item) => pick(item, ['status'], 'new') === statusFilter)
    if (search.trim()) {
      const term = search.trim().toLowerCase()
      list = list.filter((item) => {
        const { name, email } = payloadSummary(parsePayload(item))
        const ref = String(pick(item, ['referenceNumber'], '')).toLowerCase()
        return String(name).toLowerCase().includes(term) || String(email).toLowerCase().includes(term) || ref.includes(term)
      })
    }
    return list
  }, [items, search, typeFilter, statusFilter])

  /** A status that needs a reason (or an approval that may carry a membership number) opens the panel first. */
  function selectStatus(item, status) {
    const id = getId(item)
    if (status === pick(item, ['status'], '')) return

    if (requiresReason(status) || status === 'approved') {
      setExpandedId(id)
      setPendingChange({ id, status, reason: '', membershipNumber: pick(item, ['membershipNumber'], '') || '' })
      return
    }
    applyStatus(item, { status })
  }

  async function applyStatus(item, patch) {
    const id = getId(item)
    setUpdatingId(id)
    setError('')
    try {
      const updated = await registrationsApi.updateStatus(id, patch)
      setItems((prev) => prev.map((entry) => (getId(entry) === id ? { ...entry, ...updated, ...patch } : entry)))
      setPendingChange(null)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not update this registration.'))
    } finally {
      setUpdatingId(null)
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

  async function download(item, attachment) {
    try {
      await registrationsApi.openAttachment(getId(item), attachment.id, attachment.fileName)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not download that document.'))
    }
  }

  return (
    <div>
      <PageHeader
        title="Registrations"
        description="Submissions from the public registration portal (athletes, coaches, referees, clubs), with their documents and lifecycle status."
      />

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search by name, email or reference…"
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
      </div>

      {loading ? (
        <Spinner label="Loading registrations…" />
      ) : filtered.length === 0 ? (
        <EmptyState title="No registrations yet" description="Submissions from the public site will appear here." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Type</th>
                <th>Name / Contact</th>
                <th>Submitted</th>
                <th>Status</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const id = getId(item)
                const isExpanded = expandedId === id
                const payload = parsePayload(item)
                const { name, email, phone } = payloadSummary(payload)
                const status = pick(item, ['status'], 'new')
                const type = pick(item, ['type'], 'athlete')
                const attachments = attachmentsOf(payload)
                const change = pendingChange?.id === id ? pendingChange : null

                return (
                  <Fragment key={id}>
                    <tr className="data-table__clickable" onClick={() => setExpandedId(isExpanded ? null : id)}>
                      <td>
                        <code>{pick(item, ['referenceNumber'], `#${id}`)}</code>
                      </td>
                      <td>{TYPE_LABEL[type] || type}</td>
                      <td className="data-table__primary">
                        {name || '—'}
                        <div className="data-table__subtext">{email || phone || ''}</div>
                      </td>
                      <td>{formatDateTime(pick(item, ['createdAt'], ''))}</td>
                      <td>
                        <Badge tone={STATUS_TONE[status] || 'neutral'}>{statusLabel[status] || status}</Badge>
                      </td>
                      <td className="data-table__actions" onClick={(event) => event.stopPropagation()}>
                        <select
                          value={status}
                          onChange={(event) => selectStatus(item, event.target.value)}
                          disabled={updatingId === id}
                          className="toolbar__select"
                          style={{ minWidth: 170 }}
                        >
                          {statuses.map((entry) => (
                            <option key={entry.value} value={entry.value}>
                              {entry.labelEn || entry.value}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="icon-btn icon-btn--danger"
                          title="Delete"
                          aria-label="Delete"
                          onClick={() => setPendingDelete(item)}
                        >
                          <TrashIcon />
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="data-table__detail-row">
                        <td colSpan={6}>
                          {change && (
                            <div className="detail-panel">
                              <h4>Change status to “{statusLabel[change.status] || change.status}”</h4>
                              {requiresReason(change.status) && (
                                <label className="detail-panel__field">
                                  <span>
                                    {change.status === 'rejected'
                                      ? 'Reason for rejection — shown to the applicant in the email'
                                      : 'What is missing — listed to the applicant in the email'}
                                  </span>
                                  <textarea
                                    rows={3}
                                    value={change.reason}
                                    onChange={(event) => setPendingChange({ ...change, reason: event.target.value })}
                                  />
                                </label>
                              )}
                              {change.status === 'approved' && (
                                <label className="detail-panel__field">
                                  <span>Membership / accreditation number (optional)</span>
                                  <input
                                    type="text"
                                    value={change.membershipNumber}
                                    onChange={(event) => setPendingChange({ ...change, membershipNumber: event.target.value })}
                                  />
                                </label>
                              )}
                              <div className="detail-panel__actions">
                                <button
                                  type="button"
                                  className="btn btn--primary"
                                  disabled={updatingId === id || (requiresReason(change.status) && !change.reason.trim())}
                                  onClick={() =>
                                    applyStatus(item, {
                                      status: change.status,
                                      statusReason: requiresReason(change.status) ? change.reason.trim() : null,
                                      membershipNumber: change.status === 'approved' ? change.membershipNumber.trim() || null : undefined,
                                    })
                                  }
                                >
                                  {updatingId === id ? 'Saving…' : 'Confirm'}
                                </button>
                                <button type="button" className="btn" onClick={() => setPendingChange(null)}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}

                          {attachments.length > 0 && (
                            <div className="detail-panel">
                              <h4>Documents</h4>
                              <div className="detail-panel__files">
                                {attachments.map((attachment) => (
                                  <button
                                    key={attachment.id}
                                    type="button"
                                    className="btn btn--small"
                                    onClick={() => download(item, attachment)}
                                    title={attachment.fileName}
                                  >
                                    {attachment.slot} — {attachment.fileName}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <dl className="detail-grid">
                            {pick(item, ['statusReason'], '') && (
                              <div className="detail-grid__item">
                                <dt>statusReason</dt>
                                <dd>{pick(item, ['statusReason'], '')}</dd>
                              </div>
                            )}
                            {pick(item, ['membershipNumber'], '') && (
                              <div className="detail-grid__item">
                                <dt>membershipNumber</dt>
                                <dd>{pick(item, ['membershipNumber'], '')}</dd>
                              </div>
                            )}
                            {Object.entries(payload)
                              .filter(([key]) => !DETAIL_EXCLUDED.has(key))
                              .map(([key, value]) => (
                                <div key={key} className="detail-grid__item">
                                  <dt>{key}</dt>
                                  <dd>{typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}</dd>
                                </div>
                              ))}
                          </dl>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this registration?"
        description="This submission will be permanently removed."
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDeleteConfirmed}
        busy={deleting}
      />
    </div>
  )
}

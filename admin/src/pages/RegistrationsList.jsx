import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { registrationsApi } from '../api/resources'
import { useAuth } from '../context/AuthContext'
import { extractErrorMessage, formatDate, formatDateTime, getId, pick } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'
import ConfirmDialog from '../components/ConfirmDialog'
import { TrashIcon } from '../components/Icons'

/**
 * Membership review console.
 *
 * The workflow this drives is the federation's Phase 2 document: four tracks
 * with a five-stage approval chain each (§2–§5), a permission matrix in which
 * reviewing and approving are deliberately different grants (§6), and a
 * three-year term with renewal, expiry and suspension (§1, §6).
 *
 * Two rules shape the whole screen:
 *
 *   • The status control offers only the transitions the API will actually
 *     accept from the current status, filtered to the ones this user is
 *     permitted to make. Previously it listed every status unconditionally, so
 *     it invited actions that would be refused — or worse, ones that would have
 *     succeeded and skipped the review chain entirely.
 *   • Nothing here is a security boundary. The API re-checks every permission
 *     and every transition, so this only decides what is worth showing.
 */

/** Used until /statuses answers, so the screen still renders if that call fails. */
const FALLBACK_STATUSES = [
  { value: 'new', labelEn: 'New', requiresReason: false, requiredAction: 'review', allowedNext: ['under_review', 'awaiting_completion', 'rejected', 'cancelled'] },
  { value: 'under_review', labelEn: 'Under Review', requiresReason: false, requiredAction: 'review', allowedNext: ['awaiting_completion', 'awaiting_approval', 'rejected', 'cancelled'] },
  { value: 'awaiting_completion', labelEn: 'Awaiting Completion', requiresReason: true, requiredAction: 'request_completion', allowedNext: ['under_review', 'rejected', 'cancelled'] },
  { value: 'awaiting_approval', labelEn: 'Awaiting Approval', requiresReason: false, requiredAction: 'review', allowedNext: ['approved', 'rejected', 'awaiting_completion', 'cancelled'] },
  { value: 'approved', labelEn: 'Approved', requiresReason: false, requiredAction: 'approve', allowedNext: ['suspended', 'expired', 'cancelled', 'completed'] },
  { value: 'rejected', labelEn: 'Rejected', requiresReason: true, requiredAction: 'reject', allowedNext: [] },
  { value: 'cancelled', labelEn: 'Cancelled', requiresReason: false, requiredAction: 'suspend', allowedNext: [] },
  { value: 'completed', labelEn: 'Completed', requiresReason: false, requiredAction: 'review', allowedNext: [] },
  { value: 'suspended', labelEn: 'Suspended', requiresReason: true, requiredAction: 'suspend', allowedNext: ['approved', 'cancelled'] },
  { value: 'expired', labelEn: 'Expired', requiresReason: false, requiredAction: 'review', allowedNext: ['approved', 'cancelled'] },
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

/** Rendered on their own rather than in the generic detail grid. */
const DETAIL_EXCLUDED = new Set(['attachments', 'consent', 'registrationType', 'submittedLanguage'])

function parsePayload(detail) {
  const raw = pick(detail, ['payloadJson', 'payload'], '{}')
  if (raw && typeof raw === 'object') return raw
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return {}
  }
}

function attachmentsOf(payload) {
  const attachments = payload?.attachments
  if (!attachments || typeof attachments !== 'object') return []
  return Object.entries(attachments)
    .filter(([, value]) => value && typeof value === 'object' && value.id)
    .map(([slot, value]) => ({ slot, ...value }))
}

/** Wording for the reason box, which differs by what the reason is for. */
function reasonLabel(status) {
  if (status === 'rejected') return 'Reason for rejection — sent to the applicant'
  if (status === 'suspended') return 'Reason for suspension — sent to the applicant'
  if (status === 'cancelled') return 'Reason for cancellation — sent to the applicant'
  return 'What is missing — listed to the applicant in the email and SMS'
}

export default function RegistrationsList() {
  const { can, user } = useAuth()

  const [items, setItems] = useState([])
  const [statuses, setStatuses] = useState(FALLBACK_STATUSES)
  const [tracks, setTracks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [attentionOnly, setAttentionOnly] = useState(false)

  const [expandedId, setExpandedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [audit, setAudit] = useState([])

  const [updatingId, setUpdatingId] = useState(null)
  const [pendingChange, setPendingChange] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

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

    registrationsApi
      .tracks()
      .then((data) => {
        if (Array.isArray(data)) setTracks(data)
      })
      .catch(() => {
        /* The stage strip is an enhancement; the screen works without it. */
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
  const trackOf = useCallback((type) => tracks.find((t) => t.key === type) || null, [tracks])

  /**
   * The moves offered for a request: what the API allows from its current
   * status (§6 transition rules), narrowed to what this user may perform.
   */
  const movesFor = useCallback(
    (status) => {
      const allowed = statusMap[status]?.allowedNext || []
      return allowed
        .map((value) => statusMap[value])
        .filter(Boolean)
        .filter((entry) => can(entry.requiredAction || 'review'))
    },
    [statusMap, can],
  )

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

  /** Opening a row fetches the full record — the list omits the payload. */
  async function toggleRow(item) {
    const id = getId(item)
    if (expandedId === id) {
      setExpandedId(null)
      setDetail(null)
      setAudit([])
      return
    }

    setExpandedId(id)
    setDetail(null)
    setAudit([])
    setPendingChange(null)
    setDetailLoading(true)

    try {
      const [full, trail] = await Promise.all([
        registrationsApi.get(id),
        registrationsApi.audit(id).catch(() => []),
      ])
      setDetail(full)
      setAudit(Array.isArray(trail) ? trail : [])
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not open this registration.'))
    } finally {
      setDetailLoading(false)
    }
  }

  /** Statuses needing a reason (or a membership number) collect it before sending. */
  function selectStatus(item, status) {
    if (!status || status === pick(item, ['status'], '')) return
    const id = getId(item)

    if (statusMap[status]?.requiresReason || status === 'approved') {
      setPendingChange({ id, status, reason: '', membershipNumber: item.membershipNumber || '' })
      return
    }
    applyStatus(item, { status })
  }

  function mergeUpdated(id, updated) {
    const summary = updated?.summary || updated
    setItems((prev) => prev.map((entry) => (getId(entry) === id ? { ...entry, ...summary } : entry)))
    if (updated?.payloadJson !== undefined) setDetail(updated)
  }

  async function applyStatus(item, patch) {
    const id = getId(item)
    setUpdatingId(id)
    setError('')
    setNotice('')
    try {
      const updated = await registrationsApi.updateStatus(id, patch)
      mergeUpdated(id, updated)
      setPendingChange(null)
      setNotice(`${item.referenceNumber} moved to “${labelOf(patch.status)}”. The applicant has been notified.`)
      if (expandedId === id) setAudit(await registrationsApi.audit(id).catch(() => audit))
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not update this registration.'))
    } finally {
      setUpdatingId(null)
    }
  }

  async function renew(item) {
    const id = getId(item)
    setUpdatingId(id)
    setError('')
    setNotice('')
    try {
      const updated = await registrationsApi.renew(id)
      mergeUpdated(id, updated)
      const expiry = (updated?.summary || updated)?.expiresAt
      setNotice(`${item.referenceNumber} renewed${expiry ? ` until ${formatDate(expiry)}` : ''}.`)
      if (expandedId === id) setAudit(await registrationsApi.audit(id).catch(() => audit))
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not renew this membership.'))
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
        title="Memberships"
        description="Athlete, coach, referee and club applications, with their approval stage, documents, membership term and audit trail."
      />

      {/* §6 — what this account may do. Shown plainly so a reviewer who cannot
          find an approve button knows why, rather than assuming a fault. */}
      {user && (
        <p className="membership-role-note">
          Signed in as <strong>{user.displayName || user.username}</strong>
          {user.membershipRole ? <> · membership role <code>{user.membershipRole}</code></> : null}
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
                const isExpanded = expandedId === id
                const status = pick(item, ['status'], 'new')
                const type = pick(item, ['type'], 'athlete')
                const track = trackOf(type)
                const moves = movesFor(status)
                const change = pendingChange?.id === id ? pendingChange : null
                const busy = updatingId === id
                const payload = isExpanded ? parsePayload(detail) : {}
                const attachments = attachmentsOf(payload)

                return (
                  <Fragment key={id}>
                    <tr className="data-table__clickable" onClick={() => toggleRow(item)}>
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
                        {/* Only the transitions the API accepts from here, and
                            only those this role may make. An empty list means
                            there is genuinely nothing this user can do next. */}
                        {moves.length > 0 ? (
                          <select
                            value=""
                            onChange={(event) => selectStatus(item, event.target.value)}
                            disabled={busy}
                            className="toolbar__select"
                            style={{ minWidth: 170 }}
                          >
                            <option value="">Move to…</option>
                            {moves.map((entry) => (
                              <option key={entry.value} value={entry.value}>
                                {entry.labelEn || entry.value}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="data-table__subtext">No action available</span>
                        )}

                        {/* §1 — renewal restarts the three-year term. */}
                        {can('approve') && (status === 'approved' || status === 'expired') && (
                          <button type="button" className="btn btn--small" disabled={busy} onClick={() => renew(item)}>
                            Renew
                          </button>
                        )}

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

                    {isExpanded && (
                      <tr className="data-table__detail-row">
                        <td colSpan={7}>
                          {/* §2–§5 — the track's approval chain, with the
                              current stage marked and the responsible party
                              named, so a reviewer sees whose step it is. */}
                          {track && (
                            <div className="detail-panel">
                              <h4>
                                {track.licenceNameEn} · {track.termYears}-year term
                              </h4>
                              <ol className="stage-strip">
                                {track.stages.map((stage) => (
                                  <li
                                    key={stage.order}
                                    className={`stage-strip__item ${
                                      stage.order === item.stageOrder ? 'is-current' : ''
                                    } ${stage.order < item.stageOrder ? 'is-done' : ''}`}
                                  >
                                    <span className="stage-strip__order">{stage.order}</span>
                                    <span className="stage-strip__name">{stage.nameEn}</span>
                                    <span className="stage-strip__owner">{stage.ownerEn}</span>
                                  </li>
                                ))}
                              </ol>
                              <p className="stage-strip__fees">
                                <strong>Registration:</strong> {track.registrationFeeEn} <strong>Renewal:</strong>{' '}
                                {track.renewalFeeEn}
                              </p>
                            </div>
                          )}

                          {change && (
                            <div className="detail-panel">
                              <h4>Move to “{labelOf(change.status)}”</h4>
                              {statusMap[change.status]?.requiresReason && (
                                <label className="detail-panel__field">
                                  <span>{reasonLabel(change.status)}</span>
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
                                    onChange={(event) =>
                                      setPendingChange({ ...change, membershipNumber: event.target.value })
                                    }
                                  />
                                </label>
                              )}
                              {change.status === 'awaiting_completion' && (
                                <p className="field__hint">
                                  The applicant gets {'≈'}7 working days to respond; the deadline is shown in this
                                  list once set.
                                </p>
                              )}
                              <div className="detail-panel__actions">
                                <button
                                  type="button"
                                  className="btn btn--primary"
                                  disabled={
                                    busy || (statusMap[change.status]?.requiresReason && !change.reason.trim())
                                  }
                                  onClick={() =>
                                    applyStatus(item, {
                                      status: change.status,
                                      statusReason: statusMap[change.status]?.requiresReason
                                        ? change.reason.trim()
                                        : null,
                                      membershipNumber:
                                        change.status === 'approved'
                                          ? change.membershipNumber.trim() || null
                                          : undefined,
                                    })
                                  }
                                >
                                  {busy ? 'Saving…' : 'Confirm'}
                                </button>
                                <button type="button" className="btn" onClick={() => setPendingChange(null)}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}

                          {detailLoading && <Spinner label="Loading details…" />}

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

                          {/* Compliance case P6 — who did what, and when. */}
                          {audit.length > 0 && (
                            <div className="detail-panel">
                              <h4>Audit trail</h4>
                              <ul className="audit-list">
                                {audit.map((entry) => (
                                  <li key={entry.id} className="audit-list__item">
                                    <span className="audit-list__when">{formatDateTime(entry.createdAt)}</span>
                                    <span className="audit-list__who">
                                      {entry.actorName}
                                      {entry.actorRole ? ` (${entry.actorRole})` : ''}
                                    </span>
                                    <span className="audit-list__what">
                                      {entry.action?.split('.').pop()}
                                      {entry.fromStatus && entry.toStatus
                                        ? ` · ${labelOf(entry.fromStatus)} → ${labelOf(entry.toStatus)}`
                                        : ''}
                                    </span>
                                    {entry.details && <span className="audit-list__note">{entry.details}</span>}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {detail && (
                            <dl className="detail-grid">
                              {detail.statusReason && (
                                <div className="detail-grid__item">
                                  <dt>statusReason</dt>
                                  <dd>{detail.statusReason}</dd>
                                </div>
                              )}
                              {detail.completionDueAt && (
                                <div className="detail-grid__item">
                                  <dt>completionDueAt</dt>
                                  <dd>{formatDateTime(detail.completionDueAt)}</dd>
                                </div>
                              )}
                              {detail.renewalCount > 0 && (
                                <div className="detail-grid__item">
                                  <dt>renewals</dt>
                                  <dd>
                                    {detail.renewalCount} · last {formatDate(detail.renewedAt)}
                                  </dd>
                                </div>
                              )}
                              {detail.supersedesId && (
                                <div className="detail-grid__item">
                                  <dt>replaces request</dt>
                                  <dd>#{detail.supersedesId}</dd>
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
                          )}
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
        description="This permanently removes the application and the evidence behind any decision made on it. Suspending or cancelling the membership is usually the right action instead."
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDeleteConfirmed}
        busy={deleting}
      />
    </div>
  )
}

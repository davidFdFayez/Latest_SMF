import { Fragment, useEffect, useMemo, useState } from 'react'
import { whistleblowerApi } from '../api/resources'
import { extractErrorMessage, formatDateTime, getId, pick } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'
import ConfirmDialog from '../components/ConfirmDialog'
import { CheckIcon, TrashIcon } from '../components/Icons'

export default function WhistleblowerList() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [updatingId, setUpdatingId] = useState(null)
  const [filter, setFilter] = useState('all')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await whistleblowerApi.list()
      setItems(data)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not load whistleblower reports.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    if (filter === 'all') return items
    return items.filter((item) => {
      const isReviewed = Boolean(pick(item, ['isReviewed'], false))
      return filter === 'reviewed' ? isReviewed : !isReviewed
    })
  }, [items, filter])

  async function toggleReviewed(item) {
    const id = getId(item)
    const isReviewed = Boolean(pick(item, ['isReviewed'], false))
    setUpdatingId(id)
    try {
      await whistleblowerApi.markReviewed(id, !isReviewed)
      setItems((prev) => prev.map((entry) => (getId(entry) === id ? { ...entry, isReviewed: !isReviewed } : entry)))
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not update this report.'))
    } finally {
      setUpdatingId(null)
    }
  }

  async function handleDeleteConfirmed() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await whistleblowerApi.remove(getId(pendingDelete))
      setItems((prev) => prev.filter((item) => getId(item) !== getId(pendingDelete)))
      setPendingDelete(null)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not delete this report.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <PageHeader title="Whistleblower Reports" description="Confidential reports submitted through the public reporting form." />

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>

      <div className="toolbar">
        <select value={filter} onChange={(event) => setFilter(event.target.value)} className="toolbar__select">
          <option value="all">All reports</option>
          <option value="pending">Pending review</option>
          <option value="reviewed">Reviewed</option>
        </select>
      </div>

      {loading ? (
        <Spinner label="Loading reports…" />
      ) : filtered.length === 0 ? (
        <EmptyState title="No reports" description="Whistleblower submissions will appear here." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Optional Contact</th>
                <th>Submitted</th>
                <th>Status</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const id = getId(item)
                const isExpanded = expandedId === id
                const isReviewed = Boolean(pick(item, ['isReviewed'], false))
                return (
                  <Fragment key={id}>
                    <tr className="data-table__clickable" onClick={() => setExpandedId(isExpanded ? null : id)}>
                      <td className="data-table__primary">
                        <code>{pick(item, ['referenceNumber'], `#${id}`)}</code>
                      </td>
                      <td>{pick(item, ['optionalContact'], 'Anonymous')}</td>
                      <td>{formatDateTime(pick(item, ['createdAt'], ''))}</td>
                      <td>
                        <Badge tone={isReviewed ? 'neutral' : 'red'}>{isReviewed ? 'Reviewed' : 'Pending'}</Badge>
                      </td>
                      <td className="data-table__actions" onClick={(event) => event.stopPropagation()}>
                        <button
                          type="button"
                          className="btn btn--small btn--secondary"
                          onClick={() => toggleReviewed(item)}
                          disabled={updatingId === id}
                        >
                          <CheckIcon /> Mark as {isReviewed ? 'pending' : 'reviewed'}
                        </button>
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
                        <td colSpan={5}>
                          <p className="detail-message">{pick(item, ['description'], '—')}</p>
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
        title="Delete this report?"
        description="This whistleblower report will be permanently removed."
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDeleteConfirmed}
        busy={deleting}
      />
    </div>
  )
}

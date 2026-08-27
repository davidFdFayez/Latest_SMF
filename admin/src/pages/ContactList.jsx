import { Fragment, useEffect, useMemo, useState } from 'react'
import { contactApi } from '../api/resources'
import { extractErrorMessage, formatDateTime, getId, pick } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'
import ConfirmDialog from '../components/ConfirmDialog'
import { CheckIcon, TrashIcon } from '../components/Icons'

export default function ContactList() {
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
      const data = await contactApi.list()
      setItems(data)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not load contact messages.'))
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
      const isRead = Boolean(pick(item, ['isRead'], false))
      return filter === 'read' ? isRead : !isRead
    })
  }, [items, filter])

  async function toggleRead(item) {
    const id = getId(item)
    const isRead = Boolean(pick(item, ['isRead'], false))
    setUpdatingId(id)
    try {
      await contactApi.markRead(id, !isRead)
      setItems((prev) => prev.map((entry) => (getId(entry) === id ? { ...entry, isRead: !isRead } : entry)))
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not update this message.'))
    } finally {
      setUpdatingId(null)
    }
  }

  async function handleDeleteConfirmed() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await contactApi.remove(getId(pendingDelete))
      setItems((prev) => prev.filter((item) => getId(item) !== getId(pendingDelete)))
      setPendingDelete(null)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not delete this message.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <PageHeader title="Contact Messages" description="Messages submitted through the public contact form." />

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>

      <div className="toolbar">
        <select value={filter} onChange={(event) => setFilter(event.target.value)} className="toolbar__select">
          <option value="all">All messages</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
        </select>
      </div>

      {loading ? (
        <Spinner label="Loading messages…" />
      ) : filtered.length === 0 ? (
        <EmptyState title="No messages" description="Contact form submissions will appear here." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>From</th>
                <th>Subject</th>
                <th>Received</th>
                <th>Status</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const id = getId(item)
                const isExpanded = expandedId === id
                const isRead = Boolean(pick(item, ['isRead'], false))
                return (
                  <Fragment key={id}>
                    <tr className="data-table__clickable" onClick={() => setExpandedId(isExpanded ? null : id)}>
                      <td className="data-table__primary">
                        {pick(item, ['name'], '—')}
                        <div className="data-table__subtext">
                          {pick(item, ['email'], '')}
                          {pick(item, ['phone'], '') ? ` · ${pick(item, ['phone'], '')}` : ''}
                        </div>
                      </td>
                      <td>{pick(item, ['subject'], '—')}</td>
                      <td>{formatDateTime(pick(item, ['createdAt'], ''))}</td>
                      <td>
                        <Badge tone={isRead ? 'neutral' : 'green'}>{isRead ? 'Read' : 'Unread'}</Badge>
                      </td>
                      <td className="data-table__actions" onClick={(event) => event.stopPropagation()}>
                        <button
                          type="button"
                          className="btn btn--small btn--secondary"
                          onClick={() => toggleRead(item)}
                          disabled={updatingId === id}
                        >
                          <CheckIcon /> Mark as {isRead ? 'unread' : 'read'}
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
                          <p className="detail-message">{pick(item, ['message'], '—')}</p>
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
        title="Delete this message?"
        description="This contact message will be permanently removed."
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDeleteConfirmed}
        busy={deleting}
      />
    </div>
  )
}

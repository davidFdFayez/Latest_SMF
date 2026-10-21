import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { eventsApi } from '../api/resources'
import { extractErrorMessage, formatDate, getId, pick } from '../api/utils'
import { assetUrl } from '../utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'
import ConfirmDialog from '../components/ConfirmDialog'
import { EditIcon, PlusIcon, TrashIcon } from '../components/Icons'

const STATUS_TONE = { confirmed: 'green', tentative: 'gold', completed: 'neutral' }

/**
 * The event's banner, at the size of a row. It sits beside the title rather
 * than in a column of its own so the table keeps its shape on a narrow screen,
 * and it leaves no gap when an event has no image — or when the path it has
 * cannot be loaded.
 */
function EventThumb({ url }) {
  const [failed, setFailed] = useState(false)
  const href = assetUrl(url)
  if (!href || failed) return null
  return (
    <img
      src={href}
      alt=""
      width={44}
      height={30}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{
        width: 44,
        height: 30,
        flex: '0 0 auto',
        objectFit: 'cover',
        borderRadius: 4,
        border: '1px solid var(--border)',
      }}
    />
  )
}

export default function EventsList() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await eventsApi.list()
      setItems(data)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not load events.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const term = search.trim().toLowerCase()
    return items.filter((item) => String(pick(item, ['titleEn', 'title'], '')).toLowerCase().includes(term))
  }, [items, search])

  async function handleDeleteConfirmed() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await eventsApi.remove(getId(pendingDelete))
      setItems((prev) => prev.filter((item) => getId(item) !== getId(pendingDelete)))
      setPendingDelete(null)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not delete this event.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Events"
        description="Manage upcoming and past events."
        actions={
          <Link to="/events/new" className="btn btn--primary">
            <PlusIcon /> Add Event
          </Link>
        }
      />

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search by title…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="toolbar__search"
        />
      </div>

      {loading ? (
        <Spinner label="Loading events…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No events yet"
          description="Create your first event to see it here."
          action={
            <Link to="/events/new" className="btn btn--primary">
              Add Event
            </Link>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title (EN)</th>
                <th>Category</th>
                <th>Location</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Status</th>
                <th>Published</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const id = getId(item)
                const isPublished = pick(item, ['isPublished', 'published'], true)
                const status = pick(item, ['status'], 'confirmed')
                return (
                  <tr key={id}>
                    <td className="data-table__primary">
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <EventThumb url={pick(item, ['imageUrl', 'image'], '')} />
                        <span>{pick(item, ['titleEn', 'title'], '—')}</span>
                      </span>
                    </td>
                    <td>{pick(item, ['category'], '—')}</td>
                    <td>{pick(item, ['locationEn', 'location'], '—')}</td>
                    <td>{formatDate(pick(item, ['startDate', 'date'], ''))}</td>
                    <td>{formatDate(pick(item, ['endDate'], ''))}</td>
                    <td>
                      <Badge tone={STATUS_TONE[status] || 'neutral'}>{status}</Badge>
                    </td>
                    <td>
                      <Badge tone={isPublished ? 'green' : 'neutral'}>{isPublished ? 'Yes' : 'No'}</Badge>
                    </td>
                    <td className="data-table__actions">
                      <Link to={`/events/${id}`} className="icon-btn" title="Edit" aria-label="Edit">
                        <EditIcon />
                      </Link>
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
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this event?"
        description={`"${pick(pendingDelete, ['titleEn', 'title'], '')}" will be permanently removed.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDeleteConfirmed}
        busy={deleting}
      />
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { resultsApi } from '../api/resources'
import { extractErrorMessage, getId, pick } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'
import ConfirmDialog from '../components/ConfirmDialog'
import { EditIcon, PlusIcon, TrashIcon } from '../components/Icons'

const MEDAL_TONE = { gold: 'gold', silver: 'silver', bronze: 'bronze' }

export default function ResultsList() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const [medalFilter, setMedalFilter] = useState('all')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await resultsApi.list()
      setItems(data)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not load results.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    let list = items
    if (medalFilter !== 'all') {
      list = list.filter((item) => String(pick(item, ['medal'], '')).toLowerCase() === medalFilter)
    }
    if (search.trim()) {
      const term = search.trim().toLowerCase()
      list = list.filter((item) => {
        const athlete = String(pick(item, ['athlete', 'athleteEn'], '')).toLowerCase()
        const event = String(pick(item, ['event', 'eventEn'], '')).toLowerCase()
        return athlete.includes(term) || event.includes(term)
      })
    }
    return [...list].sort((a, b) => Number(pick(b, ['year'], 0)) - Number(pick(a, ['year'], 0)))
  }, [items, search, medalFilter])

  async function handleDeleteConfirmed() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await resultsApi.remove(getId(pendingDelete))
      setItems((prev) => prev.filter((item) => getId(item) !== getId(pendingDelete)))
      setPendingDelete(null)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not delete this result.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Results"
        description="Manage medal records earned by federation athletes."
        actions={
          <Link to="/results/new" className="btn btn--primary">
            <PlusIcon /> Add Result
          </Link>
        }
      />

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search by athlete or event…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="toolbar__search"
        />
        <select value={medalFilter} onChange={(event) => setMedalFilter(event.target.value)} className="toolbar__select">
          <option value="all">All medals</option>
          <option value="gold">Gold</option>
          <option value="silver">Silver</option>
          <option value="bronze">Bronze</option>
        </select>
      </div>

      {loading ? (
        <Spinner label="Loading results…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No results yet"
          description="Add a medal record to see it here."
          action={
            <Link to="/results/new" className="btn btn--primary">
              Add Result
            </Link>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Year</th>
                <th>Athlete</th>
                <th>Event</th>
                <th>Category</th>
                <th>Medal</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const id = getId(item)
                const medal = String(pick(item, ['medal'], '')).toLowerCase()
                return (
                  <tr key={id}>
                    <td>{pick(item, ['year'], '—')}</td>
                    <td className="data-table__primary">{pick(item, ['athlete', 'athleteEn'], '—')}</td>
                    <td>{pick(item, ['event', 'eventEn'], '—')}</td>
                    <td>{pick(item, ['category'], '—')}</td>
                    <td>
                      <Badge tone={MEDAL_TONE[medal] || 'neutral'}>{medal ? medal.charAt(0).toUpperCase() + medal.slice(1) : '—'}</Badge>
                    </td>
                    <td className="data-table__actions">
                      <Link to={`/results/${id}`} className="icon-btn" title="Edit" aria-label="Edit">
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
        title="Delete this result?"
        description={`The medal record for "${pick(pendingDelete, ['athlete', 'athleteEn'], '')}" will be permanently removed.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDeleteConfirmed}
        busy={deleting}
      />
    </div>
  )
}

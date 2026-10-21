import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { tournamentsApi } from '../api/resources'
import { extractErrorMessage, formatDate } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'
import { PlusIcon } from '../components/Icons'

/**
 * Tournaments — Phase 3 REQ-01.
 *
 * The list is the way into every stage that follows, so it says where each
 * tournament has got to rather than only what it is called.
 */

const STATUS_TONE = {
  draft: 'neutral',
  published: 'green',
  closed: 'gold',
  running: 'green',
  completed: 'neutral',
  cancelled: 'red',
}

export default function TournamentsList() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    tournamentsApi
      .list({ status: status || undefined })
      .then((data) => !cancelled && setItems(data))
      .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Could not load tournaments.')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [status])

  return (
    <div>
      <PageHeader
        title="Tournaments"
        description="Create a tournament, open it for entries, and run it through check-in, the draw and the schedule."
        actions={
          <Link to="/tournaments/new" className="btn btn--primary">
            <PlusIcon /> New tournament
          </Link>
        }
      />

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>

      <div className="toolbar">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="toolbar__select"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="closed">Registration closed</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <Spinner label="Loading tournaments…" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No tournaments yet"
          description="Create one to set its categories and weight classes, then publish it to open entries."
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tournament</th>
                <th>Dates</th>
                <th>Entries close</th>
                <th>Status</th>
                <th>Entries</th>
              </tr>
            </thead>
            <tbody>
              {items.map((tournament) => (
                <tr key={tournament.id}>
                  <td>
                    <Link to={`/tournaments/${tournament.id}`} className="data-table__primary data-table__link">
                      {tournament.nameEn}
                    </Link>
                    <div className="data-table__subtext">
                      <bdi>{tournament.nameAr}</bdi> · {tournament.locationEn}
                    </div>
                  </td>
                  <td>
                    {formatDate(tournament.startDate)}
                    {tournament.days.length > 1 && (
                      <div className="data-table__subtext">{tournament.days.length} days</div>
                    )}
                  </td>
                  <td>
                    {formatDate(tournament.registrationClosesAt)}
                    {tournament.registrationOpen && (
                      <div className="data-table__subtext data-table__subtext--ok">Open now</div>
                    )}
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[tournament.status] || 'neutral'}>{tournament.statusEn}</Badge>
                  </td>
                  <td>{tournament.entries}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

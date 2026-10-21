import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { membersApi } from '../api/resources'
import { extractErrorMessage, formatDate } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'

/**
 * The beneficiary directory — tracker ISSUE-03.
 *
 * Memberships lists *applications*: the same athlete appears once per form they
 * have submitted, and there is no address for the person themselves. This lists
 * beneficiaries, one row each, with their live membership on it. The profile
 * behind each row is the record; the applications stay reachable from there.
 */

const TYPES = [
  { value: '', label: 'All beneficiaries' },
  { value: 'athlete', label: 'Athletes' },
  { value: 'coach', label: 'Coaches' },
  { value: 'official', label: 'Referees' },
  { value: 'club', label: 'Clubs & facilities' },
]

const TYPE_LABELS = {
  athlete: 'Athlete',
  coach: 'Coach',
  official: 'Referee',
  club: 'Club',
}

const STATUSES = [
  { value: '', label: 'Any status' },
  { value: 'active', label: 'Active membership' },
  { value: 'approved', label: 'Approved' },
  { value: 'expired', label: 'Expired' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'under_review', label: 'Under review' },
  { value: 'new', label: 'New' },
]

function statusTone(row) {
  if (row.isExpired) return 'red'
  if (row.status === 'approved') return 'green'
  if (row.status === 'suspended' || row.status === 'rejected' || row.status === 'cancelled') return 'red'
  return 'neutral'
}

export default function MembersList() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')

  // The API does the matching, because the names it searches live inside the
  // stored application payload rather than in columns.
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    membersApi
      .list({ type: type || undefined, status: status || undefined, search: query || undefined })
      .then((data) => !cancelled && setItems(data.items || []))
      .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Could not load the beneficiary directory.')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [type, status, query])

  const counts = useMemo(() => {
    const active = items.filter((row) => row.status === 'approved' && !row.isExpired).length
    return { total: items.length, active, expired: items.filter((row) => row.isExpired).length }
  }, [items])

  return (
    <div>
      <PageHeader
        title="Beneficiary Profiles"
        description="Athletes, coaches, referees and clubs as people and organisations — each with one profile, whatever the paperwork behind it."
      />

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search name, membership number, reference, ID or email…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="toolbar__search"
          aria-label="Search beneficiaries"
        />
        <select
          value={type}
          onChange={(event) => setType(event.target.value)}
          className="toolbar__select"
          aria-label="Filter by beneficiary type"
        >
          {TYPES.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="toolbar__select"
          aria-label="Filter by membership status"
        >
          {STATUSES.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>

      {!loading && items.length > 0 && (
        <p className="form-card__intro">
          {counts.total} profile{counts.total === 1 ? '' : 's'} · {counts.active} with a live membership ·{' '}
          {counts.expired} expired
        </p>
      )}

      {loading ? (
        <Spinner label="Loading beneficiaries…" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No beneficiaries match"
          description="A profile appears once an application carries an ID number (or, for a club, an official email)."
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Beneficiary</th>
                <th>Type</th>
                <th>Membership</th>
                <th>Status</th>
                <th>Term ends</th>
                <th>Applications</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link to={`/members/${row.id}`} className="data-table__primary data-table__link">
                      {row.nameEn || row.nameAr || row.referenceNumber}
                    </Link>
                    {row.nameAr && row.nameEn && (
                      <div className="data-table__subtext">
                        <bdi>{row.nameAr}</bdi>
                      </div>
                    )}
                    {row.email && <div className="data-table__subtext">{row.email}</div>}
                  </td>
                  <td>{TYPE_LABELS[row.type] || row.type}</td>
                  <td>
                    {row.membershipNumber ? (
                      <code>{row.membershipNumber}</code>
                    ) : (
                      <span className="data-table__subtext">Not issued</span>
                    )}
                  </td>
                  <td>
                    <Badge tone={statusTone(row)}>{row.isExpired ? 'Expired' : row.statusLabelEn}</Badge>
                  </td>
                  <td>
                    {row.expiresAt ? (
                      <>
                        {formatDate(row.expiresAt)}
                        {row.isExpired ? (
                          <div className="data-table__subtext data-table__subtext--alert">0 days left</div>
                        ) : (
                          typeof row.daysUntilExpiry === 'number' &&
                          row.daysUntilExpiry <= 60 && (
                            <div className="data-table__subtext data-table__subtext--alert">
                              {row.daysUntilExpiry} days left
                            </div>
                          )
                        )}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {row.applications}
                    {row.renewalCount > 0 && (
                      <div className="data-table__subtext">{row.renewalCount} renewal(s)</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

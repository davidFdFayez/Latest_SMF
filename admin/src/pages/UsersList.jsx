import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { usersApi } from '../api/resources'
import { extractErrorMessage, formatDate } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'
import { EditIcon, PlusIcon } from '../components/Icons'

function accessSummary(permissions) {
  if (permissions.includes('*')) return 'Everything'
  if (permissions.length === 0) return 'No access'
  return `${permissions.length} permission${permissions.length === 1 ? '' : 's'}`
}

export default function UsersList() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')

  useEffect(() => {
    let cancelled = false
    usersApi
      .list()
      .then((data) => !cancelled && setItems(data))
      .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Could not load admin users.')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return items.filter((user) => {
      if (status === 'active' && !user.isActive) return false
      if (status === 'inactive' && user.isActive) return false
      if (!term) return true
      return [user.username, user.displayName, user.email, ...user.roles.map((role) => role.nameEn)]
        .some((value) => String(value || '').toLowerCase().includes(term))
    })
  }, [items, search, status])

  return (
    <div>
      <PageHeader
        title="Users"
        description="Admin accounts, their roles, and whether they can sign in."
        actions={
          <Link to="/users/new" className="btn btn--primary">
            <PlusIcon /> Add User
          </Link>
        }
      />

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search by name, username, email or role…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="toolbar__search"
          aria-label="Search users"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="toolbar__select"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {loading ? (
        <Spinner label="Loading users…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={items.length ? 'No users match' : 'No admin users yet'}
          description={items.length ? 'Try a different search or status.' : 'Create an account to give someone access.'}
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Roles</th>
                <th>Access</th>
                <th>Status</th>
                <th>Created</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="data-table__primary">
                      {user.displayName} {user.isSelf && <Badge tone="neutral">You</Badge>}
                    </div>
                    <div className="data-table__subtext">@{user.username}</div>
                    {user.email && <div className="data-table__subtext">{user.email}</div>}
                  </td>
                  <td>
                    <div className="chip-list">
                      {user.roles.length === 0 ? (
                        <Badge tone="red">No roles</Badge>
                      ) : (
                        user.roles.map((role) => (
                          <Badge key={role.id} tone={role.isSystem ? 'gold' : 'green'}>
                            {role.nameEn}
                          </Badge>
                        ))
                      )}
                    </div>
                  </td>
                  <td>{accessSummary(user.permissions)}</td>
                  <td>
                    <Badge tone={user.isActive ? 'green' : 'neutral'}>{user.isActive ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td className="data-table__actions">
                    <Link
                      to={`/users/${user.id}`}
                      className="icon-btn"
                      title={user.canManage ? 'Edit' : 'View (this account holds permissions you do not)'}
                      aria-label={`${user.canManage ? 'Edit' : 'View'} ${user.username}`}
                    >
                      <EditIcon />
                    </Link>
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

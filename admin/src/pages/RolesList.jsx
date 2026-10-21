import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { rolesApi } from '../api/resources'
import { extractErrorMessage } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'
import ConfirmDialog from '../components/ConfirmDialog'
import { EditIcon, PlusIcon, TrashIcon } from '../components/Icons'

/** Why a role cannot be deleted, or null when it can. Mirrors the API's rules. */
function deleteBlocker(role) {
  if (role.isSystem) return 'The Super Admin role cannot be deleted'
  if (!role.canManage) return 'This role grants permissions you do not hold'
  if (role.userCount > 0) return `Assigned to ${role.userCount} user(s) — remove it from them first`
  return null
}

export default function RolesList() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    rolesApi
      .list()
      .then((data) => !cancelled && setItems(data))
      .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Could not load roles.')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  async function handleDeleteConfirmed() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await rolesApi.remove(pendingDelete.id)
      setItems((prev) => prev.filter((role) => role.id !== pendingDelete.id))
      setPendingDelete(null)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not delete this role.'))
      setPendingDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        description="Each role bundles permissions. Assign roles to admin users on the Users page."
        actions={
          <Link to="/roles/new" className="btn btn--primary">
            <PlusIcon /> Add Role
          </Link>
        }
      />

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>

      {loading ? (
        <Spinner label="Loading roles…" />
      ) : items.length === 0 ? (
        <EmptyState title="No roles yet" description="Create a role, then assign it to users." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Key</th>
                <th>Permissions</th>
                <th>Users</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((role) => {
                const blocker = deleteBlocker(role)
                return (
                  <tr key={role.id}>
                    <td>
                      <div className="data-table__primary">{role.nameEn}</div>
                      <div className="data-table__subtext" dir="rtl">
                        {role.nameAr}
                      </div>
                    </td>
                    <td>
                      <code>{role.key}</code>
                    </td>
                    <td>
                      {role.isSystem ? (
                        <Badge tone="gold">All permissions · locked</Badge>
                      ) : (
                        `${role.permissions.length}`
                      )}
                    </td>
                    <td>{role.userCount}</td>
                    <td className="data-table__actions">
                      <Link
                        to={`/roles/${role.id}`}
                        className="icon-btn"
                        title={role.canManage ? 'Edit' : 'View (grants permissions you do not hold)'}
                        aria-label={`${role.canManage ? 'Edit' : 'View'} ${role.nameEn}`}
                      >
                        <EditIcon />
                      </Link>
                      <button
                        type="button"
                        className="icon-btn icon-btn--danger"
                        title={blocker || 'Delete'}
                        aria-label={`Delete ${role.nameEn}`}
                        disabled={Boolean(blocker)}
                        onClick={() => setPendingDelete(role)}
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
        title="Delete this role?"
        description={`"${pendingDelete?.nameEn || ''}" will be permanently removed.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDeleteConfirmed}
        busy={deleting}
      />
    </div>
  )
}

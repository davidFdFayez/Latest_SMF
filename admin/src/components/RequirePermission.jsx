import { Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import EmptyState from './EmptyState'

/**
 * Route guard for a console section. Presentation only — the API refuses the
 * same requests with 403 — but it replaces a page of failed requests with a
 * plain explanation.
 */
export default function RequirePermission({ permission, membershipAction }) {
  const { canAccess } = useAuth()

  if (canAccess({ permission, membershipAction })) return <Outlet />

  return (
    <EmptyState
      title="You don't have access to this section"
      description="None of your roles grants the permission this page needs. Ask an administrator who manages users and roles if you need it."
    />
  )
}

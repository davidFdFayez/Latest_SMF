import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import NotificationBell from './NotificationBell'
import {
  ArrowDownIcon,
  ContactIcon,
  DashboardIcon,
  EventsIcon,
  HistoryIcon,
  KeyIcon,
  MemberCardIcon,
  TournamentIcon,
  LogoutIcon,
  MenuIcon,
  NewsIcon,
  PagesIcon,
  RegistrationsIcon,
  ResultsIcon,
  UsersIcon,
  WhistleblowerIcon,
} from './Icons'

// Each entry names the permission its section needs (see App.jsx), so the
// sidebar only offers what the account can actually open.
const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: DashboardIcon, end: true },
  { to: '/news', label: 'News', icon: NewsIcon, permission: 'news' },
  { to: '/events', label: 'Events', icon: EventsIcon, permission: 'events' },
  { to: '/results', label: 'Results', icon: ResultsIcon, permission: 'events' },
  { to: '/content', label: 'Website Content', icon: PagesIcon, permission: ['content.publish', 'settings'] },
  { to: '/registrations', label: 'Memberships', icon: RegistrationsIcon, membershipAction: 'view' },
  { to: '/members', label: 'Beneficiary Profiles', icon: MemberCardIcon, membershipAction: 'view' },
  // A group: the parent only expands; each child is its own page. The
  // Participants permissions mirror its API (anyone who can read entries).
  { key: 'tournaments', label: 'Tournaments', icon: TournamentIcon, base: '/tournaments',
    children: [
      { to: '/tournaments', label: 'Tournament Management',
        permission: ['tournament.manage', 'tournament.entries', 'tournament.technical',
                     'tournament.draw', 'tournament.schedule'] },
      { to: '/tournaments/participants', label: 'Participants',
        permission: ['tournament.manage', 'tournament.entries', 'tournament.technical', 'tournament.draw'] },
      { to: '/tournaments/readiness', label: 'Check-in & Medical',
        permission: ['tournament.technical', 'tournament.director'] },
      // Right under Check-in & Medical; the same permissions as reading a draw.
      { to: '/draw-management', label: 'Draw Management',
        permission: ['tournament.draw', 'tournament.schedule', 'tournament.manage'] },
      // Stage 5 — directly below Draw Management: the running order made from the published brackets.
      // Opens for any scheduling role (an approver-only user reviews and approves here).
      { to: '/bout-schedule', label: 'Bout Schedule',
        permission: ['tournament.schedule', 'tournament.schedule.approve', 'tournament.draw', 'tournament.manage'] },
    ] },
  { to: '/member-accounts', label: 'Member Accounts', icon: UsersIcon, permission: ['users', 'tournament.entries'] },
  { to: '/contact', label: 'Contact Messages', icon: ContactIcon, permission: 'support' },
  { to: '/whistleblower', label: 'Whistleblower Reports', icon: WhistleblowerIcon, permission: 'whistleblower' },
  { to: '/users', label: 'Users', icon: UsersIcon, permission: 'users' },
  { to: '/roles', label: 'Roles & Permissions', icon: KeyIcon, permission: 'permissions' },
  { to: '/audit', label: 'Activity Log', icon: HistoryIcon, permission: ['users', 'permissions'] },
]

export default function Layout() {
  const { user, logout, canAccess } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { pathname } = useLocation()
  const [openGroups, setOpenGroups] = useState({})

  // Arriving on a page inside a group (a deep link, a refresh) opens it — including the group's pages that
  // live outside its base path (Draw Management, Bout Schedule).
  useEffect(() => {
    const inside = (to) => pathname === to || pathname.startsWith(`${to}/`)
    const group = NAV_ITEMS.find(
      (item) => item.children && (pathname.startsWith(item.base) || item.children.some((c) => inside(c.to))),
    )
    if (group) setOpenGroups((prev) => (prev[group.key] ? prev : { ...prev, [group.key]: true }))
  }, [pathname])

  // "Tournament Management" covers the list, create, edit and the per-tournament
  // stages under /tournaments — everything except its sibling pages.
  function childActive(child, siblings) {
    if (pathname === child.to) return true
    if (!pathname.startsWith(`${child.to}/`)) return false
    return !siblings.some(
      (other) => other !== child && other.to.length > child.to.length && pathname.startsWith(other.to),
    )
  }

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="admin-shell">
      <aside className={`sidebar${sidebarOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar__brand">
          <img src="/logo.png" alt="" className="sidebar__logo" />
          <div>
            <strong>SMF Admin</strong>
            <span>Saudi Muaythai Federation</span>
          </div>
        </div>

        <nav className="sidebar__nav">
          {NAV_ITEMS.map((item) => {
            if (!item.children) return canAccess(item) ? item : null
            const children = item.children.filter(canAccess)
            return children.length ? { ...item, children } : null
          })
            .filter(Boolean)
            .map(({ key, to, label, icon: Icon, end, children }) =>
              children ? (
                <div key={key} className="sidebar__group">
                  <button
                    type="button"
                    className={`sidebar__link sidebar__group-toggle${
                      !openGroups[key] && children.some((c) => childActive(c, children)) ? ' sidebar__link--active' : ''
                    }`}
                    aria-expanded={Boolean(openGroups[key])}
                    onClick={() => setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }))}
                  >
                    <Icon className="sidebar__icon" />
                    <span>{label}</span>
                    <ArrowDownIcon className={`sidebar__chevron${openGroups[key] ? ' sidebar__chevron--open' : ''}`} />
                  </button>
                  {openGroups[key] && (
                    <div className="sidebar__children">
                      {children.map((child) => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          className={() =>
                            `sidebar__link sidebar__child${childActive(child, children) ? ' sidebar__link--active' : ''}`
                          }
                          onClick={() => setSidebarOpen(false)}
                        >
                          <span>{child.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="sidebar__icon" />
                  <span>{label}</span>
                </NavLink>
              ),
            )}
        </nav>

        <button type="button" className="sidebar__link sidebar__logout" onClick={handleLogout}>
          <LogoutIcon className="sidebar__icon" />
          <span>Logout</span>
        </button>
      </aside>

      {sidebarOpen && <div className="sidebar__scrim" onClick={() => setSidebarOpen(false)} />}

      <div className="admin-main">
        <header className="topbar">
          <button
            type="button"
            className="topbar__menu-btn"
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label="Toggle navigation"
          >
            <MenuIcon />
          </button>
          <div className="topbar__spacer" />
          <NotificationBell />
          <div className="topbar__user">
            <span className="topbar__avatar">{(user?.username || 'A').charAt(0).toUpperCase()}</span>
            <span className="topbar__username">{user?.displayName || user?.username || 'Admin'}</span>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  ContactIcon,
  DashboardIcon,
  EventsIcon,
  LogoutIcon,
  MenuIcon,
  NewsIcon,
  PagesIcon,
  RegistrationsIcon,
  ResultsIcon,
  SettingsIcon,
  WhistleblowerIcon,
} from './Icons'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: DashboardIcon, end: true },
  { to: '/news', label: 'News', icon: NewsIcon },
  { to: '/events', label: 'Events', icon: EventsIcon },
  { to: '/results', label: 'Results', icon: ResultsIcon },
  { to: '/pages', label: 'Pages', icon: PagesIcon },
  { to: '/registrations', label: 'Memberships', icon: RegistrationsIcon },
  { to: '/contact', label: 'Contact Messages', icon: ContactIcon },
  { to: '/whistleblower', label: 'Whistleblower Reports', icon: WhistleblowerIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
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
          ))}
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

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { notificationCenterApi } from '../api/resources'
import { BellIcon } from './Icons'

/**
 * Admin Notification Center: the bell in the top bar, its unread counter and the panel. Informational only —
 * opening or reading a notification changes nothing but its read state. The server returns only the
 * notifications the administrator's current permissions grant.
 */
const POLL_MS = 60000

function when(iso) {
  if (!iso) return ''
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`)
  const minutes = Math.round((Date.now() - d.getTime()) / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`
  return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

const fullTime = (iso) =>
  iso ? new Date(iso.endsWith('Z') ? iso : `${iso}Z`).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : ''

export default function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const root = useRef(null)

  const refreshCount = useCallback(() => {
    notificationCenterApi
      .unreadCount()
      .then((r) => setUnread(r.unread || 0))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    try {
      const r = await notificationCenterApi.list()
      setItems(r.items || [])
      setUnread(r.unread || 0)
      setError('')
    } catch {
      setError('Could not load notifications.')
    }
  }, [])

  // The counter: on arrival, every minute, and whenever the window regains focus.
  useEffect(() => {
    refreshCount()
    const timer = window.setInterval(refreshCount, POLL_MS)
    const onFocus = () => refreshCount()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [refreshCount])

  useEffect(() => {
    if (!open) return undefined
    load()
    const onDown = (e) => root.current && !root.current.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, load])

  const markRead = async (n) => {
    if (n.read) return
    await notificationCenterApi.read(n.id).catch(() => {})
    setItems((list) => list?.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
    setUnread((u) => Math.max(0, u - 1))
  }

  const openItem = async (n) => {
    await markRead(n)
    setOpen(false)
    // Only Admin paths; the page itself still checks the administrator's permission.
    if (n.link && n.link.startsWith('/') && !n.link.startsWith('//')) navigate(n.link)
  }

  const markAll = async () => {
    await notificationCenterApi.readAll().catch(() => {})
    setItems((list) => list?.map((x) => ({ ...x, read: true })))
    setUnread(0)
  }

  return (
    <div className="nc" ref={root}>
      <button
        type="button"
        className="nc__bell"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        data-testid="nc-bell"
        onClick={() => setOpen((v) => !v)}
      >
        <BellIcon aria-hidden="true" />
        {unread > 0 && (
          <span className="nc__count" data-testid="nc-count">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="nc__panel" role="dialog" aria-label="Notifications" data-testid="nc-panel">
          <div className="nc__head">
            <strong>Notifications</strong>
            <button type="button" className="nc__link" onClick={markAll} disabled={!unread} data-testid="nc-read-all">
              Mark all as read
            </button>
          </div>
          {error && <p className="nc__empty">{error}</p>}
          {!error && items === null && <p className="nc__empty">Loading…</p>}
          {!error && items?.length === 0 && <p className="nc__empty">No notifications yet.</p>}
          {items?.length > 0 && (
            <ul className="nc__list">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`nc__item${n.read ? '' : ' nc__item--unread'}`}
                  data-testid="nc-item"
                  data-read={n.read ? 'true' : 'false'}
                >
                  <button type="button" className="nc__open" onClick={() => openItem(n)} data-testid="nc-open">
                    <span className="nc__title">
                      {!n.read && <span className="nc__dot" aria-label="Unread" />}
                      {n.title}
                      {n.resolved && (
                        <span className="nc__badge" data-testid="nc-resolved" title={n.resolvedNote || ''}>
                          Resolved
                        </span>
                      )}
                    </span>
                    <span className="nc__message">{n.message}</span>
                    {n.resolved && n.resolvedNote && <span className="nc__note">{n.resolvedNote}</span>}
                    <time className="nc__time" dateTime={n.updatedAt} title={fullTime(n.updatedAt)}>
                      {when(n.updatedAt)}
                    </time>
                  </button>
                  {!n.read && (
                    <button type="button" className="nc__link nc__mark" onClick={() => markRead(n)} data-testid="nc-mark-read">
                      Mark as read
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

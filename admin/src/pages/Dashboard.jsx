import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dashboardApi, contactApi, eventsApi, newsApi, registrationsApi, resultsApi, whistleblowerApi } from '../api/resources'
import { pickNumber } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import {
  ContactIcon,
  EventsIcon,
  NewsIcon,
  RegistrationsIcon,
  ResultsIcon,
  WhistleblowerIcon,
} from '../components/Icons'

const CARD_DEFS = [
  {
    key: 'news',
    label: 'News Articles',
    icon: NewsIcon,
    to: '/news',
    tone: 'green',
    countKeys: ['newsCount', 'totalNews', 'news'],
    subLabel: 'published',
    subKeys: ['publishedNewsCount'],
  },
  {
    key: 'events',
    label: 'Events',
    icon: EventsIcon,
    to: '/events',
    tone: 'blue',
    countKeys: ['eventsCount', 'totalEvents', 'events'],
    subLabel: 'upcoming',
    subKeys: ['upcomingEventsCount'],
  },
  {
    key: 'results',
    label: 'Medal Results',
    icon: ResultsIcon,
    to: '/results',
    tone: 'gold',
    countKeys: ['resultsCount', 'totalResults', 'results'],
    subLabel: 'gold',
    subKeys: ['goldCount'],
  },
  {
    key: 'registrations',
    label: 'Registrations',
    icon: RegistrationsIcon,
    to: '/registrations',
    tone: 'purple',
    countKeys: ['registrationsCount', 'totalRegistrations', 'registrations'],
    subLabel: 'pending',
    subKeys: ['pendingRegistrationsCount'],
  },
  {
    key: 'contact',
    label: 'Contact Messages',
    icon: ContactIcon,
    to: '/contact',
    tone: 'orange',
    countKeys: ['contactMessagesCount', 'contactCount', 'totalContactMessages', 'contactMessages'],
    subLabel: 'unread',
    subKeys: ['unreadContactMessagesCount', 'unreadContactCount'],
  },
  {
    key: 'whistleblower',
    label: 'Whistleblower Reports',
    icon: WhistleblowerIcon,
    to: '/whistleblower',
    tone: 'red',
    countKeys: ['whistleblowerReportsCount', 'whistleblowerCount', 'totalWhistleblowerReports', 'whistleblowerReports'],
    subLabel: 'pending review',
    subKeys: ['unreviewedWhistleblowerCount', 'unreadWhistleblowerCount'],
  },
]

export default function Dashboard() {
  const [counts, setCounts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        const data = await dashboardApi.get()
        if (!cancelled) setCounts(data || {})
      } catch {
        // Fall back to deriving counts directly from list endpoints so the
        // dashboard still works if /api/admin/dashboard isn't implemented yet.
        try {
          const [news, events, results, registrations, contact, whistleblower] = await Promise.all([
            newsApi.list().catch(() => []),
            eventsApi.list().catch(() => []),
            resultsApi.list().catch(() => []),
            registrationsApi.list().catch(() => []),
            contactApi.list().catch(() => []),
            whistleblowerApi.list().catch(() => []),
          ])
          if (!cancelled) {
            setCounts({
              newsCount: news.length,
              eventsCount: events.length,
              resultsCount: results.length,
              registrationsCount: registrations.length,
              contactCount: contact.length,
              whistleblowerCount: whistleblower.length,
            })
          }
        } catch (fallbackError) {
          if (!cancelled) setError('Could not load dashboard data from the API.')
          console.error(fallbackError)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div>
      <PageHeader title="Dashboard" description="Overview of your website content and submissions." />

      <Alert type="error">{error}</Alert>

      {loading ? (
        <Spinner label="Loading dashboard…" />
      ) : (
        <div className="card-grid">
          {CARD_DEFS.map(({ key, label, icon: Icon, to, tone, countKeys, subLabel, subKeys }) => {
            const subValue = subKeys ? pickNumber(counts, subKeys, undefined) : undefined
            return (
              <Link to={to} key={key} className={`stat-card stat-card--${tone}`}>
                <div className="stat-card__icon">
                  <Icon />
                </div>
                <div>
                  <span className="stat-card__value">{pickNumber(counts, countKeys, 0)}</span>
                  <span className="stat-card__label">{label}</span>
                  {subValue !== undefined && (
                    <span className="stat-card__sub">
                      {subValue} {subLabel}
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <div className="dashboard-welcome">
        <h2>Welcome back</h2>
        <p>
          Use the sidebar to manage news, events, medal results, static pages, and review submissions from the
          public website. Changes made here are reflected on the public site immediately.
        </p>
      </div>
    </div>
  )
}

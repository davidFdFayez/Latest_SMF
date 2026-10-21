import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { contentApi } from '../api/resources'
import { extractErrorMessage, formatDateTime } from '../api/utils'
import { siteUrl } from '../utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'
import { EditIcon, ExternalIcon } from '../components/Icons'

export default function ContentList() {
  const [data, setData] = useState({ groups: [], items: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    contentApi
      .list()
      .then((result) => !cancelled && setData({ groups: result?.groups || [], items: result?.items || [] }))
      .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Could not load the website content list.')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const sections = useMemo(() => {
    const term = search.trim().toLowerCase()
    const matches = (item) =>
      !term || [item.titleEn, item.titleAr, item.route, item.key].some((value) => String(value || '').toLowerCase().includes(term))

    return data.groups
      .map((group) => ({ ...group, items: data.items.filter((item) => item.group === group.key && matches(item)) }))
      .filter((group) => group.items.length > 0)
  }, [data, search])

  return (
    <div>
      <PageHeader
        title="Website Content"
        description="Edit the text, images, and links on the public website. Pages nobody has edited show their original content."
      />

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>

      <div className="toolbar">
        <input
          type="search"
          className="toolbar__search"
          placeholder="Search pages…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search pages"
        />
      </div>

      {loading ? (
        <Spinner label="Loading website content…" />
      ) : sections.length === 0 ? (
        <EmptyState title="No pages match" description="Try a different search." />
      ) : (
        sections.map((group) => (
          <section className="cms-group-list" key={group.key}>
            <h2 className="cms-group-list__title">
              {group.nameEn} <span dir="rtl">{group.nameAr}</span>
            </h2>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Address</th>
                    <th>Status</th>
                    <th>Last edited</th>
                    <th className="data-table__actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item) => (
                    <tr key={item.key}>
                      <td>
                        <div className="data-table__primary">{item.titleEn}</div>
                        <div className="data-table__subtext" dir="rtl">
                          {item.titleAr}
                        </div>
                      </td>
                      <td>{item.route ? <code>{item.route}</code> : <span className="data-table__subtext">Every page</span>}</td>
                      <td>
                        <Badge tone={item.customized ? 'green' : 'neutral'}>{item.customized ? 'Edited' : 'Default'}</Badge>
                      </td>
                      <td>
                        {item.updatedAt ? (
                          <>
                            <div>{formatDateTime(item.updatedAt)}</div>
                            <div className="data-table__subtext">{item.updatedBy}</div>
                          </>
                        ) : (
                          <span className="data-table__subtext">—</span>
                        )}
                      </td>
                      <td className="data-table__actions">
                        {item.route && (
                          <a
                            className="icon-btn"
                            href={siteUrl(item.route)}
                            target="_blank"
                            rel="noreferrer"
                            title="View on the website"
                            aria-label={`View ${item.titleEn} on the website`}
                          >
                            <ExternalIcon />
                          </a>
                        )}
                        {item.canEdit ? (
                          <Link to={`/content/${item.key}`} className="icon-btn" title="Edit" aria-label={`Edit ${item.titleEn}`}>
                            <EditIcon />
                          </Link>
                        ) : (
                          <span className="data-table__subtext" title={`Requires the "${item.permission}" permission`}>
                            No access
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  )
}

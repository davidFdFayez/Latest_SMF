import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { pagesApi } from '../api/resources'
import { extractErrorMessage, formatDateTime, pick } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import { PagesIcon } from '../components/Icons'

// Suggested slugs in case the API returns no pages yet (fresh database).
const SUGGESTED_SLUGS = ['home', 'overview', 'history', 'values', 'strategy', 'initiatives', 'goals', 'achievements']

function readTitle(page) {
  const contentJson = pick(page, ['contentJson'], '')
  try {
    const parsed = typeof contentJson === 'string' ? JSON.parse(contentJson) : contentJson
    return pick(parsed?.meta, ['titleEn'], '') || pick(parsed, ['titleEn'], '')
  } catch {
    return ''
  }
}

export default function PagesList() {
  const navigate = useNavigate()
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [customSlug, setCustomSlug] = useState('')

  useEffect(() => {
    let cancelled = false
    pagesApi
      .list()
      .then((data) => !cancelled && setPages(data))
      .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Could not load pages.')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const existingSlugs = useMemo(() => new Set(pages.map((p) => pick(p, ['slug'], ''))), [pages])

  const suggestions = useMemo(() => SUGGESTED_SLUGS.filter((slug) => !existingSlugs.has(slug)), [existingSlugs])

  function handleOpenCustom(event) {
    event.preventDefault()
    const slug = customSlug.trim().toLowerCase().replace(/\s+/g, '-')
    if (slug) navigate(`/pages/${slug}`)
  }

  return (
    <div>
      <PageHeader title="Pages" description="Edit static content sections of the public website by page slug." />

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>

      <form onSubmit={handleOpenCustom} className="toolbar">
        <input
          type="text"
          placeholder="Open or create a page by slug (e.g. sponsors)"
          value={customSlug}
          onChange={(event) => setCustomSlug(event.target.value)}
          className="toolbar__search"
        />
        <button type="submit" className="btn btn--secondary">
          Open Page
        </button>
      </form>

      {loading ? (
        <Spinner label="Loading pages…" />
      ) : (
        <>
          <div className="card-list">
            {pages.map((page) => {
              const slug = pick(page, ['slug'], '')
              const title = readTitle(page)
              return (
                <Link key={slug} to={`/pages/${slug}`} className="card-list__item">
                  <PagesIcon className="card-list__icon" />
                  <div>
                    <strong>{title || slug}</strong>
                    <code>/{slug}</code>
                    <div className="data-table__subtext">Updated {formatDateTime(pick(page, ['updatedAt'], ''))}</div>
                  </div>
                </Link>
              )
            })}
          </div>

          {suggestions.length > 0 && (
            <>
              <h3 className="form-section-title" style={{ borderTop: 'none' }}>
                Not yet created
              </h3>
              <div className="card-list">
                {suggestions.map((slug) => (
                  <Link key={slug} to={`/pages/${slug}`} className="card-list__item">
                    <PagesIcon className="card-list__icon" />
                    <div>
                      <strong>{slug}</strong>
                      <code>/{slug}</code>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

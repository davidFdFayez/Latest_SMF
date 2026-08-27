import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { pagesApi } from '../api/resources'
import { extractErrorMessage } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'

const TEMPLATE = {
  meta: { titleAr: '', titleEn: '' },
  hero: { headingAr: '', headingEn: '', subAr: '', subEn: '', stats: [] },
  sections: [],
}

function parseContentJson(raw) {
  if (!raw) return { ...TEMPLATE }
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return { ...TEMPLATE, ...parsed }
  } catch {
    return { ...TEMPLATE }
  }
}

export default function PageEdit() {
  const { slug } = useParams()
  const navigate = useNavigate()

  const [metaTitleEn, setMetaTitleEn] = useState('')
  const [metaTitleAr, setMetaTitleAr] = useState('')
  const [contentText, setContentText] = useState('{}')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [isNewPage, setIsNewPage] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setIsNewPage(false)

    pagesApi
      .get(slug)
      .then((page) => {
        if (cancelled || !page) return
        const parsed = parseContentJson(page.contentJson)
        setMetaTitleEn(parsed.meta?.titleEn || '')
        setMetaTitleAr(parsed.meta?.titleAr || '')
        setContentText(JSON.stringify(parsed, null, 2))
      })
      .catch((err) => {
        if (cancelled) return
        if (err?.response?.status === 404) {
          setIsNewPage(true)
          setMetaTitleEn('')
          setMetaTitleAr('')
          setContentText(JSON.stringify(TEMPLATE, null, 2))
        } else {
          setError(extractErrorMessage(err, 'Could not load this page.'))
        }
      })
      .finally(() => !cancelled && setLoading(false))

    return () => {
      cancelled = true
    }
  }, [slug])

  const isJsonValid = useMemo(() => {
    try {
      JSON.parse(contentText)
      return true
    } catch {
      return false
    }
  }, [contentText])

  async function handleSubmit(event) {
    event.preventDefault()
    setJsonError('')

    let parsedContent
    try {
      parsedContent = JSON.parse(contentText)
    } catch {
      setJsonError('Content must be valid JSON. Please fix the syntax before saving.')
      return
    }

    parsedContent.meta = { ...(parsedContent.meta || {}), titleEn: metaTitleEn, titleAr: metaTitleAr }

    setSaving(true)
    setError('')

    try {
      await pagesApi.update(slug, { contentJson: JSON.stringify(parsedContent) })
      navigate('/pages')
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not save this page.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner label="Loading page…" />

  return (
    <div>
      <PageHeader
        title={`Edit Page: /${slug}`}
        description={
          isNewPage
            ? 'This page does not exist yet — saving will create it.'
            : 'Structured meta fields plus the full bilingual content JSON (hero, sections, stats, etc.).'
        }
      />

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>
      {isNewPage && <Alert type="info">No content found for "{slug}" yet. A starter template has been loaded below — edit and save to create it.</Alert>}

      <form onSubmit={handleSubmit} className="form-card">
        <div className="form-grid">
          <label className="field">
            <span>Page Title (English) — meta.titleEn</span>
            <input type="text" value={metaTitleEn} onChange={(e) => setMetaTitleEn(e.target.value)} />
          </label>
          <label className="field">
            <span>Page Title (Arabic) — meta.titleAr</span>
            <input type="text" dir="rtl" value={metaTitleAr} onChange={(e) => setMetaTitleAr(e.target.value)} />
          </label>
        </div>

        <label className="field">
          <span>Full Page Content (JSON) — hero, sections, stats, cards, timeline items…</span>
          <textarea
            rows={20}
            className="code-textarea"
            value={contentText}
            onChange={(e) => setContentText(e.target.value)}
            spellCheck={false}
          />
          {jsonError ? (
            <span className="field__error">{jsonError}</span>
          ) : (
            <span className={`field__hint ${isJsonValid ? 'field__hint--ok' : 'field__hint--error'}`}>
              {isJsonValid ? 'Valid JSON' : 'Invalid JSON — fix before saving'}
            </span>
          )}
        </label>

        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={() => navigate('/pages')}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Page'}
          </button>
        </div>
      </form>
    </div>
  )
}

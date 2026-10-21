import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { contentApi } from '../api/resources'
import { extractErrorMessage, formatDateTime } from '../api/utils'
import { siteUrl } from '../utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import ConfirmDialog from '../components/ConfirmDialog'
import { Field, FieldList } from '../components/content/ContentFields'
import { ExternalIcon } from '../components/Icons'

/** One collapsible card per top-level schema field, so long pages stay navigable. */
function Section({ field, value, onChange, open, onToggle }) {
  return (
    <section className={`form-card cms-section${open ? ' is-open' : ''}`}>
      <button type="button" className="cms-section__toggle" aria-expanded={open} onClick={onToggle}>
        <span>{field.label || field.name}</span>
        <span className="cms-section__chevron" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="cms-section__body">
          {field.help && <p className="form-card__intro">{field.help}</p>}
          {field.type === 'group' ? (
            <FieldList fields={field.fields} value={value} onChange={onChange} />
          ) : (
            <Field field={field} value={value} onChange={onChange} />
          )}
        </div>
      )}
    </section>
  )
}

export default function ContentEdit() {
  const { key } = useParams()

  const [detail, setDetail] = useState(null)
  const [content, setContent] = useState(null)
  const [savedJson, setSavedJson] = useState('')
  const [openSections, setOpenSections] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function accept(result) {
    setDetail(result)
    setContent(result.content)
    setSavedJson(JSON.stringify(result.content))
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    contentApi
      .get(key)
      .then((result) => {
        if (cancelled) return
        accept(result)
        // Short pages open fully; long ones start with just the first section.
        const names = (result.schema || []).map((field) => field.name)
        setOpenSections(new Set(names.length <= 3 ? names : names.slice(0, 1)))
      })
      .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Could not load this page’s content.')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [key])

  const dirty = useMemo(() => content !== null && JSON.stringify(content) !== savedJson, [content, savedJson])

  useEffect(() => {
    if (!dirty) return undefined
    const warn = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  async function handleSave() {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      accept(await contentApi.save(key, content))
      setNotice('Saved. Visitors see the new content the next time they load the page.')
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not save the content.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    setResetting(true)
    setError('')
    setNotice('')
    try {
      accept(await contentApi.reset(key))
      setNotice('Restored the original content.')
      setConfirmReset(false)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not restore the original content.'))
    } finally {
      setResetting(false)
    }
  }

  function toggleSection(name) {
    setOpenSections((current) => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  if (loading) return <Spinner label="Loading content…" />

  if (!detail) {
    return (
      <div>
        <PageHeader title="Website Content" />
        <Alert type="error">{error || 'This page could not be found.'}</Alert>
        <Link to="/content" className="btn btn--ghost">
          Back to website content
        </Link>
      </div>
    )
  }

  const schema = detail.schema || []
  const allOpen = schema.every((field) => openSections.has(field.name))

  return (
    <div className="cms-editor">
      <PageHeader
        title={detail.titleEn}
        description={
          <>
            <span dir="rtl">{detail.titleAr}</span>
            {detail.route && (
              <>
                {' · '}
                <code>{detail.route}</code>
              </>
            )}
          </>
        }
        actions={
          <>
            {detail.route && (
              <a className="btn btn--secondary" href={siteUrl(detail.route)} target="_blank" rel="noreferrer">
                <ExternalIcon /> View page
              </a>
            )}
            {detail.customized && (
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmReset(true)}>
                Restore original
              </button>
            )}
          </>
        }
      />

      <p className="cms-editor__status">
        {detail.customized ? (
          <>
            <Badge tone="green">Edited</Badge> Last saved {formatDateTime(detail.updatedAt)} by {detail.updatedBy}
          </>
        ) : (
          <>
            <Badge tone="neutral">Default</Badge> Showing the original content — nobody has edited this page yet.
          </>
        )}
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => setOpenSections(allOpen ? new Set() : new Set(schema.map((field) => field.name)))}
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </p>

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>
      <Alert type="success" onDismiss={() => setNotice('')}>
        {notice}
      </Alert>

      {schema.map((field) => (
        <Section
          key={field.name}
          field={field}
          value={content?.[field.name]}
          open={openSections.has(field.name)}
          onToggle={() => toggleSection(field.name)}
          onChange={(next) => setContent((current) => ({ ...current, [field.name]: next }))}
        />
      ))}

      <div className={`cms-savebar${dirty ? ' is-dirty' : ''}`}>
        <span>{dirty ? 'You have unsaved changes.' : 'All changes saved.'}</span>
        <div className="cms-savebar__actions">
          <Link to="/content" className="btn btn--ghost">
            Back
          </Link>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!dirty || saving}
            onClick={() => setContent(JSON.parse(savedJson))}
          >
            Discard changes
          </button>
          <button type="button" className="btn btn--primary" disabled={!dirty || saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Restore the original content?"
        description="Every edit made to this page is discarded and the website shows its original content again."
        confirmLabel="Restore original"
        busy={resetting}
        onCancel={() => setConfirmReset(false)}
        onConfirm={handleReset}
      />
    </div>
  )
}

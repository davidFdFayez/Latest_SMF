import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { newsApi } from '../api/resources'
import { extractErrorMessage, pick, toDateInputValue } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'

const emptyForm = {
  titleEn: '',
  titleAr: '',
  summaryEn: '',
  summaryAr: '',
  bodyEn: '',
  bodyAr: '',
  category: 'news',
  imageUrl: '',
  publishedAt: toDateInputValue(new Date()),
  isPublished: true,
  source: 'SMF',
  externalUrl: '',
}

function normalize(item) {
  if (!item) return emptyForm
  return {
    titleEn: pick(item, ['titleEn', 'title'], ''),
    titleAr: pick(item, ['titleAr'], ''),
    summaryEn: pick(item, ['summaryEn', 'summary'], ''),
    summaryAr: pick(item, ['summaryAr'], ''),
    bodyEn: pick(item, ['bodyEn', 'contentEn', 'content', 'body'], ''),
    bodyAr: pick(item, ['bodyAr', 'contentAr'], ''),
    category: pick(item, ['category'], 'news'),
    imageUrl: pick(item, ['imageUrl', 'image'], ''),
    publishedAt: toDateInputValue(pick(item, ['publishedAt', 'publishDate', 'date'], '')) || toDateInputValue(new Date()),
    isPublished: pick(item, ['isPublished', 'published'], true),
    source: pick(item, ['source'], 'SMF'),
    externalUrl: pick(item, ['externalUrl'], ''),
  }
}

export default function NewsEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id || id === 'new'

  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isNew) return
    let cancelled = false
    setLoading(true)
    newsApi
      .get(id)
      .then((item) => !cancelled && setForm(normalize(item)))
      .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Could not load this article.')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id, isNew])

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      ...form,
      publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : new Date().toISOString(),
      externalUrl: form.externalUrl || null,
      imageUrl: form.imageUrl || null,
    }

    try {
      if (isNew) {
        await newsApi.create(payload)
      } else {
        await newsApi.update(id, payload)
      }
      navigate('/news')
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not save this article.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner label="Loading article…" />

  return (
    <div>
      <PageHeader title={isNew ? 'Add News Article' : 'Edit News Article'} description="Bilingual content for the public news section." />

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>

      <form onSubmit={handleSubmit} className="form-card">
        <div className="form-grid">
          <label className="field">
            <span>Title (English)</span>
            <input type="text" value={form.titleEn} onChange={(e) => updateField('titleEn', e.target.value)} required />
          </label>
          <label className="field">
            <span>Title (Arabic)</span>
            <input type="text" dir="rtl" value={form.titleAr} onChange={(e) => updateField('titleAr', e.target.value)} required />
          </label>
        </div>

        <div className="form-grid form-grid--3">
          <label className="field">
            <span>Category</span>
            <input type="text" value={form.category} onChange={(e) => updateField('category', e.target.value)} list="news-categories" />
            <datalist id="news-categories">
              <option value="news" />
              <option value="league" />
              <option value="results" />
              <option value="international" />
            </datalist>
          </label>
          <label className="field">
            <span>Source</span>
            <select value={form.source} onChange={(e) => updateField('source', e.target.value)}>
              <option value="SMF">SMF (original)</option>
              <option value="IFMA">IFMA (syndicated)</option>
            </select>
          </label>
          <label className="field">
            <span>Publish Date</span>
            <input type="date" value={form.publishedAt} onChange={(e) => updateField('publishedAt', e.target.value)} />
          </label>
        </div>

        {form.source === 'IFMA' && (
          <label className="field">
            <span>External URL (source article)</span>
            <input type="text" value={form.externalUrl} onChange={(e) => updateField('externalUrl', e.target.value)} placeholder="https://ifmamuaythai.org/..." />
          </label>
        )}

        <div className="form-grid">
          <label className="field">
            <span>Summary (English)</span>
            <textarea rows={2} value={form.summaryEn} onChange={(e) => updateField('summaryEn', e.target.value)} required />
          </label>
          <label className="field">
            <span>Summary (Arabic)</span>
            <textarea rows={2} dir="rtl" value={form.summaryAr} onChange={(e) => updateField('summaryAr', e.target.value)} required />
          </label>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Body (English)</span>
            <textarea rows={8} value={form.bodyEn} onChange={(e) => updateField('bodyEn', e.target.value)} required />
          </label>
          <label className="field">
            <span>Body (Arabic)</span>
            <textarea rows={8} dir="rtl" value={form.bodyAr} onChange={(e) => updateField('bodyAr', e.target.value)} required />
          </label>
        </div>

        <label className="field">
          <span>Image URL</span>
          <input type="text" value={form.imageUrl} onChange={(e) => updateField('imageUrl', e.target.value)} placeholder="/assets/images/news/example.jpg" />
        </label>

        {form.imageUrl && (
          <div className="image-preview">
            <img src={form.imageUrl} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
          </div>
        )}

        <label className="field field--checkbox">
          <input type="checkbox" checked={Boolean(form.isPublished)} onChange={(e) => updateField('isPublished', e.target.checked)} />
          <span>Published (visible on the public website)</span>
        </label>

        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={() => navigate('/news')}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Article'}
          </button>
        </div>
      </form>
    </div>
  )
}

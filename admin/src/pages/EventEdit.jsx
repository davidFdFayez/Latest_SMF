import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { eventsApi } from '../api/resources'
import { extractErrorMessage, pick, toDateInputValue } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'

function defaultDate(daysFromNow) {
  const date = new Date()
  date.setDate(date.getDate() + daysFromNow)
  return toDateInputValue(date)
}

const emptyForm = {
  titleEn: '',
  titleAr: '',
  descriptionEn: '',
  descriptionAr: '',
  category: 'community',
  startDate: defaultDate(7),
  endDate: defaultDate(9),
  locationEn: '',
  locationAr: '',
  status: 'confirmed',
  isPublished: true,
}

function normalize(item) {
  if (!item) return emptyForm
  return {
    titleEn: pick(item, ['titleEn', 'title'], ''),
    titleAr: pick(item, ['titleAr'], ''),
    descriptionEn: pick(item, ['descriptionEn', 'description'], ''),
    descriptionAr: pick(item, ['descriptionAr'], ''),
    category: pick(item, ['category'], 'community'),
    startDate: toDateInputValue(pick(item, ['startDate', 'date'], '')) || defaultDate(7),
    endDate: toDateInputValue(pick(item, ['endDate'], '')) || defaultDate(9),
    locationEn: pick(item, ['locationEn', 'location'], ''),
    locationAr: pick(item, ['locationAr'], ''),
    status: pick(item, ['status'], 'confirmed'),
    isPublished: pick(item, ['isPublished', 'published'], true),
  }
}

export default function EventEdit() {
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
    eventsApi
      .get(id)
      .then((item) => !cancelled && setForm(normalize(item)))
      .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Could not load this event.')))
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
      startDate: form.startDate ? new Date(form.startDate).toISOString() : new Date().toISOString(),
      endDate: form.endDate ? new Date(form.endDate).toISOString() : new Date().toISOString(),
    }

    try {
      if (isNew) {
        await eventsApi.create(payload)
      } else {
        await eventsApi.update(id, payload)
      }
      navigate('/events')
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not save this event.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner label="Loading event…" />

  return (
    <div>
      <PageHeader title={isNew ? 'Add Event' : 'Edit Event'} description="Bilingual event details for the public website." />

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
            <input type="text" value={form.category} onChange={(e) => updateField('category', e.target.value)} list="event-categories" />
            <datalist id="event-categories">
              <option value="community" />
              <option value="regional" />
              <option value="international" />
              <option value="camp" />
              <option value="workshop" />
            </datalist>
          </label>
          <label className="field">
            <span>Status</span>
            <select value={form.status} onChange={(e) => updateField('status', e.target.value)}>
              <option value="confirmed">Confirmed</option>
              <option value="tentative">Tentative</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <label className="field field--checkbox" style={{ alignSelf: 'end', marginBottom: 18 }}>
            <input type="checkbox" checked={Boolean(form.isPublished)} onChange={(e) => updateField('isPublished', e.target.checked)} />
            <span>Published</span>
          </label>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Location (English)</span>
            <input type="text" value={form.locationEn} onChange={(e) => updateField('locationEn', e.target.value)} required />
          </label>
          <label className="field">
            <span>Location (Arabic)</span>
            <input type="text" dir="rtl" value={form.locationAr} onChange={(e) => updateField('locationAr', e.target.value)} required />
          </label>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Start Date</span>
            <input type="date" value={form.startDate} onChange={(e) => updateField('startDate', e.target.value)} required />
          </label>
          <label className="field">
            <span>End Date</span>
            <input type="date" value={form.endDate} onChange={(e) => updateField('endDate', e.target.value)} required />
          </label>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Description (English)</span>
            <textarea rows={6} value={form.descriptionEn} onChange={(e) => updateField('descriptionEn', e.target.value)} required />
          </label>
          <label className="field">
            <span>Description (Arabic)</span>
            <textarea rows={6} dir="rtl" value={form.descriptionAr} onChange={(e) => updateField('descriptionAr', e.target.value)} required />
          </label>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={() => navigate('/events')}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Event'}
          </button>
        </div>
      </form>
    </div>
  )
}

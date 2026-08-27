import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { resultsApi } from '../api/resources'
import { extractErrorMessage, pick } from '../api/utils'
import { slugify } from '../utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'

const currentYear = new Date().getFullYear()

const emptyForm = {
  year: String(currentYear),
  athlete: '',
  athleteSlug: '',
  event: '',
  location: '',
  category: '',
  medal: 'gold',
}

function normalize(item) {
  if (!item) return emptyForm
  return {
    year: String(pick(item, ['year'], currentYear)),
    athlete: pick(item, ['athlete', 'athleteEn'], ''),
    athleteSlug: pick(item, ['athleteSlug'], ''),
    event: pick(item, ['event', 'eventEn', 'eventName'], ''),
    location: pick(item, ['location'], ''),
    category: pick(item, ['category', 'categoryEn'], ''),
    medal: String(pick(item, ['medal'], 'gold')).toLowerCase(),
  }
}

export default function ResultEdit() {
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
    resultsApi
      .get(id)
      .then((item) => !cancelled && setForm(normalize(item)))
      .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Could not load this result.')))
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
      year: Number(form.year),
      athleteSlug: form.athleteSlug || slugify(form.athlete),
    }

    try {
      if (isNew) {
        await resultsApi.create(payload)
      } else {
        await resultsApi.update(id, payload)
      }
      navigate('/results')
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not save this result.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner label="Loading result…" />

  return (
    <div>
      <PageHeader title={isNew ? 'Add Result' : 'Edit Result'} description="Medal record for an athlete's achievement." />

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>

      <form onSubmit={handleSubmit} className="form-card">
        <div className="form-grid form-grid--3">
          <label className="field">
            <span>Year</span>
            <input type="number" value={form.year} onChange={(e) => updateField('year', e.target.value)} required min="1990" max="2100" />
          </label>
          <label className="field">
            <span>Medal</span>
            <select value={form.medal} onChange={(e) => updateField('medal', e.target.value)}>
              <option value="gold">Gold</option>
              <option value="silver">Silver</option>
              <option value="bronze">Bronze</option>
            </select>
          </label>
          <label className="field">
            <span>Athlete Slug</span>
            <input type="text" value={form.athleteSlug} onChange={(e) => updateField('athleteSlug', slugify(e.target.value))} placeholder="auto-generated" />
          </label>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Athlete Name</span>
            <input
              type="text"
              value={form.athlete}
              onChange={(e) => {
                updateField('athlete', e.target.value)
                if (!form.athleteSlug) updateField('athleteSlug', slugify(e.target.value))
              }}
              required
            />
          </label>
          <label className="field">
            <span>Event</span>
            <input type="text" value={form.event} onChange={(e) => updateField('event', e.target.value)} required />
          </label>
        </div>

        <label className="field">
          <span>Location</span>
          <input type="text" value={form.location} onChange={(e) => updateField('location', e.target.value)} required />
        </label>

        <label className="field">
          <span>Category / Weight Class</span>
          <input type="text" value={form.category} onChange={(e) => updateField('category', e.target.value)} placeholder="e.g. Senior Male -75 kg" required />
        </label>

        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={() => navigate('/results')}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Result'}
          </button>
        </div>
      </form>
    </div>
  )
}

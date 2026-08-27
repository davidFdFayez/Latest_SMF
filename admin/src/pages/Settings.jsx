import { useEffect, useState } from 'react'
import { settingsApi } from '../api/resources'
import { extractErrorMessage, pick } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import { PlusIcon } from '../components/Icons'

const KEY_LABELS = {
  federation_name: 'Federation Name',
  federation_short_name: 'Federation Short Name',
  email: 'Contact Email',
  phone: 'Contact Phone',
  address: 'Address',
  twitter: 'X (Twitter) URL',
  instagram: 'Instagram URL',
  facebook: 'Facebook URL',
  youtube: 'YouTube URL',
  working_hours: 'Working Hours',
}

function labelFor(key) {
  if (KEY_LABELS[key]) return KEY_LABELS[key]
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function Settings() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [newKey, setNewKey] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await settingsApi.list()
      const normalized = data.map((row) => ({
        key: pick(row, ['key'], ''),
        valueAr: pick(row, ['valueAr'], ''),
        valueEn: pick(row, ['valueEn'], ''),
      }))
      setRows(normalized)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not load settings.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function updateRow(key, field, value) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, [field]: value } : row)))
  }

  function addRow(event) {
    event.preventDefault()
    const key = newKey.trim().toLowerCase().replace(/\s+/g, '_')
    if (!key) return
    if (rows.some((row) => row.key === key)) {
      setError(`A setting with key "${key}" already exists.`)
      return
    }
    setRows((prev) => [...prev, { key, valueAr: '', valueEn: '' }])
    setNewKey('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await Promise.all(rows.filter((row) => row.key).map((row) => settingsApi.update(row)))
      setSuccess('Settings saved successfully.')
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not save settings.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner label="Loading settings…" />

  return (
    <div>
      <PageHeader title="Settings" description="General site information, contact details and social links." />

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>
      <Alert type="success" onDismiss={() => setSuccess('')}>
        {success}
      </Alert>

      <form onSubmit={handleSubmit} className="form-card">
        {rows.map((row) => (
          <div key={row.key} className="form-grid">
            <label className="field">
              <span>{labelFor(row.key)} (English)</span>
              <input type="text" value={row.valueEn} onChange={(e) => updateRow(row.key, 'valueEn', e.target.value)} />
            </label>
            <label className="field">
              <span>{labelFor(row.key)} (Arabic)</span>
              <input type="text" dir="rtl" value={row.valueAr} onChange={(e) => updateRow(row.key, 'valueAr', e.target.value)} />
            </label>
          </div>
        ))}

        <div className="toolbar" style={{ marginTop: rows.length ? 4 : 0 }}>
          <input
            type="text"
            placeholder="Add a new setting key (e.g. sponsor_email)"
            value={newKey}
            onChange={(event) => setNewKey(event.target.value)}
            className="toolbar__search"
          />
          <button type="button" className="btn btn--secondary" onClick={addRow}>
            <PlusIcon /> Add Setting
          </button>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save All Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}

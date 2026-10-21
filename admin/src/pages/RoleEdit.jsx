import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { permissionsApi, rolesApi } from '../api/resources'
import { extractErrorMessage } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'

const emptyForm = {
  key: '',
  nameEn: '',
  nameAr: '',
  descriptionEn: '',
  descriptionAr: '',
  permissions: [],
}

/** Suggests a role key from its English name, in the shape the API accepts. */
function toKey(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+$/, '')
    .slice(0, 50)
}

export default function RoleEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id || id === 'new'

  const [form, setForm] = useState(emptyForm)
  const [role, setRole] = useState(null)
  const [catalog, setCatalog] = useState([])
  const [keyTouched, setKeyTouched] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([permissionsApi.catalog(), isNew ? null : rolesApi.get(id)])
      .then(([groups, item]) => {
        if (cancelled) return
        setCatalog(groups)
        if (item) {
          setRole(item)
          setForm({
            key: item.key,
            nameEn: item.nameEn,
            nameAr: item.nameAr,
            descriptionEn: item.descriptionEn || '',
            descriptionAr: item.descriptionAr || '',
            permissions: item.permissions,
          })
        }
      })
      .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Could not load this role.')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id, isNew])

  const locked = Boolean(role?.isSystem)
  // The API refuses changes to a role granting permissions the editor lacks.
  const readOnly = Boolean(role && !role.canManage)
  const selected = useMemo(() => new Set(form.permissions), [form.permissions])

  function updateField(field, value) {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (isNew && field === 'nameEn' && !keyTouched) next.key = toKey(value)
      return next
    })
  }

  function togglePermission(key) {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter((value) => value !== key)
        : [...prev.permissions, key],
    }))
  }

  /** Selects or clears every permission in a group that the editor is able to grant. */
  function toggleGroup(group) {
    const grantable = group.permissions.filter((permission) => permission.held).map((permission) => permission.key)
    const allOn = grantable.every((key) => selected.has(key))
    setForm((prev) => ({
      ...prev,
      permissions: allOn
        ? prev.permissions.filter((key) => !grantable.includes(key))
        : [...new Set([...prev.permissions, ...grantable])],
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      key: form.key,
      nameEn: form.nameEn,
      nameAr: form.nameAr,
      descriptionEn: form.descriptionEn,
      descriptionAr: form.descriptionAr,
      permissions: form.permissions,
    }

    try {
      if (isNew) {
        await rolesApi.create(payload)
      } else {
        await rolesApi.update(id, payload)
      }
      navigate('/roles')
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not save this role.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner label="Loading role…" />

  if (!isNew && !role) {
    return (
      <div>
        <PageHeader title="Edit Role" />
        <Alert type="error">{error || 'This role could not be found.'}</Alert>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={isNew ? 'Add Role' : `Edit ${role.nameEn}`}
        description={
          isNew
            ? 'Name the role and choose the permissions it grants.'
            : `Held by ${role.userCount} user(s). Changes apply to them immediately.`
        }
      />

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>
      {readOnly && (
        <Alert type="info">This role grants permissions you don't hold, so you can view it but not change it.</Alert>
      )}

      <form onSubmit={handleSubmit} className="form-card">
        <fieldset className="plain-fieldset" disabled={readOnly}>
          <div className="form-grid">
            <label className="field">
              <span>Name (English)</span>
              <input
                type="text"
                value={form.nameEn}
                onChange={(e) => updateField('nameEn', e.target.value)}
                maxLength={100}
                required
              />
            </label>
            <label className="field">
              <span>Name (Arabic)</span>
              <input
                type="text"
                dir="rtl"
                value={form.nameAr}
                onChange={(e) => updateField('nameAr', e.target.value)}
                maxLength={100}
                required
              />
            </label>
          </div>

          <label className="field">
            <span>Key</span>
            {isNew ? (
              <input
                type="text"
                value={form.key}
                onChange={(e) => {
                  setKeyTouched(true)
                  updateField('key', e.target.value.toLowerCase())
                }}
                pattern="[a-z][a-z0-9_]{1,49}"
                title="Starts with a letter; lowercase letters, digits and underscores"
                required
              />
            ) : (
              <input type="text" value={form.key} disabled />
            )}
            <span className="field__hint">
              {isNew ? "A stable internal name. It can't be changed later." : "Keys can't be changed."}
            </span>
          </label>

          <div className="form-grid">
            <label className="field">
              <span>Description (English)</span>
              <textarea
                rows={2}
                value={form.descriptionEn}
                onChange={(e) => updateField('descriptionEn', e.target.value)}
                maxLength={500}
              />
            </label>
            <label className="field">
              <span>Description (Arabic)</span>
              <textarea
                rows={2}
                dir="rtl"
                value={form.descriptionAr}
                onChange={(e) => updateField('descriptionAr', e.target.value)}
                maxLength={500}
              />
            </label>
          </div>

          <h3 className="form-section-title">Permissions</h3>

          {locked ? (
            <Alert type="info">
              Super Admin holds every permission, including any added in future. Its permissions are locked so there is
              always a role that can manage everything else.
            </Alert>
          ) : (
            <>
              <p className="form-card__intro">
                {form.permissions.length} selected. You can only grant permissions you hold yourself.
              </p>
              {catalog.map((group) => {
                const grantable = group.permissions.filter((permission) => permission.held)
                const count = group.permissions.filter((permission) => selected.has(permission.key)).length
                const allOn = grantable.length > 0 && grantable.every((permission) => selected.has(permission.key))
                return (
                  <section key={group.key} className="perm-group" aria-labelledby={`perm-group-${group.key}`}>
                    <div className="perm-group__head">
                      <h4 className="perm-group__title" id={`perm-group-${group.key}`}>
                        {group.nameEn}
                        <span className="perm-group__count">
                          {count} of {group.permissions.length}
                        </span>
                      </h4>
                      {!readOnly && grantable.length > 0 && (
                        <button type="button" className="btn btn--ghost btn--small" onClick={() => toggleGroup(group)}>
                          {allOn ? 'Clear all' : 'Select all'}
                        </button>
                      )}
                    </div>
                    <div className="choice-list">
                      {group.permissions.map((permission) => {
                        const checked = selected.has(permission.key)
                        const disabled = readOnly || !permission.held
                        return (
                          <label
                            key={permission.key}
                            className={`choice${checked ? ' is-checked' : ''}${disabled ? ' is-disabled' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => togglePermission(permission.key)}
                            />
                            <span className="choice__body">
                              <span className="choice__title">{permission.nameEn}</span>
                              <span className="choice__meta">
                                <bdi>{permission.nameAr}</bdi> · <code>{permission.key}</code>
                              </span>
                              <span className="choice__desc">{permission.description}</span>
                              {!permission.held && !readOnly && (
                                <span className="choice__note">You don't hold this permission</span>
                              )}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </>
          )}
        </fieldset>

        {!readOnly && (
          <div className="form-actions">
            <button type="button" className="btn btn--ghost" onClick={() => navigate('/roles')}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Saving…' : isNew ? 'Create Role' : 'Save Changes'}
            </button>
          </div>
        )}
      </form>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { permissionsApi, rolesApi, usersApi } from '../api/resources'
import { extractErrorMessage } from '../api/utils'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import Badge from '../components/Badge'

const emptyForm = {
  username: '',
  displayName: '',
  email: '',
  password: '',
  confirmPassword: '',
  isActive: true,
  roleIds: [],
}

const PASSWORD_HINT = 'At least 8 characters, including a letter and a digit.'

export default function UserEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id || id === 'new'
  const { refreshUser } = useAuth()

  const [form, setForm] = useState(emptyForm)
  const [account, setAccount] = useState(null)
  const [roles, setRoles] = useState([])
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([rolesApi.list(), permissionsApi.catalog(), isNew ? null : usersApi.get(id)])
      .then(([roleList, groups, user]) => {
        if (cancelled) return
        setRoles(roleList)
        setCatalog(groups)
        if (user) {
          setAccount(user)
          setForm({
            ...emptyForm,
            username: user.username,
            displayName: user.displayName,
            email: user.email || '',
            isActive: user.isActive,
            roleIds: user.roles.map((role) => role.id),
          })
        }
      })
      .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Could not load this user.')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id, isNew])

  const isSelf = Boolean(account?.isSelf)
  // The API refuses changes to an account holding permissions the editor lacks.
  const readOnly = Boolean(account && !account.canManage)

  const permissionNames = useMemo(
    () => new Map(catalog.flatMap((group) => group.permissions.map((permission) => [permission.key, permission.nameEn]))),
    [catalog],
  )

  // What the selected roles add up to, so the effect of a change is visible before saving.
  const effective = useMemo(() => {
    const keys = new Set(roles.filter((role) => form.roleIds.includes(role.id)).flatMap((role) => role.permissions))
    return { everything: keys.has('*'), keys: [...keys].filter((key) => key !== '*') }
  }, [roles, form.roleIds])

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function toggleRole(roleId) {
    setForm((prev) => ({
      ...prev,
      roleIds: prev.roleIds.includes(roleId) ? prev.roleIds.filter((value) => value !== roleId) : [...prev.roleIds, roleId],
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (isNew && form.password !== form.confirmPassword) {
      setError('The passwords do not match.')
      return
    }

    setSaving(true)
    try {
      if (isNew) {
        await usersApi.create({
          username: form.username,
          displayName: form.displayName,
          email: form.email.trim(),
          password: form.password,
          isActive: form.isActive,
          roleIds: form.roleIds,
        })
      } else {
        await usersApi.update(id, {
          displayName: form.displayName,
          email: form.email.trim(),
          isActive: form.isActive,
          roleIds: form.roleIds,
        })
        if (isSelf) await refreshUser().catch(() => {})
      }
      navigate('/users')
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not save this user.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (newPassword !== confirmNewPassword) {
      setError('The new passwords do not match.')
      return
    }

    setResetting(true)
    try {
      await usersApi.resetPassword(id, newPassword)
      setNewPassword('')
      setConfirmNewPassword('')
      setNotice('Password updated. Share it with the user through a secure channel.')
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not update the password.'))
    } finally {
      setResetting(false)
    }
  }

  if (loading) return <Spinner label="Loading user…" />

  if (!isNew && !account) {
    return (
      <div>
        <PageHeader title="Edit User" />
        <Alert type="error">{error || 'This user could not be found.'}</Alert>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={isNew ? 'Add User' : `Edit ${account.displayName}`}
        description={isNew ? 'Create an admin account and choose what it can do.' : `@${account.username}`}
      />

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>
      <Alert type="success" onDismiss={() => setNotice('')}>
        {notice}
      </Alert>
      {readOnly && (
        <Alert type="info">This account holds permissions you don't have, so you can view it but not change it.</Alert>
      )}

      <form onSubmit={handleSubmit} className="form-card">
        <fieldset className="plain-fieldset" disabled={readOnly}>
          <div className="form-grid">
            <label className="field">
              <span>Username</span>
              {isNew ? (
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => updateField('username', e.target.value.toLowerCase().replace(/\s/g, ''))}
                  pattern="[a-z0-9._\-]{3,50}"
                  title="3–50 lowercase letters, digits, dots, hyphens or underscores"
                  autoComplete="off"
                  required
                />
              ) : (
                <input type="text" value={form.username} disabled />
              )}
              <span className="field__hint">
                {isNew ? 'Lowercase letters, digits, dots, hyphens and underscores.' : "Usernames can't be changed."}
              </span>
            </label>
            <label className="field">
              <span>Display name</span>
              <input
                type="text"
                value={form.displayName}
                onChange={(e) => updateField('displayName', e.target.value)}
                maxLength={100}
                required
              />
              <span className="field__hint">Shown in the console and the audit trail.</span>
            </label>
            <label className="field">
              <span>Email address</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                maxLength={200}
                autoComplete="off"
                placeholder="name@example.com"
              />
              <span className="field__hint">
                Optional. Password-reset links are sent here. An account with no address cannot reset its own password —
                another administrator has to set one for it.
              </span>
            </label>
          </div>

          {isNew && (
            <div className="form-grid">
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
                <span className="field__hint">{PASSWORD_HINT}</span>
              </label>
              <label className="field">
                <span>Confirm password</span>
                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) => updateField('confirmPassword', e.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </label>
            </div>
          )}

          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={Boolean(form.isActive)}
              disabled={isSelf}
              onChange={(e) => updateField('isActive', e.target.checked)}
            />
            <span>Active — can sign in</span>
          </label>
          {isSelf && <p className="form-card__intro">You can't deactivate your own account or change your own roles.</p>}

          <h3 className="form-section-title">Roles</h3>
          <p className="form-card__intro">A user can do everything their roles grant, combined.</p>

          {roles.length === 0 ? (
            <p className="form-card__intro">No roles exist yet. Create one under Roles &amp; Permissions.</p>
          ) : (
            <div className="choice-list">
              {roles.map((role) => {
                const checked = form.roleIds.includes(role.id)
                const disabled = readOnly || isSelf || !role.canManage
                return (
                  <label
                    key={role.id}
                    className={`choice${checked ? ' is-checked' : ''}${disabled ? ' is-disabled' : ''}`}
                  >
                    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleRole(role.id)} />
                    <span className="choice__body">
                      <span className="choice__title">{role.nameEn}</span>
                      <span className="choice__meta">
                        <bdi>{role.nameAr}</bdi> ·{' '}
                        {role.isSystem ? 'all permissions' : `${role.permissions.length} permission(s)`}
                      </span>
                      {role.descriptionEn && <span className="choice__desc">{role.descriptionEn}</span>}
                      {!role.canManage && !readOnly && (
                        <span className="choice__note">Grants permissions you don't hold</span>
                      )}
                    </span>
                  </label>
                )
              })}
            </div>
          )}

          <div className="field">
            <span>Effective access</span>
            {effective.everything ? (
              <div className="chip-list">
                <Badge tone="gold">Everything (Super Admin)</Badge>
              </div>
            ) : effective.keys.length === 0 ? (
              <span className="field__hint">No permissions — this user can sign in but cannot open any section.</span>
            ) : (
              <div className="chip-list">
                {effective.keys.map((key) => (
                  <Badge key={key} tone="green">
                    {permissionNames.get(key) || key}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </fieldset>

        {!readOnly && (
          <div className="form-actions">
            <button type="button" className="btn btn--ghost" onClick={() => navigate('/users')}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Saving…' : isNew ? 'Create User' : 'Save Changes'}
            </button>
          </div>
        )}
      </form>

      {!isNew && account.canManage && (
        <form onSubmit={handleResetPassword} className="form-card">
          <h3 className="form-section-title form-section-title--first">Reset password</h3>
          <div className="form-grid">
            <label className="field">
              <span>New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
              <span className="field__hint">{PASSWORD_HINT}</span>
            </label>
            <label className="field">
              <span>Confirm new password</span>
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn--secondary" disabled={resetting}>
              {resetting ? 'Updating…' : 'Set Password'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

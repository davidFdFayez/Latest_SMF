import { useState } from 'react'
import { Link } from 'react-router-dom'
import { requestPasswordReset } from '../api/auth'
import { extractErrorMessage } from '../api/utils'
import Alert from '../components/Alert'

/**
 * Step one of self-service password reset: ask for a link.
 *
 * The API answers identically whether or not the account exists, so that an
 * outsider cannot use this form to discover real usernames or addresses. This
 * screen keeps that promise: the confirmation below never says an email *was*
 * sent to the account that was typed, only what would happen if it exists.
 */

const NEUTRAL_NOTICE = 'If that account exists and has an email address on file, a reset link is on its way.'

const TOO_MANY_ATTEMPTS =
  'Too many attempts from this connection. Please wait a few minutes before trying again.'

const OFFLINE = 'Cannot reach the server right now. Check your connection and try again.'

/** Keeps the wording calm: no raw rate-limit or transport errors on a sign-in screen. */
function friendlyError(err, fallback) {
  if (err?.response?.status === 429) return TOO_MANY_ATTEMPTS
  if (!err?.response) return OFFLINE
  const english = err.response.data?.messageEn
  return typeof english === 'string' && english.trim() ? english : extractErrorMessage(err, fallback)
}

export default function ForgotPassword() {
  const [account, setAccount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const data = await requestPasswordReset(account.trim())
      setNotice(data?.messageEn || data?.message || NEUTRAL_NOTICE)
    } catch (err) {
      setError(friendlyError(err, 'Could not request a reset link right now. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  if (notice) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-card__brand">
            <img src="/logo.png" alt="Saudi Muaythai Federation" />
            <h1>Request received</h1>
            <p>{notice}</p>
          </div>

          <p className="form-card__intro">
            The link works once and stops working after a while. If nothing arrives, check the junk mail folder, or ask
            another administrator to set a password for you.
          </p>

          <Link to="/login" className="btn btn--primary btn--block">
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__brand">
          <img src="/logo.png" alt="Saudi Muaythai Federation" />
          <h1>Reset your password</h1>
          <p>We will email a reset link to the address on your admin account</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <Alert type="error" onDismiss={() => setError('')}>
            {error}
          </Alert>

          <label className="field">
            <span>Username or email</span>
            <input
              type="text"
              value={account}
              onChange={(event) => setAccount(event.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
            <span className="field__hint">Whichever you use to sign in.</span>
          </label>

          <button type="submit" className="btn btn--primary btn--block" disabled={busy || !account.trim()}>
            {busy ? 'Sending…' : 'Email me a reset link'}
          </button>

          <p className="form-card__intro" style={{ textAlign: 'center', margin: '14px 0 0' }}>
            <Link to="/login">Back to sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}

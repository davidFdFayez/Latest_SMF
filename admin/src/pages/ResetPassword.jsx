import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { checkResetToken, resetPassword } from '../api/auth'
import { extractErrorMessage } from '../api/utils'
import Alert from '../components/Alert'

/**
 * Step two of self-service password reset: choose a new password.
 *
 * The link's token arrives in the query string. It is checked once on load so
 * an expired link says so before anyone types, it is never written to a log or
 * into a message shown on screen, and it is dropped from the address bar as
 * soon as it has been spent.
 */

const PASSWORD_HINT = 'At least 8 characters, including a letter and a digit.'

const LINK_MISSING =
  'This page needs the reset link from your email. Open the link in the message, or request a new one below.'

const LINK_DEAD =
  'This reset link is not valid any more. A link can only be used once, and it stops working a short while after it is sent.'

const TOO_MANY_ATTEMPTS = 'Too many attempts from this connection. Please wait a few minutes before trying again.'

const OFFLINE = 'Cannot reach the server right now. Check your connection and try again.'

/**
 * Keeps the wording calm — no raw rate-limit or transport errors — and prefers
 * the API's English sentence over its bilingual one-liner.
 */
function friendlyError(error, fallback) {
  if (error?.response?.status === 429) return TOO_MANY_ATTEMPTS
  if (!error?.response) return OFFLINE
  const english = error.response.data?.messageEn
  return typeof english === 'string' && english.trim() ? english : extractErrorMessage(error, fallback)
}

/** Mirrors the API's password policy, so a weak password fails before it is sent. */
function passwordProblem(value) {
  if (value.length < 8) return 'Use at least 8 characters.'
  if (value.length > 128) return 'Use 128 characters or fewer.'
  if (!/\p{L}/u.test(value)) return 'Include at least one letter.'
  if (!/\p{Nd}/u.test(value)) return 'Include at least one digit.'
  return ''
}

export default function ResetPassword() {
  const [searchParams, setSearchParams] = useSearchParams()
  // Read once: the token is dropped from the URL after a successful reset.
  const [token] = useState(() => searchParams.get('token') || '')

  // checking | ready | missing | dead | unavailable | done
  const [stage, setStage] = useState(token ? 'checking' : 'missing')
  const [blocker, setBlocker] = useState(token ? '' : LINK_MISSING)
  const [attempt, setAttempt] = useState(0)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [username, setUsername] = useState('')

  useEffect(() => {
    if (!token) return undefined
    let cancelled = false
    setStage('checking')
    setBlocker('')
    checkResetToken(token)
      .then((valid) => {
        if (cancelled) return
        setStage(valid ? 'ready' : 'dead')
        setBlocker(valid ? '' : LINK_DEAD)
      })
      .catch((err) => {
        if (cancelled) return
        setStage('unavailable')
        setBlocker(friendlyError(err, 'Could not check this reset link right now.'))
      })
    return () => {
      cancelled = true
    }
  }, [token, attempt])

  const problem = password ? passwordProblem(password) : ''
  const mismatch = Boolean(confirm) && password !== confirm
  const canSubmit = Boolean(password) && Boolean(confirm) && !problem && !mismatch

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    const weak = passwordProblem(password)
    if (weak) {
      setError(weak + ' ' + PASSWORD_HINT)
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }

    setBusy(true)
    try {
      const data = await resetPassword(token, password)
      setPassword('')
      setConfirm('')
      setUsername(typeof data?.username === 'string' ? data.username : '')
      setSuccess(data?.messageEn || data?.message || 'Your new password is set. You can sign in now.')
      setStage('done')
      // Keep the spent link out of history, bookmarks and shoulder-surfing range.
      setSearchParams(new URLSearchParams(), { replace: true })
    } catch (err) {
      setError(friendlyError(err, 'Could not set the password. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  if (stage === 'done') {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-card__brand">
            <img src="/logo.png" alt="Saudi Muaythai Federation" />
            <h1>Password set</h1>
            <p>{success}</p>
          </div>

          <p className="form-card__intro">
            {username ? 'Sign in as ' + username + ' with your new password. ' : 'Sign in with your new password. '}
            Anywhere else that was signed in to this account has been signed out.
          </p>

          <Link to="/login" className="btn btn--primary btn--block">
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  if (stage === 'checking') {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-card__brand">
            <img src="/logo.png" alt="Saudi Muaythai Federation" />
            <h1>Checking your link</h1>
            <p>One moment…</p>
          </div>
        </div>
      </div>
    )
  }

  if (stage !== 'ready') {
    const canRetry = stage === 'unavailable'
    const heading = canRetry ? 'Link not checked' : stage === 'missing' ? 'Reset link needed' : 'Link no longer works'
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-card__brand">
            <img src="/logo.png" alt="Saudi Muaythai Federation" />
            <h1>{heading}</h1>
            <p>{blocker}</p>
          </div>

          {canRetry ? (
            <>
              <button
                type="button"
                className="btn btn--primary btn--block"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Try again
              </button>
              <p className="form-card__intro" style={{ textAlign: 'center', margin: '14px 0 0' }}>
                <Link to="/forgot-password">Request a new reset link</Link>
              </p>
            </>
          ) : (
            <>
              <Link to="/forgot-password" className="btn btn--primary btn--block">
                Request a new reset link
              </Link>
              <p className="form-card__intro" style={{ textAlign: 'center', margin: '14px 0 0' }}>
                <Link to="/login">Back to sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__brand">
          <img src="/logo.png" alt="Saudi Muaythai Federation" />
          <h1>Choose a new password</h1>
          <p>Then sign in to the console with it</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <Alert type="error" onDismiss={() => setError('')}>
            {error}
          </Alert>

          <label className="field">
            <span>New password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              autoFocus
            />
            <span className={problem ? 'field__hint field__hint--error' : 'field__hint'}>{problem || PASSWORD_HINT}</span>
          </label>

          <label className="field">
            <span>Confirm new password</span>
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
            {mismatch && <span className="field__hint field__hint--error">The two passwords do not match.</span>}
          </label>

          <button type="submit" className="btn btn--primary btn--block" disabled={busy || !canSubmit}>
            {busy ? 'Saving…' : 'Set new password'}
          </button>

          <p className="form-card__intro" style={{ textAlign: 'center', margin: '14px 0 0' }}>
            <Link to="/forgot-password">Request a new link</Link> · <Link to="/login">Back to sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}

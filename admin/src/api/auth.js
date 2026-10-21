import client, { setStoredUser, setToken } from './client'
import { pick } from './utils'

/**
 * The signed-in account as the console uses it. Roles and permissions travel
 * with the session so the UI can hide what the API would refuse; the API
 * re-checks every request regardless.
 */
function toUser(data, fallbackUsername = '') {
  return {
    id: pick(data, ['id'], null),
    username: pick(data, ['username', 'name'], fallbackUsername),
    displayName: pick(data, ['displayName', 'fullName'], ''),
    roles: pick(data, ['roles'], []),
    permissions: pick(data, ['permissions'], []),
    // §6 membership permissions, used by the membership console.
    membershipGrants: pick(data, ['membershipGrants'], []),
  }
}

export async function login(username, password) {
  const response = await client.post('/auth/login', { username, password })
  const data = response.data || {}

  const token = pick(data, ['token', 'accessToken', 'jwt', 'access_token'])
  if (!token) {
    throw new Error('Login succeeded but no token was returned by the API.')
  }

  const user = { ...toUser(data, username), expiresAt: pick(data, ['expiresAt'], null) }

  setToken(token)
  setStoredUser(user)
  return { token, user }
}

/**
 * Asks for a reset link. The API answers the same way whether or not the
 * account exists, so the screen must not treat this as confirmation that it
 * does.
 */
export async function requestPasswordReset(account) {
  const response = await client.post('/auth/forgot-password', { account })
  return response.data
}

/** Whether a reset link is still usable, so the form can say so up front. */
export async function checkResetToken(token) {
  const response = await client.get(`/auth/reset-password/${encodeURIComponent(token)}`)
  return Boolean(response.data?.valid)
}

export async function resetPassword(token, password) {
  const response = await client.post('/auth/reset-password', { token, password })
  return response.data
}

/**
 * Re-reads the account's current roles and permissions. Another administrator
 * may have changed them since sign-in; a deactivated account answers 401,
 * which the client turns into a sign-out.
 */
export async function fetchProfile() {
  const response = await client.get('/auth/me')
  return toUser(response.data || {})
}

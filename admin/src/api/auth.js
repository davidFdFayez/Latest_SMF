import client, { setStoredUser, setToken } from './client'
import { pick } from './utils'

export async function login(username, password) {
  const response = await client.post('/auth/login', { username, password })
  const data = response.data || {}

  const token = pick(data, ['token', 'accessToken', 'jwt', 'access_token'])
  if (!token) {
    throw new Error('Login succeeded but no token was returned by the API.')
  }

  const user = pick(data, ['user'], {
    username: pick(data, ['username', 'name'], username),
    displayName: pick(data, ['displayName', 'fullName'], ''),
    role: pick(data, ['role'], 'Administrator'),
    // §6 membership permissions travel with the session so the console can hide
    // controls the API would refuse.
    membershipRole: pick(data, ['membershipRole'], null),
    membershipGrants: pick(data, ['membershipGrants'], []),
    expiresAt: pick(data, ['expiresAt'], null),
  })

  setToken(token)
  setStoredUser(user)
  return { token, user }
}

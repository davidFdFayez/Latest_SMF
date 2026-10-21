import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { fetchProfile, login as loginRequest } from '../api/auth'
import { clearSession, getStoredUser, getToken, onUnauthorized, setStoredUser } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => getToken())
  const [user, setUserState] = useState(() => getStoredUser())

  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      setTokenState(null)
      setUserState(null)
    })
    return unsubscribe
  }, [])

  const login = useCallback(async (username, password) => {
    const result = await loginRequest(username, password)
    setTokenState(result.token)
    setUserState(result.user)
    return result
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setTokenState(null)
    setUserState(null)
  }, [])

  /** Pulls the account's current roles and permissions from the API. */
  const refreshUser = useCallback(async () => {
    const profile = await fetchProfile()
    setUserState((previous) => {
      const next = { ...profile, expiresAt: previous?.expiresAt ?? null }
      setStoredUser(next)
      return next
    })
    return profile
  }, [])

  // A session restored from storage may predate a role change, so refresh it
  // once per load. Failures are ignored: a 401 already signs the user out.
  useEffect(() => {
    if (token) refreshUser().catch(() => {})
  }, [token, refreshUser])

  /**
   * Whether the signed-in user holds a §6 membership permission.
   *
   * Presentation only — it decides which controls are worth showing. The API
   * enforces the same matrix independently and returns 403 regardless, so a
   * stale session can never turn into an unauthorised approval.
   */
  const can = useCallback(
    (action) => Array.isArray(user?.membershipGrants) && user.membershipGrants.includes(action),
    [user],
  )

  /** Whether the user holds any of the given permissions ("*" holds them all). Presentation only. */
  const hasPermission = useCallback(
    (...permissions) => {
      const held = Array.isArray(user?.permissions) ? user.permissions : []
      return held.includes('*') || permissions.flat().some((permission) => held.includes(permission))
    },
    [user],
  )

  /**
   * Whether a console section is open to the user. A section names either a
   * site permission or, for the membership register, a §6 action; one naming
   * neither is open to every signed-in account.
   */
  const canAccess = useCallback(
    ({ permission, membershipAction } = {}) => {
      if (membershipAction) return can(membershipAction)
      return !permission || hasPermission(permission)
    },
    [can, hasPermission],
  )

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token),
      can,
      hasPermission,
      canAccess,
      login,
      logout,
      refreshUser,
    }),
    [token, user, can, hasPermission, canAccess, login, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

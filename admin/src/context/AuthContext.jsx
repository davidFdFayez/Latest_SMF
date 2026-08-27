import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { login as loginRequest } from '../api/auth'
import { clearSession, getStoredUser, getToken, onUnauthorized } from '../api/client'

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

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token),
      login,
      logout,
    }),
    [token, user, login, logout],
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

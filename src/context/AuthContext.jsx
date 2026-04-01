import { createContext, useContext, useState, useCallback, useMemo } from 'react'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })
  const [token, setToken] = useState(() => localStorage.getItem('token') || null)

  const signin = useCallback((userData, tok) => {
    setUser(userData)
    setToken(tok)
    localStorage.setItem('user', JSON.stringify(userData))
    localStorage.setItem('token', tok)
  }, [])

  const signout = useCallback(() => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('user')
    localStorage.removeItem('token')
  }, [])

  const value = useMemo(() => ({ user, token, signin, signout }), [user, token, signin, signout])

  return (
    <AuthCtx.Provider value={value}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)

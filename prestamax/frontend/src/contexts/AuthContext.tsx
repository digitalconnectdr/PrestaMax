import React, { createContext, useReducer, useCallback } from 'react'
import { User } from '@/types'

export interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
}

type AuthAction =
  | { type: 'LOGIN'; payload: { user: User; token: string } }
  | { type: 'LOGOUT' }
  | { type: 'UPDATE_USER'; payload: User }
  | { type: 'SET_LOADING'; payload: boolean }

const initialState: AuthState = {
  user: null,
  token: localStorage.getItem('prestamax_token'),
  isAuthenticated: !!localStorage.getItem('prestamax_token'),
  isLoading: false,
}

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'LOGIN':
      localStorage.setItem('prestamax_token', action.payload.token)
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        isLoading: false,
      }
    case 'LOGOUT':
      localStorage.removeItem('prestamax_token')
      localStorage.removeItem('prestamax_tenant_id')
      return {
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      }
    case 'UPDATE_USER':
      return { ...state, user: action.payload }
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }
    default:
      return state
  }
}

export const AuthContext = createContext<{
  state: AuthState
  login: (user: User, token: string) => void
  logout: () => void
  updateUser: (user: User) => void
  setLoading: (loading: boolean) => void
}>({
  state: initialState,
  login: () => {},
  logout: () => {},
  updateUser: () => {},
  setLoading: () => {},
})

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState)

  const login = useCallback((user: User, token: string) => {
    dispatch({ type: 'LOGIN', payload: { user, token } })
  }, [])

  const logout = useCallback(() => {
    dispatch({ type: 'LOGOUT' })
  }, [])

  const updateUser = useCallback((user: User) => {
    dispatch({ type: 'UPDATE_USER', payload: user })
  }, [])

  const setLoading = useCallback((loading: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: loading })
  }, [])

  return (
    <AuthContext.Provider value={{ state, login, logout, updateUser, setLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

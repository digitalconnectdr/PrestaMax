import React, { createContext, useReducer, useCallback } from 'react'
import { TenantMembership } from '@/types'

export interface TenantState {
  currentTenant: TenantMembership | null
  userTenants: TenantMembership[]
  isLoading: boolean
}

type TenantAction =
  | { type: 'SET_CURRENT_TENANT'; payload: TenantMembership }
  | { type: 'SET_USER_TENANTS'; payload: TenantMembership[] }
  | { type: 'SET_LOADING'; payload: boolean }

const initialState: TenantState = {
  currentTenant: null,
  userTenants: [],
  isLoading: false,
}

const tenantReducer = (state: TenantState, action: TenantAction): TenantState => {
  switch (action.type) {
    case 'SET_CURRENT_TENANT':
      localStorage.setItem('prestamax_tenant_id', action.payload.tenantId)
      return { ...state, currentTenant: action.payload }
    case 'SET_USER_TENANTS':
      return { ...state, userTenants: action.payload }
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }
    default:
      return state
  }
}

export const TenantContext = createContext<{
  state: TenantState
  selectTenant: (tenant: TenantMembership) => void
  setUserTenants: (tenants: TenantMembership[]) => void
  setLoading: (loading: boolean) => void
}>({
  state: initialState,
  selectTenant: () => {},
  setUserTenants: () => {},
  setLoading: () => {},
})

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(tenantReducer, initialState)

  const selectTenant = useCallback((tenant: TenantMembership) => {
    dispatch({ type: 'SET_CURRENT_TENANT', payload: tenant })
  }, [])

  const setUserTenants = useCallback((tenants: TenantMembership[]) => {
    dispatch({ type: 'SET_USER_TENANTS', payload: tenants })
  }, [])

  const setLoading = useCallback((loading: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: loading })
  }, [])

  return (
    <TenantContext.Provider value={{ state, selectTenant, setUserTenants, setLoading }}>
      {children}
    </TenantContext.Provider>
  )
}

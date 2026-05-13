import React, { createContext, useReducer, useCallback } from 'react'
import { TenantMembership } from '@/types'
import api from '@/lib/api'

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
  refreshCurrentTenant: () => Promise<void>
}>({
  state: initialState,
  selectTenant: () => {},
  setUserTenants: () => {},
  setLoading: () => {},
  refreshCurrentTenant: async () => {},
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

  // Refresca el tenant/membership desde el backend (incluye effectivePermissions
  // recalculados con el plan actual). Util tras un upgrade/downgrade de plan.
  const refreshCurrentTenant = useCallback(async () => {
    try {
      const res = await api.get('/auth/me')
      const memberships: TenantMembership[] = res.data?.memberships || []
      if (memberships.length > 0) {
        dispatch({ type: 'SET_USER_TENANTS', payload: memberships })
        const currentId = state.currentTenant?.tenantId
        const next = memberships.find(m => m.tenantId === currentId) || memberships[0]
        if (next) dispatch({ type: 'SET_CURRENT_TENANT', payload: next })
      }
    } catch (e) {
      // ignore - user can refresh manually
    }
  }, [state.currentTenant?.tenantId])

  return (
    <TenantContext.Provider value={{ state, selectTenant, setUserTenants, setLoading, refreshCurrentTenant }}>
      {children}
    </TenantContext.Provider>
  )
}

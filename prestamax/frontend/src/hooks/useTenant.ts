import { useContext } from 'react'
import { TenantContext } from '@/contexts/TenantContext'

export const useTenant = () => {
  const context = useContext(TenantContext)
  if (!context) {
    throw new Error('useTenant must be used within TenantProvider')
  }
  return context
}

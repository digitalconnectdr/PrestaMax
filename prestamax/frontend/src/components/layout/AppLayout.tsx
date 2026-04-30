import React, { useState, useEffect, useRef } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { Toaster } from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'
import { useTenant } from '@/hooks/useTenant'
import api from '@/lib/api'

interface AppLayoutProps {
  title?: string
}

const AppLayout: React.FC<AppLayoutProps> = ({ title }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { updateUser } = useAuth()
  const { selectTenant, setUserTenants } = useTenant()
  const refreshInProgress = useRef(false)

  const refreshPermissions = async () => {
    if (refreshInProgress.current) return
    refreshInProgress.current = true
    try {
      const res = await api.get('/auth/me')
      const { user, tenants } = res.data
      updateUser(user)
      setUserTenants(tenants)
      const savedId = localStorage.getItem('prestamax_tenant_id')
      const freshTenant = tenants.find((t: any) => t.tenantId === savedId) || tenants[0]
      if (freshTenant) selectTenant(freshTenant)
    } catch (_) {
      // Silently ignore
    } finally {
      refreshInProgress.current = false
    }
  }

  useEffect(() => {
    refreshPermissions()
    const handleFocus = () => refreshPermissions()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} title={title} />

        <main className="flex-1 overflow-y-auto bg-slate-50">
          <div className="p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>

      <Toaster position="top-right" />
    </div>
  )
}

export default AppLayout

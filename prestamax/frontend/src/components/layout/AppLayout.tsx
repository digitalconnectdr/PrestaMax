import React, { useState, useEffect, useRef } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import SubscriptionExpiredBanner from '@/components/shared/SubscriptionExpiredBanner'
import { useAuth } from '@/hooks/useAuth'
import { useTenant } from '@/hooks/useTenant'
import { PageLoadingState } from '@/components/ui/Loading'
import api from '@/lib/api'

interface AppLayoutProps {
  title?: string
}

const AppLayout: React.FC<AppLayoutProps> = ({ title }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { updateUser } = useAuth()
  const { state: tenantState, selectTenant, setUserTenants } = useTenant()
  // FIX (onboarding audit, Sep 2026): en una carga completa de página (F5,
  // link directo, pestaña restaurada) TenantContext arranca con
  // currentTenant=null. <Outlet/> renderiza de inmediato y PermissionRoute
  // evalua can(perm) EN ESE MISMO render, antes de que /auth/me (mas abajo)
  // resuelva -- sin permisos cargados, can() niega por defecto y el usuario
  // es redirigido a /dashboard sin explicacion, aunque si tenga el permiso.
  // Se bloquea el render de las rutas hasta que el primer chequeo de sesion
  // termine (o de inmediato si currentTenant ya venia poblado, ej. justo
  // despues de login/registro).
  //
  // refreshInFlight guarda la PROMESA en curso (no solo un booleano): en
  // React 18 StrictMode (dev) este efecto se monta dos veces seguidas: con
  // un simple booleano, la 2da llamada veia el guard activo y retornaba de
  // inmediato (sin esperar red real), y su .finally() marcaba
  // initialCheckDone=true casi instantaneo -- ANTES de que la 1ra llamada
  // (la real) terminara de traer los permisos, reproduciendo el mismo bug
  // que este fix intenta evitar. Al compartir la promesa, cualquier llamada
  // concurrente espera el MISMO fetch real, sin importar cuantas veces se
  // dispare el efecto.
  const refreshInFlight = useRef<Promise<void> | null>(null)
  const [initialCheckDone, setInitialCheckDone] = useState(!!tenantState.currentTenant)

  const refreshPermissions = (): Promise<void> => {
    if (refreshInFlight.current) return refreshInFlight.current
    const p = (async () => {
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
        refreshInFlight.current = null
      }
    })()
    refreshInFlight.current = p
    return p
  }

  useEffect(() => {
    refreshPermissions().finally(() => setInitialCheckDone(true))
    const handleFocus = () => refreshPermissions()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Mientras se resuelve el primer chequeo, no renderizar <Outlet/> -- evita
  // que PermissionRoute evalue permisos con currentTenant todavia en null.
  if (!initialCheckDone) {
    return <PageLoadingState />
  }

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} title={title} />
        <SubscriptionExpiredBanner />

        <main className="flex-1 overflow-y-auto bg-slate-50">
          <div className="p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

export default AppLayout

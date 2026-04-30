import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  BarChart3, Users, DollarSign, CreditCard, FileText, FileCheck,
  Truck, MessageCircle, Settings, Package, Users2, MapPin, BookOpen,
  ReceiptText, LogOut, ChevronLeft, TrendingUp, Landmark, ShieldCheck, ClipboardList, Calculator, CalendarRange
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermission } from '@/hooks/usePermission'

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen = true, onClose }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const { state, logout } = useAuth()
  const { can, canAny } = usePermission()

  const isActive = (path: string) => {
    if (path === '/settings') return location.pathname === '/settings'
    return location.pathname.startsWith(path)
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const userPlatformRole = (state.user as any)?.platformRole || (state.user as any)?.platform_role || ''
  const isPlatformAdmin = ['admin', 'platform_owner', 'platform_admin'].includes(userPlatformRole)

  const navGroups = [
    {
      label: 'PRINCIPAL',
      items: [
        { icon: BarChart3, label: 'Dashboard', path: '/dashboard', show: can('reports.dashboard') },
      ],
    },
    {
      label: 'OPERACIONES',
      items: [
        { icon: Users,        label: 'Clientes',         path: '/clients',    show: can('clients.view') },
        { icon: DollarSign,   label: 'Préstamos',        path: '/loans',      show: can('loans.view') },
        { icon: CreditCard,   label: 'Pagos',            path: '/payments',   show: can('payments.view') },
        // Recibos eliminado — funcionalidad integrada en Pagos (imprimir + WhatsApp)
        { icon: FileCheck,    label: 'Contratos',        path: '/contracts',  show: can('contracts.view') },
        { icon: TrendingUp,   label: 'Ingresos y Gastos',path: '/income',     show: can('income.view') },
        { icon: Calculator,   label: 'Calculadora',      path: '/calculator', show: can('calculator.use') },
        { icon: BookOpen,     label: 'Plantillas',       path: '/templates',  show: can('templates.view') },
        { icon: ClipboardList,label: 'Solicitudes',      path: '/requests',   show: can('requests.view') },
      ],
    },
    {
      label: 'COBRANZAS',
      items: [
        { icon: Truck,     label: 'Mi Cartera',       path: '/collections',          show: can('collections.view') },
        { icon: FileText,  label: 'Promesas de Pago', path: '/collections/promises', show: can('collections.promises') },
      ],
    },
    {
      label: 'COMUNICACIONES',
      items: [
        { icon: MessageCircle, label: 'WhatsApp', path: '/whatsapp', show: can('whatsapp.view') },
      ],
    },
    {
      label: 'ANÁLISIS',
      items: [
        { icon: BarChart3,     label: 'Reportes',            path: '/reports',
          show: canAny(['reports.portfolio','reports.mora','reports.collections','reports.advanced','reports.income']) },
        { icon: CalendarRange, label: 'Proyección de Cobros', path: '/reports/projection',
          show: can('reports.projection') },
      ],
    },
    {
      label: 'CONFIGURACIÓN',
      items: [
        { icon: Settings,  label: 'General',           path: '/settings',              show: can('settings.general') },
        { icon: Package,   label: 'Productos',         path: '/settings/products',     show: can('settings.products') },
        { icon: Users2,    label: 'Usuarios',          path: '/settings/users',        show: can('settings.users') },
        { icon: MapPin,    label: 'Sucursales',        path: '/settings/branches',     show: can('settings.branches') },
        { icon: Landmark,  label: 'Cuentas Bancarias', path: '/settings/bank-accounts',show: can('settings.bank_accounts') },
        { icon: CreditCard,label: 'Mi Suscripción',   path: '/settings/subscription', show: true },
      ],
    },
    ...(isPlatformAdmin ? [{
      label: 'PLATAFORMA',
      items: [
        { icon: ShieldCheck, label: 'Admin Panel', path: '/admin', show: true },
      ],
    }] : []),
  ]

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/50 lg:hidden z-40" onClick={onClose} />}

      <aside className={cn(
        'fixed lg:relative lg:translate-x-0 h-screen w-60 bg-[#1e3a5f] text-white flex flex-col overflow-y-auto z-50 transition-transform duration-300',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-white">
              <span className="text-[#f59e0b]">Presta</span>Max
            </h1>
            <button onClick={onClose} className="lg:hidden p-1 hover:bg-white/10 rounded transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
          {state.user && (
            <p className="text-xs text-white/60 mt-2 truncate">{(state.user as any).fullName || (state.user as any).full_name || (state.user as any).email}</p>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter(i => i.show !== false)
            if (!visibleItems.length) return null
            return (
              <div key={group.label}>
                <div className="sidebar-link-group">{group.label}</div>
                {visibleItems.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.path)
                  return (
                    <button
                      key={item.path}
                      onClick={() => { navigate(item.path); onClose?.() }}
                      className={cn('sidebar-link w-full text-left', active && 'bg-white/15 text-white font-medium')}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/10 p-4 space-y-2">
          <button onClick={handleLogout} className="sidebar-link w-full text-left text-red-300 hover:text-red-200 hover:bg-red-600/20">
            <LogOut className="w-4 h-4" />
            <span>Cerrar sesión</span>
          </button>
          <p className="text-[10px] text-white/30 text-center leading-tight pt-1">
            JPRS Digital Connect
          </p>
        </div>
      </aside>
    </>
  )
}

export default Sidebar

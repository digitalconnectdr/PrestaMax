import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  BarChart3, Users, DollarSign, CreditCard, FileText, FileCheck,
  Truck, MessageCircle, Settings, Package, Users2, MapPin, BookOpen,
  ReceiptText, LogOut, ChevronLeft, ChevronRight, TrendingUp, Landmark, ShieldCheck, ClipboardList, Calculator, CalendarRange, Briefcase, HelpCircle, FileSpreadsheet
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermission } from '@/hooks/usePermission'
import { useT } from '@/lib/i18n'

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen = true, onClose }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const { state, logout } = useAuth()
  const { can, canAny } = usePermission()
  const t = useT()

  // Colapsar el menú a solo-iconos (desktop). Se persiste entre sesiones.
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    try { return localStorage.getItem('credytek_sidebar_collapsed') === '1' } catch { return false }
  })
  const toggleCollapsed = () => setCollapsed(prev => {
    const next = !prev
    try { localStorage.setItem('credytek_sidebar_collapsed', next ? '1' : '0') } catch {}
    return next
  })

  const isActive = (path: string) => {
    if (path === '/settings') return location.pathname === '/settings'
    return location.pathname.startsWith(path)
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // Acceso al panel de plataforma: el backend marca isPlatformAdmin SOLO para el
  // owner (por email) o staff de plataforma explícito. Los dueños de empresa
  // (rol de tenant 'admin') NO lo reciben.
  const isPlatformAdmin = (state.user as any)?.isPlatformAdmin === true

  const navGroups = [
    {
      label: t('navgroup.main'),
      items: [
        { icon: BarChart3, label: t('nav.dashboard'), path: '/dashboard', show: can('reports.dashboard') },
      ],
    },
    {
      label: t('navgroup.operations'),
      items: [
        { icon: Users,        label: t('nav.clients'),     path: '/clients',    show: can('clients.view') },
        { icon: DollarSign,   label: t('nav.loans'),       path: '/loans',      show: can('loans.view') },
        { icon: CreditCard,   label: t('nav.payments'),    path: '/payments',   show: can('payments.view') },
        // Recibos eliminado — funcionalidad integrada en Pagos (imprimir + WhatsApp)
        { icon: FileCheck,    label: t('nav.contracts'),   path: '/contracts',  show: can('contracts.view') },
        { icon: TrendingUp,   label: t('nav.income'),      path: '/income',     show: can('income.view') },
        { icon: Calculator,   label: t('nav.calculator'),  path: '/calculator', show: can('calculator.use') },
        { icon: BookOpen,     label: t('nav.templates'),   path: '/templates',  show: can('templates.view') },
        { icon: ClipboardList,label: t('nav.requests'),    path: '/requests',   show: can('requests.view') },
        { icon: Briefcase,    label: t('nav.investors'),   path: '/investors',  show: can('investors.view') },
      ],
    },
    {
      label: t('navgroup.collections'),
      items: [
        { icon: Truck,     label: t('nav.collections'), path: '/collections',          show: can('collections.view') },
        { icon: FileText,  label: t('nav.promises'),    path: '/collections/promises', show: can('collections.promises') },
      ],
    },
    {
      label: t('navgroup.communications'),
      items: [
        { icon: MessageCircle, label: t('nav.whatsapp'), path: '/whatsapp', show: can('whatsapp.view') },
      ],
    },
    {
      label: t('navgroup.analysis'),
      items: [
        { icon: BarChart3,     label: t('nav.reports'),     path: '/reports',
          show: canAny(['reports.portfolio','reports.mora','reports.collections','reports.advanced','reports.income']) },
        { icon: FileSpreadsheet,label: t('nav.accounting'), path: '/reports/accounting',     show: can('reports.dashboard') },
        { icon: CalendarRange, label: t('nav.projection'),  path: '/reports/projection',
          show: can('reports.projection') },
      ],
    },
    {
      label: t('navgroup.config'),
      items: [
        { icon: Settings,  label: t('nav.settings'),      path: '/settings',              show: can('settings.general') },
        { icon: Package,   label: t('nav.products'),      path: '/settings/products',     show: can('settings.products') },
        { icon: Users2,    label: t('nav.users'),         path: '/settings/users',        show: can('settings.users') },
        { icon: MapPin,    label: t('nav.branches'),      path: '/settings/branches',     show: can('settings.branches') },
        { icon: Landmark,  label: t('nav.bank_accounts'), path: '/settings/bank-accounts',show: can('settings.bank_accounts') },
        { icon: CreditCard,label: t('nav.subscription'),  path: '/settings/subscription', show: true },
      ],
    },
    {
      label: t('navgroup.help'),
      items: [
        { icon: HelpCircle, label: t('nav.help'), path: '/help', show: true },
      ],
    },
    ...(isPlatformAdmin ? [{
      label: t('navgroup.platform'),
      items: [
        { icon: ShieldCheck, label: t('nav.admin'), path: '/admin', show: true },
      ],
    }] : []),
  ]

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/50 lg:hidden z-40" onClick={onClose} />}

      <aside className={cn(
        'fixed lg:relative lg:translate-x-0 h-screen w-60 bg-[#1e3a5f] text-white flex flex-col overflow-y-auto z-50 transition-all duration-300',
        collapsed ? 'lg:w-[4.5rem]' : 'lg:w-60',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Header */}
        <div className={cn('border-b border-white/10 p-4', !collapsed && 'lg:p-6')}>
          <div className={cn('flex items-center', collapsed ? 'justify-between lg:justify-center' : 'justify-between')}>
            <h1 className={cn('text-xl font-bold text-white whitespace-nowrap', collapsed && 'lg:hidden')}>
              <span className="text-[#f59e0b]">Credy</span>Tek
            </h1>
            {/* Cerrar (móvil) */}
            <button onClick={onClose} className="lg:hidden p-1 hover:bg-white/10 rounded transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            {/* Contraer / expandir (desktop) */}
            <button
              onClick={toggleCollapsed}
              title={collapsed ? t('nav.expand') : t('nav.collapse')}
              aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
              className="hidden lg:flex p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            >
              {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            </button>
          </div>
          {state.user && (
            <p className={cn('text-xs text-white/60 mt-2 truncate', collapsed && 'lg:hidden')}>{(state.user as any).fullName || (state.user as any).full_name || (state.user as any).email}</p>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter(i => i.show !== false)
            if (!visibleItems.length) return null
            return (
              <div key={group.label}>
                <div className={cn('sidebar-link-group', collapsed && 'lg:hidden')}>{group.label}</div>
                {collapsed && <div className="hidden lg:block h-px bg-white/10 my-2 mx-2" />}
                {visibleItems.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.path)
                  return (
                    <button
                      key={item.path}
                      onClick={() => { navigate(item.path); onClose?.() }}
                      title={item.label}
                      className={cn('sidebar-link w-full text-left', collapsed && 'lg:justify-center lg:px-2', active && 'bg-white/15 text-white font-medium')}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className={cn(collapsed && 'lg:hidden')}>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/10 p-4 space-y-2">
          <button onClick={handleLogout} title={t('common.logout')} className={cn('sidebar-link w-full text-left text-red-300 hover:text-red-200 hover:bg-red-600/20', collapsed && 'lg:justify-center lg:px-2')}>
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span className={cn(collapsed && 'lg:hidden')}>{t('common.logout')}</span>
          </button>
          <p className={cn('text-[10px] text-white/30 text-center leading-tight pt-1', collapsed && 'lg:hidden')}>
            JPRS Digital Connect
          </p>
        </div>
      </aside>
    </>
  )
}

export default Sidebar

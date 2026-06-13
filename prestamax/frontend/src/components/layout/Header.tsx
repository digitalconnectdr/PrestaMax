import React, { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Menu, LogOut, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import NotificationBell from '@/components/shared/NotificationBell'
import GlobalSearch from '@/components/shared/GlobalSearch'
import LanguageSwitcher from '@/components/shared/LanguageSwitcher'
import { useT } from '@/lib/i18n'

interface HeaderProps {
  onMenuClick?: () => void
  title?: string
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, title }) => {
  const { state, logout } = useAuth()
  const navigate = useNavigate()
  const t = useT()
  const [searchOpen, setSearchOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // Atajo de teclado Ctrl+K / Cmd+K abre la busqueda global
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <>
      <header className="bg-white border-b border-slate-200 h-16 sticky top-0 z-40">
        <div className="h-full px-4 md:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {onMenuClick && (
              <button
                onClick={onMenuClick}
                className="lg:hidden p-2 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            {title && <h1 className="text-lg font-semibold text-slate-900 truncate">{title}</h1>}
          </div>

          {/* Buscador */}
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-500 transition w-72"
            title="Buscar (Ctrl+K)"
          >
            <Search className="w-4 h-4" />
            <span className="flex-1 text-left">{t('header.search_placeholder')}</span>
            <kbd className="text-[10px] bg-white border border-slate-200 rounded px-1.5 py-0.5 font-mono text-slate-500">⌘K</kbd>
          </button>
          {/* Solo icono en mobile */}
          <button
            onClick={() => setSearchOpen(true)}
            className="md:hidden p-2 hover:bg-slate-100 rounded-lg text-slate-600"
            title={t('common.search')}
            aria-label={t('common.search')}
          >
            <Search className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 flex-shrink-0">
            <LanguageSwitcher />
            <NotificationBell />
            <div className="hidden md:flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium text-slate-900">
                  {state.user?.firstName} {state.user?.lastName}
                </p>
                <p className="text-xs text-slate-500">{state.user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600 hover:text-slate-900"
                title={t('common.logout')}
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
            {/* Logout solo icono en mobile */}
            <button
              onClick={handleLogout}
              className="md:hidden p-2 hover:bg-slate-100 rounded-lg text-slate-600"
              title={t('common.logout')}
              aria-label={t('common.logout')}
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}

export default Header

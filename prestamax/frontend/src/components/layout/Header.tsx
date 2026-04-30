import React from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Menu, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import NotificationBell from '@/components/shared/NotificationBell'

interface HeaderProps {
  onMenuClick?: () => void
  title?: string
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, title }) => {
  const { state, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="bg-white border-b border-slate-200 h-16 sticky top-0 z-40">
      <div className="h-full px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          {title && <h1 className="text-lg font-semibold text-slate-900">{title}</h1>}
        </div>

        <div className="flex items-center gap-3">
          <NotificationBell />
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900">
                {state.user?.firstName} {state.user?.lastName}
              </p>
              <p className="text-xs text-slate-500">{state.user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600 hover:text-slate-900"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header

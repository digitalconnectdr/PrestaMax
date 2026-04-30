import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, CheckCheck, ClipboardList, CheckCircle2, X } from 'lucide-react'
import api from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  entityType: string | null
  entityId: string | null
  isRead: number
  createdAt: string
}

const POLL_INTERVAL = 30_000 // 30 seconds

const NotificationBell: React.FC = () => {
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // ── Poll unread count every 30 seconds ──────────────────────────────────────
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.get('/notifications/unread-count')
      setUnreadCount(res.data.count || 0)
    } catch { /* silencioso — no interrumpir flujo de trabajo */ }
  }, [])

  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchUnreadCount])

  // ── Close panel when clicking outside ───────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  // ── Load full notifications when panel opens ─────────────────────────────────
  const handleOpen = async () => {
    if (isOpen) { setIsOpen(false); return; }
    setIsOpen(true)
    setIsLoading(true)
    try {
      const res = await api.get('/notifications?limit=20')
      setNotifications(res.data.notifications || [])
      setUnreadCount(res.data.unread || 0)
    } catch { /* silencioso */ } finally {
      setIsLoading(false)
    }
  }

  const handleMarkRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: 1 } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch { /* silencioso */ }
  }

  const handleMarkAllRead = async () => {
    try {
      await api.patch('/notifications/read-all')
      setNotifications(prev => prev.map(n => ({ ...n, isRead: 1 })))
      setUnreadCount(0)
    } catch { /* silencioso */ }
  }

  const handleClickNotif = async (notif: Notification) => {
    if (!notif.isRead) await handleMarkRead(notif.id)
    if (notif.entityType === 'collection_task') {
      navigate('/collections')
      setIsOpen(false)
    }
  }

  const typeIcon = (type: string) => {
    if (type === 'task_assigned') return <ClipboardList className="w-4 h-4 text-blue-500" />
    if (type === 'task_completed') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />
    return <Bell className="w-4 h-4 text-slate-400" />
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-600 hover:text-slate-900"
        title="Notificaciones"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute right-0 top-12 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-600" />
              <span className="font-semibold text-sm text-slate-800">Notificaciones</span>
              {unreadCount > 0 && (
                <span className="bg-red-100 text-red-600 text-xs font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-200 transition-colors"
                  title="Marcar todas como leídas"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Leer todo
                </button>
              )}
              <button onClick={() => setIsOpen(false)} className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {isLoading ? (
              <div className="py-8 text-center text-slate-400 text-sm">Cargando...</div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Sin notificaciones</p>
              </div>
            ) : (
              notifications.map(notif => (
                <div
                  key={notif.id}
                  onClick={() => handleClickNotif(notif)}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-slate-50 cursor-pointer transition-colors hover:bg-slate-50 ${notif.isRead ? 'opacity-60' : 'bg-blue-50/30'}`}
                >
                  <div className="flex-shrink-0 mt-0.5">{typeIcon(notif.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold text-slate-800 leading-snug ${!notif.isRead ? 'font-bold' : ''}`}>{notif.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{notif.message}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{formatDate(notif.createdAt)}</p>
                  </div>
                  {!notif.isRead && (
                    <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
              <button
                onClick={() => { navigate('/collections'); setIsOpen(false); }}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Ver tareas de cobranza →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default NotificationBell

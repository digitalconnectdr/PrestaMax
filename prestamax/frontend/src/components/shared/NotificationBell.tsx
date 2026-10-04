import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Bell, CheckCheck, ClipboardList, CheckCircle2, X, MessageSquare, DollarSign, AlertTriangle,
  FileSignature, Ban, ShieldCheck, CalendarClock, CreditCard, Clock,
} from 'lucide-react'
import { format } from 'date-fns'
import { es, enUS, ptBR } from 'date-fns/locale'
import api from '@/lib/api'
import { useNavigate } from 'react-router-dom'
import { usePermission } from '@/hooks/usePermission'
import { useT, getLocale } from '@/lib/i18n'
import {
  AppNotification, PAGE_SIZE, POLL_INTERVAL_MS, shouldPoll, hasMore, mergePage,
  notificationLink, parseServerTimestamp,
} from '@/lib/notifications'

const DATE_LOCALES = { es, en: enUS, pt: ptBR } as const

// Fecha/hora en la zona del navegador del usuario (el timestamp del servidor es UTC).
function formatWhen(raw: string): string {
  const d = parseServerTimestamp(raw)
  if (!d) return '—'
  try { return format(d, 'dd/MM/yyyy HH:mm', { locale: DATE_LOCALES[getLocale()] || es }) } catch { return '—' }
}

const NotificationBell: React.FC = () => {
  const t = useT()
  const { can } = usePermission()
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [total, setTotal] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // ── Poll del contador (solo unread-count), solo con la pestaña visible ───────
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.get('/notifications/unread-count')
      setUnreadCount(res.data.count || 0)
    } catch { /* silencioso — el badge conserva el ultimo valor; no interrumpe el trabajo */ }
  }, [])

  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(() => {
      if (shouldPoll(document.hidden)) fetchUnreadCount()
    }, POLL_INTERVAL_MS)
    // Al volver a la pestaña: refresco inmediato.
    const onVisible = () => { if (shouldPoll(document.hidden)) fetchUnreadCount() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchUnreadCount])

  // ── Close panel when clicking outside / Escape ──────────────────────────────
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setIsOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false) }
    if (isOpen) {
      document.addEventListener('mousedown', onDown)
      document.addEventListener('keydown', onKey)
    }
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [isOpen])

  // ── Carga del listado (al abrir / reintentar) ───────────────────────────────
  const loadFirstPage = useCallback(async () => {
    setIsLoading(true)
    setLoadError(false)
    try {
      const res = await api.get(`/notifications?limit=${PAGE_SIZE}&offset=0`)
      setNotifications(res.data.notifications || [])
      setTotal(res.data.total || 0)
      setUnreadCount(res.data.unread || 0)
    } catch {
      setLoadError(true)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleOpen = () => {
    if (isOpen) { setIsOpen(false); return }
    setIsOpen(true)
    loadFirstPage()
  }

  const handleLoadMore = async () => {
    if (isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const res = await api.get(`/notifications?limit=${PAGE_SIZE}&offset=${notifications.length}`)
      setNotifications(prev => mergePage(prev, res.data.notifications || []))
      setTotal(res.data.total || 0)
      setUnreadCount(res.data.unread || 0)
    } catch {
      setLoadError(true)
    } finally {
      setIsLoadingMore(false)
    }
  }

  const handleMarkRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: 1 } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch { fetchUnreadCount() /* resincroniza el badge con el servidor */ }
  }

  const handleMarkAllRead = async () => {
    try {
      await api.patch('/notifications/read-all')
      setNotifications(prev => prev.map(n => ({ ...n, isRead: 1 })))
      setUnreadCount(0)
    } catch { fetchUnreadCount() }
  }

  const handleClickNotif = async (notif: AppNotification) => {
    if (!notif.isRead) await handleMarkRead(notif.id)
    const link = notificationLink(notif)
    if (link) {
      navigate(link)
      setIsOpen(false)
    }
  }

  const typeIcon = (type: string) => {
    switch (type) {
      case 'task_assigned': return <ClipboardList className="w-4 h-4 text-blue-500" aria-hidden="true" />
      case 'task_completed': return <CheckCircle2 className="w-4 h-4 text-emerald-500" aria-hidden="true" />
      case 'plan_inquiry': return <MessageSquare className="w-4 h-4 text-amber-500" aria-hidden="true" />
      case 'payment_received': return <DollarSign className="w-4 h-4 text-emerald-500" aria-hidden="true" />
      case 'payment_voided': return <Ban className="w-4 h-4 text-red-500" aria-hidden="true" />
      case 'loan_overdue': return <AlertTriangle className="w-4 h-4 text-red-500" aria-hidden="true" />
      case 'promise_overdue': return <CalendarClock className="w-4 h-4 text-orange-500" aria-hidden="true" />
      case 'manager_approval_pending': return <ShieldCheck className="w-4 h-4 text-indigo-500" aria-hidden="true" />
      case 'loan_request': return <FileSignature className="w-4 h-4 text-blue-500" aria-hidden="true" />
      case 'trial_expiring':
      case 'trial_expired': return <Clock className="w-4 h-4 text-amber-500" aria-hidden="true" />
      case 'payment_failed': return <CreditCard className="w-4 h-4 text-red-500" aria-hidden="true" />
      case 'subscription_activated':
      case 'subscription_renewed':
      case 'plan_changed':
      case 'subscription_cancelled': return <CreditCard className="w-4 h-4 text-blue-500" aria-hidden="true" />
      default: return <Bell className="w-4 h-4 text-slate-400" aria-hidden="true" />
    }
  }

  const badgeText = unreadCount > 99 ? '99+' : String(unreadCount)

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        type="button"
        onClick={handleOpen}
        className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-600 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        title={t('notif.title')}
        aria-label={unreadCount > 0 ? `${t('notif.bell_aria')}: ${badgeText} ${t('notif.unread_aria')}` : t('notif.bell_aria')}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <Bell className="w-5 h-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {badgeText}
          </span>
        )}
      </button>
      {/* Anuncio accesible de cambios en el contador */}
      <span className="sr-only" role="status" aria-live="polite">
        {unreadCount > 0 ? `${badgeText} ${t('notif.unread_aria')}` : ''}
      </span>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label={t('notif.title')}
          className="fixed sm:absolute right-2 sm:right-0 left-2 sm:left-auto top-16 sm:top-12 sm:w-80 max-w-[calc(100vw-1rem)] bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-600" aria-hidden="true" />
              <span className="font-semibold text-sm text-slate-800">{t('notif.title')}</span>
              {unreadCount > 0 && (
                <span className="bg-red-100 text-red-600 text-xs font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-200 transition-colors"
                  title={t('notif.mark_all_title')}
                >
                  <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  {t('notif.mark_all')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label={t('notif.close')}
                className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {isLoading ? (
              <div className="py-8 text-center text-slate-400 text-sm" role="status">{t('notif.loading')}</div>
            ) : loadError && notifications.length === 0 ? (
              <div className="py-8 px-4 text-center" role="alert">
                <p className="text-sm text-red-600">{t('notif.error')}</p>
                <button type="button" onClick={loadFirstPage} className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-800 underline">
                  {t('notif.retry')}
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" aria-hidden="true" />
                <p className="text-sm text-slate-400">{t('notif.empty')}</p>
              </div>
            ) : (
              <ul className="m-0 p-0 list-none">
                {notifications.map(notif => (
                  <li key={notif.id}>
                    <button
                      type="button"
                      onClick={() => handleClickNotif(notif)}
                      className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-slate-50 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-100 ${notif.isRead ? 'opacity-60' : 'bg-blue-50/30'}`}
                    >
                      <span className="flex-shrink-0 mt-0.5">{typeIcon(notif.type)}</span>
                      <span className="flex-1 min-w-0 block">
                        <span className={`block text-xs text-slate-800 leading-snug ${!notif.isRead ? 'font-bold' : 'font-semibold'}`}>{notif.title}</span>
                        <span className="block text-xs text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{notif.message}</span>
                        <span className="block text-[10px] text-slate-400 mt-1">{formatWhen(notif.createdAt)}</span>
                      </span>
                      {!notif.isRead && (
                        <>
                          <span className="sr-only">{t('notif.row_unread')}</span>
                          <span aria-hidden="true" className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                        </>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!isLoading && loadError && notifications.length > 0 && (
              <p className="px-4 py-2 text-xs text-red-600" role="alert">{t('notif.error')}</p>
            )}
            {!isLoading && hasMore(total, notifications.length) && (
              <div className="px-4 py-2 text-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                >
                  {isLoadingMore ? t('notif.loading_more') : t('notif.load_more')}
                </button>
              </div>
            )}
          </div>

          {/* Footer: solo con permiso efectivo de tareas de cobranza */}
          {notifications.length > 0 && can('collections.tasks') && (
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
              <button
                type="button"
                onClick={() => { navigate('/collections'); setIsOpen(false) }}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                {t('notif.go_tasks')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default NotificationBell

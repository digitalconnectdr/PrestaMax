// Logica pura de la campana de notificaciones (sin imports: testeable aislada).

export interface AppNotification {
  id: string
  type: string
  title: string
  message: string
  entityType: string | null
  entityId: string | null
  isRead: number
  createdAt: string
}

export const PAGE_SIZE = 20
/** Intervalo minimo del polling de unread-count. */
export const POLL_INTERVAL_MS = 60_000

/** El polling solo corre con la pestaña visible. */
export function shouldPoll(hidden: boolean): boolean {
  return !hidden
}

/** ¿Hay mas paginas por cargar? */
export function hasMore(total: number, loaded: number): boolean {
  return total > loaded
}

/** Une una pagina nueva a la lista actual sin duplicar ids (orden preservado). */
export function mergePage(prev: AppNotification[], next: AppNotification[]): AppNotification[] {
  const seen = new Set(prev.map(n => n.id))
  return [...prev, ...next.filter(n => !seen.has(n.id))]
}

/** Ruta destino de una notificacion segun su recurso (null = no clickeable). */
export function notificationLink(n: Pick<AppNotification, 'entityType' | 'entityId'>): string | null {
  switch (n.entityType) {
    case 'collection_task': return '/collections'
    case 'plan_inquiry': return '/admin?tab=inquiries'
    case 'loan': return n.entityId ? `/loans/${n.entityId}` : null
    case 'payment': return '/payments'
    case 'loan_request': return '/requests'
    case 'subscription': return '/settings/subscription'
    default: return null
  }
}

/**
 * Timestamps de SQLite ('YYYY-MM-DD HH:MM:SS', sin zona) estan en UTC: se leen como
 * UTC (no como hora local). ISO con zona / Date se respetan tal cual.
 */
export function parseServerTimestamp(raw: string | Date | null | undefined): Date | null {
  if (!raw) return null
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw
  const s = String(raw).trim()
  const naive = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)
  const d = new Date(naive ? s.replace(' ', 'T') + 'Z' : s)
  return isNaN(d.getTime()) ? null : d
}

// sentry — integracion ACTIVA con Sentry React
// Para deshabilitar: borrar VITE_SENTRY_DSN de las env vars (no se inicializa).
// Para volver a stub: revertir este archivo al commit a4c58fc.

import * as Sentry from '@sentry/react'

let initialized = false

export async function initSentry(): Promise<boolean> {
  const dsn = (import.meta as any).env?.VITE_SENTRY_DSN as string | undefined
  if (!dsn) {
    // Silencio en dev sin DSN
    return false
  }
  try {
    Sentry.init({
      dsn,
      environment: (import.meta as any).env?.MODE || 'development',
      release: (import.meta as any).env?.VITE_GIT_COMMIT || undefined,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection captured',
        'Network Error',
      ],
    })
    initialized = true
    console.log('[sentry] inicializado')
    return true
  } catch (e: any) {
    console.warn('[sentry] no se pudo inicializar:', e?.message || e)
    return false
  }
}

export function captureError(err: any, context?: { tenant_id?: string; user_id?: string; tag?: string }) {
  if (!initialized) return
  try {
    Sentry.withScope((scope) => {
      if (context?.tenant_id) scope.setTag('tenant_id', context.tenant_id)
      if (context?.user_id) scope.setUser({ id: context.user_id })
      if (context?.tag) scope.setTag('source', context.tag)
      Sentry.captureException(err)
    })
  } catch {}
}

export function setSentryUser(user: { id: string; tenant_id?: string }) {
  if (!initialized) return
  try {
    Sentry.setUser({ id: user.id })
    if (user.tenant_id) Sentry.setTag('tenant_id', user.tenant_id)
  } catch {}
}

export function clearSentryUser() {
  if (!initialized) return
  try { Sentry.setUser(null) } catch {}
}

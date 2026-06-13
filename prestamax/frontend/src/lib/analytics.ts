// ─── Google Analytics 4 (gtag) ───────────────────────────────────────────────
// Se activa SOLO si VITE_GA_ID está definido (formato G-XXXXXXXXXX) en el build
// de Vercel. Sin esa variable, todo es no-op (no carga nada, no rastrea).
// El Measurement ID de GA4 NO es secreto (queda expuesto en la página igual).

const GA_ID: string = (import.meta as any).env?.VITE_GA_ID || ''
let loaded = false

declare global {
  interface Window { dataLayer?: any[]; gtag?: (...args: any[]) => void }
}

export function isAnalyticsEnabled(): boolean {
  return !!GA_ID
}

/** Carga gtag.js una sola vez. Llamar al arrancar la app. */
export function initAnalytics(): void {
  if (!GA_ID || loaded || typeof document === 'undefined') return
  loaded = true
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
  document.head.appendChild(s)
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() { window.dataLayer!.push(arguments) }
  window.gtag('js', new Date())
  // send_page_view:false → enviamos las vistas manualmente en cada cambio de ruta
  // (la app es SPA y no recarga la página).
  window.gtag('config', GA_ID, { send_page_view: false })
}

/** Registra una vista de página (en cambios de ruta del SPA). */
export function trackPageView(path: string): void {
  if (!GA_ID || !window.gtag) return
  window.gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  })
}

/** Registra un evento personalizado (ej. clic en "Solicitar plan"). */
export function trackEvent(name: string, params?: Record<string, any>): void {
  if (!GA_ID || !window.gtag) return
  window.gtag('event', name, params || {})
}

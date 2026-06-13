// ─── Google Analytics 4 (gtag) ───────────────────────────────────────────────
// La etiqueta gtag.js se carga ESTÁTICAMENTE en index.html (<head>) — así la
// recolección de datos y la verificación de Search Console (método Google
// Analytics) funcionan de forma confiable. Aquí solo exponemos helpers que
// usan el window.gtag ya disponible: vistas de página del SPA y eventos.

declare global {
  interface Window { dataLayer?: any[]; gtag?: (...args: any[]) => void }
}

export function isAnalyticsEnabled(): boolean {
  return typeof window !== 'undefined' && typeof window.gtag === 'function'
}

/** Compatibilidad: el tag se carga en index.html, no hay que inicializar nada. */
export function initAnalytics(): void { /* no-op: gtag es estático en index.html */ }

/** Registra una vista de página (en cada cambio de ruta del SPA). */
export function trackPageView(path: string): void {
  if (!isAnalyticsEnabled()) return
  window.gtag!('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  })
}

/** Registra un evento personalizado (ej. clic en "Solicitar plan"). */
export function trackEvent(name: string, params?: Record<string, any>): void {
  if (!isAnalyticsEnabled()) return
  window.gtag!('event', name, params || {})
}

// ─── Google Analytics 4 (gtag) ───────────────────────────────────────────────
// La etiqueta gtag.js se carga ESTÁTICAMENTE en index.html (<head>) — así la
// recolección de datos y la verificación de Search Console (método Google
// Analytics) funcionan de forma confiable. Aquí solo exponemos helpers que
// usan el window.gtag ya disponible: vistas de página del SPA y eventos.
//
// ── Fase 1 Analytics (sep 2026) ──────────────────────────────────────────────
// Esto NO reemplaza GA4 (se deja intacto, ver abajo). Se agrega una capa
// CENTRAL y reutilizable para el funnel de adquisición: una sola función
// track() por la que pasan todos los eventos, en vez de dispersarlos por los
// componentes. Cada llamada hace 3 cosas (cada una independiente — si una
// falla, las otras dos siguen funcionando):
//   1. Envía a PostHog (si VITE_POSTHOG_KEY está configurada).
//   2. Envía a nuestro propio backend (/api/public/analytics-event) — de
//      primera parte, funciona aunque un adblocker bloquee PostHog.
//   3. (para trial_cta_click/plan_selected) también replica a GA4 vía
//      trackEvent(), reusando el mecanismo que ya existía.
// Nunca se incluyen PII: nombres, correos, teléfonos, montos, contratos, etc.
// (ver ALLOWED_EVENT_NAMES y stripPotentialPii en el backend, que además
// redactan como red de seguridad si algo se coló).
import { getVisitorId, getOrRotateSessionId, getAcquisitionContext } from '@/lib/visitor'
import { phCapture, phRegisterContext } from '@/lib/posthog'

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

/**
 * Registra una visita al landing en nuestra propia base de datos (geolocalizada
 * por IP en el backend) para el mapa de "Geografía" del Admin Panel.
 * Independiente de GA4: fire-and-forget, nunca debe afectar la carga de la página.
 */
export function trackLandingVisit(path: string): void {
  const base = apiBase()
  const ctx = getAcquisitionContext()
  fetch(`${base}/public/track-visit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path,
      visitor_id: getVisitorId(),
      session_id: getOrRotateSessionId(),
      page_url: window.location.href,
      webdriver: safeWebdriverFlag(),
      ...ctx,
    }),
    keepalive: true,
  }).catch(() => { /* silencioso: el tracking nunca debe romper la UX */ })
}

// ── Fase 1: capa central del funnel de adquisición ──────────────────────────

function apiBase(): string {
  return (import.meta as any).env?.VITE_API_URL || '/api'
}

function safeWebdriverFlag(): boolean {
  try { return navigator.webdriver === true } catch { return false }
}

export type FunnelEventName =
  | 'landing_view' | 'pricing_view' | 'trial_cta_click' | 'signup_started'
  | 'signup_completed' | 'trial_activated' | 'billing_toggle_changed'
  | 'plan_selected' | 'whatsapp_click' | 'section_view'
  | 'scroll_25' | 'scroll_50' | 'scroll_75' | 'scroll_90' | 'scroll_100'
  // Fase 3 — activación + checkout/suscripción
  | 'onboarding_started' | 'first_client_created' | 'first_loan_created'
  | 'first_payment_created' | 'activation_completed' | 'checkout_started'
  | 'subscription_started'
  // Fase 4 — SEO / Centro de Recursos / calculadora pública
  | 'resource_view' | 'seo_cta_click' | 'calculator_used'

export interface FunnelEventProps {
  cta_location?: string
  plan?: string
  billing_period?: string
  scroll_depth?: number
  section?: string
  [key: string]: string | number | boolean | undefined
}

/**
 * Punto de entrada ÚNICO para instrumentar el funnel de adquisición. Adjunta
 * automáticamente contexto estándar (pathname, visitor_id, session_id, UTM,
 * referrer) y reparte el evento a PostHog + nuestro propio backend. No incluye
 * device_type/country manualmente: PostHog los infiere del lado servidor por
 * IP/User-Agent al ingerir el evento, y nuestro backend hace lo mismo para
 * analytics_events — evita duplicar esa lógica en el cliente.
 */
export function track(event: FunnelEventName, properties: FunnelEventProps = {}): void {
  const visitorId = getVisitorId()
  const sessionId = getOrRotateSessionId()
  const ctx = getAcquisitionContext()
  const fullProps = {
    page: window.location.pathname + window.location.search,
    pathname: window.location.pathname,
    anonymous_visitor_id: visitorId,
    session_id: sessionId,
    referrer: ctx.referrer,
    utm_source: ctx.utm_source || undefined,
    utm_medium: ctx.utm_medium || undefined,
    utm_campaign: ctx.utm_campaign || undefined,
    utm_term: ctx.utm_term || undefined,
    utm_content: ctx.utm_content || undefined,
    ...properties,
  }

  phCapture(event, fullProps)

  try {
    fetch(`${apiBase()}/public/analytics-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        path: window.location.pathname,
        visitor_id: visitorId,
        session_id: sessionId,
        page_url: window.location.href,
        webdriver: safeWebdriverFlag(),
        referrer: ctx.referrer,
        utm_source: ctx.utm_source,
        utm_medium: ctx.utm_medium,
        utm_campaign: ctx.utm_campaign,
        utm_term: ctx.utm_term,
        utm_content: ctx.utm_content,
        properties,
      }),
      keepalive: true,
    }).catch(() => { /* noop */ })
  } catch { /* noop */ }
}

/** Registra visitor_id/session_id en PostHog como super-properties (llamar una vez al iniciar). */
export function registerAnalyticsContext(): void {
  try {
    phRegisterContext({
      anonymous_visitor_id: getVisitorId(),
      session_id: getOrRotateSessionId(),
    })
  } catch { /* noop */ }
}

// ── Helpers específicos por evento (evita repetir nombres de propiedades) ───

const CTA_LOCATIONS = ['hero', 'benefits', 'features', 'pricing', 'final', 'nav', 'nav_mobile'] as const
export type CtaLocation = typeof CTA_LOCATIONS[number]

/** trial_cta_click — distingue SIEMPRE dónde ocurrió el clic (hero/benefits/features/pricing/final, o nav/nav_mobile para los CTAs del header que también existen hoy). */
export function trackTrialCtaClick(location: CtaLocation, extra: FunnelEventProps = {}): void {
  track('trial_cta_click', { cta_location: location, ...extra })
}

export function trackPlanSelected(plan: string, billingPeriod?: string): void {
  track('plan_selected', { plan, billing_period: billingPeriod })
}

export function trackBillingToggleChanged(billingPeriod: string): void {
  track('billing_toggle_changed', { billing_period: billingPeriod })
}

/** No hay un botón de WhatsApp en las páginas públicas actualmente — este helper
 * queda listo para cuando se agregue uno (ver reporte de Fase 1). */
export function trackWhatsAppClick(location: string): void {
  track('whatsapp_click', { cta_location: location })
}

export function trackSignupStarted(): void {
  track('signup_started')
}

export function trackSignupCompleted(plan: string): void {
  track('signup_completed', { plan })
}

export function trackTrialActivated(plan: string): void {
  track('trial_activated', { plan })
}

export function trackSectionView(section: string): void {
  track('section_view', { section })
}

export function trackScrollDepth(depth: 25 | 50 | 75 | 90 | 100): void {
  track(`scroll_${depth}` as FunnelEventName, { scroll_depth: depth })
}

// ── Fase 3: activación (checklist post-signup) + checkout/suscripción ───────
// Todos idempotentes desde el punto de vista de quien los llama: el backend
// (no localStorage) decide si el hito realmente es "el primero" o si la
// cuenta "se activó", y devuelve esa verdad en la respuesta de la creación
// (is_first_client/is_first_loan/is_first_payment/activation_completed). El
// frontend solo dispara el evento cuando esa bandera viene en true — nunca
// deriva el estado por su cuenta. Ninguno de estos eventos lleva PII, montos,
// ni identificadores de negocio (cliente, préstamo, contrato): solo el hecho
// de que ocurrieron.

export function trackOnboardingStarted(daysRemaining?: number): void {
  track('onboarding_started', daysRemaining != null ? { days_remaining: daysRemaining } : {})
}

export function trackFirstClientCreated(): void {
  track('first_client_created')
}

export function trackFirstLoanCreated(): void {
  track('first_loan_created')
}

export function trackFirstPaymentCreated(): void {
  track('first_payment_created')
}

export function trackActivationCompleted(): void {
  track('activation_completed')
}

export function trackCheckoutStarted(plan: string, billingPeriod: string, ctaLocation?: string): void {
  track('checkout_started', { plan, billing_period: billingPeriod, cta_location: ctaLocation })
}

// ── Fase 4: SEO / Centro de Recursos / calculadora pública ──────────────────
// content_type distingue artículo de recursos vs. página SEO comercial, para
// poder atribuir después qué tipo de contenido genera más trials.
export type ContentType = 'article' | 'seo_page' | 'resources_index'

export function trackResourceView(contentSlug: string, contentType: ContentType): void {
  track('resource_view', { content_slug: contentSlug, content_type: contentType })
}

export function trackSeoCtaClick(contentSlug: string, ctaLocation: string): void {
  track('seo_cta_click', { content_slug: contentSlug, cta_location: ctaLocation })
}

/** No enviar los valores que el usuario tipeó (monto/tasa/plazo) — solo que se usó la herramienta. */
export function trackCalculatorUsed(toolName: 'loan_calculator'): void {
  track('calculator_used', { tool_name: toolName })
}

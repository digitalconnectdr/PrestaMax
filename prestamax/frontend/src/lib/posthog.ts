// ─────────────────────────────────────────────────────────────────────────────
// posthog.ts — wrapper delgado sobre posthog-js. Herramienta PRINCIPAL de
// producto/funnel analytics (ver reporte de Fase 1). Solo se inicializa en
// rutas publicas de adquisicion (ver frontend/src/lib/routeSensitivity.ts) —
// nunca en el dashboard autenticado ni en /apply/:token.
//
// El paquete se importa DINAMICAMENTE (import() en vez de import estatico) a
// proposito: App.tsx no es lazy (es el entry point), asi que un import
// estatico metería posthog-js en el bundle principal para TODA carga de la
// app, incluyendo el dashboard autenticado donde nunca se usa. Con import()
// queda en su propio chunk, que solo se descarga la primera vez que se llama
// a initPostHog() desde una ruta publica.
//
// Nunca debe romper la app: toda llamada a la API de posthog-js va en
// try/catch, y si falta la clave publica (VITE_POSTHOG_KEY) o el script no
// carga (ad-blocker), las funciones de este archivo son no-ops silenciosos.
// ─────────────────────────────────────────────────────────────────────────────
type PostHogModule = typeof import('posthog-js')['default']

let phInstance: PostHogModule | null = null;
let initPromise: Promise<void> | null = null;
let optedOut = false;
// Cola para eventos disparados ANTES de que termine de cargar el chunk de
// posthog-js (ej. landing_view, que se dispara en el mismo tick que
// initPostHog()) — sin esto se perderían silenciosamente en PostHog (aunque
// no en nuestro propio /analytics-event, que no depende de este chunk).
let pendingCaptures: { event: string; properties?: Record<string, any> }[] = [];
let pendingContext: Record<string, any> = {};

function env(key: string): string | undefined {
  return (import.meta as any).env?.[key];
}

export function isPostHogConfigured(): boolean {
  return !!env('VITE_POSTHOG_KEY');
}

/** Inicializa posthog-js (idempotente: llamar varias veces es seguro). Carga el SDK en un chunk aparte. */
export function initPostHog(): void {
  if (!isPostHogConfigured() || initPromise) return;
  initPromise = import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(env('VITE_POSTHOG_KEY')!, {
        api_host: env('VITE_POSTHOG_HOST') || 'https://us.i.posthog.com',
        autocapture: false,          // solo eventos explicitos — evita capturar clicks/inputs arbitrarios
        capture_pageview: false,     // los pageviews los mandamos nosotros (landing_view) para no duplicar
        capture_pageleave: false,
        disable_session_recording: true, // Fase 1 no incluye session replay
        persistence: 'localStorage',
      });
      phInstance = posthog;
      if (Object.keys(pendingContext).length > 0) { try { posthog.register(pendingContext); } catch { /* noop */ } }
      if (optedOut) {
        posthog.opt_out_capturing();
      } else {
        for (const { event, properties } of pendingCaptures) {
          try { posthog.capture(event, properties); } catch { /* noop */ }
        }
      }
      pendingCaptures = [];
    })
    .catch(() => { /* noop: red bloqueada, ad-blocker, etc. */ });
}

/** Registra visitor_id/session_id como super-properties (se adjuntan a todo evento). */
export function phRegisterContext(props: Record<string, any>): void {
  if (!phInstance) { pendingContext = { ...pendingContext, ...props }; return; }
  try { phInstance.register(props); } catch { /* noop */ }
}

export function phCapture(event: string, properties?: Record<string, any>): void {
  if (optedOut) return;
  if (!phInstance) { pendingCaptures.push({ event, properties }); return; }
  try { phInstance.capture(event, properties); } catch { /* noop */ }
}

/** Pausa el envio de eventos sin desmontar el script (usado al navegar a rutas sensibles). */
export function phPause(): void {
  optedOut = true;
  try { phInstance?.opt_out_capturing(); } catch { /* noop */ }
}

/** Reanuda el envio de eventos (usado al volver a una ruta publica). */
export function phResume(): void {
  optedOut = false;
  try { phInstance?.opt_in_capturing(); } catch { /* noop */ }
}

// sentry — integracion opt-in con Sentry para tracking de errores en backend.
// Si SENTRY_DSN no esta definida en env vars, este modulo es un no-op
// (no hace nada, no rompe nada). Esto permite desarrollarlo localmente
// sin Sentry y activarlo solo en produccion via Render env vars.

let SentryLib: any = null;
let initialized = false;

export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('[sentry] SENTRY_DSN no definida — Sentry deshabilitado');
    return false;
  }

  try {
    // Lazy require para que el bundle local no requiera la dependencia
    // si no se va a usar (evita 'cannot find module' en dev).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    SentryLib = require('@sentry/node');
    SentryLib.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.RENDER_GIT_COMMIT || undefined,
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES || '0.1'),
      // No enviar datos sensibles
      sendDefaultPii: false,
      // Ignora errores 4xx (no nuestra culpa) por defecto
      beforeSend(event: any, hint: any) {
        const status = hint?.originalException?.status || hint?.originalException?.statusCode;
        if (status && status < 500) return null;
        return event;
      },
    });
    initialized = true;
    console.log('[sentry] inicializado para entorno:', process.env.NODE_ENV);
    return true;
  } catch (e: any) {
    console.warn('[sentry] no se pudo inicializar:', e?.message || e);
    return false;
  }
}

// Captura un error manualmente desde un endpoint o servicio
export function captureError(err: any, context?: { tenant_id?: string; user_id?: string; tag?: string }) {
  if (!initialized || !SentryLib) return;
  try {
    SentryLib.withScope((scope: any) => {
      if (context?.tenant_id) scope.setTag('tenant_id', context.tenant_id);
      if (context?.user_id) scope.setUser({ id: context.user_id });
      if (context?.tag) scope.setTag('source', context.tag);
      SentryLib.captureException(err);
    });
  } catch {}
}

// Middleware Express para wrap automatico de req/res
export function sentryRequestHandler() {
  if (!initialized || !SentryLib?.Handlers) return (_req: any, _res: any, next: any) => next();
  return SentryLib.Handlers.requestHandler();
}

export function sentryErrorHandler() {
  if (!initialized || !SentryLib?.Handlers) return (_err: any, _req: any, _res: any, next: any) => next(_err);
  return SentryLib.Handlers.errorHandler({
    shouldHandleError(error: any) {
      const status = error?.status || error?.statusCode || 500;
      return status >= 500;
    },
  });
}

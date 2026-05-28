// sentry — integracion opt-in con Sentry React.
// Si VITE_SENTRY_DSN no esta definida en .env, este modulo es no-op.
// Activar en produccion seteando VITE_SENTRY_DSN en Vercel env vars.

let SentryLib: any = null;
let initialized = false;

export async function initSentry(): Promise<boolean> {
  const dsn = (import.meta as any).env?.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    // Silencioso en dev — no contamines logs
    return false;
  }

  try {
    // @ts-ignore — opcional, instalar 'npm i @sentry/react' solo cuando se vaya a activar
    SentryLib = await import('@sentry/react');
    SentryLib.init({
      dsn,
      environment: (import.meta as any).env?.MODE || 'development',
      release: (import.meta as any).env?.VITE_GIT_COMMIT || undefined,
      tracesSampleRate: 0.1,
      // No enviar PII por defecto
      sendDefaultPii: false,
      // Ignora errores no actionables comunes
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection captured',
        'Network Error',  // ya manejado por axios interceptor
      ],
    });
    initialized = true;
    console.log('[sentry] inicializado');
    return true;
  } catch (e: any) {
    console.warn('[sentry] no se pudo inicializar:', e?.message || e);
    return false;
  }
}

// Para capturar errores manuales desde componentes
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

// Setear user despues del login (para correlacionar errores con tenant/user)
export function setSentryUser(user: { id: string; tenant_id?: string }) {
  if (!initialized || !SentryLib) return;
  try {
    SentryLib.setUser({ id: user.id });
    if (user.tenant_id) SentryLib.setTag('tenant_id', user.tenant_id);
  } catch {}
}

export function clearSentryUser() {
  if (!initialized || !SentryLib) return;
  try { SentryLib.setUser(null); } catch {}
}

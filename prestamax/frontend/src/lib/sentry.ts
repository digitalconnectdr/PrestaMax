// sentry — STUB en frontend
//
// Sentry React requiere que el bundler resuelva '@sentry/react' en build time.
// Si el modulo no esta instalado, el build de Vite/Rollup falla.
// Por eso este archivo es un STUB por defecto: no hace nada.
//
// PARA ACTIVAR SENTRY en frontend:
//   1. npm install @sentry/react
//   2. Reemplaza el contenido de este archivo con el snippet en SENTRY_SETUP.md
//      seccion "Activacion del frontend"
//   3. Configura VITE_SENTRY_DSN en Vercel env vars
//   4. Re-deploy
//
// El backend SI esta activo siempre (require dinamico que no rompe el build de Node).

export async function initSentry(): Promise<boolean> {
  return false;
}

export function captureError(_err: any, _context?: { tenant_id?: string; user_id?: string; tag?: string }) {
  // no-op
}

export function setSentryUser(_user: { id: string; tenant_id?: string }) {
  // no-op
}

export function clearSentryUser() {
  // no-op
}

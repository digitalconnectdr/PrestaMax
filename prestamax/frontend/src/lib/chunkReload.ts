// Recuperación ante "pantalla en blanco": tras un despliegue, una pestaña abierta (o un index.html en caché) puede pedir
// un archivo con hash que ya no existe → el import() dinámico falla. Sin red de seguridad, React desmonta todo y queda
// la pantalla en blanco hasta que el usuario recarga a mano. Aquí se detecta ese error y se recarga UNA vez sola.

const KEY = 'credytek_chunk_reload_at'
const WINDOW_MS = 30_000   // si ya se recargó hace menos de esto y vuelve a fallar, no se entra en bucle

/** ¿El error es un fallo al cargar un módulo/chunk (despliegue nuevo, red caída a media carga)? */
export function isChunkLoadError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? '')
  const name = String((err as any)?.name ?? '')
  return name === 'ChunkLoadError'
    || /Failed to fetch dynamically imported module/i.test(msg)
    || /error loading dynamically imported module/i.test(msg)
    || /Importing a module script failed/i.test(msg)
    || /Loading chunk [\w-]+ failed/i.test(msg)
    || /Loading CSS chunk/i.test(msg)
    || /Unable to preload CSS/i.test(msg)
    || /is not a valid JavaScript MIME type/i.test(msg)   // el rewrite devolvió index.html en lugar del .js
}

/** Recarga la página una sola vez en la ventana de seguridad. Devuelve true si disparó la recarga. */
export function reloadOnceForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (last && Date.now() - last < WINDOW_MS) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch { /* sessionStorage no disponible: se recarga igual una vez por carga de página */ }
  window.location.reload()
  return true
}

/** Registra el evento de Vite (preload fallido) y los rechazos de import() no capturados. Idempotente. */
let installed = false
export function installChunkErrorRecovery(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('vite:preloadError', (e: Event) => {
    e.preventDefault()
    reloadOnceForNewVersion()
  })
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    if (isChunkLoadError(e.reason)) { e.preventDefault(); reloadOnceForNewVersion() }
  })
}

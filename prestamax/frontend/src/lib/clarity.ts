// ─────────────────────────────────────────────────────────────────────────────
// clarity.ts — Microsoft Clarity, cargado SOLO en paginas publicas de
// adquisicion (landing, precios, registro, login, contacto). Se inyecta el
// script oficial dinamicamente (sin paquete npm — igual que SheetJS en
// ReportsPage.tsx) para poder decidir en runtime, por ruta, si se carga o no,
// y para poder pausarlo si el usuario navega a una ruta sensible dentro de la
// misma pestaña sin recargar.
//
// Masking: los formularios de login/registro/recuperar-contraseña llevan la
// clase "clarity-mask" en sus inputs (ver esas paginas) para que Clarity
// jamas capture lo que el usuario escribe ahi, sin depender solo de la
// configuracion del proyecto en el dashboard de Clarity.
// ─────────────────────────────────────────────────────────────────────────────
declare global {
  interface Window { clarity?: (...args: any[]) => void; }
}

let injected = false;

function env(key: string): string | undefined {
  return (import.meta as any).env?.[key];
}

export function isClarityConfigured(): boolean {
  return !!env('VITE_CLARITY_PROJECT_ID');
}

/** Inyecta el script de Clarity (idempotente). No-op si falta el project id. */
export function initClarity(): void {
  if (!isClarityConfigured() || injected) return;
  try {
    const projectId = env('VITE_CLARITY_PROJECT_ID');
    (function (c: any, l: Document, a: string, r: string, i: string) {
      c[a] = c[a] || function (...args: any[]) { (c[a].q = c[a].q || []).push(args); };
      const t = l.createElement(r) as HTMLScriptElement;
      t.async = true;
      t.src = 'https://www.clarity.ms/tag/' + i;
      const y = l.getElementsByTagName(r)[0];
      y.parentNode?.insertBefore(t, y);
    })(window, document, 'clarity', 'script', projectId!);
    injected = true;
  } catch { /* nunca debe romper la app si Clarity falla en cargar */ }
}

/** Pausa la grabacion (usado al navegar a una ruta sensible sin recargar la pestaña). */
export function clarityPause(): void {
  if (!isClarityConfigured()) return;
  try { window.clarity?.('stop'); } catch { /* noop */ }
}

/** Reanuda la grabacion (usado al volver a una ruta publica). */
export function clarityResume(): void {
  if (!isClarityConfigured()) return;
  try { window.clarity?.('start'); } catch { /* noop */ }
}

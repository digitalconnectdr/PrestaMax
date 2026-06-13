// ─── SEO por ruta (SPA) ───────────────────────────────────────────────────────
// La app comparte un solo index.html. El landing y las páginas legales son
// indexables; TODO lo demás (app privada) se marca noindex dinámicamente.
// robots.txt es el guardia a nivel de crawler; esto es defensa en profundidad
// para crawlers que ejecutan JS (Googlebot).

// Rutas públicas indexables (todo lo demás → noindex)
const PUBLIC_INDEXABLE = new Set<string>(['/', '/terms', '/privacy', '/contact'])

function setMetaRobots(content: string) {
  let el = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', 'robots')
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

/** Ajusta robots (index/noindex) según la ruta actual. */
export function applyRouteSeo(pathname: string): void {
  if (typeof document === 'undefined') return
  const indexable = PUBLIC_INDEXABLE.has(pathname)
  setMetaRobots(indexable ? 'index, follow' : 'noindex, nofollow')
}

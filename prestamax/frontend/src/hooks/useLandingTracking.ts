// ─────────────────────────────────────────────────────────────────────────────
// useLandingTracking — instrumentación de comportamiento del landing:
// profundidad de scroll (25/50/75/90/100%) y visibilidad de las secciones
// principales (Hero, Beneficios, Cómo funciona, Funcionalidades, Precios,
// FAQ, CTA final). Un solo hook, montado una vez en LandingPage.
//
// La sección "pricing" además dispara el evento nombrado pricing_view (ya que
// Precios es un ancla dentro de la misma página, no una ruta aparte — "verla"
// significa que el usuario la hizo visible en el viewport, vía IntersectionObserver).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from 'react'
import { track, trackScrollDepth, trackSectionView } from '@/lib/analytics'

const SCROLL_THRESHOLDS = [25, 50, 75, 90, 100] as const

export const LANDING_SECTION_IDS = ['hero', 'benefits', 'how-it-works', 'features', 'pricing', 'faq', 'cta-final']

export function useLandingTracking(): void {
  // Scroll depth
  useEffect(() => {
    const fired = new Set<number>()
    let ticking = false

    const measure = () => {
      ticking = false
      const scrollTop = window.scrollY || document.documentElement.scrollTop
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      if (docHeight <= 0) return
      const pct = Math.min(100, Math.round((scrollTop / docHeight) * 100))
      for (const threshold of SCROLL_THRESHOLDS) {
        if (pct >= threshold && !fired.has(threshold)) {
          fired.add(threshold)
          trackScrollDepth(threshold)
        }
      }
    }

    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(measure)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    measure() // cubre el caso raro de que la página ya cargue con scroll (ej. deep link con #hash)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Visibilidad de secciones
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const seen = new Set<string>()
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = entry.target.id
        if (entry.isIntersecting && id && !seen.has(id)) {
          seen.add(id)
          trackSectionView(id)
          if (id === 'pricing') track('pricing_view')
        }
      }
    }, { threshold: 0.4 })

    const elements: Element[] = []
    for (const id of LANDING_SECTION_IDS) {
      const el = document.getElementById(id)
      if (el) { observer.observe(el); elements.push(el) }
    }
    return () => { elements.forEach(el => observer.unobserve(el)); observer.disconnect() }
  }, [])
}

// SeoHead — inyecta title/description/canonical/OG/JSON-LD por página.
// La app es una SPA (un solo index.html, rewrite total en vercel.json), así
// que esto es lo que distingue una página SEO de otra para un crawler que
// ejecuta JavaScript (Googlebot, según la auditoría de Fase 1). No resuelve
// indexación para crawlers que NO ejecutan JS — ver el reporte de Fase 4.
import { useEffect } from 'react'
import { SITE_URL } from '@/lib/site'

const SITE = SITE_URL

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertCanonical(href: string) {
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

const JSONLD_ID = 'seo-head-jsonld'

export interface SeoHeadProps {
  title: string
  description: string
  /** Ruta absoluta desde la raíz, ej. '/recursos/como-llevar-control-de-prestamos' */
  path: string
  /** Objeto(s) JSON-LD (Article, BreadcrumbList, etc.) — se serializan tal cual. */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[]
}

/** Monta una sola vez por página; actualiza <head> y lo revierte al desmontar. */
export default function SeoHead({ title, description, path, jsonLd }: SeoHeadProps): null {
  useEffect(() => {
    const prevTitle = document.title
    const canonicalUrl = `${SITE}${path}`
    document.title = title
    upsertMeta('name', 'description', description)
    upsertCanonical(canonicalUrl)
    upsertMeta('property', 'og:title', title)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', canonicalUrl)
    upsertMeta('property', 'og:type', 'website')
    upsertMeta('name', 'twitter:title', title)
    upsertMeta('name', 'twitter:description', description)

    let script: HTMLScriptElement | null = null
    if (jsonLd) {
      script = document.getElementById(JSONLD_ID) as HTMLScriptElement | null
      if (!script) {
        script = document.createElement('script')
        script.id = JSONLD_ID
        script.type = 'application/ld+json'
        document.head.appendChild(script)
      }
      script.textContent = JSON.stringify(jsonLd)
    }

    return () => {
      document.title = prevTitle
      const s = document.getElementById(JSONLD_ID)
      if (s) s.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, path, JSON.stringify(jsonLd)])

  return null
}

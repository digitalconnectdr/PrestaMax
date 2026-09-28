// SeoLandingPage — plantilla genérica para las páginas SEO comerciales. Cada
// ruta (/software-para-prestamistas, etc.) renderiza este mismo componente
// con un `slug` distinto; el contenido sale de lib/seoContent.ts. Agregar una
// página nueva no requiere un componente nuevo, solo una entrada en el
// registro + una línea de ruta en App.tsx.
import React, { useEffect } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import { ArrowRight, X, Check } from 'lucide-react'
import PublicShell from '@/components/public/PublicShell'
import SeoHead from '@/components/public/SeoHead'
import { getSeoPageBySlug } from '@/lib/seoContent'
import { ARTICLES } from '@/lib/resources'
import { trackResourceView, trackSeoCtaClick } from '@/lib/analytics'

const SeoLandingPage: React.FC<{ slug: string }> = ({ slug }) => {
  const navigate = useNavigate()
  const page = getSeoPageBySlug(slug)

  useEffect(() => { window.scrollTo(0, 0) }, [slug])
  useEffect(() => { if (page) trackResourceView(page.slug, 'seo_page') }, [page])

  if (!page) return <Navigate to="/" replace />

  const goTry = (location: string) => {
    trackSeoCtaClick(page.slug, location)
    navigate('/register')
  }

  return (
    <PublicShell>
      <SeoHead title={page.metaTitle} description={page.metaDescription} path={`/${page.slug}`} />

      {/* Hero */}
      <section className="bg-gradient-to-b from-slate-50 to-white py-14 md:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl md:text-5xl font-bold text-slate-900 leading-tight">{page.h1}</h1>
          {page.intro.map((p, i) => (
            <p key={i} className="mt-5 text-lg text-slate-600 max-w-2xl mx-auto">{p}</p>
          ))}
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={() => goTry('seo_hero')}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#1e3a5f] text-white font-medium rounded-lg hover:bg-[#152a45] transition shadow-lg shadow-[#1e3a5f]/20"
            >
              Probar CredyTek
              <ArrowRight className="w-4 h-4" />
            </button>
            <Link
              to="/calculadora-prestamos"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-slate-700 font-medium rounded-lg border border-slate-300 hover:bg-slate-50 transition"
            >
              Probar la calculadora
            </Link>
          </div>
        </div>
      </section>

      {/* Problema */}
      <section className="py-14 md:py-16 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 text-center">{page.problemHeading}</h2>
          <ul className="mt-8 space-y-3 max-w-xl mx-auto">
            {page.problemItems.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-slate-700">
                <X className="w-4 h-4 text-red-400 flex-shrink-0 mt-1" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Solución */}
      <section className="py-14 md:py-16 bg-slate-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 text-center">{page.solutionHeading}</h2>
          <p className="mt-3 text-center text-slate-600 max-w-2xl mx-auto">{page.solutionIntro}</p>
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {page.solutionItems.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-5 bg-white rounded-xl border border-slate-200">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <Check className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-1 text-sm text-slate-600 leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recursos relacionados */}
      {page.relatedArticleSlugs.length > 0 && (
        <section className="py-12 md:py-14 bg-white border-t border-slate-100">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-4">Guías relacionadas</h2>
            <ul className="space-y-2">
              {page.relatedArticleSlugs.map(rs => {
                const rel = ARTICLES.find(a => a.slug === rs)
                if (!rel) return null
                return (
                  <li key={rs}>
                    <Link to={`/recursos/${rs}`} className="text-[#1e3a5f] font-medium hover:underline">
                      {rel.title} →
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      )}

      {/* CTA final */}
      <section className="py-16 md:py-20 bg-gradient-to-br from-[#1e3a5f] to-[#152a45]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white">{page.ctaFinalTitle}</h2>
          <p className="mt-3 text-blue-100">{page.ctaFinalText}</p>
          <button
            type="button"
            onClick={() => goTry('seo_final')}
            className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-white text-[#1e3a5f] font-semibold rounded-lg hover:bg-slate-50 transition"
          >
            Probar CredyTek
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>
    </PublicShell>
  )
}

export default SeoLandingPage

// ResourcesIndexPage — /recursos. Lista los artículos desde lib/resources.ts.
// Agregar un artículo nuevo a ese archivo lo hace aparecer aquí automáticamente.
import React, { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpen } from 'lucide-react'
import PublicShell from '@/components/public/PublicShell'
import SeoHead from '@/components/public/SeoHead'
import { ARTICLES } from '@/lib/resources'
import { trackResourceView, trackSeoCtaClick } from '@/lib/analytics'

const ResourcesIndexPage: React.FC = () => {
  const navigate = useNavigate()
  useEffect(() => { window.scrollTo(0, 0) }, [])
  useEffect(() => { trackResourceView('recursos', 'resources_index') }, [])

  const goTry = () => {
    trackSeoCtaClick('recursos', 'resources_index_final')
    navigate('/register')
  }

  return (
    <PublicShell>
      <SeoHead
        title="Centro de recursos para prestamistas | CredyTek"
        description="Guías prácticas sobre administración de préstamos, cartera y cobranza para prestamistas en República Dominicana."
        path="/recursos"
      />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs font-medium text-amber-700 mb-4">
            <BookOpen className="w-3.5 h-3.5" />
            Centro de recursos
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900">Guías para administrar tu operación de préstamos</h1>
          <p className="mt-4 text-lg text-slate-600">
            Contenido práctico sobre control de préstamos, organización de cartera y cobranza, pensado para prestamistas en República Dominicana.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          {ARTICLES.map(article => (
            <Link
              key={article.slug}
              to={`/recursos/${article.slug}`}
              className="flex flex-col p-6 bg-white rounded-xl border border-slate-200 hover:border-[#1e3a5f]/40 hover:shadow-md transition-all"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-[#f59e0b]">{article.category}</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-900">{article.title}</h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed flex-1">{article.metaDescription}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#1e3a5f]">
                Leer guía <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-14 rounded-2xl bg-gradient-to-br from-[#1e3a5f] to-[#152a45] p-8 text-center">
          <h2 className="text-2xl font-bold text-white">¿Listo para poner esto en práctica?</h2>
          <p className="mt-2 text-blue-100">Prueba CredyTek gratis por 14 días, sin tarjeta de crédito.</p>
          <button
            type="button"
            onClick={goTry}
            className="mt-5 inline-flex items-center gap-2 px-6 py-3 bg-white text-[#1e3a5f] font-semibold rounded-lg hover:bg-slate-50 transition"
          >
            Probar CredyTek
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </PublicShell>
  )
}

export default ResourcesIndexPage

// ResourceArticlePage — plantilla genérica para /recursos/:slug. Un artículo
// nuevo NO necesita una página nueva: se agrega a lib/resources.ts y esta
// misma ruta lo sirve.
import React, { useEffect } from 'react'
import { useParams, Link, useNavigate, Navigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Calendar } from 'lucide-react'
import PublicShell from '@/components/public/PublicShell'
import SeoHead from '@/components/public/SeoHead'
import { getArticleBySlug, ARTICLES } from '@/lib/resources'
import { getSeoPageBySlug } from '@/lib/seoContent'
import { trackResourceView, trackSeoCtaClick } from '@/lib/analytics'

const SITE = 'https://credytek.vercel.app'

const ResourceArticlePage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const article = getArticleBySlug(slug)

  useEffect(() => { window.scrollTo(0, 0) }, [slug])
  useEffect(() => {
    if (article) trackResourceView(article.slug, 'article')
  }, [article])

  if (!article) return <Navigate to="/recursos" replace />

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.metaDescription,
    datePublished: article.publishedDate,
    dateModified: article.updatedDate,
    author: { '@type': 'Organization', name: 'CredyTek' },
    publisher: { '@type': 'Organization', name: 'CredyTek' },
    mainEntityOfPage: `${SITE}/recursos/${article.slug}`,
  }

  const goTry = (location: string) => {
    trackSeoCtaClick(article.slug, location)
    navigate('/register')
  }

  return (
    <PublicShell>
      <SeoHead
        title={`${article.title} | CredyTek`}
        description={article.metaDescription}
        path={`/recursos/${article.slug}`}
        jsonLd={jsonLd}
      />
      <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <Link to="/recursos" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 mb-6">
          <ArrowLeft className="w-4 h-4" /> Centro de recursos
        </Link>

        <p className="text-xs font-semibold uppercase tracking-widest text-[#f59e0b]">{article.category}</p>
        <h1 className="mt-2 text-3xl md:text-4xl font-bold text-slate-900 leading-tight">{article.title}</h1>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
          <Calendar className="w-3.5 h-3.5" />
          Actualizado el {new Date(article.updatedDate).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>

        <div className="mt-6 space-y-4 text-slate-700 leading-relaxed">
          {article.intro.map((p, i) => <p key={i}>{p}</p>)}
        </div>

        {article.sections.map((section, i) => (
          <section key={i} className="mt-8">
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">{section.heading}</h2>
            <div className="mt-3 space-y-4 text-slate-700 leading-relaxed">
              {section.paragraphs.map((p, j) => <p key={j}>{p}</p>)}
            </div>
            {section.subsections?.map((sub, k) => (
              <div key={k} className="mt-5">
                <h3 className="text-lg font-semibold text-slate-800">{sub.heading}</h3>
                <div className="mt-2 space-y-3 text-slate-700 leading-relaxed">
                  {sub.paragraphs.map((p, m) => <p key={m}>{p}</p>)}
                </div>
              </div>
            ))}
          </section>
        ))}

        {/* CTA contextual */}
        <div className="mt-10 rounded-2xl border border-[#1e3a5f]/20 bg-slate-50 p-6 text-center">
          <p className="text-slate-800 font-medium">{article.ctaContextual.text}</p>
          <button
            type="button"
            onClick={() => goTry('article_contextual')}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-[#1e3a5f] text-white text-sm font-medium rounded-lg hover:bg-[#152a45] transition"
          >
            {article.ctaContextual.label}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Enlaces relacionados */}
        {(article.relatedSlugs.length > 0 || article.relatedSeoSlugs.length > 0) && (
          <div className="mt-10 pt-8 border-t border-slate-200">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-4">Sigue leyendo</h2>
            <ul className="space-y-2">
              {article.relatedSlugs.map(rs => {
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
              {article.relatedSeoSlugs.map(rs => {
                const rel = getSeoPageBySlug(rs)
                if (!rel) return null
                return (
                  <li key={rs}>
                    <Link to={`/${rs}`} className="text-[#1e3a5f] font-medium hover:underline">
                      {rel.h1} →
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* CTA final */}
        <div className="mt-10 rounded-2xl bg-gradient-to-br from-[#1e3a5f] to-[#152a45] p-8 text-center">
          <h2 className="text-2xl font-bold text-white">Organiza tu operación de préstamos desde hoy</h2>
          <p className="mt-2 text-blue-100">Empieza a gestionar clientes, préstamos, pagos y cobranza desde un solo lugar.</p>
          <button
            type="button"
            onClick={() => goTry('article_final')}
            className="mt-5 inline-flex items-center gap-2 px-6 py-3 bg-white text-[#1e3a5f] font-semibold rounded-lg hover:bg-slate-50 transition"
          >
            Probar CredyTek
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </article>
    </PublicShell>
  )
}

export default ResourceArticlePage

// prerender — genera un index.html estático POR RUTA para las páginas
// públicas indexables (recursos, calculadora, páginas SEO comerciales).
//
// Por qué existe: vercel.json reescribe TODA ruta a /index.html (SPA), así
// que un cliente que NO ejecuta JavaScript (curl, la mayoría de crawlers de
// IA) recibe siempre el MISMO index.html sin importar la ruta pedida — con
// el title/canonical/JSON-LD de la landing y, dentro del <noscript>, el
// contenido de la landing en vez del contenido real de esa ruta. Ya existía
// el patrón de servir contenido estático dentro de <noscript> para la home
// (Fase 1) — esto lo extiende a cada ruta pública, generando un archivo real
// en dist/<ruta>/index.html que Vercel sirve en preferencia al rewrite de la
// SPA (mismo mecanismo ya usado para robots.txt/sitemap.xml).
//
// No introduce SSR ni un renderer de React: usa el mismo enfoque manual que
// ya existía en index.html (bloque <noscript> con HTML plano), para no
// arriesgar un mismatch de hidratación (main.tsx usa createRoot(...).render,
// no hydrateRoot, así que este contenido estático se reemplaza por completo
// al montar la SPA — sin parpadeo para usuarios reales con JS).
//
// Cero dependencias nuevas: usa esbuild (ya instalado como dependencia de
// Vite) solo para poder IMPORTAR los registros de contenido reales
// (lib/resources.ts, lib/seoContent.ts — TS puro, sin JSX ni imports) en vez
// de duplicar ese contenido a mano en este script.
import { buildSync } from 'esbuild'
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const TMP = path.join(ROOT, 'node_modules', '.prerender-tmp')
const SITE = 'https://credytek.vercel.app'

function loadDataModule(srcRelPath) {
  const src = path.join(ROOT, 'src', srcRelPath)
  const out = path.join(TMP, srcRelPath.replace(/[\\/]/g, '_') + '.cjs')
  mkdirSync(path.dirname(out), { recursive: true })
  buildSync({
    entryPoints: [src],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: true,
    logLevel: 'silent',
  })
  delete require.cache[require.resolve(out)]
  return require(out)
}

const { ARTICLES } = loadDataModule('lib/resources.ts')
const { SEO_PAGES } = loadDataModule('lib/seoContent.ts')

if (!existsSync(path.join(DIST, 'index.html'))) {
  console.error('[prerender] dist/index.html no existe. Corre "vite build" antes de este script.')
  process.exit(1)
}
const baseHtml = readFileSync(path.join(DIST, 'index.html'), 'utf-8')

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function organizationNode() {
  return {
    '@type': 'Organization',
    '@id': `${SITE}/#org`,
    name: 'CredyTek',
    legalName: 'JPRS Digital Connect',
    url: SITE,
    logo: `${SITE}/favicon.svg`,
    email: 'credytek@digitalconnectdr.com',
    telephone: '+1-849-889-1220',
    address: { '@type': 'PostalAddress', addressCountry: 'DO' },
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+1-849-889-1220',
      email: 'credytek@digitalconnectdr.com',
      contactType: 'sales',
      availableLanguage: ['Spanish', 'English', 'Portuguese'],
    },
    description: 'CredyTek es una plataforma de software para la gestión de préstamos dirigida a prestamistas y financieras en Latinoamérica.',
  }
}

function articleNode(article) {
  return {
    '@type': 'Article',
    headline: article.title,
    description: article.metaDescription,
    datePublished: article.publishedDate,
    dateModified: article.updatedDate,
    author: { '@type': 'Organization', name: 'CredyTek' },
    publisher: { '@type': 'Organization', name: 'CredyTek' },
    mainEntityOfPage: `${SITE}/recursos/${article.slug}`,
  }
}

function wrapJsonLd(...nodes) {
  return { '@context': 'https://schema.org', '@graph': nodes }
}

const MAIN_STYLE = 'max-width:900px;margin:0 auto;padding:24px;font-family:system-ui,Arial,sans-serif;line-height:1.6;color:#0f172a'

function renderResourcesIndexMain() {
  const items = ARTICLES.map(a =>
    `<li><a href="${SITE}/recursos/${a.slug}">${escapeHtml(a.title)}</a> — ${escapeHtml(a.metaDescription)}</li>`
  ).join('\n')
  return `<main style="${MAIN_STYLE}">
  <h1>Guías para administrar tu operación de préstamos</h1>
  <p>Contenido práctico sobre control de préstamos, organización de cartera y cobranza, pensado para prestamistas en República Dominicana.</p>
  <ul>${items}</ul>
  <p><a href="${SITE}/register">Probar CredyTek</a> · <a href="${SITE}/">Ir a CredyTek</a></p>
</main>`
}

function renderArticleMain(article) {
  const relatedInternal = article.relatedSlugs.map(s => ARTICLES.find(a => a.slug === s)).filter(Boolean)
  const relatedSeo = article.relatedSeoSlugs.map(s => SEO_PAGES.find(p => p.slug === s)).filter(Boolean)
  const sections = article.sections.map(sec => `
  <h2>${escapeHtml(sec.heading)}</h2>
  ${sec.paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('\n  ')}
  ${(sec.subsections || []).map(sub => `<h3>${escapeHtml(sub.heading)}</h3>\n  ${sub.paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('\n  ')}`).join('\n  ')}`).join('\n')
  const related = (relatedInternal.length || relatedSeo.length)
    ? `<h2>Sigue leyendo</h2>\n  <ul>${relatedInternal.map(r => `<li><a href="${SITE}/recursos/${r.slug}">${escapeHtml(r.title)}</a></li>`).join('')}${relatedSeo.map(r => `<li><a href="${SITE}/${r.slug}">${escapeHtml(r.h1)}</a></li>`).join('')}</ul>`
    : ''
  return `<main style="${MAIN_STYLE}">
  <h1>${escapeHtml(article.title)}</h1>
  ${article.intro.map(p => `<p>${escapeHtml(p)}</p>`).join('\n  ')}
  ${sections}
  <p><strong>${escapeHtml(article.ctaContextual.text)}</strong> <a href="${SITE}/register">${escapeHtml(article.ctaContextual.label)}</a></p>
  ${related}
  <p><a href="${SITE}/recursos">Centro de recursos</a> · <a href="${SITE}/">Ir a CredyTek</a></p>
</main>`
}

function renderCalculatorMain() {
  return `<main style="${MAIN_STYLE}">
  <h1>Calculadora de préstamos</h1>
  <p>Calcula la cuota, el interés total y el plan de pagos completo de un préstamo, sin registrarte. Usa el mismo motor de cálculo real que usa CredyTek: amortización francesa, cuota fija o solo interés, con tasa mensual, anual, quincenal, semanal o diaria.</p>
  <p><a href="${SITE}/register">Probar CredyTek</a> · <a href="${SITE}/">Ir a CredyTek</a></p>
</main>`
}

function renderSeoPageMain(page) {
  const related = page.relatedArticleSlugs.map(s => ARTICLES.find(a => a.slug === s)).filter(Boolean)
  return `<main style="${MAIN_STYLE}">
  <h1>${escapeHtml(page.h1)}</h1>
  ${page.intro.map(p => `<p>${escapeHtml(p)}</p>`).join('\n  ')}
  <h2>${escapeHtml(page.problemHeading)}</h2>
  <ul>${page.problemItems.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
  <h2>${escapeHtml(page.solutionHeading)}</h2>
  <p>${escapeHtml(page.solutionIntro)}</p>
  <ul>${page.solutionItems.map(i => `<li><strong>${escapeHtml(i.title)}:</strong> ${escapeHtml(i.description)}</li>`).join('')}</ul>
  ${related.length ? `<h2>Guías relacionadas</h2><ul>${related.map(r => `<li><a href="${SITE}/recursos/${r.slug}">${escapeHtml(r.title)}</a></li>`).join('')}</ul>` : ''}
  <h2>${escapeHtml(page.ctaFinalTitle)}</h2>
  <p>${escapeHtml(page.ctaFinalText)}</p>
  <p><a href="${SITE}/register">Probar CredyTek</a> · <a href="${SITE}/">Ir a CredyTek</a></p>
</main>`
}

const routes = [
  {
    outPath: 'recursos/index.html',
    title: 'Centro de recursos para prestamistas | CredyTek',
    description: 'Guías prácticas sobre administración de préstamos, cartera y cobranza para prestamistas en República Dominicana.',
    canonicalPath: '/recursos',
    jsonLd: wrapJsonLd(organizationNode()),
    main: renderResourcesIndexMain(),
  },
  ...ARTICLES.map(a => ({
    outPath: `recursos/${a.slug}/index.html`,
    title: `${a.title} | CredyTek`,
    description: a.metaDescription,
    canonicalPath: `/recursos/${a.slug}`,
    jsonLd: wrapJsonLd(organizationNode(), articleNode(a)),
    main: renderArticleMain(a),
  })),
  {
    outPath: 'calculadora-prestamos/index.html',
    title: 'Calculadora de préstamos gratis | CredyTek',
    description: 'Calcula la cuota, el interés total y el plan de pagos de un préstamo. Usa el mismo motor de cálculo real de CredyTek: amortización francesa, cuota fija o solo interés.',
    canonicalPath: '/calculadora-prestamos',
    jsonLd: wrapJsonLd(organizationNode()),
    main: renderCalculatorMain(),
  },
  ...SEO_PAGES.map(p => ({
    outPath: `${p.slug}/index.html`,
    title: p.metaTitle,
    description: p.metaDescription,
    canonicalPath: `/${p.slug}`,
    jsonLd: wrapJsonLd(organizationNode()),
    main: renderSeoPageMain(p),
  })),
]

function buildPageHtml({ title, description, canonicalPath, jsonLd, main }) {
  let html = baseHtml
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
  html = html.replace(/(<meta name="description" content=")[^"]*(")/, `$1${escapeHtml(description)}$2`)
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${SITE}${canonicalPath}$2`)
  // Estas rutas no tienen variantes ?lang= (decisión ya tomada en Fase 4) —
  // los hreflang de la home no aplican aquí y se quitan para no sugerir
  // canonicalización cruzada incorrecta.
  html = html.replace(/\s*<!-- hreflang[^>]*-->\n?/, '\n')
  html = html.replace(/\s*<link rel="alternate"[^>]*>\n?/g, '')
  html = html.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapeHtml(title)}$2`)
  html = html.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escapeHtml(description)}$2`)
  html = html.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${SITE}${canonicalPath}$2`)
  html = html.replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${escapeHtml(title)}$2`)
  html = html.replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${escapeHtml(description)}$2`)
  html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">\n${JSON.stringify(jsonLd)}\n    </script>`)
  html = html.replace(/<noscript>\s*<main[\s\S]*?<\/main>\s*<\/noscript>/, `<noscript>\n${main}\n    </noscript>`)
  return html
}

for (const route of routes) {
  const html = buildPageHtml(route)
  const outFile = path.join(DIST, route.outPath)
  mkdirSync(path.dirname(outFile), { recursive: true })
  writeFileSync(outFile, html, 'utf-8')
  console.log(`[prerender] ${route.canonicalPath} -> dist/${route.outPath}`)
}

rmSync(TMP, { recursive: true, force: true })
console.log(`[prerender] listo — ${routes.length} rutas generadas.`)

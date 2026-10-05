// Sanitización del HTML de contratos YA almacenado (contratos históricos) antes de mostrarlo o imprimirlo.
// El escape de valores protege los contratos nuevos; los antiguos guardan `content` ya materializado y pueden traer
// <script>, onerror=, javascript:, etc. Aquí se limpia con DOMPurify (parser real + allowlist), no con regex sobre HTML.
//
// Se conserva el HTML legítimo de las plantillas (párrafos, encabezados, tablas, listas, negrita/cursiva, estructura con
// class/style, el <style> de la plantilla notarial con su @page) y se elimina todo lo ejecutable.
import DOMPurify from 'dompurify'
import { safeImageDataUrl, escapeHtml } from '@/lib/htmlSafe'

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'div', 'span', 'section', 'article', 'header', 'footer',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'small', 'mark', 'blockquote', 'pre', 'code',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
  'img', 'a', 'style',
]

const ALLOWED_ATTR = [
  'class', 'style', 'align', 'valign', 'colspan', 'rowspan', 'width', 'height', 'border', 'cellpadding', 'cellspacing',
  'dir', 'lang', 'nowrap', 'title', 'alt', 'src', 'href', 'start', 'type',
]

/**
 * CSS que se descarta (del atributo style o de un <style>): cargas externas y ejecución. Las plantillas de contratos no
 * usan url(), @import ni expresiones; un <style> que los traiga se elimina completo.
 */
function isUnsafeCss(css: string): boolean {
  return /@import|expression\s*\(|javascript:|behaviou?r\s*:|-moz-binding|url\s*\(/i.test(css)
}

type PurifyInstance = ReturnType<typeof DOMPurify>

export function createContractSanitizer(win: any): (html: string) => string {
  const purify: PurifyInstance = DOMPurify(win)

  purify.addHook('uponSanitizeAttribute', (node: any, data: any) => {
    // <img src>: solo data URL PNG/JPEG/WEBP (logo/firma del contrato); cualquier otro origen → se descarta el atributo
    if (node.nodeName === 'IMG' && data.attrName === 'src' && !safeImageDataUrl(data.attrValue)) data.keepAttr = false
    if (data.attrName === 'style' && isUnsafeCss(String(data.attrValue || ''))) data.keepAttr = false
  })

  purify.addHook('afterSanitizeAttributes', (node: any) => {
    // Una imagen sin un src válido no aporta nada: se elimina
    if (node.nodeName === 'IMG' && !node.getAttribute('src')) { node.remove(); return }
    if (node.nodeName === 'A') {
      node.removeAttribute('target')
      node.setAttribute('rel', 'noopener noreferrer')
    }
    if (node.nodeName === 'STYLE' && isUnsafeCss(node.textContent || '')) node.remove()
  })

  return (html: string) => String(purify.sanitize(String(html ?? ''), {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#)/i,   // sin javascript:, vbscript:, data: en enlaces
    FORCE_BODY: true,                                     // conserva el <style> inicial de la plantilla notarial
    KEEP_CONTENT: true,                                   // lo no permitido pierde la etiqueta pero conserva su texto
  }))
}

let cached: ((html: string) => string) | null = null

/**
 * Sanitiza el HTML almacenado de un contrato con la ventana del navegador. Sin DOM (no debería pasar en la app) falla
 * cerrado: devuelve el contenido como TEXTO escapado, nunca como HTML.
 */
export function sanitizeContractHtml(html: string): string {
  if (typeof window === 'undefined' || !(window as any).document) return escapeHtml(html)
  if (!cached) cached = createContractSanitizer(window)
  return cached(html)
}

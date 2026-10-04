// Helpers de seguridad para armar HTML de impresión (recibos, reportes, contratos) con datos del usuario.
// Mismo criterio que backend/src/lib/htmlSafe.ts: se escapan los VALORES, no la estructura del documento.

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Escapa & < > " ' para insertar un valor como texto (o en un atributo entre comillas) dentro de HTML. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, ch => ESC[ch])
}

// Solo imágenes raster en data URL base64. SVG queda fuera a propósito (puede traer scripts).
const SAFE_IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/

/** Data URL PNG/JPEG/WEBP válida, o '' (SVG, javascript:, HTML, comillas, URL remota...). */
export function safeImageDataUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  const v = value.trim()
  return SAFE_IMAGE_DATA_URL.test(v) ? v : ''
}

/**
 * Inverso de escapeHtml para mostrar contenido ya escapado por el servidor como TEXTO (React o un <pre> que se vuelve a
 * escapar). Nunca se debe usar el resultado como HTML.
 */
export function decodeBasicEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

// Helpers de seguridad para HTML generado con datos del usuario (contratos, recibos, impresiones).
// Regla: la plantilla es HTML estructural y NO se toca; solo se escapan los VALORES que se sustituyen en ella.

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa & < > " ' para insertar un valor como texto (o dentro de un atributo entre comillas) en HTML. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, ch => ESC[ch]);
}

// Solo imágenes raster por data URL en base64. SVG queda fuera a propósito (puede traer scripts).
const SAFE_IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * Devuelve la data URL si es un PNG/JPEG/WEBP en base64 estricto; si no (SVG, javascript:, HTML, comillas, espacios,
 * URL remota, vacío...) devuelve '' para que no se genere ninguna <img>.
 */
export function safeImageDataUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const v = value.trim();
  return SAFE_IMAGE_DATA_URL.test(v) ? v : '';
}

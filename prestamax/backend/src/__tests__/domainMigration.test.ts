// Migración del frontend a https://credytek.digitalconnectdr.com (Vercel deshabilitado): canonical, sitemap, robots, OG,
// JSON-LD, prerender, enlaces compartidos, CORS y enlaces de correo deben apuntar al dominio nuevo y coincidir entre sí.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const NEW = 'https://credytek.digitalconnectdr.com';
const OLD = 'credytek.vercel.app';

describe('dominio del sitio', () => {
  it('SITE_URL (único punto en el código) es el dominio nuevo y lo usan SEO, artículos y compartir', () => {
    expect(read('frontend/src/lib/site.ts')).toContain(`export const SITE_URL = '${NEW}'`);
    expect(read('frontend/src/components/public/SeoHead.tsx')).toContain('const SITE = SITE_URL');
    expect(read('frontend/src/pages/public/ResourceArticlePage.tsx')).toContain('const SITE = SITE_URL');
    expect(read('frontend/src/components/shared/ShareButton.tsx')).toContain('const SHARE_URL = `${SITE_URL}/`');
  });

  it('los archivos estáticos (index.html, sitemap, robots, llms, og-image.svg, prerender) usan el mismo dominio y ya no el de Vercel', () => {
    for (const f of ['frontend/index.html', 'frontend/public/sitemap.xml', 'frontend/public/robots.txt', 'frontend/public/llms.txt', 'frontend/public/og-image.svg', 'frontend/scripts/prerender.mjs']) {
      const t = read(f);
      expect(t, `${f} aún menciona Vercel`).not.toContain(OLD);
      expect(t, `${f} no menciona el dominio nuevo`).toContain('credytek.digitalconnectdr.com');
    }
    expect(read('frontend/scripts/prerender.mjs')).toContain(`const SITE = '${NEW}'`);
    expect(read('frontend/index.html')).toContain(`<link rel="canonical" href="${NEW}/" />`);
    expect(read('frontend/public/robots.txt')).toContain(`Sitemap: ${NEW}/sitemap.xml`);
  });

  it('todas las URLs del sitemap son del dominio nuevo y las páginas públicas siguen listadas', () => {
    const sm = read('frontend/public/sitemap.xml');
    const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    expect(locs.length).toBeGreaterThanOrEqual(12);
    for (const l of locs) expect(l.startsWith(NEW + '/') || l === NEW + '/', l).toBe(true);
    for (const p of ['/contact', '/terms', '/privacy', '/software-para-prestamistas', '/calculadora-prestamos', '/recursos']) expect(locs).toContain(NEW + p);
  });
});

describe('backend', () => {
  it('CORS permite el dominio nuevo sin depender de FRONTEND_URL', () => {
    const idx = read('backend/src/index.ts');
    const list = idx.slice(idx.indexOf('const ALLOWED_ORIGINS'), idx.indexOf('].filter(Boolean)'));
    expect(list).toContain(`'${NEW}'`);
  });
  it('los enlaces de correo y de restablecimiento usan el dominio nuevo por defecto (si FRONTEND_URL no está definida)', () => {
    for (const f of ['backend/src/services/emailService.ts', 'backend/src/routes/auth.ts']) {
      const t = read(f);
      expect(t, f).not.toContain(OLD);
      expect(t, f).toContain(`process.env.FRONTEND_URL || '${NEW}'`);
    }
  });
});

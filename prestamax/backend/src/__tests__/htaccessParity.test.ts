// El frontend también se sirve desde Hostinger (Apache/LiteSpeed): public/.htaccess debe equivaler a vercel.json
// (misma CSP y encabezados, fallback SPA, /assets inexistente = 404, caché) para no perder protección al migrar.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const FE = path.join(__dirname, '../../../frontend');
const vercel = JSON.parse(fs.readFileSync(path.join(FE, 'vercel.json'), 'utf8'));
const htaccess = fs.readFileSync(path.join(FE, 'public/.htaccess'), 'utf8');
const headers: Record<string, string> = {};
for (const h of vercel.headers.find((x: any) => x.source === '/(.*)').headers) headers[h.key] = h.value;

describe('.htaccess (Hostinger) equivale a vercel.json', () => {
  it('mismos encabezados de seguridad, incluida la CSP completa', () => {
    for (const [k, v] of Object.entries(headers)) expect(htaccess, k).toContain(`Header always set ${k} "${v.replace(/"/g, '\\"')}"`);
  });
  it('fallback SPA que respeta archivos y carpetas reales (páginas prerenderizadas) y no reescribe /assets', () => {
    expect(htaccess).toContain('RewriteCond %{REQUEST_FILENAME} !-f');
    expect(htaccess).toContain('RewriteCond %{REQUEST_FILENAME} !-d');
    expect(htaccess).toContain('RewriteCond %{REQUEST_URI} !^/assets/');
    expect(htaccess).toContain('RewriteRule ^ /index.html [L]');
  });
  it('las páginas prerenderizadas se sirven sin 301 a la barra final y la regla va antes del fallback SPA', () => {
    const rule = 'RewriteRule ^(.+?)/?$ /$1/index.html [L]';
    expect(htaccess).toContain('RewriteCond %{DOCUMENT_ROOT}/$1/index.html -f');
    expect(htaccess).toContain(rule);
    expect(htaccess.indexOf(rule)).toBeLessThan(htaccess.indexOf('RewriteRule ^ /index.html [L]'));
    expect(htaccess.indexOf('RewriteRule ^assets/ - [E=CT_ASSET:1]')).toBeLessThan(htaccess.indexOf(rule));
    // no depende de directivas que algunos servidores no aceptan en .htaccess
    expect(htaccess).not.toMatch(/DirectorySlash/i);
    // el sitemap y el canonical de cada página prerenderizada no llevan barra final
    const sm = fs.readFileSync(path.join(FE, 'public/sitemap.xml'), 'utf8');
    const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).filter(l => l.split('/').length > 4);
    for (const l of locs) expect(l.endsWith('/'), l).toBe(false);
  });
  it('HTTPS forzado, caché inmutable en /assets y HTML siempre revalidado', () => {
    expect(htaccess).toContain('RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]');
    expect(htaccess).toContain('Header set Cache-Control "public, max-age=31536000, immutable" env=CT_ASSET');
    expect(htaccess).toMatch(/<FilesMatch "\\.html\$">\s*Header set Cache-Control "public, max-age=0, must-revalidate"/);
    const assetRule = vercel.headers.find((x: any) => x.source === '/assets/(.*)').headers[0].value;
    expect(assetRule).toBe('public, max-age=31536000, immutable');
  });
  it('la CSP permite conectar a la API en Render (el backend se queda ahí)', () => {
    expect(headers['Content-Security-Policy']).toContain('https://*.onrender.com');
  });
});

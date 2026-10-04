// XSS almacenado en contratos y recibos: los VALORES sustituidos se escapan, la plantilla se respeta, solo se aceptan
// imágenes PNG/JPEG/WEBP en data URL y la plantilla de un contrato debe ser del mismo tenant. Solo BD temporal.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import crypto from 'crypto';
import { bootTestApp, TestApp } from './helpers/testApp';
import { escapeHtml, safeImageDataUrl } from '../lib/htmlSafe';
import { escapeHtml as feEscape, safeImageDataUrl as feSafeImg, decodeBasicEntities } from '../../../frontend/src/lib/htmlSafe';

vi.mock('@/lib/api', () => ({ default: { get: async () => ({ data: { installments: [], principalBalance: 0, interestBalance: 0, moraBalance: 0 } }) } }));
vi.mock('@/lib/i18n', () => ({ t: (k: string) => k, getLocale: () => 'es' }));

let app: TestApp;
beforeAll(async () => { app = await bootTestApp(); });
afterAll(async () => { await app.close(); });

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/';
const WEBP = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
const SVG = 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=';

const TEMPLATE = '<div class="contrato"><p class="cli">{{client_name}}</p><p class="emp">{{company_name}}</p><p>{{representative_name}}</p>{{company_logo}}{{company_signature}}<p>{{notary_name}} / {{testigo1_nombre}} / {{testigo2_domicilio}}</p></div>';

type Ctx = { tenantId: string; token: string; clientId: string; loanId: string; templateId: string };
function setup(opts: { clientName?: string; tenant?: Record<string, string> } = {}): Ctx {
  const t = app.createTenant({ planSlug: 'enterprise' });
  const clientId = app.createClient(t.tenantId);
  if (opts.clientName) app.db.prepare('UPDATE clients SET full_name=? WHERE id=?').run(opts.clientName, clientId);
  const [loanId] = app.fillLoans(t.tenantId, 1, 'active', clientId);
  const templateId = crypto.randomUUID();
  app.db.prepare('INSERT INTO contract_templates (id,tenant_id,name,type,body,is_default) VALUES (?,?,?,?,?,0)').run(templateId, t.tenantId, 'T', 'general', TEMPLATE);
  for (const [k, v] of Object.entries(opts.tenant || {})) app.db.prepare(`UPDATE tenants SET ${k}=? WHERE id=?`).run(v, t.tenantId);
  return { tenantId: t.tenantId, token: t.token, clientId, loanId, templateId };
}
const generate = (c: Ctx, templateId = c.templateId) =>
  app.req('POST', '/api/contracts', { token: c.token, tenantId: c.tenantId, body: { loan_id: c.loanId, template_id: templateId } });

describe('valores dinámicos del contrato se escapan', () => {
  it('client_name con <img onerror> queda como texto escapado', async () => {
    const c = setup({ clientName: '<img src=x onerror=alert(1)>' });
    const r = await generate(c);
    expect(r.status).toBe(201);
    expect(r.body.content).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(r.body.content).not.toContain('<img src=x');
  });

  it('company_name con <script> queda escapado', async () => {
    const c = setup({ tenant: { name: '<script>alert(document.cookie)</script>' } });
    const r = await generate(c);
    expect(r.body.content).toContain('&lt;script&gt;alert(document.cookie)&lt;/script&gt;');
    expect(r.body.content).not.toContain('<script');
  });

  it('representante, notario y testigos con HTML también se escapan', async () => {
    const evil = '"><svg onload=alert(1)>';
    const c = setup({ tenant: { representative_name: evil, notary_name: evil, testigo1_nombre: evil, testigo2_domicilio: evil } });
    const r = await generate(c);
    expect(r.body.content).not.toContain('<svg');
    expect(r.body.content.split('&quot;&gt;&lt;svg onload=alert(1)&gt;').length - 1).toBe(4);
  });

  it('comillas y & no rompen el HTML, y la plantilla (estructura) no se toca', async () => {
    const c = setup({ clientName: `Juan "El Jefe" O'Neil & Hijos` });
    const r = await generate(c);
    expect(r.body.content).toContain('<p class="cli">Juan &quot;El Jefe&quot; O&#39;Neil &amp; Hijos</p>');
    expect(r.body.content).toContain('<div class="contrato">');                 // HTML estructural intacto
    expect(r.body.content).toContain('<p class="emp">');
  });

  it('un valor con "$&" o con {{otra_variable}} no se re-expande', async () => {
    const c = setup({ clientName: '$& {{company_name}} $1', tenant: { name: 'ACME' } });
    const r = await generate(c);
    expect(r.body.content).toContain('<p class="cli">$&amp; {{company_name}} $1</p>');
    expect(r.body.content).toContain('<p class="emp">ACME</p>');
  });

  it('funcionalidad normal: valores sin caracteres especiales y variables desconocidas se conservan', async () => {
    const c = setup({ clientName: 'María Pérez', tenant: { name: 'Prestamos Rápidos SRL', representative_name: 'Ana Gómez' } });
    app.db.prepare('UPDATE contract_templates SET body=? WHERE id=?').run('<p>{{client_name}} - {{company_name}} - {{representative_name}} - {{variable_inventada}} - {{loan_number}}</p>', c.templateId);
    const r = await generate(c);
    expect(r.body.content).toMatch(/^<p>María Pérez - Prestamos Rápidos SRL - Ana Gómez - \{\{variable_inventada\}\} - T-\d+-[0-9a-f]{6}<\/p>$/);
  });
});

describe('company_logo / company_signature: solo PNG/JPEG/WEBP en data URL', () => {
  for (const [name, url] of [['PNG', PNG], ['JPEG', JPEG], ['WEBP', WEBP]] as const) {
    it(`${name} válido → permitido`, async () => {
      const c = setup({ tenant: { logo_url: url, signature_url: url } });
      const r = await generate(c);
      expect(r.body.content).toContain(`<img src="${url}" alt="Logo"`);
      expect(r.body.content).toContain(`<img src="${url}" alt="Firma"`);
    });
  }

  it('SVG (aunque sea data URL) → rechazado, render vacío', async () => {
    const c = setup({ tenant: { logo_url: SVG, signature_url: 'data:image/svg+xml;utf8,<svg onload=alert(1)>' } });
    const r = await generate(c);
    expect(r.body.content).not.toContain('<img');
    expect(r.body.content).not.toContain('svg');
  });

  it('logo/firma con comillas, onerror, javascript:, HTML o URL remota → rechazados', async () => {
    for (const bad of [
      'data:image/png;base64,AAAA" onerror="alert(1)',
      `data:image/png;base64,AAAA' onerror='alert(1)`,
      'javascript:alert(1)',
      '" onerror="alert(1)',
      '<img src=x onerror=alert(1)>',
      'https://evil.example/x.png',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'data:image/png;base64,AAAA AAAA',
      'data:image/png,AAAA',
      '',
    ]) {
      const c = setup({ tenant: { logo_url: bad, signature_url: bad } });
      const r = await generate(c);
      expect(r.status, bad).toBe(201);
      expect(r.body.content, bad).not.toContain('<img');
      expect(r.body.content, bad).not.toContain('onerror');
      expect(r.body.content, bad).not.toContain('javascript:');
    }
  });

  it('safeImageDataUrl (backend y frontend) aceptan lo mismo', () => {
    for (const ok of [PNG, JPEG, WEBP]) { expect(safeImageDataUrl(ok)).toBe(ok); expect(feSafeImg(ok)).toBe(ok); }
    for (const bad of [SVG, 'javascript:1', '', null, undefined, 42, 'data:image/gif;base64,R0lGODlhAQABAAAAACw=']) {
      expect(safeImageDataUrl(bad)).toBe(''); expect(feSafeImg(bad)).toBe('');
    }
  });
});

describe('POST /contracts: la plantilla debe ser del mismo tenant', () => {
  it('plantilla de otro tenant → 404, igual que una inexistente, y no se crea contrato', async () => {
    const a = setup();
    const b = setup();
    const before = (app.db.prepare('SELECT COUNT(*) c FROM contracts WHERE tenant_id=?').get(a.tenantId) as any).c;
    const foreign = await generate(a, b.templateId);
    const missing = await generate(a, crypto.randomUUID());
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);                         // indistinguibles
    expect(JSON.stringify(foreign.body)).not.toContain(b.tenantId);
    expect((app.db.prepare('SELECT COUNT(*) c FROM contracts WHERE tenant_id=?').get(a.tenantId) as any).c).toBe(before);
  });
  it('la plantilla propia sigue funcionando', async () => {
    const a = setup({ clientName: 'Cliente Normal' });
    const r = await generate(a);
    expect(r.status).toBe(201);
    expect(r.body.content).toContain('Cliente Normal');
  });
});

describe('recibos / impresiones', () => {
  it('printPaymentReceipt escapa nombre, empresa, referencia, notas y cuenta; el logo solo si es data URL válida', async () => {
    const { printPaymentReceipt } = await import('../../../frontend/src/lib/printReceipt');
    let html = '';
    vi.stubGlobal('alert', () => {});
    vi.stubGlobal('window', { open: () => ({ document: { write: (h: string) => { html = h; }, close: () => {} } }) });
    const evil = '<img src=x onerror=alert(1)>';
    await printPaymentReceipt({
      id: '1', loanId: 'L', paymentNumber: 'PAG-1', receiptNumber: '<b>R</b>', paymentDate: '2026-01-10T00:00:00Z',
      clientName: evil, loanNumber: '"><script>1</script>', paymentMethod: 'transfer<x>', bankAccountName: evil, reference: `'; alert(1); '`,
      amount: 100, registeredByName: evil, notes: '<script>alert(2)</script>',
    } as any, { name: '<script>alert(3)</script>', phone: evil, address: evil, logoUrl: 'x" onerror="alert(4)' });
    vi.unstubAllGlobals();
    expect(html).not.toContain('<img');                      // ni el nombre ni el logo malicioso generan etiquetas
    expect(html).not.toMatch(/<script>(?!window\.onload)/);  // solo queda el script propio del recibo
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;alert(3)&lt;/script&gt;');
    expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;R&lt;/b&gt;');
    expect(html).toContain('&#39;; alert(1); &#39;');
    expect(html).toContain('<script>window.onload=()=>{window.print();}</script>');   // estructura propia intacta

    html = '';
    vi.stubGlobal('window', { open: () => ({ document: { write: (h: string) => { html = h; }, close: () => {} } }) });
    await printPaymentReceipt({ id: '1', loanId: 'L', paymentNumber: 'P', paymentDate: '2026-01-10T00:00:00Z', clientName: 'Ana', loanNumber: 'L1', paymentMethod: 'cash', amount: 5 } as any, { name: 'Mi Negocio', logoUrl: PNG });
    vi.unstubAllGlobals();
    expect(html).toContain(`<img src="${PNG}" alt="Logo"`);   // logo válido permitido
    expect(html).toContain('Mi Negocio');
  });

  it('printToPDF (listado de recibos y reportes) escapa título, encabezados, celdas y resumen', async () => {
    const { printToPDF } = await import('../../../frontend/src/lib/exportUtils');
    let html = '';
    vi.stubGlobal('window', { open: () => ({ document: { write: (h: string) => { html = h; }, close: () => {} } }) });
    printToPDF({
      title: '<script>t</script>', subtitle: '<i>s</i>',
      headers: [{ key: 'c', label: '<b>h</b>' }],
      rows: [{ c: '<img src=x onerror=alert(1)>' }],
      summary: [{ label: '<u>l</u>', value: '<s>v</s>' }],
    });
    vi.unstubAllGlobals();
    for (const raw of ['<script>t', '<i>s', '<b>h', '<img src=x', '<u>l', '<s>v']) expect(html, raw).not.toContain(raw);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapeHtml escapa & < > " \' (backend y frontend iguales) y decodeBasicEntities es su inverso para texto', () => {
    const s = `<a href="x" onclick='y'>&amp;</a>`;
    expect(escapeHtml(s)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;amp;&lt;/a&gt;');
    expect(feEscape(s)).toBe(escapeHtml(s));
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(12.5)).toBe('12.5');
    expect(decodeBasicEntities(escapeHtml(s))).toBe(s);
  });
});

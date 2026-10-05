// (1) POST /contracts/:id/sign solo opera sobre contratos del tenant autenticado.
// (2) El HTML de contratos HISTÓRICOS ya almacenado se sanitiza (DOMPurify + allowlist) antes de mostrarse o imprimirse.
// Solo BD temporal; los payloads nunca se ejecutan (jsdom sin scripts).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import { bootTestApp, TestApp } from './helpers/testApp';
import { createContractSanitizer, sanitizeContractHtml } from '../../../frontend/src/lib/sanitizeContract';

let app: TestApp;
beforeAll(async () => { app = await bootTestApp(); });
afterAll(async () => { await app.close(); });

function tenantWithContract() {
  const t = app.createTenant({ planSlug: 'enterprise' });
  const clientId = app.createClient(t.tenantId);
  const [loanId] = app.fillLoans(t.tenantId, 1, 'active', clientId);
  const id = crypto.randomUUID();
  app.db.prepare('INSERT INTO contracts (id,tenant_id,loan_id,contract_number,signature_mode,status,content) VALUES (?,?,?,?,?,?,?)')
    .run(id, t.tenantId, loanId, `CON-${id.slice(0, 6)}`, 'physical', 'generated', '<p>contrato</p>');
  return { ...t, contractId: id };
}
const sign = (who: { token: string; tenantId: string }, contractId: string) =>
  app.req('POST', `/api/contracts/${contractId}/sign`, { token: who.token, tenantId: who.tenantId, body: { signed_by: 'Firmante' } });
const row = (id: string) => app.db.prepare('SELECT status, signed_at, signed_by FROM contracts WHERE id=?').get(id) as any;

describe('POST /contracts/:id/sign — aislamiento por tenant', () => {
  it('tenant A firma su contrato → OK (flujo normal intacto)', async () => {
    const a = tenantWithContract();
    const r = await sign(a, a.contractId);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('signed');
    expect(r.body.signed_by).toBe('Firmante');
    expect(row(a.contractId).status).toBe('signed');
  });

  it('tenant A intenta firmar el contrato de tenant B → 404, igual que uno inexistente, y el contrato de B queda intacto', async () => {
    const a = tenantWithContract();
    const b = tenantWithContract();
    const before = row(b.contractId);
    const foreign = await sign(a, b.contractId);
    const missing = await sign(a, crypto.randomUUID());
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);                          // indistinguibles
    expect(JSON.stringify(foreign.body)).not.toContain(b.tenantId);
    expect(row(b.contractId)).toEqual(before);                           // sigue 'generated', sin signed_at ni signed_by
    expect(row(b.contractId).status).toBe('generated');
    expect(row(b.contractId).signed_by).toBeNull();
  });
});

describe('sanitizador de contratos históricos', () => {
  const sanitize = createContractSanitizer(new JSDOM('').window);
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('contrato histórico con img onerror + script + javascript: → se limpia y el HTML legítimo se conserva', () => {
    const historic =
      '<h2>CONTRATO DE PRÉSTAMO</h2>' +
      '<p>Entre <strong>Juan Pérez</strong> y <em>ACME SRL</em>:</p>' +
      '<img src=x onerror=alert(1)>' +
      '<script>alert(1)</script>' +
      '<a href="javascript:alert(1)">x</a>' +
      '<table><thead><tr><th>#</th></tr></thead><tbody><tr><td style="text-align:center">1</td></tr></tbody></table>' +
      '<ul><li>uno</li><li>dos</li></ul><ol><li>a</li></ol><p>línea<br>siguiente</p><hr>';
    const out = sanitize(historic);
    // lo peligroso desaparece
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/<img/i);                                    // img sin data URL válida → eliminada
    expect(out).not.toContain('alert(1)</script>');
    // lo legítimo se conserva
    expect(out).toContain('<h2>CONTRATO DE PRÉSTAMO</h2>');
    expect(out).toContain('<strong>Juan Pérez</strong>');
    expect(out).toContain('<em>ACME SRL</em>');
    expect(out).toContain('<table>');
    expect(out).toContain('<th>#</th>');
    expect(out).toContain('<td style="text-align:center">1</td>');
    expect(out).toContain('<ul><li>uno</li><li>dos</li></ul>');
    expect(out).toContain('<ol><li>a</li></ol>');
    expect(out).toContain('línea<br>siguiente');
    expect(out).toContain('<hr>');
  });

  it('elimina iframe/object/embed/form/input/svg/math/link/base/meta-refresh y handlers on*', () => {
    const out = sanitize(
      '<div onclick="x()" onmouseover="y()" class="ok">a</div>' +
      '<iframe src="https://evil"></iframe><object data="x"></object><embed src="x">' +
      '<form action="javascript:alert(1)"><input name=a><button>go</button></form>' +
      '<svg onload="alert(1)"><script>1</script></svg><math><mi xlink:href="javascript:1">x</mi></math>' +
      '<link rel="stylesheet" href="https://evil/x.css"><base href="https://evil/">' +
      '<p onfocus="z()" autofocus>t</p><a href="JaVaScRiPt:alert(1)">y</a><a href="  &#106;avascript:alert(1)">z</a>');
    for (const bad of ['<iframe', '<object', '<embed', '<form', '<input', '<button', '<svg', '<math', '<link', '<base', '<script']) expect(out.toLowerCase(), bad).not.toContain(bad);
    expect(out).not.toMatch(/\son\w+\s*=/i);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toContain('autofocus');
    expect(out).toContain('<div class="ok">a</div>');
    expect(out).toContain('<p>t</p>');
  });

  it('<img>: solo data URL PNG/JPEG/WEBP (logo/firma); SVG, remota, javascript: y comillas se eliminan; los handlers se quitan siempre', () => {
    const keep = sanitize(`<img src="${PNG}" alt="Logo" style="max-height:90px;max-width:240px;object-fit:contain">`);
    expect(keep).toContain(`src="${PNG}"`);
    expect(keep).toContain('alt="Logo"');
    expect(keep).toContain('style="max-height:90px;max-width:240px;object-fit:contain"');
    const withHandler = sanitize(`<img src="${PNG}" onerror="alert(1)" onload="alert(2)">`);
    expect(withHandler).toContain(`src="${PNG}"`);
    expect(withHandler).not.toMatch(/on(error|load)/i);
    for (const bad of [
      '<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIi8+">',
      '<img src="https://evil.example/pixel.png">',
      '<img src="javascript:alert(1)">',
      '<img src="x" onerror="alert(1)">',
      `<img src='${PNG}" onerror="alert(1)'>`,
      '<img src="data:text/html;base64,PHNjcmlwdD4=">',
      '<img>',
    ]) expect(sanitize(bad), bad).not.toMatch(/<img/i);
  });

  it('enlaces: http(s)/mailto/tel se conservan con rel seguro y sin target', () => {
    const out = sanitize('<a href="https://credytek.com/x" target="_blank">ok</a><a href="mailto:a@b.com">m</a>');
    expect(out).toContain('href="https://credytek.com/x"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).not.toContain('target=');
    expect(out).toContain('href="mailto:a@b.com"');
  });

  it('plantilla notarial histórica (documento completo con <style> y @page): conserva el estilo y las clases', () => {
    const doc = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><style>@page { size: legal portrait; margin: 2cm; } .titulo { text-align: center; font-weight: bold; } p { text-align: justify; }</style></head>' +
      '<body><div class="titulo">Pagaré Notarial</div><p>Texto <strong>importante</strong></p><div class="firmas"><div class="firma-bloque"><div class="firma-linea"></div></div></div></body></html>';
    const out = sanitize(doc);
    expect(out).toContain('@page');
    expect(out).toContain('.titulo { text-align: center; font-weight: bold; }');
    expect(out).toContain('<div class="titulo">Pagaré Notarial</div>');
    expect(out).toContain('<div class="firma-linea"></div>');
    expect(out).not.toMatch(/<(html|head|body|meta)/i);
  });

  it('CSS peligroso: <style> con @import/url() y atributos style con url()/expression se eliminan', () => {
    const out = sanitize(
      '<style>@import url("https://evil/x.css"); p{color:red}</style>' +
      '<style>p{background:url(https://evil/pixel)}</style>' +
      '<div style="background:url(https://evil/p.png)">a</div>' +
      '<div style="width:expression(alert(1))">b</div>' +
      '<div style="text-align:center">c</div>');
    expect(out).not.toMatch(/@import/i);
    expect(out).not.toMatch(/url\s*\(/i);
    expect(out).not.toMatch(/expression/i);
    expect(out).toContain('<div style="text-align:center">c</div>');
    expect(out).toContain('<div>a</div>');
  });

  it('sin DOM disponible falla cerrado: devuelve el contenido como texto escapado, nunca como HTML', () => {
    expect(typeof (globalThis as any).window).toBe('undefined');
    const out = sanitizeContractHtml('<script>alert(1)</script><img src=x onerror=alert(2)>');
    expect(out).not.toContain('<');
    expect(out).toContain('&lt;script&gt;');
  });
});

describe('cableado: todo HTML de contrato almacenado pasa por el sanitizador', () => {
  const FE = path.join(__dirname, '../../../frontend');
  const page = fs.readFileSync(path.join(FE, 'src/pages/contracts/ContractsPage.tsx'), 'utf8');
  it('la vista (dangerouslySetInnerHTML) y la impresión usan sanitizeContractHtml', () => {
    expect(page).toContain("import { sanitizeContractHtml } from '@/lib/sanitizeContract'");
    expect(page).toContain('__html: sanitizeContractHtml(showContentModal.content');
    expect(page).toContain('const safeContent = sanitizeContractHtml(contract.content)');
    expect(page).not.toContain('${contract.content}');                       // nunca se interpola el contenido crudo
    expect(page.match(/dangerouslySetInnerHTML/g)!.length).toBe(1);
  });
  it('ningún otro componente usa dangerouslySetInnerHTML con contenido de contrato', () => {
    const walk = (d: string, out: string[] = []): string[] => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (/\.tsx?$/.test(e.name)) out.push(p); } return out; };
    for (const f of walk(path.join(FE, 'src'))) {
      const s = fs.readFileSync(f, 'utf8');
      if (s.includes('dangerouslySetInnerHTML')) expect(f.endsWith(path.join('contracts', 'ContractsPage.tsx')), f).toBe(true);
    }
  });
  it('dompurify es dependencia directa del frontend', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(FE, 'package.json'), 'utf8'));
    expect(pkg.dependencies.dompurify).toMatch(/^\^?3\./);
  });
});

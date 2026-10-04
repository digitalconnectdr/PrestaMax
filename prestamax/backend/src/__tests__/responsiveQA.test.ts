// Correcciones del QA responsive: datos de Reportes por moneda, claves i18n faltantes, modal Editar Préstamo en móvil,
// listas en tarjetas (Préstamos / Clientes / Pagos), acciones del detalle del préstamo, tamaños táctiles y de fuente.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const FE = path.join(__dirname, '../../../frontend');
const read = (p: string) => fs.readFileSync(path.join(FE, p), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); }
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('Reportes → Cartera por Moneda lee las claves en camelCase (el interceptor de api.ts las convierte)', () => {
  const src = read('src/pages/reports/ReportsPage.tsx');
  it('la interfaz y el render usan loanCount / portfolioBalance / moraBalance / avgRate', () => {
    const iface = src.slice(src.indexOf('interface PortfolioByCurrency'), src.indexOf('interface ReportData'));
    for (const k of ['loanCount', 'activeBalance', 'moraBalance', 'portfolioBalance', 'avgRate']) expect(iface, k).toContain(k);
    for (const k of ['loan_count', 'active_balance', 'mora_balance', 'portfolio_balance', 'avg_rate']) {
      expect(iface, k).not.toContain(k);
      expect(src.includes(`pc.${k}`), `pc.${k}`).toBe(false);
    }
    for (const k of ['pc.loanCount', 'pc.portfolioBalance', 'pc.moraBalance', 'pc.avgRate']) expect(src, k).toContain(k);
  });
  it('el interceptor realmente convierte snake_case → camelCase en las respuestas', () => {
    const api = read('src/lib/api.ts');
    expect(api).toContain('camelizeKeys(');
  });
});

describe('claves de traducción', () => {
  it('col.bank existe en es/en/pt', () => {
    const line = read('src/lib/i18n.ts').split('\n').find(l => l.trimStart().startsWith("'col.bank':"));
    expect(line).toBeTruthy();
    for (const lang of ['es', 'en', 'pt']) expect(line!).toMatch(new RegExp(`${lang}: '[^']{3,}`));
  });
  it('ninguna t(\'clave.literal\') del frontend queda sin definir (se vería el texto crudo)', () => {
    const defined = new Set([...read('src/lib/i18n.ts').matchAll(/^\s*'([A-Za-z0-9_.\-]+)'\s*:\s*\{/gm)].map(m => m[1]));
    const missing: string[] = [];
    for (const f of walk(path.join(FE, 'src'))) {
      if (f.endsWith(`${path.sep}i18n.ts`)) continue;
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\b(?:t|tGen|tg|tt)\(\s*'([a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_\-]+)+)'/g)) {
        const k = m[1];
        if (k.endsWith('_')) continue;                       // prefijo de clave dinámica: t('inc.cat_' + x)
        if (!defined.has(k)) missing.push(`${k} (${path.relative(FE, f)})`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('Editar Préstamo en móvil', () => {
  const src = read('src/pages/loans/EditLoanModal.tsx');
  it('las pestañas hacen scroll horizontal en vez de desbordar el modal', () => {
    expect(src).toContain('overflow-x-auto');
    expect(src).toContain('whitespace-nowrap shrink-0');
  });
  it('plazo y frecuencia se apilan en móvil y el número de plazo tiene ancho mínimo', () => {
    expect(src).toContain('grid grid-cols-1 sm:grid-cols-2 gap-4');
    expect(src).toContain('flex-1 min-w-[4rem]');
  });
});

describe('listas en tarjetas en móvil (la tabla queda solo desde md)', () => {
  for (const [file, testid] of [
    ['src/pages/loans/LoansPage.tsx', 'loans-mobile-list'],
    ['src/pages/clients/ClientsPage.tsx', 'clients-mobile-list'],
    ['src/pages/payments/PaymentsPage.tsx', 'payments-mobile-list'],
  ] as const) {
    it(`${path.basename(file)}: tarjetas md:hidden + tabla hidden md:block`, () => {
      const src = read(file);
      expect(src).toContain(`data-testid="${testid}"`);
      expect(src).toMatch(/<ul className="md:hidden[^"]*" data-testid="/);
      expect(src).toContain('<div className="hidden md:block overflow-x-auto">');
    });
  }
  it('Pagos: las tarjetas conservan imprimir, WhatsApp, editar y anular con los mismos permisos', () => {
    const src = read('src/pages/payments/PaymentsPage.tsx');
    const list = src.slice(src.indexOf('payments-mobile-list'), src.indexOf('hidden md:block overflow-x-auto'));
    for (const s of ['printPaymentReceipt(', "can('whatsapp.send')", "can('payments.edit')", "can('payments.void')", 'setVoidingPayment(payment)']) expect(list, s).toContain(s);
  });
  it('Clientes: la tarjeta navega al detalle y conserva Editar con permiso', () => {
    const src = read('src/pages/clients/ClientsPage.tsx');
    const list = src.slice(src.indexOf('clients-mobile-list'), src.indexOf('hidden md:block overflow-x-auto'));
    expect(list).toContain('navigate(`/clients/${client.id}`)');
    expect(list).toContain("can('clients.edit')");
  });
});

describe('detalle del préstamo en móvil', () => {
  const src = read('src/pages/loans/LoanDetailPage.tsx');
  it('Registrar Pago también aparece arriba (solo < lg) con la misma condición de permiso y estado', () => {
    const at = src.indexOf('data-testid="loan-mobile-pay"');
    expect(at).toBeGreaterThan(-1);
    const before = src.slice(Math.max(0, at - 400), at);
    expect(before).toContain("can('payments.create')");
    expect(before).toContain("loan.status === 'active' || loan.status === 'in_mora' || loan.status === 'disbursed'");
    expect(src.slice(at - 200, at + 200)).toContain('lg:hidden');
  });
  it('las acciones destructivas van en una zona separada y Eliminar ya no es un bloque rojo sólido pegado a Anular', () => {
    const marker = src.indexOf('data-testid="loan-danger-zone"');
    const zone = src.slice(src.lastIndexOf('<div', marker));
    expect(zone.slice(0, 250)).toContain('border-t');
    expect(zone.slice(0, 250)).toContain('space-y-3');
    const del = zone.slice(zone.indexOf('handleDeleteLoan'), zone.indexOf('handleDeleteLoan') + 400);
    expect(del).not.toContain('bg-red-600');
    expect(del).not.toContain('mt-1');
  });
});

describe('móvil: tamaño de fuente y áreas táctiles', () => {
  const css = read('src/index.css');
  it('campos de formulario a 16 px en < 768 px (evita el zoom de Safari de iPhone), fuera de @layer para ganar a text-sm', () => {
    const at = css.indexOf('@media (max-width: 767px)');
    expect(at).toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf('}\n}', at) + 3);
    expect(block).toContain('font-size: 16px');
    // select/textarea necesitan un :not() para superar la especificidad de .text-sm (Tailwind v3 no usa @layer nativo)
    for (const sel of ['input:not([type="checkbox"])', 'select:not(', 'textarea:not(']) expect(block, sel).toContain(sel);
    expect(block).not.toMatch(/^\s*select,\s*$/m);
  });
  it('.tap-target garantiza 40 px en pantallas táctiles y se aplica a los botones de icono', () => {
    expect(css).toMatch(/@media \(pointer: coarse\) \{\s*\.tap-target \{[^}]*min-width: 40px; min-height: 40px/);
    for (const f of ['src/components/layout/Sidebar.tsx', 'src/components/dashboard/OnboardingChecklist.tsx', 'src/pages/clients/ClientsPage.tsx', 'src/pages/loans/LoansPage.tsx', 'src/pages/contracts/ContractsPage.tsx'])
      expect(read(f), f).toContain('tap-target');
    expect(read('src/pages/loans/EditLoanModal.tsx')).toContain('aria-label={t(\'common.close\')}');
  });
});

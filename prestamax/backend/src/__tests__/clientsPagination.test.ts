// Paginación y búsqueda server-side de Clientes (antes: el listado cargaba solo los primeros 200 y filtraba en el navegador).
// BD temporal; un tenant con 235 clientes.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { bootTestApp, TestApp } from './helpers/testApp';

let app: TestApp;
afterAll(async () => { await app.close(); });

const N = 235;
type Seed = { tenantId: string; token: string; ids: string[]; first: string; last: string };
let A: Seed;
let B: Seed;

function seedTenant(count: number, label: string): Seed {
  const t = app.createTenant({ planSlug: 'enterprise' });
  const ids: string[] = [];
  const upd = app.db.prepare('UPDATE clients SET full_name=?, first_name=?, last_name=?, id_number=?, phone_personal=?, score=?, is_active=?, created_at=? WHERE id=?');
  app.db.exec('BEGIN');
  for (let i = 1; i <= count; i++) {
    const id = app.createClient(t.tenantId);
    const name = `Cliente${label} ${String(i).padStart(3, '0')}`;
    // created_at distinto y creciente: el cliente 1 es el más antiguo (queda al final del listado, posición 235)
    const createdAt = new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString().replace('T', ' ').slice(0, 19);
    upd.run(name, name, label, `${label}-${String(i).padStart(7, '0')}`, `809-${label === 'A' ? '555' : '777'}-${String(1000 + i)}`, i % 100, i % 6 === 0 ? 0 : 1, createdAt, id);
    ids.push(id);
  }
  app.db.exec('COMMIT');
  return { tenantId: t.tenantId, token: t.token, ids, first: ids[0], last: ids[ids.length - 1] };
}
beforeAll(async () => { app = await bootTestApp(); A = seedTenant(N, 'A'); B = seedTenant(3, 'B'); });

const list = (s: Seed, qs = '') => app.req('GET', `/api/clients${qs ? '?' + qs : ''}`, { token: s.token, tenantId: s.tenantId });

describe('paginación', () => {
  it('forma de la respuesta y valores por defecto (page 1, pageSize 25)', async () => {
    const r = await list(A);
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(25);
    expect(r.body.total).toBe(N);
    expect(r.body.page).toBe(1);
    expect(r.body.pageSize).toBe(25);
    expect(r.body.totalPages).toBe(10);
    expect(r.body.data).toEqual(r.body.items);               // alias que usan otras pantallas
    expect(r.body.limit).toBe(25);
  });

  it('pageSize=100: page 1 trae 100, page 2 trae el siguiente bloque, la última trae el remanente (35); total 235 y 3 páginas', async () => {
    const p1 = await list(A, 'page=1&pageSize=100');
    const p2 = await list(A, 'page=2&pageSize=100');
    const p3 = await list(A, 'page=3&pageSize=100');
    expect(p1.body.items).toHaveLength(100);
    expect(p2.body.items).toHaveLength(100);
    expect(p3.body.items).toHaveLength(35);
    for (const p of [p1, p2, p3]) { expect(p.body.total).toBe(N); expect(p.body.totalPages).toBe(3); expect(p.body.pageSize).toBe(100); }
    expect([p1.body.page, p2.body.page, p3.body.page]).toEqual([1, 2, 3]);
    // el orden es el mismo (más recientes primero) y los bloques son consecutivos
    expect(p1.body.items[0].id).toBe(A.last);
    expect(p3.body.items[34].id).toBe(A.first);
  });

  it('con 25 por página: 10 páginas y la última trae 10; ningún cliente se duplica ni desaparece', async () => {
    const seen: string[] = [];
    for (let p = 1; p <= 10; p++) {
      const r = await list(A, `page=${p}&pageSize=25`);
      expect(r.body.items).toHaveLength(p === 10 ? 10 : 25);
      expect(r.body.page).toBe(p);
      seen.push(...r.body.items.map((c: any) => c.id));
    }
    expect(seen).toHaveLength(N);
    expect(new Set(seen).size).toBe(N);                       // sin duplicados
    expect([...seen].sort()).toEqual([...A.ids].sort());      // sin faltantes
  });

  it('el orden es estable aunque varios clientes tengan el mismo created_at', async () => {
    const t = app.createTenant({ planSlug: 'enterprise' });
    const same = Array.from({ length: 60 }, () => app.createClient(t.tenantId));
    app.db.prepare('UPDATE clients SET created_at=? WHERE tenant_id=?').run('2026-05-05 10:00:00', t.tenantId);
    const seen: string[] = [];
    for (let p = 1; p <= 3; p++) seen.push(...(await app.req('GET', `/api/clients?page=${p}&pageSize=25`, { token: t.token, tenantId: t.tenantId })).body.items.map((c: any) => c.id));
    expect(seen).toHaveLength(60);
    expect(new Set(seen).size).toBe(60);
    expect([...seen].sort()).toEqual([...same].sort());
  });

  it('pageSize por encima del máximo se limita a 100; inválido (0, negativo, texto) → 25', async () => {
    expect((await list(A, 'pageSize=500')).body.pageSize).toBe(100);
    expect((await list(A, 'pageSize=500')).body.items).toHaveLength(100);
    for (const bad of ['0', '-5', 'abc', '']) {
      const r = await list(A, `pageSize=${bad}`);
      expect(r.status, bad).toBe(200);
      expect(r.body.pageSize, bad).toBe(25);
      expect(r.body.items, bad).toHaveLength(25);
    }
  });

  it('página inválida → controlado: 0, negativa o texto = página 1; más allá de la última = la última', async () => {
    for (const bad of ['0', '-3', 'abc', '']) {
      const r = await list(A, `page=${bad}&pageSize=25`);
      expect(r.status, bad).toBe(200);
      expect(r.body.page, bad).toBe(1);
      expect(r.body.items[0].id, bad).toBe(A.last);
    }
    const past = await list(A, 'page=999&pageSize=25');
    expect(past.status).toBe(200);
    expect(past.body.page).toBe(10);
    expect(past.body.items).toHaveLength(10);
    expect(past.body.items[9].id).toBe(A.first);
  });

  it('el parámetro heredado limit sigue funcionando para los selectores (hasta 500)', async () => {
    const r = await list(A, 'limit=200');
    expect(r.body.items).toHaveLength(200);
    expect(r.body.data).toHaveLength(200);
    expect(r.body.limit).toBe(200);
    const big = await list(A, 'limit=1000');
    expect(big.body.items).toHaveLength(N);                   // tope 500 > 235 clientes
    expect(big.body.pageSize).toBe(500);
  });
});

describe('búsqueda server-side', () => {
  it('CRÍTICO: un cliente más allá del registro 200 (el más antiguo, posición 235) NO está en la primera página y la búsqueda lo encuentra', async () => {
    const p1 = await list(A, 'pageSize=100');
    expect(p1.body.items.map((c: any) => c.id)).not.toContain(A.first);
    const r = await list(A, 'search=ClienteA 001&pageSize=25');
    expect(r.body.total).toBe(1);
    expect(r.body.items.map((c: any) => c.id)).toEqual([A.first]);
    expect(r.body.totalPages).toBe(1);
  });

  it('un cliente creado DESPUÉS del registro 200 (alta real por la API, el 236) aparece buscándolo y en la primera página', async () => {
    const created = await app.req('POST', '/api/clients', { token: A.token, tenantId: A.tenantId, body: { first_name: 'Zacarías', last_name: 'Ñúñez Posterior', id_number: 'POST-0000236', phone_personal: '809-999-0236', id_type: 'cedula' } });
    expect(created.status).toBe(201);
    const byName = await list(A, 'search=Zacarías Ñúñez');
    expect(byName.body.total).toBe(1);
    expect(byName.body.items[0].id).toBe(created.body.id);
    expect((await list(A, 'search=POST-0000236')).body.items[0].id).toBe(created.body.id);     // por documento
    expect((await list(A, 'search=809-999-0236')).body.items[0].id).toBe(created.body.id);     // por teléfono
    const all = await list(A, 'pageSize=25');
    expect(all.body.total).toBe(N + 1);
    expect(all.body.items[0].id).toBe(created.body.id);                                         // el más reciente primero
    app.db.prepare('DELETE FROM clients WHERE id=?').run(created.body.id);                      // deja el tenant en 235
  });

  it('busca por nombre, documento y teléfono; ignora mayúsculas/minúsculas (también con acentos)', async () => {
    expect((await list(A, 'search=clientea 007')).body.total).toBe(1);
    expect((await list(A, 'search=A-0000100')).body.total).toBe(1);
    expect((await list(A, 'search=809-555-1150')).body.total).toBe(1);
    const acc = app.createClient(A.tenantId);
    app.db.prepare('UPDATE clients SET full_name=?, first_name=?, last_name=? WHERE id=?').run('María Peña', 'María', 'Peña', acc);
    for (const q of ['maría', 'MARÍA', 'María', 'peña', 'PEÑA']) expect((await list(A, `search=${encodeURIComponent(q)}`)).body.total, q).toBe(1);
    app.db.prepare('DELETE FROM clients WHERE id=?').run(acc);
  });

  it('búsqueda con muchos resultados se pagina (el total es el de la búsqueda, no el del tenant)', async () => {
    const r1 = await list(A, 'search=ClienteA&pageSize=100&page=1');
    const r3 = await list(A, 'search=ClienteA&pageSize=100&page=3');
    expect(r1.body.total).toBe(N);
    expect(r3.body.items).toHaveLength(35);
    const narrow = await list(A, 'search=ClienteA 1&pageSize=25');                  // 100–199 y 010–019 …
    const expected = (app.db.prepare("SELECT COUNT(*) c FROM clients WHERE tenant_id=? AND full_name LIKE '%ClienteA 1%'").get(A.tenantId) as any).c;
    expect(narrow.body.total).toBe(expected);
  });

  it('búsqueda inexistente → total 0, sin items y metadatos coherentes', async () => {
    const r = await list(A, 'search=NoExisteNadie');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(0);
    expect(r.body.items).toEqual([]);
    expect(r.body.page).toBe(1);
    expect(r.body.totalPages).toBe(1);
  });

  it('los comodines del LIKE (% y _) escritos por el usuario se tratan como texto literal', async () => {
    expect((await list(A, 'search=%25')).body.total).toBe(0);
    expect((await list(A, 'search=_')).body.total).toBe(0);
    expect((await list(A, 'search=Cliente_ 001')).body.total).toBe(0);                // "_" no es "cualquier carácter"
  });

  it('el término se recorta (espacios) y vacío equivale a sin búsqueda', async () => {
    expect((await list(A, 'search=%20%20ClienteA 002%20')).body.total).toBe(1);
    expect((await list(A, 'search=%20%20')).body.total).toBe(N);
  });
});

describe('aislamiento por tenant', () => {
  it('el tenant A nunca recibe clientes del tenant B (ni paginando, ni buscando) y viceversa', async () => {
    const bIds = new Set(B.ids);
    for (let p = 1; p <= 3; p++) for (const c of (await list(A, `page=${p}&pageSize=100`)).body.items) expect(bIds.has(c.id)).toBe(false);
    const searchB = await list(A, 'search=ClienteB');
    expect(searchB.body.total).toBe(0);
    const searchPhoneB = await list(A, 'search=809-777-1001');
    expect(searchPhoneB.body.total).toBe(0);
    const b = await list(B, 'pageSize=100');
    expect(b.body.total).toBe(3);
    expect(b.body.items.map((c: any) => c.id).sort()).toEqual([...B.ids].sort());
    expect((await list(B, 'search=ClienteA')).body.total).toBe(0);
  });
});

describe('filtros + búsqueda + paginación', () => {
  it('is_active + score_band + search se combinan en la misma consulta y se paginan (coincide con el cálculo directo en BD)', async () => {
    const expectedIds = (app.db.prepare("SELECT id FROM clients WHERE tenant_id=? AND is_active=1 AND score>=70 AND score<85 AND full_name LIKE '%ClienteA 1%' ORDER BY created_at DESC, id ASC").all(A.tenantId) as any[]).map(x => x.id);
    expect(expectedIds.length).toBeGreaterThan(3);
    const seen: string[] = [];
    let total = 0, pages = 0;
    for (let p = 1; p <= 10; p++) {
      const r = await list(A, `is_active=true&score_band=muy_bueno&search=ClienteA 1&pageSize=3&page=${p}`);
      total = r.body.total; pages = r.body.totalPages;
      seen.push(...r.body.items.map((c: any) => c.id));
      if (p >= r.body.totalPages) break;
    }
    expect(total).toBe(expectedIds.length);
    expect(pages).toBe(Math.ceil(expectedIds.length / 3));
    expect(seen).toEqual(expectedIds);                        // mismo contenido y mismo orden, sin repetir
  });

  it('is_active=false trae solo inactivos y score_band respeta cada umbral', async () => {
    const inactive = await list(A, 'is_active=false&pageSize=100');
    expect(inactive.body.total).toBe(Math.floor(N / 6));
    expect(inactive.body.items.every((c: any) => c.is_active === 0)).toBe(true);
    const bands: Record<string, [number, number]> = { excelente: [85, 1000], muy_bueno: [70, 85], bueno: [50, 70], regular: [30, 50], deficiente: [-1, 30] };
    for (const [band, [lo, hi]] of Object.entries(bands)) {
      const r = await list(A, `score_band=${band}&pageSize=100`);
      const exp = (app.db.prepare('SELECT COUNT(*) c FROM clients WHERE tenant_id=? AND score>=? AND score<?').get(A.tenantId, lo, hi) as any).c;
      expect(r.body.total, band).toBe(exp);
      expect(r.body.items.every((c: any) => c.score >= lo && c.score < hi), band).toBe(true);
    }
    expect((await list(A, 'score_band=inventado')).body.total).toBe(N);              // banda desconocida se ignora
  });
});

describe('frontend: Clientes usa la paginación del servidor (tabla y tarjetas, mismo dataset)', () => {
  const FE = path.join(__dirname, '../../../frontend/src');
  const page = fs.readFileSync(path.join(FE, 'pages/clients/ClientsPage.tsx'), 'utf8');
  it('ya no pide limit=200 ni filtra en el navegador; consulta page/pageSize/search/filtros al servidor', () => {
    expect(page).not.toContain('limit=200');
    expect(page).not.toMatch(/clients\.filter\(/);
    for (const s of ["api.get('/clients', { params })", 'page, pageSize: PAGE_SIZE', 'params.search = searchTerm', 'params.is_active', 'params.score_band']) expect(page, s).toContain(s);
  });
  it('búsqueda con debounce que vuelve a la página 1; filtros también; un solo efecto de carga; respuestas viejas descartadas', () => {
    expect(page).toContain('SEARCH_DEBOUNCE_MS');
    expect(page).toMatch(/setSearchTerm\(searchInput\.trim\(\)\); setPage\(1\)/);
    expect(page).toContain('setScoreFilter(e.target.value); setPage(1)');
    expect(page).toContain('setStatusFilter(e.target.value); setPage(1)');
    expect((page.match(/api\.get\('\/clients'/g) || []).length).toBe(1);
    expect(page).toContain('requestId.current');
  });
  it('cards móviles y tabla de escritorio usan el mismo arreglo y la paginación está dentro del mismo Card', () => {
    expect(page).toContain('data-testid="clients-mobile-list"');
    expect(page).toContain('<div className="hidden md:block overflow-x-auto">');
    expect((page.match(/filteredClients\.map\(/g) || []).length).toBe(2);
    expect(page).toContain('<Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE}');
  });
  it('estados: error con reintentar, cargando, vacío y página fuera de rango (vuelve a la última válida)', () => {
    expect(page).toContain('data-testid="clients-error"');
    expect(page).toContain("setReloadKey(k => k + 1)");
    expect(page).toContain('d.page !== page');
    expect(page).toContain("t('cli.empty_title')");
    const pag = fs.readFileSync(path.join(FE, 'components/ui/Pagination.tsx'), 'utf8');
    for (const s of ["t('pag.prev')", "t('pag.next')", "t('pag.page_of')", 'totalPages > 1', 'disabled || atFirst', 'disabled || atLast']) expect(pag, s).toContain(s);
    const i18n = fs.readFileSync(path.join(FE, 'lib/i18n.ts'), 'utf8');
    for (const k of ['pag.aria', 'pag.showing', 'pag.prev', 'pag.next', 'pag.page_of', 'cli.retry']) {
      const line = i18n.split('\n').find(l => l.trimStart().startsWith(`'${k}':`));
      expect(line, k).toBeTruthy();
      for (const lang of ['es', 'en', 'pt']) expect(line!, `${k}.${lang}`).toMatch(new RegExp(`${lang}: '[^']{3,}`));
    }
  });
});

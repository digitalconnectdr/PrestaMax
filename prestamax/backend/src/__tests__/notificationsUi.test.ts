// Notifications V2 — campana del frontend. No hay runner de componentes en el frontend,
// así que la lógica va en un módulo puro (frontend/src/lib/notifications.ts, probado
// aquí con comportamiento real) y el cableado del componente se verifica sobre su fuente.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  PAGE_SIZE, POLL_INTERVAL_MS, shouldPoll, hasMore, mergePage, notificationLink, parseServerTimestamp, AppNotification,
} from '../../../frontend/src/lib/notifications';

const FRONT = path.resolve(__dirname, '..', '..', '..', 'frontend', 'src');
const read = (p: string) => fs.readFileSync(path.join(FRONT, p), 'utf8');
const mk = (id: string): AppNotification => ({ id, type: 'x', title: id, message: '', entityType: null, entityId: null, isRead: 0, createdAt: '2030-01-01 10:00:00' });

describe('lógica pura de la campana', () => {
  it('"Cargar más": hay más páginas mientras total > cargadas; mergePage no duplica y preserva el orden', () => {
    expect(PAGE_SIZE).toBe(20);
    expect(hasMore(45, 20)).toBe(true);
    expect(hasMore(45, 40)).toBe(true);
    expect(hasMore(45, 45)).toBe(false);
    expect(hasMore(0, 0)).toBe(false);
    const p1 = [mk('a'), mk('b')];
    const merged = mergePage(p1, [mk('b'), mk('c')]);
    expect(merged.map(n => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('polling: intervalo mínimo 60 s y pausado cuando la pestaña está oculta', () => {
    expect(POLL_INTERVAL_MS).toBeGreaterThanOrEqual(60_000);
    expect(shouldPoll(true)).toBe(false);
    expect(shouldPoll(false)).toBe(true);
  });

  it('fechas: "YYYY-MM-DD HH:MM:SS" de SQLite se interpreta como UTC (no como hora local)', () => {
    expect(parseServerTimestamp('2030-01-01 10:00:00')!.toISOString()).toBe('2030-01-01T10:00:00.000Z');
    expect(parseServerTimestamp('2030-01-01T10:00:00')!.toISOString()).toBe('2030-01-01T10:00:00.000Z');
    expect(parseServerTimestamp('2030-01-01T10:00:00.000Z')!.toISOString()).toBe('2030-01-01T10:00:00.000Z');
    expect(parseServerTimestamp('2030-01-01T10:00:00-04:00')!.toISOString()).toBe('2030-01-01T14:00:00.000Z');
    expect(parseServerTimestamp('basura')).toBeNull();
    expect(parseServerTimestamp(null)).toBeNull();
  });

  it('deep links por recurso (incluye billing)', () => {
    expect(notificationLink({ entityType: 'loan', entityId: 'L1' })).toBe('/loans/L1');
    expect(notificationLink({ entityType: 'loan', entityId: null })).toBeNull();
    expect(notificationLink({ entityType: 'collection_task', entityId: 't' })).toBe('/collections');
    expect(notificationLink({ entityType: 'loan_request', entityId: 'r' })).toBe('/requests');
    expect(notificationLink({ entityType: 'payment', entityId: 'p' })).toBe('/payments');
    expect(notificationLink({ entityType: 'subscription', entityId: null })).toBe('/settings/subscription');
    expect(notificationLink({ entityType: 'plan_inquiry', entityId: 'i' })).toBe('/admin?tab=inquiries');
    expect(notificationLink({ entityType: null, entityId: null })).toBeNull();
  });
});

describe('componente NotificationBell', () => {
  const src = read('components/shared/NotificationBell.tsx');

  it('carga el listado al abrir; el polling pide SOLO unread-count, en pausa con la pestaña oculta y refresca al volver', () => {
    expect(src).toMatch(/const handleOpen[\s\S]{0,200}loadFirstPage\(\)/);
    expect(src).toMatch(/setInterval\(\(\) => \{\s*if \(shouldPoll\(document\.hidden\)\) fetchUnreadCount\(\)/);
    expect(src).toMatch(/addEventListener\('visibilitychange'/);
    expect(src).toMatch(/removeEventListener\('visibilitychange'/);
    // el intervalo de polling no llama al listado completo
    const pollBlock = src.slice(src.indexOf('const fetchUnreadCount'), src.indexOf('Close panel'));
    expect(pollBlock).toMatch(/\/notifications\/unread-count/);
    expect(pollBlock).not.toMatch(/api\.get\(`\/notifications\?/);
  });

  it('botón "Cargar más" cuando total > cargadas, con offset real', () => {
    expect(src).toMatch(/hasMore\(total, notifications\.length\)/);
    expect(src).toMatch(/offset=\$\{notifications\.length\}/);
    expect(src).toMatch(/t\('notif\.load_more'\)/);
    expect(src).toMatch(/mergePage\(prev,/);
  });

  it('estado de error DISTINTO de "Sin notificaciones" (con reintento)', () => {
    expect(src).toMatch(/setLoadError\(true\)/);
    expect(src).toMatch(/loadError && notifications\.length === 0[\s\S]{0,300}t\('notif\.error'\)[\s\S]{0,300}t\('notif\.retry'\)/);
    expect(src).toMatch(/t\('notif\.empty'\)/);
    // el catch del listado ya no es silencioso
    expect(src).not.toMatch(/catch \{ \/\* silencioso \*\/ \} finally \{\s*setIsLoading/);
  });

  it('el badge sale del unread real del servidor', () => {
    expect(src).toMatch(/setUnreadCount\(res\.data\.count \|\| 0\)/);
    expect(src).toMatch(/setUnreadCount\(res\.data\.unread \|\| 0\)/);
  });

  it('el pie "Ver tareas de cobranza" solo con permiso efectivo collections.tasks', () => {
    expect(src).toMatch(/can\('collections\.tasks'\)[\s\S]{0,400}t\('notif\.go_tasks'\)/);
    expect(src).toMatch(/usePermission/);
  });

  it('accesibilidad: aria-label en la campana, estado aria-expanded, anuncio aria-live y filas como <button>', () => {
    expect(src).toMatch(/aria-label=\{unreadCount > 0/);
    expect(src).toMatch(/aria-expanded=\{isOpen\}/);
    expect(src).toMatch(/aria-live="polite"/);
    expect(src).toMatch(/<li key=\{notif\.id\}>\s*<button\s+type="button"\s+onClick=\{\(\) => handleClickNotif/);
    expect(src).not.toMatch(/<div[^>]*onClick=\{\(\) => handleClickNotif/); // ya no es un div clickeable
    expect(src).toMatch(/e\.key === 'Escape'/);
  });

  it('textos por i18n (sin cadenas fijas) y claves en es/en/pt', () => {
    expect(src).not.toMatch(/>\s*(Notificaciones|Sin notificaciones|Leer todo|Cargando\.\.\.)\s*</);
    const i18n = read('lib/i18n.ts');
    const keys = ['notif.title', 'notif.bell_aria', 'notif.unread_aria', 'notif.empty', 'notif.loading', 'notif.error', 'notif.retry',
      'notif.mark_all', 'notif.mark_all_title', 'notif.close', 'notif.load_more', 'notif.loading_more', 'notif.go_tasks', 'notif.row_unread'];
    for (const k of keys) {
      expect(i18n, k).toMatch(new RegExp(`'${k.replace('.', '\\.')}':\\s*\\{\\s*es:\\s*[^}]*en:\\s*[^}]*pt:`));
      expect(src, k).toContain(`'${k}'`);
    }
  });

  it('las fechas usan el timestamp UTC correctamente interpretado (no formatDate/parseDate local)', () => {
    expect(src).toMatch(/parseServerTimestamp\(raw\)/);
    expect(src).not.toMatch(/formatDate\(notif\.createdAt\)/);
  });
});

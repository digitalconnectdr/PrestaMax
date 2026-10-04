import { Router, Response } from 'express';
import { getDb } from '../db/database';
import { authenticate, requireTenant, AuthRequest, isPlatformStaff } from '../middleware/auth';
import { effectivePermissionSet } from '../lib/access';

const router = Router();

// Las notificaciones se filtran SIEMPRE por tenant + usuario. Ademas, las que traen
// required_permission solo se devuelven si el usuario conserva ese permiso EFECTIVO
// (plan AND rol): tras un downgrade o un cambio de rol no se filtra contenido de una
// feature a la que ya no accede (el historico no se borra; reaparece si recupera el permiso).
// El staff de plataforma (soporte) no se filtra.
function visibility(req: AuthRequest, db: any): { sql: string; params: any[] } {
  if (isPlatformStaff(req.user)) return { sql: '', params: [] };
  const needed = (db.prepare(
    `SELECT DISTINCT required_permission AS p FROM notifications
     WHERE tenant_id=? AND user_id=? AND required_permission IS NOT NULL`
  ).all(req.tenant.id, req.user.id) as any[]).map(r => r.p as string);
  if (needed.length === 0) return { sql: '', params: [] };
  const perms = effectivePermissionSet(req, db);
  const allowed = needed.filter(p => perms.has(p));
  if (allowed.length === 0) return { sql: ' AND required_permission IS NULL', params: [] };
  return {
    sql: ` AND (required_permission IS NULL OR required_permission IN (${allowed.map(() => '?').join(',')}))`,
    params: allowed,
  };
}

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

function parseIntParam(raw: unknown, name: string, def: number): number | { error: string } {
  if (raw === undefined || raw === '') return def;
  if (typeof raw !== 'string' || !/^-?\d+$/.test(raw.trim())) return { error: `${name} debe ser un entero.` };
  return parseInt(raw, 10);
}

const fail = (e: any, res: Response) => {
  console.error('[notifications] error:', String(e?.message || e).slice(0, 160));
  res.status(500).json({ error: 'No se pudieron procesar las notificaciones.' });
};

// GET /notifications — pagina de notificaciones del usuario actual
router.get('/', authenticate, requireTenant, (req: AuthRequest, res: Response) => {
  try {
    const l = parseIntParam(req.query.limit, 'limit', DEFAULT_LIMIT);
    const o = parseIntParam(req.query.offset, 'offset', 0);
    if (typeof l === 'object') return res.status(400).json({ error: l.error, code: 'INVALID_PAGINATION' });
    if (typeof o === 'object') return res.status(400).json({ error: o.error, code: 'INVALID_PAGINATION' });
    if (l < 1) return res.status(400).json({ error: 'limit debe ser >= 1.', code: 'INVALID_PAGINATION' });
    if (o < 0) return res.status(400).json({ error: 'offset debe ser >= 0.', code: 'INVALID_PAGINATION' });
    const limit = Math.min(l, MAX_LIMIT);

    const db = getDb();
    const vis = visibility(req, db);
    const base = `FROM notifications WHERE tenant_id=? AND user_id=?${vis.sql}`;
    const args = [req.tenant.id, req.user.id, ...vis.params];
    const notifications = db.prepare(
      `SELECT id, type, title, message, entity_type, entity_id, is_read, created_at ${base}
       ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
    ).all(...args, limit, o);
    const total = (db.prepare(`SELECT COUNT(*) AS c ${base}`).get(...args) as any).c;
    const unread = (db.prepare(`SELECT COUNT(*) AS c ${base} AND is_read=0`).get(...args) as any).c;
    res.json({ notifications, unread, total });
  } catch (e) { fail(e, res); }
});

// GET /notifications/unread-count — ping liviano para el badge de la campana
router.get('/unread-count', authenticate, requireTenant, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const vis = visibility(req, db);
    const row = db.prepare(
      `SELECT COUNT(*) AS c FROM notifications WHERE tenant_id=? AND user_id=? AND is_read=0${vis.sql}`
    ).get(req.tenant.id, req.user.id, ...vis.params) as any;
    res.json({ count: row.c });
  } catch (e) { fail(e, res); }
});

// PATCH /notifications/read-all — marca como leidas SOLO las propias y visibles
router.patch('/read-all', authenticate, requireTenant, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const vis = visibility(req, db);
    const r = db.prepare(
      `UPDATE notifications SET is_read=1 WHERE tenant_id=? AND user_id=? AND is_read=0${vis.sql}`
    ).run(req.tenant.id, req.user.id, ...vis.params) as any;
    res.json({ success: true, updated: Number(r?.changes || 0) });
  } catch (e) { fail(e, res); }
});

// PATCH /notifications/:id/read — marca una como leida. Inexistente, de otro usuario,
// de otro tenant o no visible => 404 uniforme (no revela nada de otra empresa).
router.patch('/:id/read', authenticate, requireTenant, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const vis = visibility(req, db);
    const r = db.prepare(
      `UPDATE notifications SET is_read=1 WHERE id=? AND tenant_id=? AND user_id=?${vis.sql}`
    ).run(req.params.id, req.tenant.id, req.user.id, ...vis.params) as any;
    if (!Number(r?.changes || 0)) return res.status(404).json({ error: 'Notificación no encontrada.', code: 'NOTIFICATION_NOT_FOUND' });
    res.json({ success: true });
  } catch (e) { fail(e, res); }
});

export default router;

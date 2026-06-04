// inquiries — gestion de leads capturados desde la landing publica.
//
// Endpoints admin-only:
//   GET    /api/admin/inquiries           — lista (filtrable por status)
//   GET    /api/admin/inquiries/stats     — contadores por status
//   PATCH  /api/admin/inquiries/:id       — cambiar status / notas / vincular tenant
//   DELETE /api/admin/inquiries/:id       — borrar (spam, error, etc.)
//
// El endpoint publico POST esta en routes/public.ts (lo creara el form de la landing).

import { Router, Response } from 'express';
import { getDb, now } from '../db/database';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

function requirePlatformAdmin(req: AuthRequest, res: Response, next: any) {
  const role = req.user?.platformRole || (req.user as any)?.platform_role || '';
  if (role !== 'admin' && role !== 'platform_owner') {
    return res.status(403).json({ error: 'Acceso solo para administradores de la plataforma' });
  }
  next();
}

function clean(v: any, max = 500): string {
  if (v === null || v === undefined) return '';
  return String(v).trim().slice(0, max);
}

// GET /api/admin/inquiries — lista con filtros
router.get('/', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const status = clean(req.query.status, 30);
    const limit  = Math.min(parseInt(String(req.query.limit || '200'), 10) || 200, 500);

    let sql = 'SELECT * FROM plan_inquiries';
    const params: any[] = [];
    if (status && ['new','contacted','converted','rejected'].includes(status)) {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY datetime(created_at) DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// GET /api/admin/inquiries/stats — contadores por status (badge en sidebar)
router.get('/stats', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const stats = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM plan_inquiries
      GROUP BY status
    `).all() as any[];

    const result = { new: 0, contacted: 0, converted: 0, rejected: 0, total: 0 };
    for (const s of stats) {
      result[s.status as keyof typeof result] = s.count;
      result.total += s.count;
    }
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// PATCH /api/admin/inquiries/:id — cambiar status / notas / vincular tenant
router.patch('/:id', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const id = req.params.id;
    const existing = db.prepare('SELECT * FROM plan_inquiries WHERE id = ?').get(id) as any;
    if (!existing) return res.status(404).json({ error: 'Lead no encontrado' });

    const status = clean(req.body.status, 20);
    const notes  = req.body.notes != null ? clean(req.body.notes, 2000) : null;
    const converted_to_tenant_id = req.body.converted_to_tenant_id != null
      ? clean(req.body.converted_to_tenant_id, 50) : null;

    if (status && !['new','contacted','converted','rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status invalido' });
    }

    const updates: string[] = ['updated_at = ?'];
    const params: any[] = [now()];

    if (status) {
      updates.push('status = ?');
      params.push(status);
      if (status === 'contacted' && !existing.contacted_at) {
        updates.push('contacted_at = ?', 'contacted_by = ?');
        params.push(now(), req.user?.id || null);
      }
    }
    if (notes !== null) {
      updates.push('notes = ?');
      params.push(notes);
    }
    if (converted_to_tenant_id !== null) {
      updates.push('converted_to_tenant_id = ?');
      params.push(converted_to_tenant_id || null);
    }

    params.push(id);
    db.prepare(`UPDATE plan_inquiries SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare('SELECT * FROM plan_inquiries WHERE id = ?').get(id);
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// DELETE /api/admin/inquiries/:id — para limpiar spam evidente
// También elimina las notificaciones asociadas (campanita) para que no queden
// "huérfanas" apuntando a una solicitud que ya no existe.
router.delete('/:id', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM plan_inquiries WHERE id = ?').run(req.params.id);
    // Limpiar notificaciones de la campanita relacionadas a esta solicitud
    try {
      db.prepare("DELETE FROM notifications WHERE type='plan_inquiry' AND entity_id=?").run(req.params.id);
    } catch (_) { /* no critical */ }
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

export default router;

import { Router, Response } from 'express';
import { getDb } from '../db/database';
import { authenticate, requireTenant, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /notifications — get paginated notifications for current user
router.get('/', authenticate, requireTenant, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { limit: lim = '30', offset: off = '0' } = req.query as any;
    const notifications = db.prepare(`
      SELECT * FROM notifications
      WHERE tenant_id=? AND user_id=?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.tenant.id, req.user.id, parseInt(lim), parseInt(off));
    const unread = (db.prepare('SELECT COUNT(*) as c FROM notifications WHERE tenant_id=? AND user_id=? AND is_read=0').get(req.tenant.id, req.user.id) as any).c;
    res.json({ notifications, unread });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// GET /notifications/unread-count — lightweight ping for the bell badge
router.get('/unread-count', authenticate, requireTenant, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE tenant_id=? AND user_id=? AND is_read=0').get(req.tenant.id, req.user.id) as any;
    res.json({ count: row.c });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// PATCH /notifications/:id/read — mark single notification as read
router.patch('/:id/read', authenticate, requireTenant, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    db.prepare('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=? AND tenant_id=?').run(req.params.id, req.user.id, req.tenant.id);
    res.json({ success: true });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// PATCH /notifications/read-all — mark all notifications as read
router.patch('/read-all', authenticate, requireTenant, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=? AND tenant_id=?').run(req.user.id, req.tenant.id);
    res.json({ success: true });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

export default router;

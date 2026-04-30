import { Router, Response } from 'express';
import { getDb, uuid, now } from '../db/database';
import { authenticate, requireTenant, requirePermission, AuthRequest } from '../middleware/auth';
const router = Router();
router.get('/', authenticate, requireTenant, requirePermission('whatsapp.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    res.json(db.prepare('SELECT * FROM whatsapp_messages WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100').all(req.tenant.id));
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});
router.get('/templates', authenticate, requireTenant, requirePermission('whatsapp.templates'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    res.json(db.prepare('SELECT * FROM whatsapp_templates WHERE tenant_id=? AND is_active=1 ORDER BY name').all(req.tenant.id));
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

// POST create whatsapp template
router.post('/templates', authenticate, requireTenant, requirePermission('whatsapp.templates'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const id = uuid(); const d = req.body;
    if (!d.name || !d.body) return res.status(400).json({ error: 'Nombre y cuerpo son requeridos' });
    db.prepare('INSERT INTO whatsapp_templates (id,tenant_id,name,event,body,is_active) VALUES (?,?,?,?,?,1)').run(id, req.tenant.id, d.name, d.event || 'manual', d.body);
    res.status(201).json(db.prepare('SELECT * FROM whatsapp_templates WHERE id=?').get(id));
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// PUT update whatsapp template
router.put('/templates/:id', authenticate, requireTenant, requirePermission('whatsapp.templates'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const d = req.body;
    const tpl = db.prepare('SELECT id FROM whatsapp_templates WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id);
    if (!tpl) return res.status(404).json({ error: 'Plantilla no encontrada' });
    db.prepare('UPDATE whatsapp_templates SET name=COALESCE(?,name), event=COALESCE(?,event), body=COALESCE(?,body) WHERE id=?').run(
      d.name || null, d.event || null, d.body || null, req.params.id
    );
    res.json(db.prepare('SELECT * FROM whatsapp_templates WHERE id=?').get(req.params.id));
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// DELETE whatsapp template (soft delete)
router.delete('/templates/:id', authenticate, requireTenant, requirePermission('whatsapp.templates'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    db.prepare('UPDATE whatsapp_templates SET is_active=0 WHERE id=? AND tenant_id=?').run(req.params.id, req.tenant.id);
    res.json({ success: true });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

router.post('/send', authenticate, requireTenant, requirePermission('whatsapp.send'), (req: AuthRequest, res: Response) => {
  try {
    const { client_phone, body, event='manual', loan_id } = req.body;
    const db = getDb(); const id = uuid();
    db.prepare('INSERT INTO whatsapp_messages (id,tenant_id,user_id,loan_id,client_phone,event,body,status,sent_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id,req.tenant.id,req.user.id,loan_id||null,client_phone,event,body,'sent',now());
    res.status(201).json(db.prepare('SELECT * FROM whatsapp_messages WHERE id=?').get(id));
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});
export default router;

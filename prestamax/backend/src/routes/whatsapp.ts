import { Router, Response } from 'express';
import { getDb, uuid, now } from '../db/database';
import { authenticate, requireTenant, requirePermission, AuthRequest } from '../middleware/auth';
import { WA_EVENTS, WA_EVENT_LABELS } from '../services/whatsappService';
const router = Router();
router.get('/', authenticate, requireTenant, requirePermission('whatsapp.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    // Historial: solo mensajes que YA fueron enviados (is_draft=0). Los drafts pendientes
    // viven en /api/whatsapp/outbox?status=draft. Esto evita confusion al usuario.
    const rows = db.prepare(`
      SELECT m.*, c.full_name as client_name, l.loan_number as loan_number
      FROM whatsapp_messages m
      LEFT JOIN clients c ON c.id = m.client_id
      LEFT JOIN loans l ON l.id = m.loan_id
      WHERE m.tenant_id=? AND m.is_draft=0
      ORDER BY m.created_at DESC LIMIT 200
    `).all(req.tenant.id);
    res.json(rows);
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
// ─────────────────────────────────────────────────────────────────────────────
// BANDEJA DE ENVIOS (OUTBOX) — drafts y enviados
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/whatsapp/outbox?status=draft|sent  — lista mensajes con filtro
router.get('/outbox', authenticate, requireTenant, requirePermission('whatsapp.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const status = (req.query.status as string) || 'draft';
    const draftFlag = status === 'draft' ? 1 : 0;
    const rows = db.prepare(`
      SELECT m.*, c.full_name as client_name, c.first_name as client_first_name,
             l.loan_number as loan_number
      FROM whatsapp_messages m
      LEFT JOIN clients c ON c.id = m.client_id
      LEFT JOIN loans l ON l.id = m.loan_id
      WHERE m.tenant_id=? AND m.is_draft=?
      ORDER BY m.created_at DESC LIMIT 200
    `).all(req.tenant.id, draftFlag);
    res.json(rows);
  } catch (e: any) {
    console.error('outbox list error:', e);
    res.status(500).json({ error: 'Failed' });
  }
});

// POST /api/whatsapp/outbox/:id/mark-sent — marca un draft como enviado
router.post('/outbox/:id/mark-sent', authenticate, requireTenant, requirePermission('whatsapp.send'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const msg = db.prepare('SELECT id FROM whatsapp_messages WHERE id=? AND tenant_id=? AND is_draft=1').get(req.params.id, req.tenant.id);
    if (!msg) return res.status(404).json({ error: 'Draft no encontrado' });
    db.prepare(`UPDATE whatsapp_messages SET is_draft=0, status='sent', sent_at=?, user_id=COALESCE(user_id,?) WHERE id=?`).run(now(), req.user.id, req.params.id);
    res.json(db.prepare('SELECT * FROM whatsapp_messages WHERE id=?').get(req.params.id));
  } catch (e: any) {
    console.error('mark-sent error:', e);
    res.status(500).json({ error: 'Failed' });
  }
});

// DELETE /api/whatsapp/outbox/:id — descartar un draft
router.delete('/outbox/:id', authenticate, requireTenant, requirePermission('whatsapp.send'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM whatsapp_messages WHERE id=? AND tenant_id=? AND is_draft=1').run(req.params.id, req.tenant.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Draft no encontrado' });
    res.json({ success: true });
  } catch (e: any) {
    console.error('outbox delete error:', e);
    res.status(500).json({ error: 'Failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACION POR EVENTO (switches on/off)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/whatsapp/event-settings — devuelve config de los 5 eventos
router.get('/event-settings', authenticate, requireTenant, requirePermission('whatsapp.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT event, enabled, template_id FROM whatsapp_event_settings WHERE tenant_id=?').all(req.tenant.id) as any[];
    const byEvent: Record<string, any> = {};
    for (const r of rows) byEvent[r.event] = { enabled: !!r.enabled, template_id: r.template_id };
    // Devolver una entrada por cada evento, default disabled
    const result = WA_EVENTS.map(ev => ({
      event: ev,
      label: WA_EVENT_LABELS[ev],
      enabled: byEvent[ev]?.enabled || false,
      template_id: byEvent[ev]?.template_id || null,
    }));
    res.json(result);
  } catch (e: any) {
    console.error('event-settings list error:', e);
    res.status(500).json({ error: 'Failed' });
  }
});

// PUT /api/whatsapp/event-settings — body: { event, enabled, template_id? }
router.put('/event-settings', authenticate, requireTenant, requirePermission('whatsapp.templates'), (req: AuthRequest, res: Response) => {
  try {
    const { event, enabled, template_id } = req.body;
    if (!event || !WA_EVENTS.includes(event)) {
      return res.status(400).json({ error: 'Evento invalido' });
    }
    const db = getDb();
    const existing = db.prepare('SELECT id FROM whatsapp_event_settings WHERE tenant_id=? AND event=?').get(req.tenant.id, event) as any;
    if (existing) {
      db.prepare(`UPDATE whatsapp_event_settings SET enabled=?, template_id=?, updated_at=? WHERE id=?`)
        .run(enabled ? 1 : 0, template_id || null, now(), existing.id);
    } else {
      db.prepare(`INSERT INTO whatsapp_event_settings (id, tenant_id, event, enabled, template_id) VALUES (?,?,?,?,?)`)
        .run(uuid(), req.tenant.id, event, enabled ? 1 : 0, template_id || null);
    }
    res.json({ event, enabled: !!enabled, template_id: template_id || null });
  } catch (e: any) {
    console.error('event-settings put error:', e);
    res.status(500).json({ error: 'Failed' });
  }
});

export default router;

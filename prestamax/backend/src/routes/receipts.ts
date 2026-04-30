import { Router, Response } from 'express';
import { getDb, uuid, now } from '../db/database';
import { authenticate, requireTenant, requirePermission, AuthRequest } from '../middleware/auth';
const router = Router();

router.get('/', authenticate, requireTenant, requirePermission('receipts.view'), (req: AuthRequest, res: Response) => {
  try {
    const { page='1', limit='20', search } = req.query as any;
    const skip = (parseInt(page)-1)*parseInt(limit);
    const db = getDb();
    let where = 'WHERE r.tenant_id=?'; const params: any[] = [req.tenant.id];
    if (search) { where+=' AND (r.receipt_number LIKE ? OR r.client_name LIKE ?)'; const s=`%${search}%`; params.push(s,s); }
    // Ensure is_voided column exists (idempotent migration)
    try { db.exec(`ALTER TABLE receipts ADD COLUMN is_voided INTEGER NOT NULL DEFAULT 0`); } catch(_) {}
    const total = (db.prepare(`SELECT COUNT(*) as c FROM receipts r ${where}`).get(...params) as any).c;
    const data = db.prepare(`
      SELECT r.*, p.payment_method, p.payment_date, p.is_voided as payment_is_voided,
        COALESCE(r.is_voided, p.is_voided, 0) as is_voided,
        u.full_name as issued_by_name,
        reg.full_name as registered_by_name
      FROM receipts r
      JOIN payments p ON p.id=r.payment_id
      JOIN users u ON u.id=r.issued_by
      LEFT JOIN users reg ON reg.id=p.registered_by
      ${where} ORDER BY r.issued_at DESC LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), skip);
    res.json({ data, total });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

router.get('/:id', authenticate, requireTenant, requirePermission('receipts.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const receipt = db.prepare(`
      SELECT r.*, u.full_name as issued_by_name
      FROM receipts r JOIN users u ON u.id=r.issued_by
      WHERE r.id=? AND r.tenant_id=?
    `).get(req.params.id, req.tenant.id) as any;
    if (!receipt) return res.status(404).json({ error: 'Recibo no encontrado' });
    receipt.payment = db.prepare('SELECT p.*, pi.concept, pi.amount as item_amount FROM payments p LEFT JOIN payment_items pi ON pi.payment_id=p.id WHERE p.id=?').all(receipt.payment_id);
    receipt.loan = db.prepare('SELECT l.*, c.full_name as client_name FROM loans l JOIN clients c ON c.id=l.client_id WHERE l.id=?').get(receipt.loan_id);
    try { receipt.concept_detail = JSON.parse(receipt.concept_detail||'{}'); } catch(_) {}
    res.json(receipt);
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// POST reprint a receipt
router.post('/:id/reprint', authenticate, requireTenant, requirePermission('receipts.reprint'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const receipt = db.prepare('SELECT * FROM receipts WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any;
    if (!receipt) return res.status(404).json({ error: 'Recibo no encontrado' });
    if (receipt.is_voided) return res.status(400).json({ error: 'No se puede reimprimir un recibo anulado. El pago asociado fue reversado.' });
    db.prepare('UPDATE receipts SET is_reprinted=1 WHERE id=?').run(req.params.id);
    db.prepare('INSERT INTO audit_logs (id,tenant_id,user_id,user_name,action,entity_type,entity_id,description) VALUES (?,?,?,?,?,?,?,?)').run(
      uuid(), req.tenant.id, req.user.id, req.user.full_name, 'receipt_reprinted', 'receipt', req.params.id,
      `Reimprimió el recibo ${receipt.receipt_number||req.params.id.slice(-8)}`
    );
    res.json({ success: true });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

export { router };

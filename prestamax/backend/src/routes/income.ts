import { Router, Response } from 'express';
import { getDb, uuid, now } from '../db/database';
import { authenticate, requireTenant, requirePermission, AuthRequest } from '../middleware/auth';
const router = Router();

// List income/expenses with filters
router.get('/', authenticate, requireTenant, requirePermission('income.view'), (req: AuthRequest, res: Response) => {
  try {
    const { page='1', limit='50', type, category, from_date, to_date } = req.query as any;
    const skip = (parseInt(page)-1)*parseInt(limit);
    const db = getDb();
    let where = 'WHERE ie.tenant_id=?'; const params: any[] = [req.tenant.id];
    if (type) { where += ' AND ie.type=?'; params.push(type); }
    if (category) { where += ' AND ie.category=?'; params.push(category); }
    if (from_date) { where += ' AND ie.transaction_date>=?'; params.push(from_date); }
    if (to_date) { where += ' AND ie.transaction_date<=?'; params.push(to_date + 'T23:59:59'); }
    const total = (db.prepare(`SELECT COUNT(*) as c FROM income_expenses ie ${where}`).get(...params) as any).c;
    const data = db.prepare(`
      SELECT ie.*, u.full_name as registered_by_name
      FROM income_expenses ie
      LEFT JOIN users u ON u.id=ie.registered_by
      ${where} ORDER BY ie.transaction_date DESC LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), skip);
    // Summary totals for current filters
    const summary = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN ie.type='income' THEN ie.amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN ie.type='expense' THEN ie.amount ELSE 0 END), 0) as total_expenses
      FROM income_expenses ie ${where}
    `).get(...params) as any;
    res.json({ data, total, summary });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// Create income/expense entry
router.post('/', authenticate, requireTenant, requirePermission('income.create'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const d = req.body; const id = uuid();
    if (!d.description || !d.amount || !d.type) return res.status(400).json({ error: 'Tipo, descripción y monto son requeridos' });
    if (!['income','expense'].includes(d.type)) return res.status(400).json({ error: 'Tipo debe ser income o expense' });
    const bankAccountId = d.bank_account_id || null;
    db.prepare(`INSERT INTO income_expenses
      (id,tenant_id,branch_id,registered_by,type,category,description,amount,transaction_date,payment_method,bank_account_id,reference,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, req.tenant.id, d.branch_id||null, req.user.id,
      d.type, d.category||'otros', d.description, parseFloat(d.amount),
      d.transaction_date || now(), d.payment_method||'cash', bankAccountId, d.reference||null, d.notes||null
    );
    // Update bank account balance
    if (bankAccountId) {
      const bankAcc = db.prepare('SELECT * FROM bank_accounts WHERE id=? AND tenant_id=? AND is_active=1').get(bankAccountId, req.tenant.id) as any;
      if (bankAcc) {
        const amt = parseFloat(d.amount);
        if (d.type === 'income') {
          db.prepare('UPDATE bank_accounts SET current_balance=current_balance+? WHERE id=?').run(amt, bankAccountId);
        } else {
          db.prepare('UPDATE bank_accounts SET current_balance=MAX(0,current_balance-?) WHERE id=?').run(amt, bankAccountId);
        }
      }
    }
    const entry = db.prepare('SELECT ie.*, u.full_name as registered_by_name FROM income_expenses ie LEFT JOIN users u ON u.id=ie.registered_by WHERE ie.id=?').get(id);
    res.status(201).json(entry);
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// Update entry
router.put('/:id', authenticate, requireTenant, requirePermission('income.edit'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const d = req.body;
    const entry = db.prepare('SELECT id FROM income_expenses WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id);
    if (!entry) return res.status(404).json({ error: 'Registro no encontrado' });
    db.prepare(`UPDATE income_expenses SET
      type=COALESCE(?,type), category=COALESCE(?,category), description=COALESCE(?,description),
      amount=COALESCE(?,amount), transaction_date=COALESCE(?,transaction_date),
      payment_method=COALESCE(?,payment_method), reference=COALESCE(?,reference), notes=COALESCE(?,notes)
    WHERE id=?`).run(
      d.type||null, d.category||null, d.description||null, d.amount?parseFloat(d.amount):null,
      d.transaction_date||null, d.payment_method||null, d.reference||null, d.notes||null, req.params.id
    );
    res.json(db.prepare('SELECT * FROM income_expenses WHERE id=?').get(req.params.id));
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// Delete entry
router.delete('/:id', authenticate, requireTenant, requirePermission('income.delete'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const entry = db.prepare('SELECT id FROM income_expenses WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id);
    if (!entry) return res.status(404).json({ error: 'Registro no encontrado' });
    db.prepare('DELETE FROM income_expenses WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

export default router;

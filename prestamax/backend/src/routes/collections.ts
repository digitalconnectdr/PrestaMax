import { Router, Response } from 'express';
import { getDb, uuid, now } from '../db/database';
import { authenticate, requireTenant, requirePermission, AuthRequest } from '../middleware/auth';
import { hasPermission } from '../lib/permissions';
const router = Router();



// ── UNIFIED COLLECTIONS ENDPOINT ────────────────────────────────────────────
// Returns loans with real-time computed status.
// Scope: admin/owner → all tenant loans; collector → only assigned loans.
// filter: all | overdue | upcoming | current (default: all)
// days: window for "upcoming" filter (default 7, max 30)
router.get('/loans', authenticate, requireTenant, requirePermission('collections.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const filter = (req.query.filter as string) || 'all';
    const days   = Math.min(Math.max(parseInt((req.query.days as string) || '7', 10), 1), 30);
    // Determine wideView from granular permission collections.manage
    // (plan features are loaded here so the check respects the plan ceiling)
    const planRow = db.prepare(
      "SELECT p.features FROM tenants t LEFT JOIN plans p ON p.id = t.plan_id WHERE t.id = ?"
    ).get(req.tenant.id) as any;
    const planFeatures: string[] = (() => {
      try { return JSON.parse(planRow?.features || '[]'); } catch(_) { return []; }
    })();
    const _roles: string[] = (() => { try { return JSON.parse(req.membership?.roles || '[]'); } catch(_) { return []; } })();
    const _explicit: Record<string,boolean> = (() => { try { return JSON.parse(req.membership?.permissions || '{}'); } catch(_) { return {}; } })();
    const wideView = hasPermission(_roles, _explicit, 'collections.manage', planFeatures);

    // Calculate date bounds for "upcoming"
    const today      = new Date();
    const todayStr   = today.toISOString().split('T')[0];
    const target     = new Date(today);
    target.setDate(target.getDate() + days);
    const targetStr  = target.toISOString().split('T')[0];

    // Base WHERE: tenant + active statuses + optional collector scope
    const scopeClause = wideView
      ? `l.status IN ('active', 'in_mora', 'overdue', 'disbursed')`
      : `l.status IN ('active', 'in_mora', 'overdue', 'disbursed') AND l.collector_id = '${req.user.id}'`;

    // HAVING clause applied after GROUP BY (aggregate filter)
    let havingClause = '';
    const extraParams: any[] = [];

    if (filter === 'overdue') {
      havingClause = `HAVING MIN(COALESCE(i.deferred_due_date, i.due_date)) < date('now')`;
    } else if (filter === 'upcoming') {
      havingClause = `HAVING date(MIN(COALESCE(i.deferred_due_date, i.due_date))) >= ? AND date(MIN(COALESCE(i.deferred_due_date, i.due_date))) < ?`;
      extraParams.push(todayStr, targetStr);
    } else if (filter === 'current') {
      havingClause = `HAVING MIN(COALESCE(i.deferred_due_date, i.due_date)) >= date('now')`;
    }

    const loans = db.prepare(`
      SELECT
        l.*,
        c.full_name  AS client_name,
        c.phone_personal,
        c.whatsapp,
        c.address,
        MIN(COALESCE(i.deferred_due_date, i.due_date)) AS next_due_date,
        CAST(ROUND(
          julianday(MIN(COALESCE(i.deferred_due_date, i.due_date))) - julianday('now')
        ) AS INTEGER) AS days_until_due,
        CAST(MAX(
          CASE WHEN COALESCE(i.deferred_due_date, i.due_date) < datetime('now')
               THEN ROUND(julianday('now') - julianday(COALESCE(i.deferred_due_date, i.due_date)))
               ELSE 0 END
        ) AS INTEGER) AS days_overdue_real,
        i.total_amount AS next_installment_amount,
        CASE
          WHEN MIN(COALESCE(i.deferred_due_date, i.due_date)) < datetime('now') THEN 'overdue'
          WHEN date(MIN(COALESCE(i.deferred_due_date, i.due_date))) < ? THEN 'upcoming'
          ELSE 'current'
        END AS collection_status
      FROM loans l
      JOIN clients c ON c.id = l.client_id
      JOIN installments i ON i.loan_id = l.id
      WHERE l.tenant_id = ?
        AND ${scopeClause}
        AND i.status NOT IN ('paid', 'waived', 'interest_paid')
      GROUP BY l.id
      ${havingClause}
      ORDER BY
        CASE WHEN MIN(COALESCE(i.deferred_due_date, i.due_date)) < datetime('now') THEN 0
             WHEN date(MIN(COALESCE(i.deferred_due_date, i.due_date))) < ? THEN 1
             ELSE 2 END,
        next_due_date ASC
      LIMIT 200
    `).all(targetStr, req.tenant.id, ...extraParams, targetStr) as any[];

    // Attach next 3 installments for expanded view
    const result = loans.map((loan: any) => {
      loan.next_installments = db.prepare(
        `SELECT * FROM installments WHERE loan_id=? AND status NOT IN ('paid','waived') ORDER BY COALESCE(deferred_due_date,due_date) LIMIT 3`
      ).all(loan.id);
      return loan;
    });

    res.json({ loans: result, scope: wideView ? 'all' : 'assigned', filter, days });
  } catch(e: any) { console.error('LOANS ERROR:', e); res.status(500).json({ error: e.message || 'Failed' }); }
});

router.get('/portfolio', authenticate, requireTenant, requirePermission('collections.view'), (req: AuthRequest, res: Response) => {
  try {
    const { collector_id } = req.query as any;
    const db = getDb(); const cid = collector_id || req.user.id;
    const loans = db.prepare(`SELECT l.*,c.full_name as client_name,c.phone_personal,c.whatsapp,c.address
      FROM loans l JOIN clients c ON c.id=l.client_id
      WHERE l.tenant_id=? AND l.collector_id=? AND l.status IN ('active','overdue','in_mora')
      ORDER BY l.days_overdue DESC`).all(req.tenant.id, cid) as any[];
    const result = loans.map((loan: any) => {
      loan.next_installments = db.prepare('SELECT * FROM installments WHERE loan_id=? AND status!=? ORDER BY due_date LIMIT 3').all(loan.id,'paid');
      loan.promises = db.prepare('SELECT * FROM payment_promises WHERE loan_id=? AND status=? ORDER BY promised_date LIMIT 1').all(loan.id,'pending');
      return loan;
    });
    res.json(result);
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

router.get('/overdue', authenticate, requireTenant, requirePermission('collections.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const loans = db.prepare(`
      SELECT l.*, c.full_name as client_name, c.phone_personal, c.whatsapp,
        CAST(MAX(julianday('now') - julianday(COALESCE(i.deferred_due_date, i.due_date))) AS INTEGER) as days_overdue
      FROM loans l
      JOIN clients c ON c.id = l.client_id
      JOIN installments i ON i.loan_id = l.id
      WHERE l.tenant_id = ?
        AND l.status IN ('active', 'in_mora', 'overdue', 'disbursed')
        AND i.status NOT IN ('paid', 'waived', 'interest_paid')
        AND COALESCE(i.deferred_due_date, i.due_date) < datetime('now')
      GROUP BY l.id
      ORDER BY days_overdue DESC
      LIMIT 100
    `).all(req.tenant.id);
    res.json(loans);
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// GET loans with installments due within the next N days (default 7), not yet overdue
router.get('/upcoming', authenticate, requireTenant, requirePermission('collections.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const days = Math.min(Math.max(parseInt((req.query.days as string) || '7', 10), 1), 30);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const target = new Date(today);
    target.setDate(target.getDate() + days);
    const targetStr = target.toISOString().split('T')[0];
    const loans = db.prepare(`
      SELECT l.*, c.full_name as client_name, c.phone_personal, c.whatsapp,
        MIN(COALESCE(i.deferred_due_date, i.due_date)) as next_due_date,
        CAST(ROUND(julianday(MIN(COALESCE(i.deferred_due_date, i.due_date))) - julianday('now')) AS INTEGER) as days_until_due,
        i.total_amount as next_installment_amount
      FROM loans l
      JOIN clients c ON c.id = l.client_id
      JOIN installments i ON i.loan_id = l.id
      WHERE l.tenant_id = ?
        AND l.status IN ('active', 'disbursed')
        AND i.status NOT IN ('paid', 'waived', 'interest_paid')
        AND date(COALESCE(i.deferred_due_date, i.due_date)) >= ?
        AND date(COALESCE(i.deferred_due_date, i.due_date)) < ?
      GROUP BY l.id
      ORDER BY next_due_date ASC
      LIMIT 100
    `).all(req.tenant.id, todayStr, targetStr);
    res.json(loans);
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

router.get('/notes/:loanId', authenticate, requireTenant, requirePermission('collections.notes'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    // Verify the loan belongs to this tenant
    const loan = db.prepare('SELECT id FROM loans WHERE id=? AND tenant_id=?').get(req.params.loanId, req.tenant.id);
    if (!loan) return res.status(404).json({ error: 'Préstamo no encontrado' });
    const notes = db.prepare(`
      SELECT cn.*, u.full_name as user_name
      FROM collection_notes cn
      LEFT JOIN users u ON u.id = cn.user_id
      WHERE cn.loan_id = ?
      ORDER BY cn.created_at DESC
      LIMIT 20
    `).all(req.params.loanId);
    res.json(notes);
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

router.post('/notes', authenticate, requireTenant, requirePermission('collections.notes'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const id = uuid(); const d = req.body;
    db.prepare('INSERT INTO collection_notes (id,loan_id,user_id,type,note,next_action,next_date) VALUES (?,?,?,?,?,?,?)').run(
      id, d.loan_id, req.user.id, d.type||'visit', d.note, d.next_action||null, d.next_date||null
    );
    res.status(201).json(db.prepare('SELECT * FROM collection_notes WHERE id=?').get(id));
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

router.get('/promises', authenticate, requireTenant, requirePermission('collections.promises'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const promises = db.prepare(`
      SELECT pp.*, l.loan_number, c.full_name as client_name, l.id as loan_id
      FROM payment_promises pp
      JOIN loans l ON l.id=pp.loan_id
      JOIN clients c ON c.id=l.client_id
      WHERE l.tenant_id=? ORDER BY pp.promised_date
    `).all(req.tenant.id);
    res.json(promises);
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

router.post('/promises', authenticate, requireTenant, requirePermission('collections.promises'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const id = uuid(); const d = req.body;
    if (!d.loan_id) return res.status(400).json({ error: 'loan_id es requerido' });
    if (!d.promised_date) return res.status(400).json({ error: 'La fecha de la promesa es requerida' });
    const promisedAmount = parseFloat(d.promised_amount);
    if (!d.promised_amount || isNaN(promisedAmount) || promisedAmount <= 0) {
      return res.status(400).json({ error: 'El monto prometido debe ser mayor a cero' });
    }
    db.prepare(`INSERT INTO payment_promises (id,loan_id,collector_id,promised_date,promised_amount,notes,requires_visit)
      VALUES (?,?,?,?,?,?,?)`).run(
      id, d.loan_id, d.collector_id||req.user.id, d.promised_date, promisedAmount, d.notes||null, d.requires_visit?1:0
    );
    const promise = db.prepare(`SELECT pp.*, l.loan_number, c.full_name as client_name
      FROM payment_promises pp JOIN loans l ON l.id=pp.loan_id JOIN clients c ON c.id=l.client_id
      WHERE pp.id=?`).get(id);
    res.status(201).json(promise);
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

router.put('/promises/:id', authenticate, requireTenant, requirePermission('collections.promises'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const d = req.body;
    const promise = db.prepare('SELECT pp.id FROM payment_promises pp JOIN loans l ON l.id=pp.loan_id WHERE pp.id=? AND l.tenant_id=?').get(req.params.id, req.tenant.id);
    if (!promise) return res.status(404).json({ error: 'Promesa no encontrada' });
    if (d.visit_notes !== undefined || d.visited_at !== undefined) {
      db.prepare(`UPDATE payment_promises SET
        visited_at=COALESCE(?,visited_at),
        visit_notes=COALESCE(?,visit_notes),
        status=COALESCE(?,status)
      WHERE id=?`).run(d.visited_at||now(), d.visit_notes||null, d.status||null, req.params.id);
    } else {
      db.prepare(`UPDATE payment_promises SET status=COALESCE(?,status) WHERE id=?`).run(d.status||null, req.params.id);
    }
    res.json(db.prepare('SELECT * FROM payment_promises WHERE id=?').get(req.params.id));
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

export default router;

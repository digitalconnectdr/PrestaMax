import { Router, Response } from 'express';
import { getDb, uuid, now } from '../db/database';
import { authenticate, requireTenant, AuthRequest, requirePermission } from '../middleware/auth';

const router = Router();

// GET all loan requests for the tenant
router.get('/', authenticate, requireTenant, requirePermission('requests.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { status } = req.query as any;
    let sql = `SELECT * FROM loan_requests WHERE tenant_id=?`;
    const params: any[] = [req.tenant.id];
    if (status && status !== 'all') { sql += ` AND status=?`; params.push(status); }
    sql += ` ORDER BY created_at DESC`;
    const requests = db.prepare(sql).all(...params);
    // Strip heavy base64 image fields — only needed in the detail endpoint
    const slim = requests.map((r: any) => {
      const { id_front_image, id_back_image, ...rest } = r;
      return rest;
    });
    res.json(slim);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET single loan request (includes base64 images)
router.get('/:id', authenticate, requireTenant, requirePermission('requests.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const request = db.prepare(`SELECT * FROM loan_requests WHERE id=? AND tenant_id=?`).get(req.params.id, req.tenant.id);
    if (!request) return res.status(404).json({ error: 'Solicitud no encontrada' });
    res.json(request);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PUT approve a loan request
router.put('/:id/approve', authenticate, requireTenant, requirePermission('requests.approve'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { notes } = req.body;
    const request = db.prepare(`SELECT * FROM loan_requests WHERE id=? AND tenant_id=?`).get(req.params.id, req.tenant.id) as any;
    if (!request) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Solo se pueden aprobar solicitudes pendientes' });

    db.prepare(`
      UPDATE loan_requests SET status='approved', notes=?, reviewed_by=?, reviewed_at=? WHERE id=?
    `).run(notes || null, req.user.id, now(), req.params.id);

    res.json({ success: true, message: 'Solicitud aprobada' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PUT reject a loan request
router.put('/:id/reject', authenticate, requireTenant, requirePermission('requests.reject'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    // Accept both camelCase and snake_case (interceptor converts camelCase → snake_case)
    const rejectionReason = req.body.rejection_reason || req.body.rejectionReason;
    const notes = req.body.notes;
    if (!rejectionReason) return res.status(400).json({ error: 'Motivo de rechazo es obligatorio' });

    const request = db.prepare(`SELECT * FROM loan_requests WHERE id=? AND tenant_id=?`).get(req.params.id, req.tenant.id) as any;
    if (!request) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Solo se pueden rechazar solicitudes pendientes' });

    db.prepare(`
      UPDATE loan_requests SET status='rejected', rejection_reason=?, notes=?, reviewed_by=?, reviewed_at=? WHERE id=?
    `).run(rejectionReason, notes || null, req.user.id, now(), req.params.id);

    res.json({ success: true, message: 'Solicitud rechazada' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PUT convert loan request → create actual loan + client (if new)
router.put('/:id/convert', authenticate, requireTenant, requirePermission('requests.convert'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const request = db.prepare(`SELECT * FROM loan_requests WHERE id=? AND tenant_id=?`).get(req.params.id, req.tenant.id) as any;
    if (!request) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (request.status === 'converted') return res.status(400).json({ error: 'La solicitud ya fue convertida' });

    // Fields from request body (override defaults from loan_request row)
    const {
      product_id,
      rate,
      rate_type = 'monthly',
      term,
      term_unit = 'months',
      payment_frequency = 'monthly',
      amortization_type = 'fixed_installment',
      first_payment_date,
      disbursement_bank_account_id,
      branch_id,
    } = req.body;

    const finalProductId = product_id || request.product_id;
    if (!finalProductId) return res.status(400).json({ error: 'Producto requerido para crear el préstamo' });

    const product = db.prepare('SELECT * FROM loan_products WHERE id=?').get(finalProductId) as any;
    if (!product) return res.status(400).json({ error: 'Producto no encontrado' });

    const finalAmount = request.loan_amount || req.body.amount;
    if (!finalAmount) return res.status(400).json({ error: 'Monto del préstamo requerido' });

    const finalRate = rate || request.rate || product.rate || 0;
    const finalTerm = term || request.loan_term || 12;
    const finalFirstDate = first_payment_date || (() => {
      const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().split('T')[0];
    })();

    // ── 1. Find or create client ────────────────────────────────────────────
    let clientId: string;
    const existingClient = request.id_number
      ? db.prepare('SELECT id FROM clients WHERE id_number=? AND tenant_id=?').get(request.id_number, req.tenant.id) as any
      : null;

    if (existingClient) {
      clientId = existingClient.id;
    } else {
      clientId = uuid();
      // Generate client_number
      const clientCount = (db.prepare('SELECT COUNT(*) as c FROM clients WHERE tenant_id=?').get(req.tenant.id) as any).c;
      const clientNumber = `CLI-${new Date().getFullYear()}-${String(clientCount + 1).padStart(4, '0')}`;
      // Derive first_name / last_name from full name (both are NOT NULL in schema)
      const fullName: string = request.client_name || 'Sin Nombre';
      const nameParts = fullName.trim().split(/\s+/);
      const firstName = nameParts[0] || fullName;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : firstName;
      db.prepare(`INSERT INTO clients (id,tenant_id,client_number,full_name,first_name,last_name,id_number,phone_personal,phone_work,phone_family,whatsapp,email,address,city,province,occupation,employer,work_address,economic_activity,monthly_income,birth_date,gender,marital_status,family_contact_name,family_relationship,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`).run(
        clientId, req.tenant.id, clientNumber,
        fullName, firstName, lastName,
        request.id_number || null,
        request.client_phone || null, request.phone_work || null, request.phone_family || null,
        request.whatsapp || request.client_phone || null,
        request.client_email || null, request.client_address || null,
        request.city || null, request.province || null,
        request.occupation || null, request.employer || null, request.work_address || null,
        request.economic_activity || null, request.monthly_income || null,
        request.date_of_birth || request.birth_date || null,
        request.gender || null, request.marital_status || null,
        request.family_contact_name || null, request.family_relationship || null
      );
    }

    // ── 2. Create loan ──────────────────────────────────────────────────────
    const loanId = uuid();
    const count = (db.prepare('SELECT COUNT(*) as c FROM loans WHERE tenant_id=?').get(req.tenant.id) as any).c;
    const loanNumber = `PRE-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
    const loanStatus = 'active'; // Requests are pre-approved; go straight to active

    db.prepare(`INSERT INTO loans (id,tenant_id,branch_id,client_id,product_id,loan_number,status,requested_amount,approved_amount,disbursed_amount,
      rate,rate_type,term,term_unit,payment_frequency,amortization_type,purpose,
      mora_rate_daily,mora_grace_days,disbursement_bank_account_id,disbursement_date,first_payment_date,application_date,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,datetime('now'),datetime('now'))`).run(
      loanId, req.tenant.id, branch_id || null, clientId, finalProductId,
      loanNumber, loanStatus, finalAmount, finalAmount, finalAmount,
      finalRate, rate_type, finalTerm, term_unit, payment_frequency, amortization_type,
      request.loan_purpose || null,
      product.mora_rate_daily || 0.001, product.mora_grace_days || 3,
      disbursement_bank_account_id || request.disbursement_bank_account_id || null,
      finalFirstDate
    );

    // ── 3. Generate installments ────────────────────────────────────────────
    function getNextDate2(d: Date, freq: string): Date {
      const nd = new Date(d);
      if (freq === 'daily') nd.setDate(nd.getDate() + 1);
      else if (freq === 'weekly') nd.setDate(nd.getDate() + 7);
      else if (freq === 'biweekly') nd.setDate(nd.getDate() + 15);
      else nd.setMonth(nd.getMonth() + 1);
      return nd;
    }
    function r2(v: number) { return Math.round(v * 100) / 100; }
    function getN(term: number, termUnit: string, freq: string): number {
      const months = termUnit === 'months' ? term : termUnit === 'weeks' ? term / 4.33 : term / 30;
      if (freq === 'daily') return Math.round(months * 30);
      if (freq === 'weekly') return Math.round(months * 4.33);
      if (freq === 'biweekly') return Math.round(months * 2);
      return Math.round(months);
    }

    const mRate = rate_type === 'annual' ? finalRate / 100 / 12
      : rate_type === 'daily' ? finalRate / 100 * 30
      : rate_type === 'weekly' ? finalRate / 100 * 4.33
      : rate_type === 'biweekly' ? finalRate / 100 * 2
      : finalRate / 100; // monthly default
    const n = getN(finalTerm, term_unit, payment_frequency);
    let balance = finalAmount;
    let curDate = new Date(finalFirstDate);
    const fixedPmt = mRate > 0 ? finalAmount * (mRate * Math.pow(1 + mRate, n)) / (Math.pow(1 + mRate, n) - 1) : finalAmount / n;

    let totalInterest = 0;
    let lastDueDate = curDate.toISOString();

    for (let i = 1; i <= n; i++) {
      let principal = 0, interest = 0;
      if (amortization_type === 'flat_interest') {
        interest = r2(finalAmount * mRate);
        principal = r2(finalAmount / n);
      } else if (amortization_type === 'interest_only') {
        interest = r2(balance * mRate);
        principal = i === n ? r2(balance) : 0;
      } else { // fixed_installment
        interest = r2(balance * mRate);
        principal = i === n ? r2(balance) : r2(fixedPmt - interest);
      }
      principal = Math.max(0, Math.min(principal, balance));
      balance = r2(balance - principal);
      totalInterest = r2(totalInterest + interest);

      db.prepare(`INSERT INTO installments (id,loan_id,installment_number,due_date,principal_amount,interest_amount,total_amount,status,paid_principal,paid_interest,paid_mora,paid_total)
        VALUES (?,?,?,?,?,?,?,?,0,0,0,0)`).run(
        uuid(), loanId, i, curDate.toISOString(),
        principal, interest, r2(principal + interest), 'pending'
      );
      lastDueDate = curDate.toISOString();
      curDate = getNextDate2(curDate, payment_frequency);
      if (Math.abs(balance) < 0.01) break;
    }

    // Update loan with calculated totals and maturity date
    db.prepare(`UPDATE loans SET
      principal_balance=?, interest_balance=?, total_balance=?, total_interest=?, maturity_date=?, updated_at=datetime('now')
      WHERE id=?`).run(
      finalAmount, totalInterest, r2(finalAmount + totalInterest), totalInterest, lastDueDate, loanId
    );

    // ── 4. Debit bank account if specified ──────────────────────────────────
    const bankId = disbursement_bank_account_id || request.disbursement_bank_account_id;
    if (bankId) {
      db.prepare('UPDATE bank_accounts SET current_balance=current_balance-?, loaned_balance=loaned_balance+? WHERE id=? AND tenant_id=?')
        .run(finalAmount, finalAmount, bankId, req.tenant.id);
    }

    // ── 5. Mark request as converted ───────────────────────────────────────
    db.prepare(`UPDATE loan_requests SET status='converted', reviewed_by=?, reviewed_at=? WHERE id=? AND tenant_id=?`)
      .run(req.user.id, now(), req.params.id, req.tenant.id);

    res.json({ success: true, loanId, loanNumber, clientId, message: `Préstamo ${loanNumber} creado exitosamente` });
  } catch (e: any) { console.error(e); res.status(500).json({ error: e.message || 'Error al convertir solicitud' }); }
});

// GET public token / public link for tenant
router.get('/settings/public-link', authenticate, requireTenant, requirePermission('requests.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    let tenant = db.prepare(`SELECT id, public_token, name FROM tenants WHERE id=?`).get(req.tenant.id) as any;
    if (!tenant.public_token) {
      const token = uuid().replace(/-/g, '').substring(0, 16);
      db.prepare(`UPDATE tenants SET public_token=? WHERE id=?`).run(token, tenant.id);
      tenant = db.prepare(`SELECT id, public_token, name FROM tenants WHERE id=?`).get(req.tenant.id) as any;
    }
    res.json({ publicToken: tenant.public_token, tenantName: tenant.name });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST regenerate public token (invalidates old link)
router.post('/settings/regenerate-token', authenticate, requireTenant, requirePermission('settings.general'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const token = uuid().replace(/-/g, '').substring(0, 16);
    db.prepare(`UPDATE tenants SET public_token=? WHERE id=?`).run(token, req.tenant.id);
    res.json({ publicToken: token });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;

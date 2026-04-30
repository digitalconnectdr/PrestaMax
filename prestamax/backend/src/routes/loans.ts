import { Router, Response } from 'express';
import { getDb, uuid, now, r2 } from '../db/database';
import { authenticate, requireTenant, requirePermission, AuthRequest } from '../middleware/auth';

const router = Router();

function getNextDate(d: Date, freq: string): Date {
  const nd = new Date(d);
  if (freq==='daily') nd.setDate(nd.getDate()+1);
  else if (freq==='every_2_days') nd.setDate(nd.getDate()+2);
  else if (freq==='weekly') nd.setDate(nd.getDate()+7);
  else if (freq==='biweekly') nd.setDate(nd.getDate()+15);
  else nd.setMonth(nd.getMonth()+1);
  return nd;
}

function getInstallmentCount(term: number, termUnit: string, freq: string): number {
  const months = termUnit==='months'?term:termUnit==='weeks'?term/4.33:term/30;
  if (freq==='daily') return Math.round(months*30);
  if (freq==='weekly') return Math.round(months*4.33);
  if (freq==='biweekly') return Math.round(months*2);
  return Math.round(months);
}

function generateSchedule(params: any) {
  const { amount, rate, rateType, term, termUnit, freq, type, firstDate } = params;
  const mRate = rateType==='daily'?rate/100*30:rateType==='weekly'?rate/100*4.33:rateType==='biweekly'?rate/100*2:rateType==='annual'?rate/100/12:rate/100;
  const n = getInstallmentCount(term, termUnit, freq);
  const schedule = [];
  let balance = amount;
  let currentDate = new Date(firstDate);
  const fixedPayment = mRate>0 ? amount*(mRate*Math.pow(1+mRate,n))/(Math.pow(1+mRate,n)-1) : amount/n;

  for (let i=1; i<=n; i++) {
    let principal=0, interest=0;
    if (type==='fixed_installment') {
      interest = r2(balance*mRate);
      principal = i===n ? r2(balance) : r2(fixedPayment-interest);
    } else if (type==='flat_interest') {
      interest = r2(amount*mRate);
      principal = r2(amount/n);
    } else if (type==='interest_only') {
      interest = r2(balance*mRate);
      principal = i===n ? r2(balance) : 0;
    } else {
      interest = r2(balance*mRate);
      principal = r2(amount/n);
    }
    principal = Math.max(0, Math.min(principal, balance));
    balance = r2(balance - principal);
    schedule.push({ installment_number:i, due_date:currentDate.toISOString(), principal_amount:principal, interest_amount:interest, total_amount:r2(principal+interest), status:'pending' });
    currentDate = getNextDate(currentDate, freq);
    if (Math.abs(balance)<0.01) break;
  }
  return schedule;
}

router.get('/', authenticate, requireTenant, requirePermission('loans.view'), (req: AuthRequest, res: Response) => {
  try {
    const { status, client_id, collector_id, page='1', limit='20', search } = req.query as any;
    const skip = (parseInt(page)-1)*parseInt(limit);
    const db = getDb();
    let where = 'WHERE l.tenant_id=?'; const params: any[] = [req.tenant.id];
    if (status) { where+=' AND l.status=?'; params.push(status); }
    if (client_id) { where+=' AND l.client_id=?'; params.push(client_id); }
    if (collector_id) { where+=' AND l.collector_id=?'; params.push(collector_id); }
    if (search) { where+=' AND (l.loan_number LIKE ? OR c.full_name LIKE ?)'; const s=`%${search}%`; params.push(s,s); }
    const total = (db.prepare(`SELECT COUNT(*) as cnt FROM loans l JOIN clients c ON c.id=l.client_id ${where}`).get(...params) as any).cnt;
    const data = db.prepare(`
      SELECT l.*, c.full_name as client_name, c.id_number as client_id_number, c.phone_personal as client_phone,
             p.name as product_name, p.type as product_type
      FROM loans l JOIN clients c ON c.id=l.client_id JOIN loan_products p ON p.id=l.product_id
      ${where} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), skip);
    res.json({ data, total, page:parseInt(page), limit:parseInt(limit) });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed' }); }
});

router.post('/', authenticate, requireTenant, requirePermission('loans.create'), (req: AuthRequest, res: Response) => {
  try {
    const d = req.body;

    // ── Validación de campos requeridos ──────────────────────────────────────
    if (!d.client_id) return res.status(400).json({ error: 'Cliente requerido' });
    if (!d.product_id) return res.status(400).json({ error: 'Producto de préstamo requerido' });
    if (!d.requested_amount || d.requested_amount <= 0) return res.status(400).json({ error: 'Monto debe ser mayor a cero' });
    if (!d.term || d.term <= 0) return res.status(400).json({ error: 'Plazo debe ser mayor a cero' });
    // ─────────────────────────────────────────────────────────────────────────

    const db = getDb(); const id = uuid();
    const count = (db.prepare('SELECT COUNT(*) as c FROM loans WHERE tenant_id=?').get(req.tenant.id) as any).c;
    const loan_number = `PRE-${new Date().getFullYear()}-${String(count+1).padStart(5,'0')}`;
    const product = db.prepare('SELECT * FROM loan_products WHERE id=?').get(d.product_id) as any;
    const status = product?.requires_approval ? 'under_review' : 'approved';
    // Multi-currency: default to tenant base currency if not specified
    const currency = (d.currency || 'DOP').toUpperCase();
    const exchange_rate_to_dop = currency === 'DOP' ? 1.0 : (parseFloat(d.exchange_rate_to_dop) || 1.0);
    // Validate bank account currency matches loan currency if provided
    if (d.disbursement_bank_account_id) {
      const bankAcc = db.prepare('SELECT currency FROM bank_accounts WHERE id=? AND tenant_id=?').get(d.disbursement_bank_account_id, req.tenant.id) as any;
      if (bankAcc && bankAcc.currency !== currency) {
        return res.status(400).json({ error: `La cuenta bancaria está en ${bankAcc.currency} pero el préstamo es en ${currency}. Selecciona una cuenta en ${currency}.` });
      }
    }
    db.prepare(`INSERT INTO loans (id,tenant_id,branch_id,client_id,product_id,loan_number,status,requested_amount,
      rate,rate_type,term,term_unit,payment_frequency,amortization_type,purpose,notes,
      mora_rate_daily,mora_grace_days,collector_id,currency,exchange_rate_to_dop,prorroga_fee) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id,req.tenant.id,d.branch_id||null,d.client_id,d.product_id,loan_number,status,d.requested_amount,
      d.rate||product?.rate,d.rate_type||product?.rate_type||'monthly',d.term,d.term_unit||'months',
      d.payment_frequency||product?.payment_frequency||'monthly',d.amortization_type||product?.amortization_type||'fixed_installment',
      d.purpose||null,d.notes||null,product?.mora_rate_daily||0.001,product?.mora_grace_days||3,d.collector_id||null,
      currency,exchange_rate_to_dop,parseFloat(d.prorroga_fee)||0
    );
    const clientForLog = db.prepare('SELECT full_name FROM clients WHERE id=?').get(d.client_id) as any;
    db.prepare('INSERT INTO audit_logs (id,tenant_id,user_id,user_name,action,entity_type,entity_id,description) VALUES (?,?,?,?,?,?,?,?)').run(uuid(),req.tenant.id,req.user.id,req.user.full_name,'created','loan',id,`Creó el préstamo ${loan_number} para ${clientForLog?.full_name||'cliente'}`);
    const loan = db.prepare(`SELECT l.*,c.full_name as client_name,p.name as product_name FROM loans l JOIN clients c ON c.id=l.client_id JOIN loan_products p ON p.id=l.product_id WHERE l.id=?`).get(id);
    res.status(201).json(loan);
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed to create loan' }); }
});

router.get('/:id', authenticate, requireTenant, requirePermission('loans.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const loan = db.prepare(`SELECT l.*,c.full_name as client_name,c.id_number as client_id_number,
      c.phone_personal as client_phone,c.whatsapp as client_whatsapp,c.score as client_score,
      p.name as product_name,p.type as product_type,
      u.full_name as collector_name
      FROM loans l
      JOIN clients c ON c.id=l.client_id
      JOIN loan_products p ON p.id=l.product_id
      LEFT JOIN users u ON u.id=l.collector_id
      WHERE l.id=? AND l.tenant_id=?`).get(req.params.id, req.tenant.id) as any;
    if (!loan) return res.status(404).json({ error: 'Préstamo no encontrado' });
    loan.installments = db.prepare('SELECT * FROM installments WHERE loan_id=? ORDER BY installment_number').all(loan.id);
    loan.payments = db.prepare(`SELECT pay.*,r.receipt_number FROM payments pay LEFT JOIN receipts r ON r.payment_id=pay.id WHERE pay.loan_id=? AND pay.is_voided=0 ORDER BY pay.payment_date DESC`).all(loan.id);
    loan.contracts = db.prepare('SELECT * FROM contracts WHERE loan_id=? ORDER BY generated_at DESC').all(loan.id);
    loan.promises = db.prepare('SELECT * FROM payment_promises WHERE loan_id=? ORDER BY promised_date').all(loan.id);
    loan.collection_notes = db.prepare('SELECT cn.*,u.full_name as user_name FROM collection_notes cn JOIN users u ON u.id=cn.user_id WHERE cn.loan_id=? ORDER BY cn.created_at DESC').all(loan.id);
    // Recalculate totals from actual payments to keep data consistent
    const payTotals = db.prepare(`
      SELECT COALESCE(SUM(amount),0) as total_paid,
             COALESCE(SUM(applied_capital),0) as total_paid_principal,
             COALESCE(SUM(applied_interest),0) as total_paid_interest,
             COALESCE(SUM(applied_mora),0) as total_paid_mora
      FROM payments WHERE loan_id=? AND is_voided=0`).get(loan.id) as any;
    loan.total_paid = r2(payTotals.total_paid);
    loan.total_paid_principal = r2(payTotals.total_paid_principal);
    loan.total_paid_interest = r2(payTotals.total_paid_interest);
    loan.total_paid_mora = r2(payTotals.total_paid_mora);
    // Sync computed totals back to DB so list views stay accurate
    db.prepare(`UPDATE loans SET total_paid=?,total_paid_principal=?,total_paid_interest=?,total_paid_mora=? WHERE id=?`)
      .run(loan.total_paid, loan.total_paid_principal, loan.total_paid_interest, loan.total_paid_mora, loan.id);
    // Real-time mora calc — respects mora_base and mora_fixed_enabled for this loan.
    // If mora_fixed_enabled: each overdue installment gets a flat fixed charge (replaces %).
    // If not: percentage-based daily rate is applied.
    const now2      = new Date();
    const moraBase  = loan.mora_base || 'cuota_vencida';
    const useFixed  = !!loan.mora_fixed_enabled;
    const fixedAmt  = loan.mora_fixed_amount || 0;
    let computedMora = 0;

    loan.installments = (loan.installments as any[]).map((inst: any) => {
      if (inst.status !== 'paid' && inst.status !== 'waived') {
        const effectiveDue = inst.deferred_due_date
          ? new Date(inst.deferred_due_date)
          : new Date(inst.due_date);
        const days     = Math.max(0, Math.floor((now2.getTime() - effectiveDue.getTime()) / 86400000));
        const moraDays = Math.max(0, days - (loan.mora_grace_days || 0));

        let moraAmount = 0;
        if (moraDays > 0) {
          if (useFixed) {
            // Fixed charge per overdue installment — replaces percentage entirely
            moraAmount = fixedAmt;
          } else {
            let baseAmount = 0;
            if (moraBase === 'cuota_vencida') {
              baseAmount = r2((inst.principal_amount + inst.interest_amount) - (inst.paid_total || 0));
            } else {
              baseAmount = r2((inst.principal_amount || 0) - (inst.paid_principal || 0));
            }
            moraAmount = r2(Math.max(0, baseAmount) * (loan.mora_rate_daily || 0.001) * moraDays);
          }
        }
        computedMora += moraAmount;
        return {
          ...inst,
          mora_days: moraDays,
          mora_amount: moraAmount,
          effective_due_date: inst.deferred_due_date || inst.due_date,
        };
      }
      return inst;
    });

    loan.computed_mora = r2(computedMora);
    // Override mora_balance with real-time computed value so frontend cards are accurate
    loan.mora_balance = loan.computed_mora;
    res.json(loan);
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed to get loan' }); }
});

router.post('/:id/approve', authenticate, requireTenant, requirePermission('loans.approve'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const loanForApproval = db.prepare('SELECT l.*, p.requires_guarantee FROM loans l JOIN loan_products p ON p.id=l.product_id WHERE l.id=? AND l.tenant_id=?').get(req.params.id, req.tenant.id) as any;
    if (!loanForApproval) return res.status(404).json({ error: 'Préstamo no encontrado' });
    // If product requires guarantee, verify at least one guarantor/guarantee is registered
    if (loanForApproval.requires_guarantee) {
      const hasGuarantor  = db.prepare('SELECT id FROM loan_guarantors WHERE loan_id=? LIMIT 1').get(req.params.id) as any;
      const hasGuarantee  = db.prepare('SELECT id FROM loan_guarantees WHERE loan_id=? LIMIT 1').get(req.params.id) as any;
      if (!hasGuarantor && !hasGuarantee) {
        return res.status(400).json({ error: 'Este producto requiere garantía. Registra un garante o bien como garantía antes de aprobar.' });
      }
    }
    db.prepare('UPDATE loans SET status=?,approval_date=?,approved_amount=COALESCE(?,requested_amount),updated_at=? WHERE id=?')
      .run('approved',now(),req.body.approved_amount||null,now(),req.params.id);
    const approvedLoan = db.prepare('SELECT loan_number FROM loans WHERE id=?').get(req.params.id) as any;
    db.prepare('INSERT INTO audit_logs (id,tenant_id,user_id,user_name,action,entity_type,entity_id,description) VALUES (?,?,?,?,?,?,?,?)').run(uuid(),req.tenant.id,req.user.id,req.user.full_name,'approved','loan',req.params.id,`Aprobó el préstamo ${approvedLoan?.loan_number||req.params.id}`);
    res.json(db.prepare('SELECT * FROM loans WHERE id=?').get(req.params.id));
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/:id/reject', authenticate, requireTenant, requirePermission('loans.reject'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const loan = db.prepare('SELECT id FROM loans WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any;
    if (!loan) return res.status(404).json({ error: 'Préstamo no encontrado' });
    db.prepare('UPDATE loans SET status=?,rejection_reason=?,updated_at=? WHERE id=? AND tenant_id=?').run('rejected',req.body.rejection_reason||null,now(),req.params.id,req.tenant.id);
    res.json(db.prepare('SELECT * FROM loans WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id));
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/:id/disburse', authenticate, requireTenant, requirePermission('loans.disburse'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const loan = db.prepare('SELECT * FROM loans WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any;
    if (!loan) return res.status(404).json({ error: 'Préstamo no encontrado' });
    if (loan.status!=='approved') return res.status(400).json({ error: 'El préstamo debe estar aprobado' });

    const disbAmount = parseFloat(req.body.disbursed_amount) || loan.approved_amount || loan.requested_amount;
    const disbDate = new Date();
    const firstPayDate = req.body.first_payment_date ? new Date(req.body.first_payment_date) : new Date(new Date().setMonth(new Date().getMonth()+1));

    // Validate first_payment_date must be after disbursement date
    if (firstPayDate < disbDate) {
      return res.status(400).json({ error: 'La fecha del primer pago debe ser posterior a la fecha de desembolso.' });
    }

    const bankAccountId = req.body.bank_account_id || loan.disbursement_bank_account_id || null;

    // Bank account balance check
    let bankAccount: any = null;
    if (bankAccountId) {
      bankAccount = db.prepare('SELECT * FROM bank_accounts WHERE id=? AND tenant_id=? AND is_active=1').get(bankAccountId, req.tenant.id) as any;
      if (!bankAccount) return res.status(404).json({ error: 'Cuenta bancaria no encontrada' });
      if (bankAccount.current_balance < disbAmount) {
        return res.status(400).json({
          error: `Fondos insuficientes en ${bankAccount.bank_name}. Balance disponible: ${Number(bankAccount.current_balance).toFixed(2)}`,
          insufficient_funds: true,
          available_balance: bankAccount.current_balance,
          required: disbAmount,
        });
      }
    }

    const schedule = generateSchedule({ amount:disbAmount, rate:loan.rate, rateType:loan.rate_type, term:loan.term, termUnit:loan.term_unit, freq:loan.payment_frequency, type:loan.amortization_type, firstDate:firstPayDate });
    const totalInterest = schedule.reduce((s:number,i:any)=>s+i.interest_amount,0);

    // maturity date = due_date of last installment
    const maturityDate = schedule.length>0 ? schedule[schedule.length-1].due_date : null;

    db.prepare(`UPDATE loans SET status='active',disbursed_amount=?,disbursement_date=?,first_payment_date=?,maturity_date=?,
      principal_balance=?,interest_balance=?,total_balance=?,total_interest=?,approved_amount=?,
      disbursement_bank_account_id=COALESCE(?,disbursement_bank_account_id),updated_at=? WHERE id=?`).run(
      disbAmount, disbDate.toISOString(), firstPayDate.toISOString(), maturityDate,
      disbAmount, r2(totalInterest), r2(disbAmount+totalInterest), r2(totalInterest), disbAmount,
      bankAccountId, now(), req.params.id
    );

    const insertInst = db.prepare('INSERT INTO installments (id,loan_id,installment_number,due_date,principal_amount,interest_amount,total_amount,status) VALUES (?,?,?,?,?,?,?,?)');
    // delete existing installments first
    db.prepare('DELETE FROM installments WHERE loan_id=?').run(req.params.id);
    for (const s of schedule) {
      insertInst.run(uuid(), req.params.id, s.installment_number, s.due_date, s.principal_amount, s.interest_amount, s.total_amount, s.status);
    }

    // Deduct from bank account balance
    if (bankAccount) {
      db.prepare('UPDATE bank_accounts SET current_balance=current_balance-?, loaned_balance=loaned_balance+? WHERE id=?').run(disbAmount, disbAmount, bankAccountId);
    }

    const disbLoan = db.prepare('SELECT loan_number FROM loans WHERE id=?').get(req.params.id) as any;
    db.prepare('INSERT INTO audit_logs (id,tenant_id,user_id,user_name,action,entity_type,entity_id,description,new_values) VALUES (?,?,?,?,?,?,?,?,?)').run(uuid(),req.tenant.id,req.user.id,req.user.full_name,'disbursed','loan',req.params.id,`Desembolsó el préstamo ${disbLoan?.loan_number||req.params.id} por RD$${disbAmount.toLocaleString()}`,JSON.stringify({disbursed_amount:disbAmount,bank_account_id:bankAccountId}));
    res.json({ loan: db.prepare('SELECT * FROM loans WHERE id=?').get(req.params.id), installments: schedule });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed to disburse loan' }); }
});

router.put('/:id', authenticate, requireTenant, requirePermission('loans.edit'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();

    // ── Permission check: only platform_owner, platform_admin, or tenant_owner ──
    const isPlatform = ['platform_owner','platform_admin'].includes(req.user?.platform_role || '');
    const memberRoles: string[] = (() => { try { return JSON.parse(req.membership?.roles || '[]'); } catch(_) { return []; } })();
    const isTenantOwner = memberRoles.includes('tenant_owner');
    if (!isPlatform && !isTenantOwner) {
      return res.status(403).json({ error: 'No tienes permisos para editar préstamos. Comunícate con tu encargado.' });
    }

    const loan = db.prepare('SELECT * FROM loans WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any;
    if (!loan) return res.status(404).json({ error: 'Préstamo no encontrado' });

    const d = req.body;
    const isDisbursed = ['active','in_mora','disbursed','restructured'].includes(loan.status);
    const oldValues = { ...loan };

    // ── Fields always editable ────────────────────────────────────────────────
    const alwaysFields: Record<string, any> = {};
    if (d.purpose       !== undefined) alwaysFields.purpose        = d.purpose;
    if (d.notes         !== undefined) alwaysFields.notes          = d.notes;
    if (d.collector_id  !== undefined) alwaysFields.collector_id   = d.collector_id || null;
    if (d.mora_rate_daily    !== undefined) alwaysFields.mora_rate_daily    = parseFloat(d.mora_rate_daily);
    if (d.mora_grace_days    !== undefined) alwaysFields.mora_grace_days    = parseInt(d.mora_grace_days);
    if (d.mora_base          !== undefined) alwaysFields.mora_base          = d.mora_base;
    if (d.mora_fixed_enabled !== undefined) alwaysFields.mora_fixed_enabled = d.mora_fixed_enabled ? 1 : 0;
    if (d.mora_fixed_amount  !== undefined) alwaysFields.mora_fixed_amount  = parseFloat(d.mora_fixed_amount) || 0;
    if (d.prorroga_fee       !== undefined) alwaysFields.prorroga_fee       = parseFloat(d.prorroga_fee) || 0;
    // Date corrections (always allowed for record fixing)
    if (d.application_date  !== undefined) alwaysFields.application_date  = d.application_date;
    if (d.approval_date     !== undefined) alwaysFields.approval_date     = d.approval_date || null;
    if (d.disbursement_date !== undefined) alwaysFields.disbursement_date = d.disbursement_date || null;
    if (d.first_payment_date!== undefined) alwaysFields.first_payment_date= d.first_payment_date || null;
    if (d.maturity_date     !== undefined) alwaysFields.maturity_date     = d.maturity_date || null;

    // ── Fields editable only pre-disbursement (also allowed post-disbursement as record corrections by owners) ──
    const termFields: Record<string, any> = {};
    if (d.requested_amount   !== undefined) termFields.requested_amount   = parseFloat(d.requested_amount);
    if (d.approved_amount    !== undefined) termFields.approved_amount    = parseFloat(d.approved_amount);
    if (d.rate               !== undefined) termFields.rate               = parseFloat(d.rate);
    if (d.rate_type          !== undefined) termFields.rate_type          = d.rate_type;
    if (d.term               !== undefined) termFields.term               = parseInt(d.term);
    if (d.term_unit          !== undefined) termFields.term_unit          = d.term_unit;
    if (d.payment_frequency  !== undefined) termFields.payment_frequency  = d.payment_frequency;
    if (d.amortization_type  !== undefined) termFields.amortization_type  = d.amortization_type;

    // Merge all updates
    const updates = { ...alwaysFields, ...termFields, updated_at: now() };
    const setClauses = Object.keys(updates).map(k => `${k}=?`).join(',');
    const values = [...Object.values(updates), req.params.id];
    db.prepare(`UPDATE loans SET ${setClauses} WHERE id=?`).run(...values);

    // ── Regenerate installment schedule if pre-disbursement and term fields changed ──
    const scheduleChanged = !isDisbursed && Object.keys(termFields).length > 0;
    if (scheduleChanged) {
      const updated = db.prepare('SELECT * FROM loans WHERE id=?').get(req.params.id) as any;
      if (updated.first_payment_date) {
        const schedule = generateSchedule({
          amount: updated.disbursed_amount || updated.approved_amount || updated.requested_amount,
          rate: updated.rate, rateType: updated.rate_type, term: updated.term,
          termUnit: updated.term_unit, freq: updated.payment_frequency,
          type: updated.amortization_type,
          firstDate: new Date(updated.first_payment_date),
        });
        if (schedule.length > 0) {
          db.prepare('DELETE FROM installments WHERE loan_id=?').run(req.params.id);
          const insertInst = db.prepare('INSERT INTO installments (id,loan_id,installment_number,due_date,principal_amount,interest_amount,total_amount,status) VALUES (?,?,?,?,?,?,?,?)');
          for (const s of schedule) {
            insertInst.run(uuid(), req.params.id, s.installment_number, s.due_date, s.principal_amount, s.interest_amount, s.total_amount, 'pending');
          }
          const totalInterest = schedule.reduce((s: number, i: any) => s + i.interest_amount, 0);
          const maturityDate = schedule[schedule.length - 1].due_date;
          db.prepare('UPDATE loans SET total_interest=?,maturity_date=?,updated_at=? WHERE id=?').run(r2(totalInterest), maturityDate, now(), req.params.id);
        }
      }
    }

    // ── Audit log ─────────────────────────────────────────────────────────────
    const editedLoanNum = db.prepare('SELECT loan_number FROM loans WHERE id=?').get(req.params.id) as any;
    db.prepare('INSERT INTO audit_logs (id,tenant_id,user_id,user_name,action,entity_type,entity_id,description,old_values,new_values) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
      uuid(), req.tenant.id, req.user.id, req.user.full_name, 'loan_edited', 'loan', req.params.id,
      `Editó el préstamo ${editedLoanNum?.loan_number||req.params.id}`,
      JSON.stringify(oldValues), JSON.stringify(updates)
    );

    const result = db.prepare(`SELECT l.*,c.full_name as client_name,c.id_number as client_id_number,
      c.phone_personal as client_phone,c.whatsapp as client_whatsapp,c.score as client_score,
      p.name as product_name,p.type as product_type,
      u.full_name as collector_name
      FROM loans l
      JOIN clients c ON c.id=l.client_id
      JOIN loan_products p ON p.id=l.product_id
      LEFT JOIN users u ON u.id=l.collector_id
      WHERE l.id=?`).get(req.params.id) as any;
    result.installments = db.prepare('SELECT * FROM installments WHERE loan_id=? ORDER BY installment_number').all(req.params.id);
    res.json(result);
  } catch(e: any) { console.error(e); res.status(500).json({ error: 'Failed to update loan: ' + e.message }); }
});

// POST /loans/bulk-import — import existing loans from CSV (migration feature)
router.post('/bulk-import', authenticate, requireTenant, requirePermission('loans.import'), (req: AuthRequest, res: Response) => {
  const db = getDb();
  const rows: any[] = req.body.loans || [];
  if (!rows.length) return res.status(400).json({ error: 'No se recibieron registros' });

  const results: { row: number; status: 'created' | 'error'; loanNumber?: string; clientName?: string; error?: string }[] = [];

  // Find or create a generic migration product for this tenant
  const ensureProduct = (type: string, rate: number, rateType: string, freq: string, amorType: string): string => {
    const slug = `migration_${type}_${rateType}`;
    let prod = db.prepare(`SELECT id FROM loan_products WHERE tenant_id=? AND slug=?`).get(req.tenant.id, slug) as any;
    if (!prod) {
      const pid = uuid();
      db.prepare(`INSERT INTO loan_products (id,tenant_id,name,slug,type,rate,rate_type,payment_frequency,amortization_type,mora_rate_daily,mora_grace_days,is_active)
        VALUES (?,?,?,?,?,?,?,?,?,0.001,3,1)`)
        .run(pid, req.tenant.id, `Migración ${type}`, slug, type, rate, rateType, freq, amorType);
      return pid;
    }
    return prod.id;
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const clientName = (row.client_name || '').trim();
      if (!clientName) { results.push({ row: i+1, status:'error', error:'Nombre de cliente requerido' }); continue; }
      if (!row.loan_amount || isNaN(parseFloat(row.loan_amount))) { results.push({ row: i+1, status:'error', clientName, error:'Monto de préstamo inválido' }); continue; }

      const loanAmount = parseFloat(row.loan_amount);
      const rate = parseFloat(row.interest_rate || '0');
      const rateType = row.rate_type || 'monthly';
      const termMonths = parseInt(row.term_months || '12');
      const freq = row.payment_frequency || 'monthly';
      const amorType = row.amortization_type || 'fixed_installment';
      const loanType = row.loan_type || 'personal';
      const startDate = row.start_date ? new Date(row.start_date) : new Date();
      const amountPaid = parseFloat(row.amount_paid || '0') || 0;
      const outstandingBalance = row.outstanding_balance ? parseFloat(row.outstanding_balance) : null;
      // Multi-currency support
      const currency = ((row.currency || 'DOP') as string).toUpperCase();
      const VALID_CURRENCIES = ['DOP','USD','EUR','HTG','CAD','GBP'];
      const safeCurrency = VALID_CURRENCIES.includes(currency) ? currency : 'DOP';
      const exchangeRateToDop = safeCurrency === 'DOP' ? 1.0 : (parseFloat(row.exchange_rate_to_dop || '1') || 1.0);
      const nameParts = clientName.split(' ');
      const firstName = nameParts[0] || clientName;
      const lastName = nameParts.slice(1).join(' ') || '-';

      // Find or create client
      let client = db.prepare(`SELECT id FROM clients WHERE tenant_id=? AND (phone_personal=? OR id_number=?) LIMIT 1`)
        .get(req.tenant.id, row.client_phone || '', row.client_id_number || '') as any;
      if (!client) {
        const cid = uuid();
        db.prepare(`INSERT INTO clients (id,tenant_id,first_name,last_name,full_name,phone_personal,email,id_number,id_type,address,score,is_active)
          VALUES (?,?,?,?,?,?,?,?,'cedula',?,3,1)`)
          .run(cid, req.tenant.id, firstName, lastName, clientName,
               row.client_phone || null, row.client_email || null,
               row.client_id_number || null, row.client_address || null);
        client = { id: cid };
      }

      // Find or create loan product
      const productId = ensureProduct(loanType, rate, rateType, freq, amorType);

      // Create loan
      const loanId = uuid();
      const loanCount = (db.prepare('SELECT COUNT(*) as c FROM loans WHERE tenant_id=?').get(req.tenant.id) as any).c;
      const loanNumber = row.loan_number || `PRE-${startDate.getFullYear()}-${String(loanCount+1).padStart(5,'0')}`;

      // Compute first payment date (1 period after start)
      const firstPayDate = new Date(startDate);
      if (freq === 'monthly') firstPayDate.setMonth(firstPayDate.getMonth()+1);
      else if (freq === 'biweekly') firstPayDate.setDate(firstPayDate.getDate()+15);
      else if (freq === 'weekly') firstPayDate.setDate(firstPayDate.getDate()+7);
      else firstPayDate.setMonth(firstPayDate.getMonth()+1);

      const schedule = generateSchedule({ amount:loanAmount, rate, rateType, term:termMonths, termUnit:'months', freq, type:amorType, firstDate:firstPayDate });
      const totalInterest = r2(schedule.reduce((s:number,inst:any) => s+inst.interest_amount, 0));
      const maturityDate = schedule.length > 0 ? schedule[schedule.length-1].due_date : null;

      // Determine effective principal balance (remaining after payments)
      const principalBalance = outstandingBalance !== null ? outstandingBalance : r2(loanAmount - amountPaid);

      db.prepare(`INSERT INTO loans (id,tenant_id,client_id,product_id,loan_number,status,requested_amount,approved_amount,disbursed_amount,
        rate,rate_type,term,term_unit,payment_frequency,amortization_type,purpose,notes,
        principal_balance,interest_balance,total_balance,total_interest,
        mora_rate_daily,mora_grace_days,disbursement_date,first_payment_date,maturity_date,approval_date,
        currency,exchange_rate_to_dop)
        VALUES (?,?,?,?,?,'active',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0.001,3,?,?,?,?,?,?)`)
        .run(loanId, req.tenant.id, client.id, productId, loanNumber,
             loanAmount, loanAmount, loanAmount,
             rate, rateType, termMonths, 'months', freq, amorType,
             row.purpose || null, row.notes || null,
             principalBalance, totalInterest, r2(principalBalance + totalInterest), totalInterest,
             startDate.toISOString(), firstPayDate.toISOString(), maturityDate, startDate.toISOString(),
             safeCurrency, exchangeRateToDop);

      // Insert installment schedule
      const insertInst = db.prepare('INSERT INTO installments (id,loan_id,installment_number,due_date,principal_amount,interest_amount,total_amount,status) VALUES (?,?,?,?,?,?,?,?)');
      let remaining = amountPaid;
      for (const s of schedule) {
        let instStatus = 'pending';
        if (remaining > 0) {
          if (remaining >= s.total_amount) { instStatus = 'paid'; remaining = r2(remaining - s.total_amount); }
          else { instStatus = 'partial'; remaining = 0; }
        }
        insertInst.run(uuid(), loanId, s.installment_number, s.due_date, s.principal_amount, s.interest_amount, s.total_amount, instStatus);
      }

      // If there were prior payments, create a migration payment record
      if (amountPaid > 0) {
        const payId = uuid();
        db.prepare(`INSERT INTO payments (id,loan_id,tenant_id,amount,payment_date,payment_method,reference,notes,is_voided)
          VALUES (?,?,?,?,?,?,?,?,0)`)
          .run(payId, loanId, req.tenant.id, amountPaid, startDate.toISOString(), 'migration', 'MIGRACIÓN', 'Pago previo — migración al sistema');
        // Create receipt for the migration payment
        const rcptNum = `MIG-${String(loanCount+1).padStart(5,'0')}`;
        db.prepare(`INSERT INTO receipts (id,tenant_id,payment_id,loan_id,issued_by,receipt_number,amount,client_name,loan_number,concept_detail,notes,issued_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(uuid(), req.tenant.id, payId, loanId, req.user.id, rcptNum, amountPaid,
               clientName, loanNumber, 'Pago de migración', 'Saldo pagado antes de migración', startDate.toISOString());
      }

      db.prepare('INSERT INTO audit_logs (id,tenant_id,user_id,user_name,action,entity_type,entity_id,description,new_values) VALUES (?,?,?,?,?,?,?,?,?)').run(
        uuid(), req.tenant.id, req.user.id, req.user.full_name, 'imported', 'loan', loanId,
        `Importó el préstamo ${loanNumber} — cliente: ${clientName}`,
        JSON.stringify({ loan_number: loanNumber, client: clientName })
      );

      results.push({ row: i+1, status:'created', loanNumber, clientName });
    } catch (err: any) {
      results.push({ row: i+1, status:'error', error: err.message || 'Error desconocido' });
    }
  }

  const created = results.filter(r => r.status === 'created').length;
  const errors = results.filter(r => r.status === 'error').length;
  res.json({ summary: { total: rows.length, created, errors }, results });
});

router.get('/:id/schedule', authenticate, requireTenant, requirePermission('loans.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const installments = db.prepare('SELECT * FROM installments WHERE loan_id=? ORDER BY installment_number').all(req.params.id);
    res.json(installments);
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

// ── Void / Cancel a loan ───────────────────────────────────────────────────────
// POST /loans/:id/write-off — Mark loan as uncollectible (incobrable)
router.post('/:id/write-off', authenticate, requireTenant, requirePermission('loans.write_off'), async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb()
    const { reason, record_loss, loss_components } = req.body
    // loss_components: { capital: bool, interest: bool, mora: bool } — selects what to register as expense
    if (!reason?.trim()) return res.status(400).json({ error: 'Motivo requerido' })

    // Only tenant owners / platform admins can write off
    const platformRole = (req as any).user?.platformRole || (req as any).user?.platform_role || ''
    const isPlatform = ['platform_owner', 'platform_admin', 'admin'].includes(platformRole)
    const membership = db.prepare('SELECT roles FROM tenant_memberships WHERE tenant_id=? AND user_id=?')
      .get(req.tenant!.id, (req as any).user.id) as any
    const roles: string[] = (() => { try { return JSON.parse(membership?.roles || '[]') } catch { return [] } })()
    const isTenantOwner = roles.includes('tenant_owner')
    if (!isPlatform && !isTenantOwner) return res.status(403).json({ error: 'Sin permisos para marcar préstamos como incobrables' })

    const loan = db.prepare('SELECT * FROM loans WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant!.id) as any
    if (!loan) return res.status(404).json({ error: 'Préstamo no encontrado' })
    if (['written_off', 'liquidated', 'cancelled', 'voided'].includes(loan.status)) {
      return res.status(400).json({ error: `El préstamo ya está en estado "${loan.status}"` })
    }

    // Update loan status
    db.prepare(`UPDATE loans SET status='written_off', updated_at=datetime('now'), notes=COALESCE(notes||' | ','')|| ? WHERE id=? AND tenant_id=?`)
      .run(`[INCOBRABLE ${new Date().toISOString().slice(0,10)}: ${reason}]`, req.params.id, req.tenant!.id)

    // Reduce client score to 1 (minimum)
    db.prepare('UPDATE clients SET score=1, updated_at=datetime(\'now\') WHERE id=?').run(loan.client_id)

    // Register loss entries in income_expenses based on selected components
    if (record_loss) {
      const comp = loss_components || {}
      const lossEntries: { description: string; amount: number }[] = []

      if (comp.capital && loan.principal_balance > 0)
        lossEntries.push({ description: `Capital incobrable - Préstamo ${loan.loan_number}`, amount: r2(loan.principal_balance) })
      if (comp.interest && (loan.interest_balance || 0) > 0)
        lossEntries.push({ description: `Intereses incobrables - Préstamo ${loan.loan_number}`, amount: r2(loan.interest_balance) })
      if (comp.mora && (loan.mora_balance || 0) > 0)
        lossEntries.push({ description: `Mora incobrable - Préstamo ${loan.loan_number}`, amount: r2(loan.mora_balance) })

      for (const entry of lossEntries) {
        db.prepare(`INSERT INTO income_expenses (id,tenant_id,registered_by,type,category,description,amount,transaction_date,payment_method,reference,notes)
          VALUES (?,?,?,?,?,?,?,datetime('now'),?,?,?)`)
          .run(uuid(), req.tenant!.id, req.user.id, 'expense', 'castigo_cartera', entry.description, entry.amount,
               'other', loan.loan_number, `Préstamo castigado - ${reason}`)
      }
    }

    const woLoan = db.prepare('SELECT loan_number FROM loans WHERE id=?').get(req.params.id) as any;
    db.prepare('INSERT INTO audit_logs (id,tenant_id,user_id,user_name,action,entity_type,entity_id,description,new_values) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(uuid(), req.tenant!.id, req.user.id, req.user.full_name, 'write_off', 'loan', req.params.id,
           `Castigó la cartera del préstamo ${woLoan?.loan_number||req.params.id}: ${reason}`,
           JSON.stringify({ reason, record_loss, loss_components }))

    res.json({ success: true, message: 'Préstamo marcado como incobrable' })
  } catch (e:any) { res.status(500).json({ error: e.message || 'Error al procesar' }) }
})

router.post('/:id/void', authenticate, requireTenant, requirePermission('loans.void'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb()
    const { reason } = req.body
    if (!reason?.trim()) return res.status(400).json({ error: 'Motivo requerido' })

    // Only platform admins / tenant owners can void
    const platformRole = (req as any).user?.platform_role || ''
    const isPlatform = ['platform_owner', 'platform_admin'].includes(platformRole)
    const membership = db.prepare('SELECT roles FROM tenant_memberships WHERE tenant_id=? AND user_id=?')
      .get(req.tenant!.id, (req as any).user.id) as any
    const roles: string[] = (() => { try { return JSON.parse(membership?.roles || '[]') } catch { return [] } })()
    const isTenantOwner = roles.includes('tenant_owner')
    if (!isPlatform && !isTenantOwner) return res.status(403).json({ error: 'Sin permisos para anular préstamos' })

    const loan = db.prepare('SELECT * FROM loans WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant!.id) as any
    if (!loan) return res.status(404).json({ error: 'Préstamo no encontrado' })
    if (['cancelled', 'paid', 'voided'].includes(loan.status)) {
      return res.status(400).json({ error: `El préstamo ya está en estado "${loan.status}"` })
    }

    db.prepare(`UPDATE loans SET status='voided', updated_at=datetime('now'), notes=COALESCE(notes||' | ','')|| ? WHERE id=? AND tenant_id=?`)
      .run(`[ANULADO: ${reason}]`, req.params.id, req.tenant!.id)

    res.json({ success: true, message: 'Préstamo anulado correctamente' })
  } catch (e) { res.status(500).json({ error: 'Error al anular préstamo' }) }
})

export default router;

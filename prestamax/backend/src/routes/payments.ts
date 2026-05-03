import { Router, Response } from 'express';
import { getDb, uuid, now, r2 } from '../db/database';
import { authenticate, requireTenant, requirePermission, AuthRequest } from '../middleware/auth';

const router = Router();

// ─── Idempotent migrations for interest-only deferral columns ────────────────
;(() => {
  try {
    const db = getDb();
    try { db.exec(`ALTER TABLE installments ADD COLUMN interest_paid_at TEXT`); } catch(_) {}
    try { db.exec(`ALTER TABLE installments ADD COLUMN interest_paid_amount REAL DEFAULT 0`); } catch(_) {}
    try { db.exec(`ALTER TABLE installments ADD COLUMN deferred_due_date TEXT`); } catch(_) {}
    try { db.exec(`ALTER TABLE installments ADD COLUMN prorroga_count INTEGER NOT NULL DEFAULT 0`); } catch(_) {}
  } catch(_) {}
})();

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Recalculate and persist the client score after any payment event. */
function recalcClientScore(db: any, clientId: string): void {
  try {
    const client = db.prepare('SELECT * FROM clients WHERE id=?').get(clientId) as any;
    if (!client) return;
    const loans = db.prepare('SELECT * FROM loans WHERE client_id=?').all(clientId) as any[];
    const loanIds = loans.map((l: any) => l.id);
    const installments: any[] = loanIds.length
      ? db.prepare(`SELECT * FROM installments WHERE loan_id IN (${loanIds.map(() => '?').join(',')})`).all(...loanIds) as any[]
      : [];
    const paidLoans    = loans.filter((l: any) => l.status === 'liquidated').length;
    const lateInst     = installments.filter((i: any) => i.mora_days > 0 || i.status === 'overdue').length;
    const total        = installments.length || 1;
    const punctuality  = 1 - (lateInst / total);
    const paidRatio    = loans.length > 0 ? paidLoans / loans.length : 0;
    // ageMonths: 0-1 scale (1 = 60 months of history = max trust)
    const ageMonths    = Math.min((Date.now() - new Date(client.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30), 60) / 60;
    // raw = weighted average 0.0-1.0; convert to 0-100 scale (Mayo 2026)
    const raw          = punctuality * 0.5 + paidRatio * 0.3 + ageMonths * 0.2;
    const score        = Math.max(0, Math.min(100, Math.round(raw * 100)));
    db.prepare('UPDATE clients SET score=?, score_updated_at=datetime(\'now\') WHERE id=?').run(score, clientId);
  } catch (_) { /* non-critical — do not break payment flow */ }
}

/**
 * Given an installment's original due_date and the loan payment_frequency,
 * returns the new deferred due date as an ISO string (1 period later).
 */
function calcDeferredDate(dueDateStr: string, paymentFrequency: string): string {
  const d = new Date(dueDateStr);
  const freq = paymentFrequency || 'monthly';
  if (freq === 'daily')        d.setDate(d.getDate() + 1);
  else if (freq === 'every_2_days') d.setDate(d.getDate() + 2);
  else if (freq === 'weekly')  d.setDate(d.getDate() + 7);
  else if (freq === 'biweekly') d.setDate(d.getDate() + 15);
  else                          d.setMonth(d.getMonth() + 1); // monthly / quarterly
  return d.toISOString();
}

/**
 * After an interest_only payment, mark affected installments as 'interest_paid'
 * and set their deferred_due_date to 1 period ahead.
 * Called immediately after saving — no midnight job needed.
 */
function applyInterestOnlyDeferral(
  db: any,
  updates: Array<{ id: string; addInterest: number }>,
  installments: any[],
  paymentFrequency: string,
  paymentTimestamp: string
) {
  for (const upd of updates) {
    if (upd.addInterest <= 0) continue;
    const inst = installments.find(i => i.id === upd.id);
    if (!inst) continue;
    const newPaidInterest = r2((inst.paid_interest || 0) + upd.addInterest);
    // Only defer if interest is now fully covered for this installment
    if (newPaidInterest >= (inst.interest_amount || 0) - 0.01) {
      const deferredDate = calcDeferredDate(inst.due_date, paymentFrequency);
      db.prepare(
        `UPDATE installments SET status='interest_paid', interest_paid_at=?, interest_paid_amount=?, deferred_due_date=? WHERE id=?`
      ).run(paymentTimestamp, newPaidInterest, deferredDate, inst.id);
    }
  }
}

/**
 * Apply a prorroga (extension) to all unpaid installments: shifts their effective
 * due date forward by one payment period.  Uses deferred_due_date so the original
 * due_date is preserved for audit purposes.
 */
function applyProrrogaShift(
  db: any,
  loanId: string,
  paymentFrequency: string,
  installments: any[]
): void {
  const unpaid = installments.filter(i => !['paid', 'waived'].includes(i.status));
  for (const inst of unpaid) {
    const baseDateStr = inst.deferred_due_date || inst.due_date;
    const newDate = calcDeferredDate(baseDateStr, paymentFrequency);
    db.prepare(
      `UPDATE installments SET deferred_due_date=?, prorroga_count=COALESCE(prorroga_count,0)+1 WHERE id=?`
    ).run(newDate, inst.id);
  }
}

/** Calculate current mora for a loan as of a given date.
 *  Respects mora_base:
 *   'cuota_vencida'   — mora on the full unpaid installment (principal + interest)
 *   'capital_pendiente' — mora only on unpaid principal
 *   'capital_vencido'   — same as capital_pendiente for overdue installments
 *
 *  When an installment has deferred_due_date set (interest was pre-paid),
 *  mora is calculated from that date instead of the original due_date.
 */
function calcMora(loan: any, installments: any[], asOf: Date): number {
  const base       = loan.mora_base || 'cuota_vencida';
  const useFixed   = !!loan.mora_fixed_enabled;
  const fixedAmt   = loan.mora_fixed_amount || 0;
  let total = 0;
  for (const inst of installments) {
    if (inst.status === 'paid' || inst.status === 'waived') continue;
    const effectiveDue = inst.deferred_due_date
      ? new Date(inst.deferred_due_date)
      : new Date(inst.due_date);
    const days     = Math.max(0, Math.floor((asOf.getTime() - effectiveDue.getTime()) / 86400000));
    const moraDays = Math.max(0, days - (loan.mora_grace_days || 0));
    if (moraDays > 0) {
      if (useFixed) {
        // Fixed charge per overdue installment — replaces percentage calculation entirely
        total += fixedAmt;
      } else {
        let baseAmount = 0;
        if (base === 'cuota_vencida') {
          baseAmount = r2((inst.principal_amount + inst.interest_amount) - (inst.paid_total || 0));
        } else {
          baseAmount = r2((inst.principal_amount || 0) - (inst.paid_principal || 0));
        }
        total += Math.max(0, baseAmount) * (loan.mora_rate_daily || 0.001) * moraDays;
      }
    }
  }
  return r2(total);
}

/** Apply amount to pending installments (interest first), returns allocation detail */
function allocatePayment(
  installments: any[],
  amount: number,
  paymentType: string,       // 'regular' | 'interest_only' | 'capital_only' | 'full_payoff'
  overpaymentAction: string, // 'apply_to_capital' | 'apply_to_next_installment'
  mora: number
) {
  let remaining = amount;
  const updates: Array<{ id: string; addPrincipal: number; addInterest: number; addMora: number }> = [];
  let totalInterest = 0, totalPrincipal = 0, totalMora = 0, excessToCapital = 0;

  // Pending installments in due-date order (include interest_paid — still owes principal)
  const pending = installments
    .filter(i => !['paid', 'waived'].includes(i.status))
    .sort((a, b) => {
      // Sort by effective due date: deferred_due_date takes precedence for interest_paid installments
      const dateA = a.deferred_due_date || a.due_date;
      const dateB = b.deferred_due_date || b.due_date;
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    });

  // --- Pay mora first (if any and not interest_only / capital_only type) ---
  if (mora > 0 && paymentType !== 'interest_only' && paymentType !== 'capital_only') {
    const moraPay = r2(Math.min(remaining, mora));
    totalMora += moraPay;
    remaining = r2(remaining - moraPay);
  }

  // --- Allocate by payment type ---
  if (paymentType === 'interest_only') {
    // Only pay interest across all pending installments
    for (const inst of pending) {
      if (remaining <= 0) break;
      const interestOwed = r2((inst.interest_amount || 0) - (inst.paid_interest || 0));
      if (interestOwed <= 0) continue;
      const pay = r2(Math.min(remaining, interestOwed));
      totalInterest += pay;
      remaining = r2(remaining - pay);
      updates.push({ id: inst.id, addPrincipal: 0, addInterest: pay, addMora: 0 });
    }

  } else if (paymentType === 'capital_only') {
    // Pay outstanding interest first (forced), then all remaining to principal
    for (const inst of pending) {
      if (remaining <= 0) break;
      const interestOwed = r2((inst.interest_amount || 0) - (inst.paid_interest || 0));
      if (interestOwed > 0) {
        const iPay = r2(Math.min(remaining, interestOwed));
        totalInterest += iPay;
        remaining = r2(remaining - iPay);
        updates.push({ id: inst.id, addPrincipal: 0, addInterest: iPay, addMora: 0 });
      }
    }
    // Remaining → principal on first pending installments
    for (const inst of pending) {
      if (remaining <= 0) break;
      const principalOwed = r2((inst.principal_amount || 0) - (inst.paid_principal || 0));
      if (principalOwed <= 0) continue;
      const pay = r2(Math.min(remaining, principalOwed));
      totalPrincipal += pay;
      remaining = r2(remaining - pay);
      const existing = updates.find(u => u.id === inst.id);
      if (existing) existing.addPrincipal += pay;
      else updates.push({ id: inst.id, addPrincipal: pay, addInterest: 0, addMora: 0 });
    }

  } else {
    // 'regular' or 'full_payoff': interest first, then principal, per installment in order
    for (const inst of pending) {
      if (remaining <= 0) break;
      const interestOwed = r2((inst.interest_amount || 0) - (inst.paid_interest || 0));
      const principalOwed = r2((inst.principal_amount || 0) - (inst.paid_principal || 0));
      let addI = 0, addP = 0;

      if (interestOwed > 0) {
        addI = r2(Math.min(remaining, interestOwed));
        totalInterest += addI;
        remaining = r2(remaining - addI);
      }
      if (remaining > 0 && principalOwed > 0) {
        addP = r2(Math.min(remaining, principalOwed));
        totalPrincipal += addP;
        remaining = r2(remaining - addP);
      }
      if (addI > 0 || addP > 0) updates.push({ id: inst.id, addPrincipal: addP, addInterest: addI, addMora: 0 });
    }

    // Handle overpayment
    if (remaining > 0.01) {
      if (overpaymentAction === 'apply_to_capital') {
        excessToCapital = remaining;
        totalPrincipal += remaining;
        remaining = 0;
      }
      // If 'apply_to_next_installment', remaining stays (caller handles display, no extra to balances)
    }
  }

  return { updates, totalInterest: r2(totalInterest), totalPrincipal: r2(totalPrincipal), totalMora: r2(totalMora), excessToCapital: r2(excessToCapital), remaining: r2(remaining) };
}

// ─── GET preview (calculate allocation without saving) ────────────────────────
router.post('/preview', authenticate, requireTenant, requirePermission('payments.create'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { loan_id, amount, payment_type = 'regular', overpayment_action = 'apply_to_next_installment' } = req.body;
    if (!loan_id || !amount) return res.status(400).json({ error: 'loan_id y amount requeridos' });

    const loan = db.prepare('SELECT * FROM loans WHERE id=? AND tenant_id=?').get(loan_id, req.tenant.id) as any;
    if (!loan) return res.status(404).json({ error: 'Préstamo no encontrado' });

    const installments = db.prepare('SELECT * FROM installments WHERE loan_id=? ORDER BY due_date').all(loan_id) as any[];
    const pDate = new Date();
    const mora = calcMora(loan, installments, pDate);

    // -- Prorroga preview: fixed fee + current mora, no installment allocation ----
    if (payment_type === 'prorroga') {
      const prorrogaFee = r2(loan.prorroga_fee || 0);
      const totalPreview = r2(prorrogaFee + mora);
      const nextPendingInst2 = installments.filter(i => i.status !== 'paid').sort(
        (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
      )[0];
      const pendingInstCount2 = installments.filter(i => i.status === 'pending' || i.status === 'partial' || i.status === 'overdue').length;
      return res.json({
        loanId: loan_id, amount: totalPreview,
        breakdown: { prorroga_fee: prorrogaFee, mora: mora, interest: 0, capital: 0, excessToCapital: 0 },
        remaining: 0, isOverpayment: false, currentMora: mora, totalDue: totalPreview,
        pendingInstallments: pendingInstCount2,
        nextInstallment: nextPendingInst2 ? {
          id: nextPendingInst2.id, number: nextPendingInst2.installment_number,
          dueDate: nextPendingInst2.deferred_due_date || nextPendingInst2.due_date,
          total: nextPendingInst2.total_amount, interest: nextPendingInst2.interest_amount,
          capital: nextPendingInst2.principal_amount,
          pendingTotal: r2(nextPendingInst2.total_amount - (nextPendingInst2.paid_total || 0)),
        } : null,
      });
    }

    const { totalInterest, totalPrincipal, totalMora, excessToCapital, remaining } =
      allocatePayment(installments, parseFloat(amount), payment_type, overpayment_action, mora);

    const nextPending = installments.filter(i => i.status !== 'paid').sort(
      (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    )[0];

    const totalDue = r2((loan.principal_balance || 0) + (loan.interest_balance || 0) + mora);
    const pendingInstCount = installments.filter(i => i.status === 'pending' || i.status === 'partial' || i.status === 'overdue').length;

    res.json({
      loanId: loan_id,
      amount: parseFloat(amount),
      breakdown: { interest: totalInterest, capital: totalPrincipal, mora: totalMora, excessToCapital },
      remaining,
      isOverpayment: remaining > 0.01 && payment_type !== 'interest_only',
      currentMora: mora,
      totalDue,
      pendingInstallments: pendingInstCount,
      nextInstallment: nextPending ? {
        id: nextPending.id,
        number: nextPending.installment_number,
        dueDate: nextPending.due_date,
        total: nextPending.total_amount,
        interest: nextPending.interest_amount,
        capital: nextPending.principal_amount,
        pendingTotal: r2(nextPending.total_amount - (nextPending.paid_total || 0)),
      } : null,
    });
  } catch (e: any) { console.error(e); res.status(500).json({ error: e.message || 'Error' }); }
});

// ─── GET list ─────────────────────────────────────────────────────────────────
router.get('/', authenticate, requireTenant, requirePermission('payments.view'), (req: AuthRequest, res: Response) => {
  try {
    const { loan_id, bank_account_id, page = '1', limit = '20' } = req.query as any;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const db = getDb();
    // When filtering by specific loan, include voided payments so history is complete
    let where = (loan_id || bank_account_id) ? 'WHERE p.tenant_id=?' : 'WHERE p.tenant_id=? AND p.is_voided=0';
    const params: any[] = [req.tenant.id];
    if (loan_id) { where += ' AND p.loan_id=?'; params.push(loan_id); }
    if (bank_account_id) { where += ' AND p.bank_account_id=?'; params.push(bank_account_id); }
    const total = (db.prepare(`SELECT COUNT(*) as c FROM payments p ${where}`).get(...params) as any).c;
    const data = db.prepare(`
      SELECT p.*, l.loan_number,
             c.full_name as client_name,
             COALESCE(c.phone_personal, c.phone_work, c.phone_family) as client_phone,
             r.receipt_number,
             ba.bank_name as bank_account_name, ba.account_number as bank_account_number,
             u.full_name as registered_by_name
      FROM payments p
      JOIN loans l ON l.id=p.loan_id
      JOIN clients c ON c.id=l.client_id
      LEFT JOIN receipts r ON r.payment_id=p.id
      LEFT JOIN bank_accounts ba ON ba.id=p.bank_account_id
      LEFT JOIN users u ON u.id=p.registered_by
      ${where} ORDER BY p.payment_date DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), skip);
    res.json({ data, total });
  } catch (e: any) { console.error('GET /payments error:', e.message); res.status(500).json({ error: e.message || 'Failed' }); }
});

// ─── POST register payment ────────────────────────────────────────────────────
router.post('/', authenticate, requireTenant, requirePermission('payments.create'), (req: AuthRequest, res: Response) => {
  try {
    const {
      loan_id, amount, payment_method = 'cash', bank_account_id, reference, notes,
      payment_date, collector_id,
      payment_type = 'regular',          // regular | interest_only | capital_only | full_payoff
      overpayment_action = 'apply_to_next_installment', // apply_to_capital | apply_to_next_installment
    } = req.body;

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: 'El monto del pago debe ser mayor a cero' });
    }
    const db = getDb();
    const loan = db.prepare('SELECT * FROM loans WHERE id=? AND tenant_id=?').get(loan_id, req.tenant.id) as any;
    if (!loan) return res.status(404).json({ error: 'Préstamo no encontrado' });
    if (['liquidated', 'paid', 'cancelled', 'rejected'].includes(loan.status)) {
      return res.status(400).json({ error: `Este préstamo ya está "${loan.status}" y no acepta más pagos` });
    }

    // Multi-currency: validate bank account currency matches loan currency
    if (bank_account_id) {
      const bankAcc = db.prepare('SELECT currency FROM bank_accounts WHERE id=? AND tenant_id=?').get(bank_account_id, req.tenant.id) as any;
      const loanCurrency = loan.currency || 'DOP';
      if (bankAcc && bankAcc.currency !== loanCurrency) {
        return res.status(400).json({ error: `Este préstamo es en ${loanCurrency}. La cuenta bancaria seleccionada está en ${bankAcc.currency}. Selecciona una cuenta en ${loanCurrency}.` });
      }
    }

    const pDate = new Date(payment_date || new Date());
    const installments = db.prepare('SELECT * FROM installments WHERE loan_id=? ORDER BY due_date').all(loan_id) as any[];
    const mora = calcMora(loan, installments, pDate);

    // ----------------------------------------------------------------
    // PRORROGA BRANCH: charge extension fee + mora, freeze installment
    // ----------------------------------------------------------------
    if (payment_type === 'prorroga') {
      const prorrogaFee = r2(loan.prorroga_fee || 0);
      const moraAmount  = r2(mora);
      const totalCharge = r2(prorrogaFee + moraAmount);

      if (prorrogaFee <= 0) {
        return res.status(400).json({ error: 'Este prestamo no tiene cargo de prorroga configurado.' });
      }

      // -- Record the payment (no capital/interest reduction) --------
      const count2 = (db.prepare('SELECT COUNT(*) as c FROM payments WHERE tenant_id=?').get(req.tenant.id) as any).c;
      const payment_number2 = `PAG-${new Date().getFullYear()}-${String(count2 + 1).padStart(6, '0')}`;
      const payId2 = uuid();
      db.prepare(`INSERT INTO payments (id,tenant_id,loan_id,registered_by,collector_id,payment_number,payment_date,amount,
        applied_mora,applied_charges,applied_interest,applied_capital,payment_method,bank_account_id,reference,type,notes) VALUES
        (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        payId2, req.tenant.id, loan_id, req.user.id, collector_id || null,
        payment_number2, pDate.toISOString(), totalCharge,
        moraAmount, r2(prorrogaFee), 0, 0,
        payment_method, bank_account_id || null, reference || null, 'prorroga', notes || null
      );

      // -- Payment items for receipt breakdown -----------------------
      const insertItem2 = db.prepare('INSERT INTO payment_items (id,payment_id,concept,amount) VALUES (?,?,?,?)');
      if (prorrogaFee > 0) insertItem2.run(uuid(), payId2, 'prorroga_fee', prorrogaFee);
      if (moraAmount > 0)  insertItem2.run(uuid(), payId2, 'mora', moraAmount);

      // -- Shift all unpaid installments 1 period forward -------------
      applyProrrogaShift(db, loan_id, loan.payment_frequency, installments);

      // -- Update loan mora_balance only (principal/interest unchanged)
      const newMoraBal = r2(Math.max(0, (loan.mora_balance || 0) - moraAmount));
      db.prepare(`UPDATE loans SET mora_balance=?,total_paid=?,total_paid_mora=?,updated_at=? WHERE id=?`).run(
        newMoraBal,
        r2((loan.total_paid || 0) + totalCharge),
        r2((loan.total_paid_mora || 0) + moraAmount),
        now(), loan_id
      );

      // -- Receipt ---------------------------------------------------
      const client2 = db.prepare('SELECT * FROM clients WHERE id=?').get(loan.client_id) as any;
      const series2 = db.prepare('SELECT * FROM receipt_series WHERE tenant_id=? AND is_default=1').get(req.tenant.id) as any;
      let receiptNum2 = '';
      if (series2) {
        db.prepare('UPDATE receipt_series SET last_number=last_number+1 WHERE id=?').run(series2.id);
        const updated2 = db.prepare('SELECT * FROM receipt_series WHERE id=?').get(series2.id) as any;
        receiptNum2 = `${series2.prefix}-${String(updated2.last_number).padStart(6, '0')}`;
      } else {
        const rc2 = (db.prepare('SELECT COUNT(*) as c FROM receipts WHERE tenant_id=?').get(req.tenant.id) as any).c;
        receiptNum2 = `REC-${new Date().getFullYear()}-${String(rc2 + 1).padStart(6, '0')}`;
      }
      const receiptId2 = uuid();
      db.prepare(`INSERT INTO receipts (id,tenant_id,payment_id,loan_id,issued_by,series_id,receipt_number,
        client_name,client_id_number,loan_number,amount,concept_detail) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        receiptId2, req.tenant.id, payId2, loan_id, req.user.id, series2?.id || null, receiptNum2,
        client2?.full_name || '', client2?.id_number || null, loan.loan_number, totalCharge,
        JSON.stringify({ prorroga_fee: prorrogaFee, mora: moraAmount, interest: 0, capital: 0 })
      );

      // -- Bank account credit (prorroga fee is income, not capital return) --
      if (bank_account_id) {
        const bankAcc2 = db.prepare('SELECT * FROM bank_accounts WHERE id=? AND tenant_id=? AND is_active=1').get(bank_account_id, req.tenant.id) as any;
        if (bankAcc2) {
          db.prepare('UPDATE bank_accounts SET current_balance=current_balance+? WHERE id=?').run(totalCharge, bank_account_id);
        }
      }

      db.prepare('INSERT INTO audit_logs (id,tenant_id,user_id,user_name,action,entity_type,entity_id,description,new_values) VALUES (?,?,?,?,?,?,?,?,?)').run(
        uuid(), req.tenant.id, req.user.id, req.user.full_name, 'prorroga_registered', 'payment', payId2,
        `Registró cargo de prórroga por RD$${totalCharge.toLocaleString()} — Préstamo ${loan.loan_number}`,
        JSON.stringify({ totalCharge, prorrogaFee, mora: moraAmount, payment_number: payment_number2 })
      );
      recalcClientScore(db, loan.client_id);

      return res.status(201).json({
        payment: db.prepare('SELECT * FROM payments WHERE id=?').get(payId2),
        receipt: db.prepare('SELECT * FROM receipts WHERE id=?').get(receiptId2),
        breakdown: { prorroga_fee: prorrogaFee, mora: moraAmount, interest: 0, capital: 0, excessToCapital: 0, remaining: 0 },
      });
    }
    // ----------------------------------------------------------------

    const { updates, totalInterest, totalPrincipal, totalMora, excessToCapital, remaining } =
      allocatePayment(installments, amount, payment_type, overpayment_action, mora);

    // ── Save payment record ───────────────────────────────────────────────────
    const count = (db.prepare('SELECT COUNT(*) as c FROM payments WHERE tenant_id=?').get(req.tenant.id) as any).c;
    const payment_number = `PAG-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;
    const payId = uuid();

    // applied_charges: future use for origination fees / extra charges module.
    // Currently 0 — tracked separately via payment_items if needed.
    const appliedCharges = 0;
    db.prepare(`INSERT INTO payments (id,tenant_id,loan_id,registered_by,collector_id,payment_number,payment_date,amount,
      applied_mora,applied_charges,applied_interest,applied_capital,payment_method,bank_account_id,reference,type,notes) VALUES
      (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      payId, req.tenant.id, loan_id, req.user.id, collector_id || null,
      payment_number, pDate.toISOString(), amount,
      r2(totalMora), appliedCharges, r2(totalInterest), r2(totalPrincipal),
      payment_method, bank_account_id || null, reference || null, payment_type, notes || null
    );

    const insertItem = db.prepare('INSERT INTO payment_items (id,payment_id,concept,amount) VALUES (?,?,?,?)');
    if (totalMora > 0) insertItem.run(uuid(), payId, 'mora', totalMora);
    if (totalInterest > 0) insertItem.run(uuid(), payId, 'interest', totalInterest);
    if (totalPrincipal > 0) insertItem.run(uuid(), payId, 'capital', totalPrincipal);

    // ── Update individual installments ────────────────────────────────────────
    for (const upd of updates) {
      const inst = installments.find(i => i.id === upd.id);
      if (!inst) continue;
      const newPaidI = r2((inst.paid_interest || 0) + upd.addInterest);
      const newPaidP = r2((inst.paid_principal || 0) + upd.addPrincipal);
      const newPaidM = r2((inst.paid_mora || 0) + upd.addMora);
      const newPaidTotal = r2(newPaidI + newPaidP + newPaidM);
      const instTotal = r2(inst.interest_amount + inst.principal_amount);
      const newStatus = newPaidTotal >= instTotal - 0.01 ? 'paid' : newPaidTotal > 0.01 ? 'partial' : inst.status;
      const paidAt = newStatus === 'paid' ? pDate.toISOString() : null;
      db.prepare(`UPDATE installments SET paid_interest=?,paid_principal=?,paid_mora=?,paid_total=?,status=?,paid_at=COALESCE(?,paid_at) WHERE id=?`)
        .run(newPaidI, newPaidP, newPaidM, newPaidTotal, newStatus, paidAt, upd.id);
    }

    // ── Interest-only: defer due date IMMEDIATELY at payment time ─────────────
    // This is the key behavior: status → 'interest_paid', deferred_due_date set now.
    // No midnight job needed — the installment is already protected from mora.
    if (payment_type === 'interest_only') {
      applyInterestOnlyDeferral(db, updates, installments, loan.payment_frequency, pDate.toISOString());
    }

    // ── Update loan balances ──────────────────────────────────────────────────
    const newPrincipal = r2(Math.max(0, loan.principal_balance - totalPrincipal - excessToCapital));
    const newInterest = r2(Math.max(0, (loan.interest_balance || 0) - totalInterest));
    const newMoraBalance = r2(Math.max(0, (loan.mora_balance || 0) - totalMora));
    const newCharges   = r2(loan.charges_balance || 0); // charges are not reduced by regular payments
    const totalBalance = r2(newPrincipal + newInterest + newMoraBalance + newCharges);
    const fullyPaid    = newPrincipal <= 0.01 && newInterest <= 0.01 && newMoraBalance <= 0.01;
    const newStatus    = fullyPaid ? 'liquidated' : mora > totalMora ? 'in_mora' : 'active';

    // Recalculate days_overdue from remaining unpaid installments after this payment
    const remainingOverdue = db.prepare(`
      SELECT MIN(CAST(julianday('now') - julianday(COALESCE(i.deferred_due_date, i.due_date)) AS INTEGER)) as oldest_overdue
      FROM installments i
      WHERE i.loan_id=? AND i.status IN ('pending','partial')
        AND COALESCE(i.deferred_due_date, i.due_date) < date('now')
    `).get(loan_id) as any;
    const newDaysOverdue = Math.max(0, remainingOverdue?.oldest_overdue ?? 0);

    db.prepare(`UPDATE loans SET principal_balance=?,interest_balance=?,mora_balance=?,total_balance=?,
      total_paid=?,total_paid_principal=?,total_paid_interest=?,total_paid_mora=?,
      days_overdue=?,status=?,actual_close_date=?,updated_at=? WHERE id=?`).run(
      newPrincipal, newInterest, newMoraBalance, totalBalance,
      r2((loan.total_paid || 0) + amount),
      r2((loan.total_paid_principal || 0) + totalPrincipal + excessToCapital),
      r2((loan.total_paid_interest || 0) + totalInterest),
      r2((loan.total_paid_mora || 0) + totalMora),
      newDaysOverdue, newStatus, fullyPaid ? pDate.toISOString() : null, now(), loan_id
    );

    // ── Generate receipt ──────────────────────────────────────────────────────
    const client = db.prepare('SELECT * FROM clients WHERE id=?').get(loan.client_id) as any;
    const series = db.prepare('SELECT * FROM receipt_series WHERE tenant_id=? AND is_default=1').get(req.tenant.id) as any;
    let receiptNum = '';
    if (series) {
      db.prepare('UPDATE receipt_series SET last_number=last_number+1 WHERE id=?').run(series.id);
      const updated = db.prepare('SELECT * FROM receipt_series WHERE id=?').get(series.id) as any;
      receiptNum = `${series.prefix}-${String(updated.last_number).padStart(6, '0')}`;
    } else {
      const rc = (db.prepare('SELECT COUNT(*) as c FROM receipts WHERE tenant_id=?').get(req.tenant.id) as any).c;
      receiptNum = `REC-${new Date().getFullYear()}-${String(rc + 1).padStart(6, '0')}`;
    }
    const receiptId = uuid();
    db.prepare(`INSERT INTO receipts (id,tenant_id,payment_id,loan_id,issued_by,series_id,receipt_number,
      client_name,client_id_number,loan_number,amount,concept_detail) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      receiptId, req.tenant.id, payId, loan_id, req.user.id, series?.id || null, receiptNum,
      client?.full_name || '', client?.id_number || null, loan.loan_number, amount,
      JSON.stringify({ mora: r2(totalMora), interest: r2(totalInterest), capital: r2(totalPrincipal), excess_capital: r2(excessToCapital) })
    );

    // ── Credit bank account if specified ─────────────────────────────────────
    if (bank_account_id) {
      const bankAcc = db.prepare('SELECT * FROM bank_accounts WHERE id=? AND tenant_id=? AND is_active=1').get(bank_account_id, req.tenant.id) as any;
      if (bankAcc) {
        const payedCapital = r2(totalPrincipal + excessToCapital);
        db.prepare('UPDATE bank_accounts SET current_balance=current_balance+?, loaned_balance=MAX(0,loaned_balance-?) WHERE id=?').run(amount, payedCapital, bank_account_id);
      }
    } else {
      // If loan has a disbursement bank account, auto-credit it
      const disbBankId = loan.disbursement_bank_account_id;
      if (disbBankId) {
        const payedCapital = r2(totalPrincipal + excessToCapital);
        db.prepare('UPDATE bank_accounts SET current_balance=current_balance+?, loaned_balance=MAX(0,loaned_balance-?) WHERE id=?').run(amount, payedCapital, disbBankId);
      }
    }

    db.prepare('INSERT INTO audit_logs (id,tenant_id,user_id,user_name,action,entity_type,entity_id,description,new_values) VALUES (?,?,?,?,?,?,?,?,?)').run(
      uuid(), req.tenant.id, req.user.id, req.user.full_name, 'payment_registered', 'payment', payId,
      `Registró pago de RD$${Number(amount).toLocaleString()} — Préstamo ${loan.loan_number} (Cuota #${payment_number})`,
      JSON.stringify({ amount, payment_number, payment_type })
    );

    // ── Auto-update client score after payment ────────────────────────────────
    recalcClientScore(db, loan.client_id);

    res.status(201).json({
      payment: db.prepare('SELECT * FROM payments WHERE id=?').get(payId),
      receipt: db.prepare('SELECT * FROM receipts WHERE id=?').get(receiptId),
      breakdown: { interest: r2(totalInterest), capital: r2(totalPrincipal), mora: r2(totalMora), excessToCapital: r2(excessToCapital), remaining: r2(remaining) },
    });
  } catch (e: any) { console.error(e); res.status(500).json({ error: 'Failed to register payment: ' + e.message }); }
});

// ─── POST void ────────────────────────────────────────────────────────────────
router.post('/:id/void', authenticate, requireTenant, requirePermission('payments.void'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    // Permission: only platform admin or tenant_owner
    const platformRole = (req as any).user?.platform_role || '';
    const isPlatformAdmin = ['platform_owner', 'platform_admin'].includes(platformRole);
    const membership = db.prepare('SELECT roles FROM tenant_memberships WHERE tenant_id=? AND user_id=?').get(req.tenant.id, (req as any).user.id) as any;
    const roles: string[] = (() => { try { return JSON.parse(membership?.roles || '[]') } catch { return [] } })();
    if (!isPlatformAdmin && !roles.includes('tenant_owner')) {
      return res.status(403).json({ error: 'Sin permisos para anular pagos' });
    }
    const voidReasonBody = req.body.void_reason || req.body.voidReason;
    if (!voidReasonBody?.trim()) return res.status(400).json({ error: 'Motivo de anulación requerido' });

    const payment = db.prepare('SELECT * FROM payments WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any;
    if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });
    if (payment.is_voided) return res.status(400).json({ error: 'Pago ya anulado' });

    // ── Mark payment as voided ────────────────────────────────────────────────
    db.prepare('UPDATE payments SET is_voided=1,voided_at=?,voided_by=?,void_reason=? WHERE id=? AND tenant_id=?').run(now(), req.user.id, voidReasonBody, payment.id, req.tenant.id);
    // ── Mark associated receipts as voided ───────────────────────────────────
    try { db.exec(`ALTER TABLE receipts ADD COLUMN is_voided INTEGER NOT NULL DEFAULT 0`); } catch(_) {}
    db.prepare('UPDATE receipts SET is_voided=1 WHERE payment_id=?').run(payment.id);

    const loan = db.prepare('SELECT * FROM loans WHERE id=?').get(payment.loan_id) as any;
    if (loan) {
      // ── Recalculate installments from scratch (re-apply all non-voided payments) ──
      // 1. Reset all installments to original pending state
      const allInstallments = db.prepare('SELECT * FROM installments WHERE loan_id=? ORDER BY due_date').all(payment.loan_id) as any[];
      const resetStmt = db.prepare(`UPDATE installments SET paid_principal=0,paid_interest=0,paid_mora=0,paid_total=0,status='pending',paid_at=NULL,interest_paid_at=NULL,interest_paid_amount=0,deferred_due_date=NULL WHERE id=?`);
      for (const inst of allInstallments) resetStmt.run(inst.id);

      // 2. Re-apply all non-voided payments in chronological order
      const remainingPayments = db.prepare('SELECT * FROM payments WHERE loan_id=? AND is_voided=0 ORDER BY payment_date,created_at').all(payment.loan_id) as any[];
      for (const pay of remainingPayments) {
        const freshInst = db.prepare('SELECT * FROM installments WHERE loan_id=? ORDER BY due_date').all(payment.loan_id) as any[];
        const pDate = new Date(pay.payment_date);
        const mora = calcMora(loan, freshInst, pDate);
        // Prorroga payments only shift dates -- no installment allocation needed
        if ((pay.type || 'regular') === 'prorroga') {
          applyProrrogaShift(db, payment.loan_id, loan.payment_frequency, freshInst);
          continue;
        }
        const { updates } = allocatePayment(freshInst, pay.amount, pay.type || 'regular', 'apply_to_next_installment', mora);
        for (const upd of updates) {
          const inst = freshInst.find((i: any) => i.id === upd.id);
          if (!inst) continue;
          const newPaidI = r2((inst.paid_interest || 0) + upd.addInterest);
          const newPaidP = r2((inst.paid_principal || 0) + upd.addPrincipal);
          const newPaidM = r2((inst.paid_mora || 0) + upd.addMora);
          const newPaidTotal = r2(newPaidI + newPaidP + newPaidM);
          const instTotal = r2((inst.interest_amount || 0) + (inst.principal_amount || 0));
          const newStatus = newPaidTotal >= instTotal - 0.01 ? 'paid' : newPaidTotal > 0.01 ? 'partial' : 'pending';
          db.prepare(`UPDATE installments SET paid_interest=?,paid_principal=?,paid_mora=?,paid_total=?,status=?,paid_at=COALESCE(?,paid_at) WHERE id=?`)
            .run(newPaidI, newPaidP, newPaidM, newPaidTotal, newStatus, newStatus === 'paid' ? pDate.toISOString() : null, upd.id);
        }
        // Re-apply interest_only deferral if the voided payment was of that type
        if ((pay.type || 'regular') === 'interest_only') {
          applyInterestOnlyDeferral(db, updates, freshInst, loan.payment_frequency, pDate.toISOString());
        }
      }

      // 3. Recalculate loan balances from remaining non-voided payments
      const payTotals = db.prepare(`SELECT COALESCE(SUM(amount),0) as total_paid, COALESCE(SUM(applied_capital),0) as total_capital,
        COALESCE(SUM(applied_interest),0) as total_interest, COALESCE(SUM(applied_mora),0) as total_mora
        FROM payments WHERE loan_id=? AND is_voided=0`).get(payment.loan_id) as any;

      // Recalculate balances from installments
      const finalInst = db.prepare('SELECT * FROM installments WHERE loan_id=?').all(payment.loan_id) as any[];
      let principalBalance = 0, interestBalance = 0;
      for (const inst of finalInst) {
        if (inst.status !== 'paid' && inst.status !== 'waived') {
          principalBalance += r2((inst.principal_amount || 0) - (inst.paid_principal || 0));
          interestBalance += r2((inst.interest_amount || 0) - (inst.paid_interest || 0));
        }
      }
      principalBalance = r2(Math.max(0, principalBalance));
      interestBalance = r2(Math.max(0, interestBalance));
      const moraBalance = r2(Math.max(0, (loan.mora_balance || 0) - (payment.applied_mora || 0)));
      const totalBalance = r2(principalBalance + interestBalance + moraBalance);
      const newStatus = principalBalance <= 0.01 ? 'liquidated' : 'active';

      // Recalculate days_overdue after void
      const voidedOverdue = db.prepare(`
        SELECT MIN(CAST(julianday('now') - julianday(COALESCE(i.deferred_due_date, i.due_date)) AS INTEGER)) as oldest_overdue
        FROM installments i
        WHERE i.loan_id=? AND i.status IN ('pending','partial')
          AND COALESCE(i.deferred_due_date, i.due_date) < date('now')
      `).get(loan.id) as any;
      const voidDaysOverdue = Math.max(0, voidedOverdue?.oldest_overdue ?? 0);

      db.prepare(`UPDATE loans SET principal_balance=?,interest_balance=?,mora_balance=?,total_balance=?,
        total_paid=?,total_paid_principal=?,total_paid_interest=?,total_paid_mora=?,
        days_overdue=?,status=?,updated_at=? WHERE id=?`).run(
        principalBalance, interestBalance, moraBalance, totalBalance,
        r2(payTotals.total_paid), r2(payTotals.total_capital), r2(payTotals.total_interest), r2(payTotals.total_mora),
        voidDaysOverdue, newStatus, now(), loan.id
      );
    }

    // ── Reverse bank account credit on void ───────────────────────────────────
    const bankId = payment.bank_account_id || loan?.disbursement_bank_account_id;
    if (bankId) {
      db.prepare('UPDATE bank_accounts SET current_balance=MAX(0,current_balance-?), loaned_balance=loaned_balance+? WHERE id=? AND tenant_id=?').run(
        r2(payment.amount), r2(payment.applied_capital || 0), bankId, req.tenant.id
      );
    }

    const voidLoan = db.prepare('SELECT loan_number FROM loans WHERE id=?').get(payment.loan_id) as any;
    db.prepare('INSERT INTO audit_logs (id,tenant_id,user_id,user_name,action,entity_type,entity_id,description,new_values) VALUES (?,?,?,?,?,?,?,?,?)').run(
      uuid(), req.tenant.id, req.user.id, req.user.full_name, 'payment_voided', 'payment', payment.id,
      `Anuló pago de RD$${Number(payment.amount).toLocaleString()} — Préstamo ${voidLoan?.loan_number||payment.loan_id}. Motivo: ${voidReasonBody||'Sin motivo'}`,
      JSON.stringify({ void_reason: voidReasonBody, amount: payment.amount })
    );
    res.json(db.prepare('SELECT * FROM payments WHERE id=?').get(payment.id));
  } catch (e: any) { console.error(e); res.status(500).json({ error: 'Failed to void payment: ' + e.message }); }
});

// ── Edit payment metadata (date, method, bank account, reference, notes) ──────
router.put('/:id', authenticate, requireTenant, requirePermission('payments.edit'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const payment = db.prepare('SELECT * FROM payments WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any;
    if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });
    if (payment.is_voided) return res.status(400).json({ error: 'No se puede editar un pago anulado' });

    // Permission check: only platform owners/admins or tenant_owners
    const isPlatform = ['platform_owner', 'platform_admin'].includes(req.user?.platform_role || '');
    const memberRoles: string[] = (() => { try { return JSON.parse(req.membership?.roles || '[]'); } catch(_) { return []; } })();
    const isTenantOwner = memberRoles.includes('tenant_owner');
    if (!isPlatform && !isTenantOwner) {
      return res.status(403).json({ error: 'No tienes permisos para editar pagos. Comunícate con tu encargado.' });
    }

    const d = req.body;
    const { payment_date, payment_method, bank_account_id, reference, notes } = req.body;

    const old = {
      payment_date: payment.payment_date,
      payment_method: payment.payment_method,
      bank_account_id: payment.bank_account_id,
      reference: payment.reference,
      notes: payment.notes,
    };

    db.prepare(`
      UPDATE payments SET
        payment_date = COALESCE(?, payment_date),
        payment_method = COALESCE(?, payment_method),
        bank_account_id = ?,
       reference = COALESCE(?, reference),
        notes = COALESCE(?, notes),
        updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `).run(
      d.paymentDate || d.payment_date || null,
      d.paymentMethod || d.payment_method || null,
      d.bankAccountId !== undefined ? (d.bankAccountId || d.bank_account_id || null) : payment.bank_account_id,
      d.reference !== undefined ? (d.reference || null) : payment.reference,
      d.notes !== undefined ? (d.notes || null) : payment.notes,
      now(), req.params.id, req.tenant.id
    );

    db.prepare('INSERT INTO audit_logs (id,tenant_id,user_id,user_name,action,entity_type,entity_id,description,changes) VALUES (?,?,?,?,?,?,?,?,?)').run(
      uuid(), req.tenant.id, req.user.id, req.user.full_name, 'payment_updated', 'payment', req.params.id,
      `Modificó datos del pago ${req.params.id.slice(-8)}`,
      JSON.stringify({ old, new: { payment_date: d.paymentDate||d.payment_date, payment_method: d.paymentMethod||d.payment_method } })
    );
    res.json(db.prepare('SELECT * FROM payments WHERE id=?').get(req.params.id));
  } catch(e:any) { console.error(e); res.status(500).json({ error: e.message || 'Failed' }); }
});

export { router };

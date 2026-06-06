import { Router, Response } from 'express';
import { getDb, uuid, now, r2 } from '../db/database';
import { authenticate, requireTenant, requirePermission, AuthRequest } from '../middleware/auth';
import { generateDraft } from '../services/whatsappService';

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
    const lateInst     = installments.filter((i: any) => {
      // FIX (Jun 2026): NO usar mora_days (no se resetea al pagar).
      // Criterio correcto: cuota actualmente en atraso, o cuota pagada
      // tarde (paid_at > due_date). Asi el score refleja comportamiento real.
      if (i.status === 'overdue' && !i.paid_at) return true;
      if (i.paid_at && i.due_date) {
        try {
          const paidDate = new Date(i.paid_at);
          const dueDate = new Date(i.due_date);
          // Tolerancia 1 dia (zona horaria + cierre del dia)
          if (paidDate.getTime() - dueDate.getTime() > 86400000) return true;
        } catch (_) { /* fechas invalidas — ignorar */ }
      }
      return false;
    }).length;
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
  // Reutiliza calcMoraPerInstallment para garantizar consistencia:
  // SUM(calcMoraPerInstallment) === calcMora siempre.
  const perInst = calcMoraPerInstallment(loan, installments, asOf);
  let total = 0;
  for (const k in perInst) total += perInst[k];
  return r2(total);
}

/** Calculate mora INDIVIDUAL per installment as of a given date.
 *  Returns Record<installment_id, moraAmount>.
 *
 *  Misma logica que calcMora() pero retornando por cuota. Es la base para
 *  la nueva asignacion "waterfall por cuota" de allocatePayment:
 *  cada pago liquida la mora de SU cuota antes de pasar a la siguiente,
 *  en vez de cobrar la mora global consolidada antes de tocar cuotas.
 */
function calcMoraPerInstallment(loan: any, installments: any[], asOf: Date): Record<string, number> {
  const base     = loan.mora_base || 'cuota_vencida';
  const useFixed = !!loan.mora_fixed_enabled;
  const fixedAmt = loan.mora_fixed_amount || 0;
  // mora_start_date: si esta seteada, la mora se cuenta solo a partir de esa fecha
  // (para prestamos migrados que ya estaban al dia, evita mora retroactiva).
  // FIX P1 (Jun 2026): parsear local-midnight para evitar offsets de zona horaria.
  const toLocalMidnight = (s: string) => new Date(s.length > 10 ? s : s + 'T00:00:00');
  const moraStart = loan.mora_start_date ? toLocalMidnight(loan.mora_start_date) : null;
  const out: Record<string, number> = {};
  for (const inst of installments) {
    if (inst.status === 'paid' || inst.status === 'waived') continue;
    const effectiveDue = inst.deferred_due_date
      ? toLocalMidnight(inst.deferred_due_date)
      : toLocalMidnight(inst.due_date);
    // El "punto de partida" para contar dias en mora es el mayor entre
    // (fecha de vencimiento) y (mora_start_date si existe).
    const startFrom = moraStart && moraStart.getTime() > effectiveDue.getTime()
      ? moraStart
      : effectiveDue;
    const days     = Math.max(0, Math.floor((asOf.getTime() - startFrom.getTime()) / 86400000));
    const moraDays = Math.max(0, days - (loan.mora_grace_days || 0));
    if (moraDays <= 0) { out[inst.id] = 0; continue; }
    if (useFixed) {
      out[inst.id] = r2(fixedAmt);
    } else {
      let baseAmount = 0;
      if (base === 'cuota_vencida') {
        baseAmount = r2((inst.principal_amount + inst.interest_amount) - (inst.paid_total || 0));
      } else {
        baseAmount = r2((inst.principal_amount || 0) - (inst.paid_principal || 0));
      }
      out[inst.id] = r2(Math.max(0, baseAmount) * (loan.mora_rate_daily || 0.001) * moraDays);
    }
  }
  return out;
}

/** Apply amount to pending installments with WATERFALL-PER-INSTALLMENT logic.
 *
 *  NUEVA LOGICA (May 2026): a diferencia del modelo anterior que cobraba
 *  TODA la mora vigente global ANTES de tocar cualquier cuota, ahora por
 *  cada cuota en orden cronologico se aplica: mora-de-esa-cuota -> interes
 *  -> capital. El sobrante pasa a la siguiente cuota.
 *
 *  Motivacion:
 *    - Mas intuitivo para el cliente ("paso de cuota a cuota").
 *    - Cuotas viejas se liquidan ordenadamente en vez de quedar parciales
 *      por absorcion global de mora.
 *    - Coincide con el sistema frances/bancario que ya usamos en el plan.
 *
 *  paymentType:
 *    'regular' | 'full_payoff' — mora -> interes -> capital, por cuota
 *    'interest_only'           — NO cobra mora, NO cobra capital, solo interes
 *    'capital_only'            — NO cobra mora, cobra interes pendiente y luego capital
 *
 *  moraPerInst: mapa { installment_id -> mora_de_esa_cuota } generado por
 *  calcMoraPerInstallment(). Garantiza SUM(moraPerInst) === calcMora().
 */
function allocatePayment(
  installments: any[],
  amount: number,
  paymentType: string,
  overpaymentAction: string,
  moraPerInst: Record<string, number>
) {
  let remaining = r2(amount);
  const updates: Array<{ id: string; addPrincipal: number; addInterest: number; addMora: number }> = [];
  let totalInterest = 0, totalPrincipal = 0, totalMora = 0, excessToCapital = 0;

  // Reglas por tipo de pago:
  //   regular / full_payoff -> cobra MORA + INTERES + CAPITAL (en ese orden, por cuota)
  //   interest_only         -> NO mora, NO capital, solo INTERES
  //   capital_only          -> NO mora, cobra INTERES pendiente PRIMERO, luego CAPITAL
  //                             (estandar bancario: no se toca capital con interes vencido)
  const chargesMora    = paymentType !== 'interest_only' && paymentType !== 'capital_only';
  const chargesCapital = paymentType !== 'interest_only';

  // Cuotas pendientes en orden cronologico efectivo (deferred_due_date tiene precedencia)
  const pending = installments
    .filter(i => !['paid', 'waived'].includes(i.status))
    .sort((a, b) => {
      const dateA = a.deferred_due_date || a.due_date;
      const dateB = b.deferred_due_date || b.due_date;
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    });

  for (const inst of pending) {
    if (remaining <= 0.001) break;
    let addM = 0, addI = 0, addP = 0;

    // 1) MORA de esta cuota
    if (chargesMora) {
      const moraOfInst   = r2(moraPerInst[inst.id] || 0);
      const moraPendInst = Math.max(0, r2(moraOfInst - (inst.paid_mora || 0)));
      if (moraPendInst > 0 && remaining > 0) {
        addM = r2(Math.min(remaining, moraPendInst));
        totalMora += addM;
        remaining = r2(remaining - addM);
      }
    }

    // 2) INTERES de esta cuota (todos los tipos cobran interes pendiente)
    const interestOwed = Math.max(0, r2((inst.interest_amount || 0) - (inst.paid_interest || 0)));
    if (interestOwed > 0 && remaining > 0) {
      addI = r2(Math.min(remaining, interestOwed));
      totalInterest += addI;
      remaining = r2(remaining - addI);
    }

    // 3) CAPITAL de esta cuota (todos excepto interest_only)
    if (chargesCapital) {
      const principalOwed = Math.max(0, r2((inst.principal_amount || 0) - (inst.paid_principal || 0)));
      if (principalOwed > 0 && remaining > 0) {
        addP = r2(Math.min(remaining, principalOwed));
        totalPrincipal += addP;
        remaining = r2(remaining - addP);
      }
    }

    if (addM > 0 || addI > 0 || addP > 0) {
      updates.push({ id: inst.id, addPrincipal: addP, addInterest: addI, addMora: addM });
    }
  }

  // OVERPAYMENT: sobrante despues de cubrir todas las cuotas
  if (remaining > 0.01) {
    if (overpaymentAction === 'apply_to_capital' && paymentType !== 'interest_only') {
      excessToCapital = remaining;
      totalPrincipal += remaining;
      remaining = 0;
    }
    // 'apply_to_next_installment': remaining queda > 0 (caller decide)
  }

  return {
    updates,
    totalInterest: r2(totalInterest),
    totalPrincipal: r2(totalPrincipal),
    totalMora: r2(totalMora),
    excessToCapital: r2(excessToCapital),
    remaining: r2(remaining),
  };
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
    const moraPerInst = calcMoraPerInstallment(loan, installments, pDate);
    const mora = r2(Object.values(moraPerInst).reduce((s, v) => s + v, 0));

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
      allocatePayment(installments, parseFloat(amount), payment_type, overpayment_action, moraPerInst);

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
    const { loan_id, bank_account_id, page = '1', limit = '20', voided_filter } = req.query as any;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const db = getDb();

    // voided_filter: 'valid' (default) | 'voided' | 'all'
    // When filtering by specific loan, default a 'all' (historial completo del prestamo).
    let voidedClause = '';
    const filterMode = (voided_filter || (loan_id || bank_account_id ? 'all' : 'valid')).toString();
    if (filterMode === 'valid')  voidedClause = ' AND p.is_voided=0';
    else if (filterMode === 'voided') voidedClause = ' AND p.is_voided=1';
    // 'all' -> no clause

    let where = `WHERE p.tenant_id=?${voidedClause}`;
    const params: any[] = [req.tenant.id];
    if (loan_id) { where += ' AND p.loan_id=?'; params.push(loan_id); }
    if (bank_account_id) { where += ' AND p.bank_account_id=?'; params.push(bank_account_id); }

    const total = (db.prepare(`SELECT COUNT(*) as c FROM payments p ${where}`).get(...params) as any).c;

    // Conteo separado de validos vs anulados (sin filtro de voided) para mostrar en la UI
    const baseWhere = (loan_id || bank_account_id)
      ? 'WHERE p.tenant_id=?' + (loan_id ? ' AND p.loan_id=?' : '') + (bank_account_id ? ' AND p.bank_account_id=?' : '')
      : 'WHERE p.tenant_id=?';
    const baseParams: any[] = [req.tenant.id];
    if (loan_id) baseParams.push(loan_id);
    if (bank_account_id) baseParams.push(bank_account_id);
    const counts = db.prepare(`SELECT
      SUM(CASE WHEN p.is_voided=0 THEN 1 ELSE 0 END) AS valid_count,
      SUM(CASE WHEN p.is_voided=1 THEN 1 ELSE 0 END) AS voided_count
      FROM payments p ${baseWhere}`).get(...baseParams) as any;

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
    res.json({
      data,
      total,
      counts: {
        valid:  Number(counts?.valid_count)  || 0,
        voided: Number(counts?.voided_count) || 0,
      },
      filter: filterMode,
    });
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

    // ── Validacion estricta de moneda (P0 Audit fix) ───────────────────────────
    const loanCurrency = (loan.currency || 'DOP').toUpperCase();
    if (bank_account_id) {
      const bankAcc = db.prepare('SELECT currency FROM bank_accounts WHERE id=? AND tenant_id=?').get(bank_account_id, req.tenant.id) as any;
      if (bankAcc && (bankAcc.currency || 'DOP').toUpperCase() !== loanCurrency) {
        return res.status(400).json({ error: `Este préstamo es en ${loanCurrency}. La cuenta bancaria seleccionada está en ${bankAcc.currency}. Selecciona una cuenta en ${loanCurrency}.` });
      }
    } else if (loanCurrency !== 'DOP') {
      return res.status(400).json({ error: `Este préstamo es en ${loanCurrency}. Debes seleccionar una cuenta bancaria en ${loanCurrency} para registrar el pago.` });
    }

    const pDate = new Date(payment_date || new Date());

    // Anti-error humano: no permitir fecha de pago muy futura (margen 3 dias por zonas horarias).
    // Si necesitas registrar pagos futuros (ej. cheques posfechados) se contemplara en otro flujo.
    const maxFutureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    if (pDate.getTime() > maxFutureDate.getTime()) {
      return res.status(400).json({
        error: `La fecha del pago no puede ser mayor a 3 dias en el futuro. Recibido: ${pDate.toISOString().slice(0, 10)}`,
      });
    }

    const installments = db.prepare('SELECT * FROM installments WHERE loan_id=? ORDER BY due_date').all(loan_id) as any[];
    const moraPerInst = calcMoraPerInstallment(loan, installments, pDate);
    const mora = r2(Object.values(moraPerInst).reduce((s, v) => s + v, 0));

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
        applied_mora,applied_charges,applied_interest,applied_capital,payment_method,bank_account_id,reference,type,notes,currency) VALUES
        (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        payId2, req.tenant.id, loan_id, req.user.id, collector_id || null,
        payment_number2, pDate.toISOString(), totalCharge,
        moraAmount, r2(prorrogaFee), 0, 0,
        payment_method, bank_account_id || null, reference || null, 'prorroga', notes || null,
        loanCurrency
      );

      // -- Payment items for receipt breakdown -----------------------
      const insertItem2 = db.prepare('INSERT INTO payment_items (id,payment_id,concept,amount) VALUES (?,?,?,?)');
      if (prorrogaFee > 0) insertItem2.run(uuid(), payId2, 'prorroga_fee', prorrogaFee);
      if (moraAmount > 0)  insertItem2.run(uuid(), payId2, 'mora', moraAmount);

      // -- Shift all unpaid installments 1 period forward -------------
      applyProrrogaShift(db, loan_id, loan.payment_frequency, installments);

      // -- Update loan mora_balance only (principal/interest unchanged)
      const newMoraBal = r2(Math.max(0, (loan.mora_balance || 0) - moraAmount));
      db.prepare(`UPDATE loans SET mora_balance=?,total_paid=?,total_paid_mora=?,updated_at=? WHERE id=? AND tenant_id=?`).run(
        newMoraBal,
        r2((loan.total_paid || 0) + totalCharge),
        r2((loan.total_paid_mora || 0) + moraAmount),
        now(), loan_id, req.tenant.id
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

      // Devolver el payment con registered_by_name resuelto (LEFT JOIN users)
      // para que el recibo en el frontend muestre "Registrado por: <Nombre>".
      return res.status(201).json({
        payment: db.prepare(`SELECT p.*, u.full_name as registered_by_name
          FROM payments p LEFT JOIN users u ON u.id=p.registered_by WHERE p.id=?`).get(payId2),
        receipt: db.prepare('SELECT * FROM receipts WHERE id=?').get(receiptId2),
        breakdown: { prorroga_fee: prorrogaFee, mora: moraAmount, interest: 0, capital: 0, excessToCapital: 0, remaining: 0 },
      });
    }
    // ----------------------------------------------------------------

    const { updates, totalInterest, totalPrincipal, totalMora, excessToCapital, remaining } =
      allocatePayment(installments, amount, payment_type, overpayment_action, moraPerInst);

    // ── Save payment record ───────────────────────────────────────────────────
    const count = (db.prepare('SELECT COUNT(*) as c FROM payments WHERE tenant_id=?').get(req.tenant.id) as any).c;
    const payment_number = `PAG-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;
    const payId = uuid();

    // applied_charges: future use for origination fees / extra charges module.
    // Currently 0 — tracked separately via payment_items if needed.
    const appliedCharges = 0;
    db.prepare(`INSERT INTO payments (id,tenant_id,loan_id,registered_by,collector_id,payment_number,payment_date,amount,
      applied_mora,applied_charges,applied_interest,applied_capital,payment_method,bank_account_id,reference,type,notes,currency) VALUES
      (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      payId, req.tenant.id, loan_id, req.user.id, collector_id || null,
      payment_number, pDate.toISOString(), amount,
      r2(totalMora), appliedCharges, r2(totalInterest), r2(totalPrincipal),
      payment_method, bank_account_id || null, reference || null, payment_type, notes || null,
      loanCurrency
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
      SELECT MAX(CAST(julianday('now') - julianday(COALESCE(i.deferred_due_date, i.due_date)) AS INTEGER)) as oldest_overdue
      FROM installments i
      WHERE i.loan_id=? AND i.status IN ('pending','partial')
        AND COALESCE(i.deferred_due_date, i.due_date) < date('now')
    `).get(loan_id) as any;
    const newDaysOverdue = Math.max(0, remainingOverdue?.oldest_overdue ?? 0);

    db.prepare(`UPDATE loans SET principal_balance=?,interest_balance=?,mora_balance=?,total_balance=?,
      total_paid=?,total_paid_principal=?,total_paid_interest=?,total_paid_mora=?,
      days_overdue=?,status=?,actual_close_date=?,updated_at=? WHERE id=? AND tenant_id=?`).run(
      newPrincipal, newInterest, newMoraBalance, totalBalance,
      r2((loan.total_paid || 0) + amount),
      r2((loan.total_paid_principal || 0) + totalPrincipal + excessToCapital),
      r2((loan.total_paid_interest || 0) + totalInterest),
      r2((loan.total_paid_mora || 0) + totalMora),
      newDaysOverdue, newStatus, fullyPaid ? pDate.toISOString() : null, now(), loan_id, req.tenant.id
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

    // ── Generar draft de WhatsApp transaccional (payment_received). Best-effort.
    generateDraft(db, req.tenant.id, 'payment_received', { payment_id: payId, loan_id: loan.id, user_id: req.user.id });

    // Devolver el payment con registered_by_name resuelto (LEFT JOIN users) para
    // que el recibo en el frontend muestre "Registrado por: <Nombre>" en vez de "—".
    res.status(201).json({
      payment: db.prepare(`SELECT p.*, u.full_name as registered_by_name
        FROM payments p LEFT JOIN users u ON u.id=p.registered_by WHERE p.id=?`).get(payId),
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
        const moraPerInstReapply = calcMoraPerInstallment(loan, freshInst, pDate);
        // Prorroga payments only shift dates -- no installment allocation needed
        if ((pay.type || 'regular') === 'prorroga') {
          applyProrrogaShift(db, payment.loan_id, loan.payment_frequency, freshInst);
          continue;
        }
        const { updates } = allocatePayment(freshInst, pay.amount, pay.type || 'regular', 'apply_to_next_installment', moraPerInstReapply);
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
      // FIX P0 (Jun 2026): re-calcular mora desde cero con calcMora sobre las cuotas
      // post-reaplicacion. La aritmetica anterior restaba la mora del pago anulado
      // sobre loan.mora_balance que YA habia sido reducido en el pago original,
      // produciendo descuento DOBLE -> mora_balance subestimada.
      const moraBalance = r2(calcMora(loan, finalInst, new Date()));
      const totalBalance = r2(principalBalance + interestBalance + moraBalance);

      // Recalculate days_overdue after void
      const voidedOverdue = db.prepare(`
        SELECT MAX(CAST(julianday('now') - julianday(COALESCE(i.deferred_due_date, i.due_date)) AS INTEGER)) as oldest_overdue
        FROM installments i
        WHERE i.loan_id=? AND i.status IN ('pending','partial')
          AND COALESCE(i.deferred_due_date, i.due_date) < date('now')
      `).get(loan.id) as any;
      const voidDaysOverdue = Math.max(0, voidedOverdue?.oldest_overdue ?? 0);

      // FIX P1: respetar in_mora cuando hay cuotas vencidas tras grace_days.
      // Antes el void siempre devolvia 'active' aunque hubiera mora real.
      const newStatus = principalBalance <= 0.01
        ? 'liquidated'
        : (voidDaysOverdue > (loan.mora_grace_days || 0)) ? 'in_mora' : 'active';

      db.prepare(`UPDATE loans SET principal_balance=?,interest_balance=?,mora_balance=?,total_balance=?,
        total_paid=?,total_paid_principal=?,total_paid_interest=?,total_paid_mora=?,
        days_overdue=?,status=?,updated_at=? WHERE id=? AND tenant_id=?`).run(
        principalBalance, interestBalance, moraBalance, totalBalance,
        r2(payTotals.total_paid), r2(payTotals.total_capital), r2(payTotals.total_interest), r2(payTotals.total_mora),
        voidDaysOverdue, newStatus, now(), loan.id, req.tenant.id
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

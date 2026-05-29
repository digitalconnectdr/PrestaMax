// ─── PrestaMax — seed extendido con datos demo realistas ─────────────────────
// Genera ~50 clientes, ~100 prestamos en distintos estados, 10 inversionistas
// (5 fixed_rate + 5 equity), pagos historicos de 6 meses, y 3-4 payouts hechos.
//
// Uso:  npx ts-node src/db/seed_demo.ts
// (requiere haber corrido el seed base primero para tener tenant/plan)

import { getDb, initializeDatabase, uuid, now, r2 } from './database';
import { generateSchedule } from '../lib/calculations';

const NOMBRES_DR_M = ['Juan', 'Pedro', 'Luis', 'Miguel', 'José', 'Carlos', 'Rafael', 'Antonio', 'Manuel', 'Roberto', 'Francisco', 'Eduardo', 'Ramón', 'Andrés', 'Diego'];
const NOMBRES_DR_F = ['María', 'Ana', 'Carmen', 'Rosa', 'Lucía', 'Sofía', 'Patricia', 'Laura', 'Isabel', 'Mónica', 'Elena', 'Yesenia', 'Yokasta', 'Altagracia', 'Mercedes'];
const APELLIDOS_DR = ['Pérez', 'García', 'Rodríguez', 'Martínez', 'Hernández', 'López', 'González', 'Sánchez', 'Reyes', 'Mejía', 'Peña', 'Núñez', 'Cabrera', 'De los Santos', 'Almonte', 'Tavárez', 'Bautista', 'Castillo', 'Vásquez', 'Polanco'];
const OCUPACIONES = ['Comerciante', 'Empleado privado', 'Empleado público', 'Conductor', 'Profesor', 'Enfermero', 'Mecánico', 'Carpintero', 'Vendedor', 'Albañil', 'Cocinero', 'Estilista', 'Técnico', 'Contador', 'Costurera'];
const EMPRESAS = ['Supermercado El Nacional', 'Banco Popular', 'Claro Dominicana', 'Aerodom', 'EDESUR', 'CAASD', 'Centro Cuesta Nacional', 'Cervecería Nacional', 'Falconbridge', 'Ferreteria Ochoa', 'Plaza Lama', 'Sirena', 'Universidad APEC', 'Hospital Cabral', 'Ministerio de Salud'];
const PROVINCIAS = ['Santo Domingo', 'Santiago', 'La Vega', 'San Cristóbal', 'Puerto Plata', 'San Pedro de Macorís', 'Espaillat', 'Duarte'];
const ESTADOS_CIVIL = ['Soltero', 'Casado', 'Union Libre', 'Divorciado', 'Viudo'];

function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randDate(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - randInt(0, daysBack));
  return d.toISOString();
}

async function seedDemo(opts: { tenantId: string; productId: string; branchId: string; officerId: string; collectorId: string }) {
  initializeDatabase();
  const db = getDb();

  console.log('🌱 Seed demo extendido iniciando…');
  console.log(`   Tenant: ${opts.tenantId}`);

  // ── 50 clientes ─────────────────────────────────────────────────────────────
  const clientIds: string[] = [];
  for (let i = 1; i <= 50; i++) {
    const isMale = Math.random() < 0.6;
    const firstName = isMale ? rand(NOMBRES_DR_M) : rand(NOMBRES_DR_F);
    const lastName  = `${rand(APELLIDOS_DR)} ${rand(APELLIDOS_DR)}`;
    const fullName  = `${firstName} ${lastName}`;
    const cedula    = `${randInt(100, 999)}-${String(randInt(1000000, 9999999)).padStart(7, '0')}-${randInt(1, 9)}`;
    const phone     = `809-${randInt(200, 999)}-${String(randInt(0, 9999)).padStart(4, '0')}`;
    const clientId  = uuid();

    db.prepare(`INSERT INTO clients (
      id, tenant_id, client_number, first_name, last_name, full_name,
      id_number, id_type, gender, marital_status, phone_personal, phone_work,
      address, city, province, occupation, employer, work_address,
      monthly_income, score, created_at, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'cedula', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`).run(
      clientId, opts.tenantId, `CLI-${String(i).padStart(4, '0')}`,
      firstName, lastName, fullName,
      cedula, isMale ? 'M' : 'F',
      rand(ESTADOS_CIVIL),
      phone,
      `809-${randInt(200, 999)}-${String(randInt(0, 9999)).padStart(4, '0')}`,
      `Calle ${rand(['Duarte', 'Mella', '27 de Febrero', 'Independencia', 'Bolívar'])} #${randInt(1, 999)}`,
      rand(PROVINCIAS),
      rand(PROVINCIAS),
      rand(OCUPACIONES),
      rand(EMPRESAS),
      `Av. ${rand(['Lincoln', 'Tiradentes', 'JFK', 'Roberto Pastoriza'])} #${randInt(1, 999)}`,
      randInt(15000, 80000),
      randInt(50, 95),
      randDate(540),
    );
    clientIds.push(clientId);
  }
  console.log(`✅ 50 clientes creados`);

  // ── 10 inversionistas (5 fixed_rate, 5 equity) ─────────────────────────────
  const investorIds: string[] = [];
  // Timestamp epoch para evitar colision de emails en ejecuciones repetidas
  const seedRun = Date.now().toString(36).slice(-4);
  for (let i = 1; i <= 10; i++) {
    const isFixedRate = i <= 5;
    const fullName = `${rand(NOMBRES_DR_M)} ${rand(APELLIDOS_DR)}`;
    const invId = uuid();
    const capital = isFixedRate ? randInt(50000, 500000) : 0;
    db.prepare(`INSERT INTO investors (
      id, tenant_id, full_name, email, phone, id_number,
      model_type, fixed_rate_monthly, equity_percent_interest, commission_percent,
      capital_contributed, notes, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`).run(
      invId, opts.tenantId, fullName,
      `inv${i}-${seedRun}@demo.com`, `809-555-${String(2000 + i).padStart(4, '0')}`,
      `${randInt(100, 999)}-${String(randInt(1000000, 9999999)).padStart(7, '0')}-${randInt(1, 9)}`,
      isFixedRate ? 'fixed_rate' : 'equity',
      isFixedRate ? randInt(2, 4) : 0,
      isFixedRate ? 0 : randInt(50, 80),
      isFixedRate ? 0 : randInt(10, 20),
      capital,
      isFixedRate ? `Inversionista tasa fija ${i}` : `Inversionista equity ${i}`,
    );
    investorIds.push(invId);
  }
  console.log(`✅ 10 inversionistas creados (5 fixed_rate + 5 equity)`);

  // ── 100 prestamos en distintos estados ─────────────────────────────────────
  const STATUSES = ['active', 'active', 'active', 'in_mora', 'in_mora', 'liquidated', 'liquidated', 'voided', 'rejected', 'under_review'];
  const TYPES    = ['fixed_installment', 'flat_interest', 'fixed_installment', 'fixed_installment'];
  let createdLoans = 0;

  for (let i = 1; i <= 100; i++) {
    const clientId = rand(clientIds);
    const status   = rand(STATUSES);
    const amount   = randInt(5000, 100000);
    const rate     = randInt(2, 5);
    const term     = randInt(6, 24);
    const type     = rand(TYPES);
    const investorId = i <= 30 ? rand(investorIds) : null; // 30% asignados a inversionista

    // Fecha de desembolso: para in_mora forzar 180-365 dias atras (cuotas vencidas reales).
    // Para active mas reciente. Para under_review/rejected NO hay disbursement_date.
    let disbDate: string | null = null;
    if (status === 'in_mora') {
      const d = new Date();
      d.setDate(d.getDate() - randInt(180, 365)); // bien atras para tener atrasos
      disbDate = d.toISOString();
    } else if (status === 'liquidated') {
      const d = new Date();
      d.setDate(d.getDate() - randInt(365, 720)); // viejo y pagado
      disbDate = d.toISOString();
    } else if (!['under_review', 'rejected'].includes(status)) {
      const d = new Date();
      d.setDate(d.getDate() - randInt(30, 150));
      disbDate = d.toISOString();
    }

    const loanNumber = `PRE-2026-${String(i).padStart(5, '0')}`;
    const loanId = uuid();

    // Calcular cuanto interes total tendria el prestamo (informativo)
    const totalInterest = r2(amount * (rate / 100) * term);

    db.prepare(`INSERT INTO loans (
      id, tenant_id, branch_id, client_id, product_id, loan_number, status,
      requested_amount, approved_amount, disbursed_amount, rate, rate_type,
      term, term_unit, payment_frequency, amortization_type,
      application_date, approval_date, disbursement_date, first_payment_date,
      principal_balance, interest_balance, mora_balance, total_balance,
      total_paid, days_overdue, collector_id, currency, investor_id,
      mora_rate_daily, mora_grace_days
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'monthly', ?, 'months', 'monthly', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, 'DOP', ?, 0.001, 3)`).run(
      loanId, opts.tenantId, opts.branchId, clientId, opts.productId, loanNumber, status,
      amount, amount, status === 'rejected' || status === 'under_review' ? null : amount,
      rate, term, type,
      randDate(540),
      ['under_review', 'rejected'].includes(status) ? null : randDate(180),
      disbDate, disbDate,
      status === 'liquidated' ? 0 : amount,
      0,
      0, // mora_balance se calcula al final
      status === 'liquidated' ? 0 : amount,
      opts.collectorId,
      investorId,
    );

    // Generar installments solo si está desembolsado
    if (disbDate && !['voided', 'rejected', 'under_review'].includes(status)) {
      const schedule = generateSchedule({
        amount, rate, rateType: 'monthly',
        term, termUnit: 'months', freq: 'monthly',
        type: type as any,
        firstDate: disbDate,
      });
      for (const inst of schedule) {
        db.prepare(`INSERT INTO installments (
          id, loan_id, installment_number, due_date,
          principal_amount, interest_amount, total_amount, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
          uuid(), loanId, inst.installment_number, inst.due_date,
          inst.principal_amount, inst.interest_amount, inst.total_amount,
          status === 'liquidated' ? 'paid' : 'pending',
        );
      }
    }
    createdLoans++;
  }

  // ── Recalcular days_overdue y mora_balance para todos los prestamos ────────
  // Esto persiste valores correctos para que dashboard y reportes los lean.
  const allLoans = db.prepare(`
    SELECT id, mora_rate_daily, mora_grace_days FROM loans
    WHERE tenant_id=? AND disbursement_date IS NOT NULL
  `).all(opts.tenantId) as any[];

  const today = new Date();
  for (const loan of allLoans) {
    const insts = db.prepare(`SELECT * FROM installments WHERE loan_id=? AND status NOT IN ('paid','waived','cancelled')`).all(loan.id) as any[];
    let maxDays = 0;
    let totalMora = 0;
    for (const inst of insts) {
      const due = new Date(inst.due_date);
      const days = Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));
      const moraDays = Math.max(0, days - (loan.mora_grace_days || 3));
      if (moraDays > 0) {
        if (days > maxDays) maxDays = days;
        const baseAmount = (inst.principal_amount + inst.interest_amount) - (inst.paid_total || 0);
        totalMora += Math.max(0, baseAmount) * (loan.mora_rate_daily || 0.001) * moraDays;
      }
    }
    db.prepare('UPDATE loans SET days_overdue=?, mora_balance=? WHERE id=?')
      .run(maxDays, r2(totalMora), loan.id);
  }
  console.log('✅ days_overdue y mora_balance recalculados');
  console.log(`✅ ${createdLoans} prestamos creados (mix de estados)`);

  // ── Generar pagos historicos (6 meses) para algunos prestamos activos ──────
  const activeLoans = db.prepare(`
    SELECT id, principal_balance, currency, investor_id FROM loans
    WHERE tenant_id = ? AND status IN ('active','in_mora') AND disbursed_amount > 0
    LIMIT 60
  `).all(opts.tenantId) as any[];

  let paymentCount = 0;
  // Distribuir pagos: la MITAD en los ultimos 30 dias (para que aparezcan en filtros default
  // como dashboard, reporte mensual, etc.) y la otra mitad en los meses 1-6.
  for (let idx = 0; idx < activeLoans.length; idx++) {
    const loan = activeLoans[idx];
    const numPagos = randInt(1, 6);
    const installments = db.prepare('SELECT * FROM installments WHERE loan_id=? ORDER BY installment_number LIMIT ?').all(loan.id, numPagos) as any[];
    const recentLoan = idx % 2 === 0; // alternar: la mitad de los prestamos tienen pagos recientes
    for (let p = 0; p < installments.length; p++) {
      const inst = installments[p];
      const payAmount = r2(inst.total_amount);
      const payDate = new Date();
      if (recentLoan) {
        // Pagos en ultimos 30 dias, escalonados
        payDate.setDate(payDate.getDate() - randInt(1, 30));
      } else {
        // Pagos en meses 1-6, escalonados por orden p
        payDate.setDate(payDate.getDate() - (numPagos - p) * 30 - randInt(0, 10));
      }
      // Mix de metodos de pago para que aparezcan en el reporte por cuenta bancaria
      const method = idx % 3 === 0 ? 'transfer' : (idx % 3 === 1 ? 'cash' : 'card');

      db.prepare(`INSERT INTO payments (
        id, tenant_id, loan_id, registered_by, payment_number, payment_date, amount,
        applied_mora, applied_charges, applied_interest, applied_capital,
        payment_method, type, currency
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 'regular', 'DOP')`).run(
        uuid(), opts.tenantId, loan.id, opts.officerId,
        `PAG-2026-${String(paymentCount + 1).padStart(6, '0')}`,
        payDate.toISOString(), payAmount,
        inst.interest_amount, inst.principal_amount,
        method,
      );

      db.prepare('UPDATE installments SET status=?, paid_total=?, paid_principal=?, paid_interest=? WHERE id=?')
        .run('paid', inst.total_amount, inst.principal_amount, inst.interest_amount, inst.id);

      // Actualizar total_paid del prestamo
      db.prepare('UPDATE loans SET total_paid = total_paid + ? WHERE id=?').run(payAmount, loan.id);

      paymentCount++;
    }
  }
  console.log(`✅ ${paymentCount} pagos historicos generados`);

  // ── 3 payouts ya hechos para algunos inversionistas equity ─────────────────
  const equityInvs = db.prepare(`SELECT * FROM investors WHERE tenant_id=? AND model_type='equity' LIMIT 3`).all(opts.tenantId) as any[];
  let payoutCount = 0;
  for (const inv of equityInvs) {
    const periodTo   = new Date();
    const periodFrom = new Date(periodTo.getTime() - 30 * 86400000);
    const periodFromStr = periodFrom.toISOString().slice(0, 10);
    const periodToStr   = periodTo.toISOString().slice(0, 10);

    const pendingPayments = db.prepare(`
      SELECT p.id, p.applied_interest, p.applied_mora FROM payments p
      JOIN loans l ON l.id = p.loan_id
      WHERE p.tenant_id=? AND p.is_voided=0 AND l.investor_id=?
        AND p.liquidated_in_payout_id IS NULL
    `).all(opts.tenantId, inv.id) as any[];

    if (pendingPayments.length === 0) continue;

    const grossInterest = r2(pendingPayments.reduce((s, p) => s + (p.applied_interest || 0), 0));
    const grossMora     = r2(pendingPayments.reduce((s, p) => s + (p.applied_mora || 0), 0));
    const grossTotal    = r2(grossInterest + grossMora);
    const commPct       = parseFloat(inv.commission_percent) || 0;
    const commAmt       = r2(grossTotal * commPct / 100);
    const netAmount     = r2(grossTotal - commAmt);
    if (netAmount <= 0) continue;

    const payoutId  = uuid();
    const ieId      = uuid();
    db.prepare(`INSERT INTO investor_payouts (
      id, tenant_id, investor_id, period_from, period_to, payments_count,
      gross_interest, gross_mora, gross_capital, gross_total,
      commission_percent, commission_amount, net_amount,
      paid_at, paid_by, payment_method, status, income_expense_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 'bank_transfer', 'paid', ?)`).run(
      payoutId, opts.tenantId, inv.id, periodFromStr, periodToStr,
      pendingPayments.length, grossInterest, grossMora, grossTotal,
      commPct, commAmt, netAmount, periodToStr, opts.officerId, ieId,
    );

    db.prepare(`INSERT INTO income_expenses (
      id, tenant_id, registered_by, type, category, description, amount, transaction_date, payment_method
    ) VALUES (?, ?, ?, 'expense', 'investor_payout', ?, ?, ?, 'bank_transfer')`).run(
      ieId, opts.tenantId, opts.officerId,
      `Liquidación a ${inv.full_name} (${periodFromStr} a ${periodToStr})`,
      netAmount, periodToStr,
    );

    const upd = db.prepare('UPDATE payments SET liquidated_in_payout_id=? WHERE id=?');
    for (const p of pendingPayments) upd.run(payoutId, p.id);

    payoutCount++;
  }
  console.log(`✅ ${payoutCount} payouts demo creados`);

  console.log('');
  console.log('🎉 Seed demo extendido completo');
  console.log(`   50 clientes, 100 prestamos, 10 inversionistas, ${paymentCount} pagos, ${payoutCount} payouts`);
}

// ─── CLI entry ──────────────────────────────────────────────────────────────
if (require.main === module) {
  const db = getDb();
  // Buscar el primer tenant activo
  const tenant = db.prepare("SELECT id FROM tenants WHERE is_active=1 LIMIT 1").get() as any;
  if (!tenant) {
    console.error('No hay tenants. Corre el seed base primero.');
    process.exit(1);
  }
  const product = db.prepare("SELECT id FROM loan_products WHERE tenant_id=? LIMIT 1").get(tenant.id) as any;
  const branch  = db.prepare("SELECT id FROM branches WHERE tenant_id=? LIMIT 1").get(tenant.id) as any;
  const officer = db.prepare("SELECT user_id FROM tenant_memberships WHERE tenant_id=? AND roles LIKE '%tenant_owner%' LIMIT 1").get(tenant.id) as any;
  const coll    = db.prepare("SELECT user_id FROM tenant_memberships WHERE tenant_id=? AND roles LIKE '%cobrador%' LIMIT 1").get(tenant.id) as any;

  if (!product || !branch || !officer) {
    console.error('Faltan product/branch/owner. Corre el seed base primero.');
    process.exit(1);
  }
  seedDemo({
    tenantId: tenant.id,
    productId: product.id,
    branchId: branch.id,
    officerId: officer.user_id,
    collectorId: coll?.user_id || officer.user_id,
  }).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

export { seedDemo };

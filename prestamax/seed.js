/**
 * PrestaMax — Seed Script
 * Limpia datos de prueba y carga 10 clientes + 10 préstamos con cálculos correctos
 */

const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('crypto');

const db = new DatabaseSync('./prestamax.db');

const uid = () => randomUUID();
const now = () => new Date().toISOString();

// ── Helpers ──────────────────────────────────────────────────────────────────
function r2(n) { return Math.round(n * 100) / 100; }

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function getNextDate(d, freq) {
  if (freq === 'daily')     return addDays(d, 1);
  if (freq === 'weekly')    return addDays(d, 7);
  if (freq === 'biweekly')  return addDays(d, 15);
  return addMonths(d, 1); // monthly
}

function getInstallmentCount(term, termUnit, freq) {
  const months = termUnit === 'months' ? term : termUnit === 'weeks' ? term / 4.33 : term / 30;
  if (freq === 'daily')    return Math.round(months * 30);
  if (freq === 'weekly')   return Math.round(months * 4.33);
  if (freq === 'biweekly') return Math.round(months * 2);
  return Math.round(months);
}

function generateSchedule({ amount, rate, rateType, term, termUnit, freq, type, firstDate }) {
  const mRate = rateType === 'annual' ? rate / 100 / 12
    : rateType === 'daily' ? rate / 100 * 30
    : rateType === 'weekly' ? rate / 100 * 4.33
    : rateType === 'biweekly' ? rate / 100 * 2
    : rate / 100; // monthly default

  const n = getInstallmentCount(term, termUnit, freq);
  const schedule = [];
  let balance = amount;
  let currentDate = new Date(firstDate);
  const fixedPayment = mRate > 0
    ? amount * (mRate * Math.pow(1 + mRate, n)) / (Math.pow(1 + mRate, n) - 1)
    : amount / n;

  for (let i = 1; i <= n; i++) {
    let principal = 0, interest = 0;
    if (type === 'fixed_installment') {
      interest = r2(balance * mRate);
      principal = i === n ? r2(balance) : r2(fixedPayment - interest);
    } else if (type === 'flat_interest') {
      interest = r2(amount * mRate);
      principal = r2(amount / n);
    } else if (type === 'interest_only') {
      interest = r2(balance * mRate);
      principal = i === n ? r2(balance) : 0;
    } else {
      interest = r2(balance * mRate);
      principal = r2(amount / n);
    }
    principal = Math.max(0, Math.min(principal, balance));
    balance = r2(balance - principal);
    schedule.push({
      installment_number: i,
      due_date: currentDate.toISOString(),
      principal_amount: principal,
      interest_amount: interest,
      total_amount: r2(principal + interest),
      total_due: r2(principal + interest),
      status: 'pending',
    });
    currentDate = getNextDate(currentDate, freq);
    if (Math.abs(balance) < 0.01) break;
  }
  return schedule;
}

// ── Read existing config ──────────────────────────────────────────────────────
const tenant = db.prepare("SELECT * FROM tenants LIMIT 1").get();
const adminUser = db.prepare("SELECT id FROM users WHERE platform_role='platform_owner' LIMIT 1").get()
  || db.prepare("SELECT id FROM users LIMIT 1").get();
const TENANT_ID = tenant.id;
const products = db.prepare("SELECT * FROM loan_products WHERE is_active=1").all();
const bankAccount = db.prepare("SELECT * FROM bank_accounts WHERE tenant_id=? AND is_active=1 LIMIT 1").get(TENANT_ID);

if (!tenant) { console.error('No tenant found. Aborting.'); process.exit(1); }
if (!bankAccount) { console.error('No bank account found. Aborting.'); process.exit(1); }
if (products.length === 0) { console.error('No products found. Aborting.'); process.exit(1); }

const BANK_ID = bankAccount.id;
const PROD_PERSONAL  = products.find(p => p.type === 'personal')   || products[0];
const PROD_SAN       = products.find(p => p.type === 'san')         || products[0];
const PROD_REDITOS   = products.find(p => p.type === 'reditos' || p.amortization_type === 'interest_only') || products[0];
const PROD_GARANTIA  = products.find(p => p.type === 'guaranteed')  || products[0];

// Ensure bank has enough balance for all seeds (total: ~575,000)
const SEED_INITIAL_BALANCE = 750000;
db.prepare("UPDATE bank_accounts SET initial_balance=?, current_balance=?, loaned_balance=0 WHERE id=?")
  .run(SEED_INITIAL_BALANCE, SEED_INITIAL_BALANCE, bankAccount.id);

console.log(`Tenant: ${tenant.name} (${TENANT_ID})`);
console.log(`Bank: ${bankAccount.bank_name} | Balance ajustado a: RD$${SEED_INITIAL_BALANCE.toLocaleString()}`);

// ── 1. Delete existing loan data ──────────────────────────────────────────────
console.log('\n── Limpiando datos anteriores...');
db.exec(`
  DELETE FROM payment_items;
  DELETE FROM receipts;
  DELETE FROM payments;
  DELETE FROM installments;
  DELETE FROM collection_notes;
  DELETE FROM payment_promises;
  DELETE FROM contracts;
  DELETE FROM loan_guarantors;
  DELETE FROM loan_guarantees;
  DELETE FROM guarantors;
  DELETE FROM loan_requests;
  DELETE FROM loans;
  DELETE FROM clients;
  DELETE FROM audit_logs;
  DELETE FROM whatsapp_messages;
`);

// Reset bank account to initial balance
db.prepare("UPDATE bank_accounts SET current_balance=initial_balance, loaned_balance=0 WHERE id=?").run(BANK_ID);
const freshBank = db.prepare("SELECT * FROM bank_accounts WHERE id=?").get(BANK_ID);
console.log(`Balance reiniciado a: ${freshBank.current_balance}`);

// ── 2. Define 10 clients ──────────────────────────────────────────────────────
const clientsData = [
  { first:'María', last:'Rodríguez Santos',  id_number:'001-2345678-9', phone:'809-555-0101', email:'maria.rodriguez@gmail.com', address:'Calle Las Flores 45', city:'Santiago', dob:'1988-03-15', score:5, occupation:'Maestra' },
  { first:'Carlos', last:'Martínez López',   id_number:'002-3456789-0', phone:'809-555-0102', email:'carlos.martinez@yahoo.com', address:'Av. Duarte 120 Apto 3B', city:'Santiago', dob:'1985-07-22', score:4, occupation:'Ingeniero' },
  { first:'Ana', last:'García Pérez',        id_number:'003-4567890-1', phone:'809-555-0103', email:'ana.garcia@hotmail.com', address:'Calle Principal 78', city:'La Vega', dob:'1992-11-08', score:5, occupation:'Comerciante' },
  { first:'Roberto', last:'Hernández Cruz',  id_number:'004-5678901-2', phone:'809-555-0104', email:'roberto.hernandez@gmail.com', address:'Urbanización Jardines 23', city:'Santiago', dob:'1979-01-30', score:3, occupation:'Taxista' },
  { first:'Laura', last:'Sánchez Reyes',     id_number:'005-6789012-3', phone:'809-555-0105', email:'laura.sanchez@gmail.com', address:'Residencial Las Palmas B-5', city:'Santiago', dob:'1995-06-14', score:4, occupation:'Enfermera' },
  { first:'Miguel', last:'Torres Familia',   id_number:'006-7890123-4', phone:'809-555-0106', email:'miguel.torres@gmail.com', address:'Calle Mella 234', city:'Moca', dob:'1983-09-25', score:2, occupation:'Agricultor' },
  { first:'Carmen', last:'Díaz Méndez',      id_number:'007-8901234-5', phone:'809-555-0107', email:'carmen.diaz@yahoo.com', address:'Av. Las Carreras 56', city:'Santiago', dob:'1990-04-03', score:5, occupation:'Contadora' },
  { first:'Juan', last:'Morales Castillo',   id_number:'008-9012345-6', phone:'809-555-0108', email:'juan.morales@gmail.com', address:'Calle 5 de Octubre 89', city:'Bonao', dob:'1987-12-19', score:3, occupation:'Mecánico' },
  { first:'Sofia', last:'Jiménez Vargas',    id_number:'009-0123456-7', phone:'809-555-0109', email:'sofia.jimenez@gmail.com', address:'Calle Nueva 12', city:'Santiago', dob:'1998-08-07', score:4, occupation:'Profesora' },
  { first:'Pedro', last:'Álvarez Núñez',     id_number:'010-1234567-8', phone:'809-555-0110', email:'pedro.alvarez@hotmail.com', address:'Residencial Country Club 44', city:'Santiago', dob:'1975-02-28', score:5, occupation:'Empresario' },
];

const insertClient = db.prepare(`
  INSERT INTO clients (id, tenant_id, client_number, first_name, last_name, full_name, id_number, phone_personal, whatsapp, email,
    address, city, birth_date, score, occupation, is_active, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
`);

const clientIds = [];
for (const [ci, c] of clientsData.entries()) {
  const id = uid();
  clientIds.push(id);
  const ts = now();
  const clientNumber = `CLI-${new Date().getFullYear()}-${String(ci + 1).padStart(4, '0')}`;
  insertClient.run(id, TENANT_ID, clientNumber, c.first, c.last, `${c.first} ${c.last}`, c.id_number,
    c.phone, c.phone, c.email, c.address, c.city, c.dob, c.score, c.occupation, ts, ts);
}
console.log(`✓ ${clientIds.length} clientes creados`);

// ── 3. Define 10 loans ────────────────────────────────────────────────────────
const today = new Date();
function daysAgo(n) { return addDays(today, -n); }

// Define loans: some active, some in mora, some recent
const loansConfig = [
  // 1. María — Préstamo Personal activo, cuotas niveladas, 12 meses, iniciado hace 3 meses
  {
    clientIdx: 0, product: PROD_PERSONAL, amount: 50000, term: 12, termUnit: 'months',
    rate: 5, rateType: 'monthly', freq: 'monthly', amortType: 'fixed_installment',
    startDaysAgo: 90, paymentsCount: 3, purpose: 'Remodelación del hogar'
  },
  // 2. Carlos — Préstamo Personal, 6 meses, iniciado hace 2 meses
  {
    clientIdx: 1, product: PROD_PERSONAL, amount: 25000, term: 6, termUnit: 'months',
    rate: 5, rateType: 'monthly', freq: 'monthly', amortType: 'fixed_installment',
    startDaysAgo: 60, paymentsCount: 2, purpose: 'Capital de trabajo'
  },
  // 3. Ana — Préstamo con Garantía grande, 24 meses, iniciado hace 5 meses
  {
    clientIdx: 2, product: PROD_GARANTIA, amount: 80000, term: 24, termUnit: 'months',
    rate: 2.5, rateType: 'monthly', freq: 'monthly', amortType: 'fixed_installment',
    startDaysAgo: 150, paymentsCount: 5, purpose: 'Expansión de negocio'
  },
  // 4. Roberto — en mora (no ha pagado ninguna cuota y empezó hace 45 días, cuota vencida)
  {
    clientIdx: 3, product: PROD_PERSONAL, amount: 15000, term: 6, termUnit: 'months',
    rate: 5, rateType: 'monthly', freq: 'monthly', amortType: 'fixed_installment',
    startDaysAgo: 45, paymentsCount: 0, purpose: 'Compra de vehículo'
  },
  // 5. Laura — Préstamo SAN semanal, 8 semanas, ha pagado 3 cuotas
  {
    clientIdx: 4, product: PROD_SAN, amount: 5000, term: 8, termUnit: 'weeks',
    rate: 10, rateType: 'monthly', freq: 'weekly', amortType: 'fixed_installment',
    startDaysAgo: 28, paymentsCount: 3, purpose: 'Capital de emergencia'
  },
  // 6. Miguel — Réditos (solo intereses), 12 meses, ha pagado 2 meses de intereses
  {
    clientIdx: 5, product: PROD_REDITOS, amount: 30000, term: 12, termUnit: 'months',
    rate: 3, rateType: 'monthly', freq: 'monthly', amortType: 'interest_only',
    startDaysAgo: 60, paymentsCount: 2, purpose: 'Mejoras agrícolas'
  },
  // 7. Carmen — Préstamo Personal reciente, 18 meses, 1 pago realizado
  {
    clientIdx: 6, product: PROD_PERSONAL, amount: 40000, term: 18, termUnit: 'months',
    rate: 5, rateType: 'monthly', freq: 'monthly', amortType: 'fixed_installment',
    startDaysAgo: 30, paymentsCount: 1, purpose: 'Gastos médicos'
  },
  // 8. Juan — Interés plano, 3 meses, ha pagado 1 cuota
  {
    clientIdx: 7, product: PROD_PERSONAL, amount: 10000, term: 3, termUnit: 'months',
    rate: 5, rateType: 'monthly', freq: 'monthly', amortType: 'flat_interest',
    startDaysAgo: 35, paymentsCount: 1, purpose: 'Reparación de vehículo'
  },
  // 9. Sofia — Garantía 36 meses, muy reciente, sin pagos aún
  {
    clientIdx: 8, product: PROD_GARANTIA, amount: 120000, term: 36, termUnit: 'months',
    rate: 2.5, rateType: 'monthly', freq: 'monthly', amortType: 'fixed_installment',
    startDaysAgo: 15, paymentsCount: 0, purpose: 'Compra de local comercial'
  },
  // 10. Pedro — Réditos de alto valor, 24 meses, ha pagado 6 meses
  {
    clientIdx: 9, product: PROD_REDITOS, amount: 200000, term: 24, termUnit: 'months',
    rate: 3, rateType: 'monthly', freq: 'monthly', amortType: 'interest_only',
    startDaysAgo: 180, paymentsCount: 6, purpose: 'Inversión inmobiliaria'
  },
];

const insertLoan = db.prepare(`
  INSERT INTO loans (id, tenant_id, client_id, product_id, loan_number, status,
    requested_amount, approved_amount, disbursed_amount,
    rate, rate_type, term, term_unit, payment_frequency, amortization_type,
    purpose, principal_balance, interest_balance, total_balance, total_interest,
    mora_rate_daily, mora_grace_days, disbursement_date, first_payment_date,
    maturity_date, disbursement_bank_account_id, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    0.001, 3, ?, ?,
    ?, ?, ?, ?)
`);

const insertInstallment = db.prepare(`
  INSERT INTO installments (id, loan_id, installment_number, due_date,
    principal_amount, interest_amount, total_amount,
    paid_principal, paid_interest, paid_mora, paid_total,
    status)
  VALUES (?, ?, ?, ?,
    ?, ?, ?,
    0, 0, 0, 0,
    ?)
`);

const ADMIN_ID = adminUser.id;

const insertPayment = db.prepare(`
  INSERT INTO payments (id, tenant_id, loan_id, registered_by, payment_number, payment_date,
    amount, applied_capital, applied_interest, applied_mora,
    payment_method, notes, created_at)
  VALUES (?, ?, ?, ?, ?, ?,
    ?, ?, ?, 0,
    'cash', 'Pago seed', ?)
`);

let totalDisbursed = 0;
let loanCount = 0;
let paymentCount = 0;

for (const [idx, cfg] of loansConfig.entries()) {
  const clientId = clientIds[cfg.clientIdx];
  const loanId = uid();
  loanCount++;
  const loanNumber = `PRE-${new Date().getFullYear()}-${String(loanCount).padStart(5, '0')}`;

  const disbDate = daysAgo(cfg.startDaysAgo);
  const firstPayDate = addMonths(disbDate, cfg.freq === 'weekly' ? 0 : 1);
  if (cfg.freq === 'weekly') firstPayDate.setDate(firstPayDate.getDate() + 7);

  const schedule = generateSchedule({
    amount: cfg.amount,
    rate: cfg.rate,
    rateType: cfg.rateType,
    term: cfg.term,
    termUnit: cfg.termUnit,
    freq: cfg.freq,
    type: cfg.amortType,
    firstDate: firstPayDate,
  });

  const totalInterest = r2(schedule.reduce((s, i) => s + i.interest_amount, 0));
  const maturityDate = schedule.length > 0 ? schedule[schedule.length - 1].due_date : null;

  // Calculate remaining balance after payments
  let principalPaid = 0;
  let interestPaid = 0;
  for (let p = 0; p < cfg.paymentsCount && p < schedule.length; p++) {
    principalPaid = r2(principalPaid + schedule[p].principal_amount);
    interestPaid = r2(interestPaid + schedule[p].interest_amount);
  }
  const principalBalance = r2(cfg.amount - principalPaid);
  const interestBalance = r2(totalInterest - interestPaid);

  const ts = now();
  insertLoan.run(
    loanId, TENANT_ID, clientId, cfg.product.id, loanNumber,
    cfg.amount, cfg.amount, cfg.amount,
    cfg.rate, cfg.rateType, cfg.term, cfg.termUnit, cfg.freq, cfg.amortType,
    cfg.purpose, principalBalance, interestBalance, r2(principalBalance + interestBalance), totalInterest,
    disbDate.toISOString(), firstPayDate.toISOString(),
    maturityDate, BANK_ID, ts, ts
  );

  // Insert installments
  for (const [si, inst] of schedule.entries()) {
    const pNum = si; // 0-indexed
    let instStatus = 'pending';
    if (pNum < cfg.paymentsCount) instStatus = 'paid';
    else if (new Date(inst.due_date) < today && pNum >= cfg.paymentsCount) instStatus = 'overdue';

    const instId = uid();
    insertInstallment.run(
      instId, loanId, inst.installment_number, inst.due_date,
      inst.principal_amount, inst.interest_amount, inst.total_amount,
      instStatus
    );

    // Record payments for paid installments
    if (pNum < cfg.paymentsCount) {
      const payDate = addDays(new Date(inst.due_date), -2).toISOString();
      paymentCount++;
      const payNum = `PAY-${new Date().getFullYear()}-${String(paymentCount).padStart(5,'0')}`;
      insertPayment.run(
        uid(), TENANT_ID, loanId, ADMIN_ID, payNum, payDate,
        inst.total_amount, inst.principal_amount, inst.interest_amount,
        ts
      );
      // Update installment paid amounts
      db.prepare(`UPDATE installments SET
        paid_principal=principal_amount, paid_interest=interest_amount,
        paid_mora=0, paid_total=total_amount, paid_at=?, status='paid' WHERE id=?`).run(payDate, instId);
    }
  }

  totalDisbursed += cfg.amount;
  const client = clientsData[cfg.clientIdx];
  console.log(`✓ Préstamo ${loanNumber} | ${client.first} ${client.last} | RD$${cfg.amount.toLocaleString()} | ${cfg.term} ${cfg.termUnit} | ${cfg.paymentsCount} pagos hechos`);
}

// ── 4. Update bank account balance ────────────────────────────────────────────
db.prepare(`UPDATE bank_accounts SET
  current_balance = initial_balance - ?,
  loaned_balance = ?
  WHERE id=?`).run(totalDisbursed, totalDisbursed, BANK_ID);

const updatedBank = db.prepare("SELECT * FROM bank_accounts WHERE id=?").get(BANK_ID);
console.log(`\n── Balance de cuenta bancaria actualizado:`);
console.log(`   Balance inicial: RD$${updatedBank.initial_balance.toLocaleString()}`);
console.log(`   Total desembolsado: RD$${totalDisbursed.toLocaleString()}`);
console.log(`   Balance disponible: RD$${updatedBank.current_balance.toLocaleString()}`);
console.log(`   En préstamos: RD$${updatedBank.loaned_balance.toLocaleString()}`);

console.log('\n✅ Seed completado exitosamente.');
console.log(`   ${clientsData.length} clientes | ${loanCount} préstamos`);

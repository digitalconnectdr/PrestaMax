import { Router, Response } from 'express';
import { getDb, uuid, now } from '../db/database';
import { authenticate, requireTenant, requirePermission, AuthRequest } from '../middleware/auth';

const router = Router();

// ── Number to Spanish words ───────────────────────────────────────────────────
const _ONES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve']
const _TENS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const _HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos']

function numToWords(n: number): string {
  n = Math.round(n)
  if (n === 0) return 'cero'
  if (n === 100) return 'cien'
  if (n < 0) return 'menos ' + numToWords(-n)
  const parts: string[] = []
  if (n >= 1000000) {
    const m = Math.floor(n / 1000000)
    parts.push(m === 1 ? 'un millón' : `${numToWords(m)} millones`)
    n %= 1000000
  }
  if (n >= 1000) {
    const t = Math.floor(n / 1000)
    parts.push(t === 1 ? 'mil' : `${numToWords(t)} mil`)
    n %= 1000
  }
  if (n >= 100) {
    parts.push(_HUNDREDS[Math.floor(n / 100)])
    n %= 100
  }
  if (n >= 20) {
    const t = Math.floor(n / 10); const u = n % 10
    parts.push(u === 0 ? _TENS[t] : (t === 2 ? `veinti${_ONES[u]}` : `${_TENS[t]} y ${_ONES[u]}`))
  } else if (n > 0) { parts.push(_ONES[n]) }
  return parts.filter(Boolean).join(' ')
}

const _MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const _DAY_WORDS = ['', 'primero', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho',
  'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete',
  'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro',
  'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve', 'treinta', 'treinta y uno']

function dateLong(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const day = d.getUTCDate(), month = d.getUTCMonth(), year = d.getUTCFullYear()
  return `${_DAY_WORDS[day]} (${day}) días del mes de ${_MONTHS_ES[month]} del año ${numToWords(year)} (${year})`
}

function currencyWords(n: number, currency = 'PESOS'): string {
  const int = Math.round(n)
  const cents = Math.round((n - int) * 100)
  let result = `${numToWords(int).toUpperCase()} ${currency} (RD$${n.toLocaleString('es-DO', { minimumFractionDigits: 2 })})`
  if (cents > 0) result = `${numToWords(int).toUpperCase()} CON ${numToWords(cents).toUpperCase()}/100 ${currency} (RD$${n.toLocaleString('es-DO', { minimumFractionDigits: 2 })})`
  return result
}

// ── Helper: render template variables ─────────────────────────────────────────
function renderTemplate(body: string, loan: any, tenant: any, installments: any[]): string {
  // ── Pre-compute values ──────────────────────────────────────────────────
  const loanAmount = loan.disbursed_amount || loan.requested_amount || 0
  const firstInstallment = installments[0]
  const installmentAmt = firstInstallment?.total_amount || firstInstallment?.total_due || 0
  const lastInstallment = installments[installments.length - 1]
  const maturityDateStr = loan.maturity_date || loan.end_date || lastInstallment?.due_date

  // Payment plan table (plain text)
  const paymentPlanLines = [
    '#  | Vence        | Cuota',
    '---|--------------|------------',
    ...installments.map((ins: any, idx: number) => {
      const num = String(idx + 1).padStart(2, ' ')
      const due = ins.due_date ? new Date(ins.due_date).toLocaleDateString('es-DO') : '-'
      const cuota = `RD$${Number(ins.total_amount || ins.total_due || ins.amount || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      return `${num} | ${due.padEnd(12)} | ${cuota}`
    }),
  ].join('\n')

  const printDate = new Date().toLocaleDateString('es-DO')

  // Find next pending installment date
  const nextPending = installments.find((i: any) => ['pending', 'partial', 'overdue'].includes(i.status))
  const nextPaymentDate = nextPending?.due_date
    ? new Date(nextPending.due_date).toLocaleDateString('es-DO')
    : '-'

  const fmt = (n: number | null | undefined) =>
    `RD$${Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const termStr = `${loan.term} ${loan.term_unit || 'meses'}`
  const rateStr = `${loan.rate}% mensual`
  const freqLabel: Record<string, string> = {
    monthly: 'Mensual', biweekly: 'Quincenal', weekly: 'Semanal', daily: 'Diario'
  }
  const freq = freqLabel[loan.payment_frequency] || loan.payment_frequency || 'Mensual'

  return body
    // Debtor
    .replace(/\{\{client_name\}\}/g, loan.client_name || '')
    .replace(/\{\{client_id\}\}/g, loan.client_id_number || loan.client_id || '')
    .replace(/\{\{client_address\}\}/g, loan.client_address || '')
    .replace(/\{\{client_city\}\}/g, loan.client_city || '')
    .replace(/\{\{client_email\}\}/g, loan.client_email || '')
    .replace(/\{\{client_phone\}\}/g, loan.client_phone || loan.client_phone_personal || '')
    // Lender / company
    .replace(/\{\{company_name\}\}/g, tenant?.name || '')
    .replace(/\{\{company_address\}\}/g, tenant?.address || '')
    .replace(/\{\{company_phone\}\}/g, tenant?.phone || '')
    .replace(/\{\{company_email\}\}/g, tenant?.email || '')
    .replace(/\{\{rnc\}\}/g, tenant?.rnc || '')
    .replace(/\{\{representative_name\}\}/g, tenant?.representative_name || '')
    .replace(/\{\{company_logo\}\}/g, tenant?.logo_url || '')
    .replace(/\{\{company_signature\}\}/g, tenant?.signature_url || '')
    // Loan data
    .replace(/\{\{loan_number\}\}/g, loan.loan_number || '')
    .replace(/\{\{amount\}\}/g, fmt(loan.disbursed_amount || loan.requested_amount))
    .replace(/\{\{rate\}\}/g, rateStr)
    .replace(/\{\{term\}\}/g, termStr)
    .replace(/\{\{monthly_payment\}\}/g, freq)
    .replace(/\{\{start_date\}\}/g, loan.start_date ? new Date(loan.start_date).toLocaleDateString('es-DO') : '-')
    .replace(/\{\{end_date\}\}/g, loan.end_date ? new Date(loan.end_date).toLocaleDateString('es-DO') : '-')
    .replace(/\{\{next_payment_date\}\}/g, nextPaymentDate)
    .replace(/\{\{print_date\}\}/g, printDate)
    .replace(/\{\{date\}\}/g, printDate)
    // Payment plan table
    .replace(/\{\{payment_plan\}\}/g, paymentPlanLines)
    // ── Notarial / legal document variables ────────────────────────────────
    .replace(/\{\{notary_name\}\}/g, tenant?.notary_name || '[NOMBRE DEL NOTARIO]')
    .replace(/\{\{notary_collegiate_number\}\}/g, tenant?.notary_collegiate_number || '[NO. COLEGIATURA]')
    .replace(/\{\{notary_office_address\}\}/g, tenant?.notary_office_address || '[DIRECCIÓN DEL NOTARIO]')
    .replace(/\{\{acreedor_id\}\}/g, tenant?.acreedor_id_number || '[CÉDULA ACREEDOR]')
    .replace(/\{\{company_city\}\}/g, tenant?.city || 'Santiago')
    .replace(/\{\{testigo1_nombre\}\}/g, tenant?.testigo1_nombre || '[NOMBRE TESTIGO 1]')
    .replace(/\{\{testigo1_id\}\}/g, tenant?.testigo1_id || '[CÉDULA TESTIGO 1]')
    .replace(/\{\{testigo1_domicilio\}\}/g, tenant?.testigo1_domicilio || '[DOMICILIO TESTIGO 1]')
    .replace(/\{\{testigo2_nombre\}\}/g, tenant?.testigo2_nombre || '[NOMBRE TESTIGO 2]')
    .replace(/\{\{testigo2_id\}\}/g, tenant?.testigo2_id || '[CÉDULA TESTIGO 2]')
    .replace(/\{\{testigo2_domicilio\}\}/g, tenant?.testigo2_domicilio || '[DOMICILIO TESTIGO 2]')
    // ── Financial words ────────────────────────────────────────────────────
    .replace(/\{\{amount_words\}\}/g, currencyWords(loanAmount))
    .replace(/\{\{amount_raw\}\}/g, String(loanAmount))
    .replace(/\{\{installment_amount\}\}/g, `RD$${Number(installmentAmt).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`)
    .replace(/\{\{installment_amount_words\}\}/g, currencyWords(installmentAmt))
    .replace(/\{\{rate_pct\}\}/g, String(loan.rate || 0))
    .replace(/\{\{rate_words\}\}/g, numToWords(loan.rate || 0))
    .replace(/\{\{loan_term\}\}/g, String(loan.term || 0))
    .replace(/\{\{loan_term_words\}\}/g, numToWords(loan.term || 0))
    .replace(/\{\{frequency_label\}\}/g, freq)
    // ── Date words ─────────────────────────────────────────────────────────
    .replace(/\{\{today_date_long\}\}/g, dateLong(new Date().toISOString()))
    .replace(/\{\{maturity_date_long\}\}/g, dateLong(maturityDateStr))
    .replace(/\{\{first_payment_date_long\}\}/g, dateLong(loan.first_payment_date))
    .replace(/\{\{disbursement_date_long\}\}/g, dateLong(loan.disbursement_date))
}

// ── Routes ────────────────────────────────────────────────────────────────────
router.get('/', authenticate, requireTenant, requirePermission('contracts.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const contracts = db.prepare(
      'SELECT c.*, l.loan_number, cl.full_name as client_name FROM contracts c JOIN loans l ON l.id=c.loan_id JOIN clients cl ON cl.id=l.client_id WHERE c.tenant_id=? ORDER BY c.generated_at DESC'
    ).all(req.tenant.id);
    res.json(contracts);
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/', authenticate, requireTenant, requirePermission('contracts.create'), (req: AuthRequest, res: Response) => {
  try {
    const { loan_id, template_id } = req.body;
    const db = getDb();

    // Fetch full loan with client data
    const loan = db.prepare(`
      SELECT l.*,
        c.full_name as client_name,
        c.id_number as client_id_number,
        c.address as client_address,
        c.city as client_city,
        c.email as client_email,
        c.phone_personal as client_phone_personal
      FROM loans l
      JOIN clients c ON c.id = l.client_id
      WHERE l.id=? AND l.tenant_id=?
    `).get(loan_id, req.tenant.id) as any;

    if (!loan) return res.status(404).json({ error: 'Préstamo no encontrado' });

    // Fetch tenant data
    const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get(req.tenant.id) as any;

    // Fetch installments
    const installments = db.prepare(
      'SELECT * FROM installments WHERE loan_id=? ORDER BY due_date ASC'
    ).all(loan_id) as any[];

    const count = (db.prepare('SELECT COUNT(*) as c FROM contracts WHERE tenant_id=?').get(req.tenant.id) as any).c;
    const contract_number = `CON-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    let content = '';
    if (template_id) {
      const tmpl = db.prepare('SELECT * FROM contract_templates WHERE id=?').get(template_id) as any;
      if (tmpl) {
        content = renderTemplate(tmpl.body, loan, tenant, installments);
      }
    }

    const id = uuid();
    db.prepare(
      'INSERT INTO contracts (id,tenant_id,loan_id,template_id,contract_number,signature_mode,status,content) VALUES (?,?,?,?,?,?,?,?)'
    ).run(id, req.tenant.id, loan_id, template_id || null, contract_number, tenant?.signature_mode || 'physical', 'generated', content);

    res.status(201).json(db.prepare('SELECT * FROM contracts WHERE id=?').get(id));
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed' }); }
});

router.post('/:id/sign', authenticate, requireTenant, requirePermission('contracts.sign'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    db.prepare('UPDATE contracts SET status=?,signed_at=?,signed_by=?,signature_evidence_url=? WHERE id=?')
      .run('signed', now(), req.body.signed_by || null, req.body.signature_evidence_url || null, req.params.id);
    res.json(db.prepare('SELECT * FROM contracts WHERE id=?').get(req.params.id));
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

// DELETE contract — only for unsigned (generated) contracts
router.delete('/:id', authenticate, requireTenant, requirePermission('contracts.delete'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const contract = db.prepare('SELECT * FROM contracts WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any;
    if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });
    if (contract.status === 'signed') return res.status(400).json({ error: 'No se puede eliminar un contrato ya firmado' });
    db.prepare('DELETE FROM contracts WHERE id=? AND tenant_id=?').run(req.params.id, req.tenant.id);
    res.json({ message: 'Contrato eliminado' });
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

export default router;

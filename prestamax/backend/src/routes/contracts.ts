import { Router, Response } from 'express';
import { getDb, uuid, now } from '../db/database';
import { authenticate, requireTenant, requirePermission, AuthRequest } from '../middleware/auth';
import { escapeHtml, safeImageDataUrl } from '../lib/htmlSafe';

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

  // Todos los valores se escapan (& < > " ') ANTES de sustituirse: client_name, company_name, representante, datos
  // notariales, testigos, etc. pueden venir de usuarios con menos privilegios o del formulario público de solicitudes.
  // La plantilla (HTML estructural) no se toca. Una sola pasada: un valor que contenga "{{otra_variable}}" no se re-expande.
  const E = escapeHtml
  const logoSrc = safeImageDataUrl(tenant?.logo_url)
  const signatureSrc = safeImageDataUrl(tenant?.signature_url)
  const vars: Record<string, string> = {
    // Debtor
    client_name: E(loan.client_name || ''),
    client_id: E(loan.client_id_number || loan.client_id || ''),
    client_address: E(loan.client_address || ''),
    client_city: E(loan.client_city || ''),
    client_email: E(loan.client_email || ''),
    client_phone: E(loan.client_phone || loan.client_phone_personal || ''),
    // Lender / company
    company_name: E(tenant?.name || ''),
    company_address: E(tenant?.address || ''),
    company_phone: E(tenant?.phone || ''),
    company_email: E(tenant?.email || ''),
    rnc: E(tenant?.rnc || ''),
    representative_name: E(tenant?.representative_name || ''),
    // Imágenes: solo PNG/JPEG/WEBP en data URL válida; cualquier otra cosa no genera <img>
    company_logo: logoSrc ? `<img src="${logoSrc}" alt="Logo" style="max-height:90px;max-width:240px;object-fit:contain"/>` : '',
    company_signature: signatureSrc ? `<img src="${signatureSrc}" alt="Firma" style="max-height:60px;max-width:200px;object-fit:contain"/>` : '',
    // Loan data
    loan_number: E(loan.loan_number || ''),
    amount: E(fmt(loan.disbursed_amount || loan.requested_amount)),
    rate: E(rateStr),
    term: E(termStr),
    monthly_payment: E(freq),
    start_date: E(loan.start_date ? new Date(loan.start_date).toLocaleDateString('es-DO') : '-'),
    end_date: E(loan.end_date ? new Date(loan.end_date).toLocaleDateString('es-DO') : '-'),
    next_payment_date: E(nextPaymentDate),
    print_date: E(printDate),
    date: E(printDate),
    // Payment plan table
    payment_plan: E(paymentPlanLines),
    // ── Notarial / legal document variables ────────────────────────────────
    notary_name: E(tenant?.notary_name || '[NOMBRE DEL NOTARIO]'),
    notary_collegiate_number: E(tenant?.notary_collegiate_number || '[NO. COLEGIATURA]'),
    notary_office_address: E(tenant?.notary_office_address || '[DIRECCIÓN DEL NOTARIO]'),
    acreedor_id: E(tenant?.acreedor_id_number || '[CÉDULA ACREEDOR]'),
    company_city: E(tenant?.city || 'Santiago'),
    testigo1_nombre: E(tenant?.testigo1_nombre || '[NOMBRE TESTIGO 1]'),
    testigo1_id: E(tenant?.testigo1_id || '[CÉDULA TESTIGO 1]'),
    testigo1_domicilio: E(tenant?.testigo1_domicilio || '[DOMICILIO TESTIGO 1]'),
    testigo2_nombre: E(tenant?.testigo2_nombre || '[NOMBRE TESTIGO 2]'),
    testigo2_id: E(tenant?.testigo2_id || '[CÉDULA TESTIGO 2]'),
    testigo2_domicilio: E(tenant?.testigo2_domicilio || '[DOMICILIO TESTIGO 2]'),
    // ── Financial words ────────────────────────────────────────────────────
    amount_words: E(currencyWords(loanAmount)),
    amount_raw: E(String(loanAmount)),
    installment_amount: E(`RD$${Number(installmentAmt).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`),
    installment_amount_words: E(currencyWords(installmentAmt)),
    rate_pct: E(String(loan.rate || 0)),
    rate_words: E(numToWords(loan.rate || 0)),
    loan_term: E(String(loan.term || 0)),
    loan_term_words: E(numToWords(loan.term || 0)),
    frequency_label: E(freq),
    // ── Date words ─────────────────────────────────────────────────────────
    today_date_long: E(dateLong(new Date().toISOString())),
    maturity_date_long: E(dateLong(maturityDateStr)),
    first_payment_date_long: E(dateLong(loan.first_payment_date)),
    disbursement_date_long: E(dateLong(loan.disbursement_date)),
  }

  // Variables desconocidas se dejan tal cual (igual que antes); la función de reemplazo evita que "$&" o "$1" en un valor se interpreten.
  return body.replace(/\{\{(\w+)\}\}/g, (m, key) => (Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : m))
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

    // La plantilla debe pertenecer a ESTE tenant. Una plantilla de otro tenant (o inexistente) responde igual: 404.
    let content = '';
    if (template_id) {
      const tmpl = db.prepare('SELECT * FROM contract_templates WHERE id=? AND tenant_id=?').get(template_id, req.tenant.id) as any;
      if (!tmpl) return res.status(404).json({ error: 'Plantilla no encontrada' });
      content = renderTemplate(tmpl.body, loan, tenant, installments);
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
    // Solo el contrato de ESTE tenant: uno inexistente y uno de otro tenant responden igual (404), sin revelar que existe.
    const contract = db.prepare('SELECT id FROM contracts WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id);
    if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });
    db.prepare('UPDATE contracts SET status=?,signed_at=?,signed_by=?,signature_evidence_url=? WHERE id=? AND tenant_id=?')
      .run('signed', now(), req.body.signed_by || null, req.body.signature_evidence_url || null, req.params.id, req.tenant.id);
    res.json(db.prepare('SELECT * FROM contracts WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id));
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

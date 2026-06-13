// ─── reportI18n — traducción de reportes descargables del backend (ES/EN/PT) ──
// Los CSV de contabilidad se generan en el servidor; el frontend envía el idioma
// activo como ?lang=es|en|pt y aquí traducimos encabezados y etiquetas fijas.
// (Los datos del tenant —categorías, nombres— no se traducen.)
export type ReportLang = 'es' | 'en' | 'pt'

type Tri = { es: string; en: string; pt: string }

const R: Record<string, Tri> = {
  // Libro diario (journal)
  'col.date':      { es: 'Fecha',            en: 'Date',             pt: 'Data' },
  'col.time':      { es: 'Hora',             en: 'Time',             pt: 'Hora' },
  'col.type':      { es: 'Tipo',             en: 'Type',             pt: 'Tipo' },
  'col.concept':   { es: 'Concepto',         en: 'Concept',          pt: 'Conceito' },
  'col.client':    { es: 'Cliente',          en: 'Client',           pt: 'Cliente' },
  'col.loan':      { es: 'Prestamo',         en: 'Loan',             pt: 'Empréstimo' },
  'col.currency':  { es: 'Moneda',           en: 'Currency',         pt: 'Moeda' },
  'col.debit':     { es: 'Debe (entrada)',   en: 'Debit (in)',       pt: 'Débito (entrada)' },
  'col.credit':    { es: 'Haber (salida)',   en: 'Credit (out)',     pt: 'Crédito (saída)' },
  'col.bank':      { es: 'Cuenta Bancaria',  en: 'Bank Account',     pt: 'Conta Bancária' },
  'col.reference': { es: 'Referencia',       en: 'Reference',        pt: 'Referência' },
  // Tipos de movimiento
  'type.disbursement': { es: 'Desembolso',    en: 'Disbursement',    pt: 'Desembolso' },
  'type.payment':      { es: 'Pago Recibido', en: 'Payment Received', pt: 'Pagamento Recebido' },
  'type.income':       { es: 'Ingreso',       en: 'Income',          pt: 'Receita' },
  'type.expense':      { es: 'Gasto',         en: 'Expense',         pt: 'Despesa' },
  'concept.loan':      { es: 'Préstamo',      en: 'Loan',            pt: 'Empréstimo' },
  'concept.payment':   { es: 'Pago',          en: 'Payment',         pt: 'Pagamento' },
  // Mayor por cuenta (by-account)
  'col.bank_name':   { es: 'Banco',          en: 'Bank',            pt: 'Banco' },
  'col.inflows':     { es: 'Entradas',       en: 'Inflows',         pt: 'Entradas' },
  'col.outflows':    { es: 'Salidas',        en: 'Outflows',        pt: 'Saídas' },
  'col.net':         { es: 'Neto',           en: 'Net',             pt: 'Líquido' },
  'col.movements':   { es: '# Movimientos',  en: '# Transactions',  pt: '# Movimentos' },
  'col.opening':     { es: 'Saldo Inicial',  en: 'Opening Balance', pt: 'Saldo Inicial' },
  'col.closing':     { es: 'Saldo Actual',   en: 'Current Balance', pt: 'Saldo Atual' },
  // Resumen financiero (summary)
  'col.amount':      { es: 'Monto',          en: 'Amount',          pt: 'Valor' },
  'col.detail':      { es: 'Detalle',        en: 'Detail',          pt: 'Detalhe' },
  'sum.income':         { es: 'INGRESOS',                  en: 'INCOME',                pt: 'RECEITAS' },
  'sum.interest':       { es: '  Interés cobrado',         en: '  Interest collected',  pt: '  Juros cobrados' },
  'sum.mora':           { es: '  Mora cobrada',            en: '  Late fees collected', pt: '  Multa cobrada' },
  'sum.other_income':   { es: '  Otros ingresos',          en: '  Other income',        pt: '  Outras receitas' },
  'sum.total_gross':    { es: 'TOTAL INGRESOS BRUTOS',     en: 'TOTAL GROSS INCOME',    pt: 'TOTAL DE RECEITAS BRUTAS' },
  'sum.expenses_cat':   { es: 'GASTOS POR CATEGORIA',      en: 'EXPENSES BY CATEGORY',  pt: 'DESPESAS POR CATEGORIA' },
  'sum.total_expenses': { es: 'TOTAL GASTOS',              en: 'TOTAL EXPENSES',        pt: 'TOTAL DE DESPESAS' },
  'sum.net':            { es: 'UTILIDAD NETA',             en: 'NET PROFIT',            pt: 'LUCRO LÍQUIDO' },
  'sum.additional':     { es: 'INFORMACION ADICIONAL',     en: 'ADDITIONAL INFO',       pt: 'INFORMAÇÃO ADICIONAL' },
  'sum.capital_out':    { es: '  Capital desembolsado',    en: '  Capital disbursed',   pt: '  Capital desembolsado' },
  'sum.capital_back':   { es: '  Capital recuperado',      en: '  Capital recovered',   pt: '  Capital recuperado' },
  // Sufijos de detalle (con {n})
  'd.payments':     { es: '{n} pagos',          en: '{n} payments',      pt: '{n} pagamentos' },
  'd.entries':      { es: '{n} entradas',       en: '{n} entries',       pt: '{n} entradas' },
  'd.movements':    { es: '{n} movimientos',    en: '{n} transactions',  pt: '{n} movimentos' },
  'd.loans':        { es: '{n} préstamos',      en: '{n} loans',         pt: '{n} empréstimos' },
  'd.margin':       { es: '{n}% margen',        en: '{n}% margin',       pt: '{n}% margem' },
  'd.amortization': { es: 'amortización a capital', en: 'principal amortization', pt: 'amortização ao capital' },
  // Nombres de archivo
  'file.journal':   { es: 'libro-diario',       en: 'general-ledger',    pt: 'livro-diario' },
  'file.by_account':{ es: 'mayor-por-cuenta',   en: 'ledger-by-account', pt: 'razao-por-conta' },
  'file.summary':   { es: 'resumen-financiero', en: 'financial-summary', pt: 'resumo-financeiro' },
}

/** Lee el idioma del request (?lang= o header), default 'es'. */
export function getReportLang(req: any): ReportLang {
  const raw = String(req?.query?.lang || req?.headers?.['x-locale'] || 'es').toLowerCase()
  return (['es', 'en', 'pt'].includes(raw) ? raw : 'es') as ReportLang
}

/** Devuelve un traductor para el idioma dado. tr('col.date'), tr('d.payments', 3) */
export function reportT(lang: ReportLang) {
  return (key: string, n?: number | string): string => {
    const entry = R[key]
    let s = entry ? (entry[lang] ?? entry.es) : key
    if (n !== undefined) s = s.replace('{n}', String(n))
    return s
  }
}

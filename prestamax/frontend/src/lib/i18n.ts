// ─────────────────────────────────────────────────────────────────────────────
// i18n minimalista — sin dependencias externas
// Idiomas soportados: español (default), inglés, portugués
// Uso:
//   import { useT, setLocale, getLocale } from '@/lib/i18n'
//   const t = useT()
//   <h1>{t('login.title')}</h1>
//
// ESTRUCTURA (Jun 2026): una entrada por clave con los 3 idiomas juntos, para
// que agregar texto nuevo no desincronice idiomas. Se traduce por fases; si una
// clave falta en un idioma cae a español y luego a la propia clave.
// ─────────────────────────────────────────────────────────────────────────────
import { useSyncExternalStore } from 'react'

export type Locale = 'es' | 'en' | 'pt'

const STORAGE_KEY = 'prestamax_locale'

export const SUPPORTED_LOCALES: { code: Locale; name: string; flag: string }[] = [
  { code: 'es', name: 'Español',    flag: '🇩🇴' },
  { code: 'en', name: 'English',    flag: '🇺🇸' },
  { code: 'pt', name: 'Português',  flag: '🇧🇷' },
]

// ── Diccionario unificado: key -> { es, en, pt } ─────────────────────────────
type Tri = { es: string; en: string; pt: string }

const TR: Record<string, Tri> = {
  // ── Auth ───────────────────────────────────────────────────────────────────
  'auth.login':      { es: 'Iniciar Sesión',     en: 'Sign in',            pt: 'Entrar' },
  'auth.logout':     { es: 'Cerrar sesión',      en: 'Sign out',           pt: 'Sair' },
  'auth.register':   { es: 'Regístrate aquí',    en: 'Sign up here',       pt: 'Cadastre-se aqui' },
  'auth.email':      { es: 'Correo electrónico', en: 'Email',              pt: 'E-mail' },
  'auth.password':   { es: 'Contraseña',         en: 'Password',           pt: 'Senha' },
  'auth.no_account': { es: '¿Aún no tienes cuenta?', en: "Don't have an account?", pt: 'Ainda não tem uma conta?' },
  'auth.need_help':  { es: '¿Necesitas ayuda? Contacta a', en: 'Need help? Contact', pt: 'Precisa de ajuda? Contate' },
  'auth.terms':      { es: 'Términos de Uso',    en: 'Terms of Use',       pt: 'Termos de Uso' },
  'auth.privacy':    { es: 'Política de Privacidad', en: 'Privacy Policy',  pt: 'Política de Privacidade' },
  'auth.welcome':    { es: 'Bienvenido a PrestaMax', en: 'Welcome to PrestaMax', pt: 'Bem-vindo ao PrestaMax' },

  // ── Common ─────────────────────────────────────────────────────────────────
  'common.cancel':   { es: 'Cancelar',   en: 'Cancel',      pt: 'Cancelar' },
  'common.save':     { es: 'Guardar',    en: 'Save',        pt: 'Salvar' },
  'common.delete':   { es: 'Eliminar',   en: 'Delete',      pt: 'Excluir' },
  'common.edit':     { es: 'Editar',     en: 'Edit',        pt: 'Editar' },
  'common.search':   { es: 'Buscar',     en: 'Search',      pt: 'Buscar' },
  'common.loading':  { es: 'Cargando...', en: 'Loading...', pt: 'Carregando...' },
  'common.language': { es: 'Idioma',     en: 'Language',    pt: 'Idioma' },
  'common.logout':   { es: 'Cerrar sesión', en: 'Sign out', pt: 'Sair' },

  // ── Header ─────────────────────────────────────────────────────────────────
  'header.search_placeholder': { es: 'Buscar clientes, préstamos…', en: 'Search clients, loans…', pt: 'Buscar clientes, empréstimos…' },

  // ── Nav: grupos ──────────────────────────────────────────────────────────────
  'navgroup.main':           { es: 'PRINCIPAL',      en: 'MAIN',           pt: 'PRINCIPAL' },
  'navgroup.operations':     { es: 'OPERACIONES',    en: 'OPERATIONS',     pt: 'OPERAÇÕES' },
  'navgroup.collections':    { es: 'COBRANZAS',      en: 'COLLECTIONS',    pt: 'COBRANÇAS' },
  'navgroup.communications': { es: 'COMUNICACIONES', en: 'COMMUNICATIONS', pt: 'COMUNICAÇÕES' },
  'navgroup.analysis':       { es: 'ANÁLISIS',       en: 'ANALYTICS',      pt: 'ANÁLISE' },
  'navgroup.config':         { es: 'CONFIGURACIÓN',  en: 'SETTINGS',       pt: 'CONFIGURAÇÕES' },
  'navgroup.help':           { es: 'AYUDA',          en: 'HELP',           pt: 'AJUDA' },
  'navgroup.platform':       { es: 'PLATAFORMA',     en: 'PLATFORM',       pt: 'PLATAFORMA' },

  // ── Nav: items ───────────────────────────────────────────────────────────────
  'nav.dashboard':     { es: 'Dashboard',          en: 'Dashboard',          pt: 'Painel' },
  'nav.clients':       { es: 'Clientes',           en: 'Clients',            pt: 'Clientes' },
  'nav.loans':         { es: 'Préstamos',          en: 'Loans',              pt: 'Empréstimos' },
  'nav.payments':      { es: 'Pagos',              en: 'Payments',           pt: 'Pagamentos' },
  'nav.contracts':     { es: 'Contratos',          en: 'Contracts',          pt: 'Contratos' },
  'nav.income':        { es: 'Ingresos y Gastos',  en: 'Income & Expenses',  pt: 'Receitas e Despesas' },
  'nav.calculator':    { es: 'Calculadora',        en: 'Calculator',         pt: 'Calculadora' },
  'nav.templates':     { es: 'Plantillas',         en: 'Templates',          pt: 'Modelos' },
  'nav.requests':      { es: 'Solicitudes',        en: 'Requests',           pt: 'Solicitações' },
  'nav.investors':     { es: 'Inversionistas',     en: 'Investors',          pt: 'Investidores' },
  'nav.collections':   { es: 'Mi Cartera',         en: 'My Portfolio',       pt: 'Minha Carteira' },
  'nav.promises':      { es: 'Promesas de Pago',   en: 'Payment Promises',   pt: 'Promessas de Pagamento' },
  'nav.whatsapp':      { es: 'WhatsApp',           en: 'WhatsApp',           pt: 'WhatsApp' },
  'nav.reports':       { es: 'Reportes',           en: 'Reports',            pt: 'Relatórios' },
  'nav.accounting':    { es: 'Exportar Contabilidad', en: 'Export Accounting', pt: 'Exportar Contabilidade' },
  'nav.projection':    { es: 'Proyección de Cobros', en: 'Collections Forecast', pt: 'Projeção de Cobranças' },
  'nav.settings':      { es: 'General',            en: 'General',            pt: 'Geral' },
  'nav.products':      { es: 'Productos',          en: 'Products',           pt: 'Produtos' },
  'nav.users':         { es: 'Usuarios',           en: 'Users',              pt: 'Usuários' },
  'nav.branches':      { es: 'Sucursales',         en: 'Branches',           pt: 'Filiais' },
  'nav.bank_accounts': { es: 'Cuentas Bancarias',  en: 'Bank Accounts',      pt: 'Contas Bancárias' },
  'nav.subscription':  { es: 'Mi Suscripción',     en: 'My Subscription',    pt: 'Minha Assinatura' },
  'nav.help':          { es: 'Guía del Sistema',   en: 'System Guide',       pt: 'Guia do Sistema' },
  'nav.admin':         { es: 'Admin Panel',        en: 'Admin Panel',        pt: 'Painel Admin' },

  // ── Estados de préstamo (reutilizable en toda la app) ────────────────────────
  'status.active':         { es: 'Activo',         en: 'Active',       pt: 'Ativo' },
  'status.approved':       { es: 'Aprobado',       en: 'Approved',     pt: 'Aprovado' },
  'status.in_mora':        { es: 'En Mora',        en: 'Overdue',      pt: 'Em Atraso' },
  'status.overdue':        { es: 'Vencido',        en: 'Past Due',     pt: 'Vencido' },
  'status.pending_review': { es: 'En Revisión',    en: 'Under Review', pt: 'Em Análise' },
  'status.under_review':   { es: 'En Revisión',    en: 'Under Review', pt: 'Em Análise' },
  'status.liquidated':     { es: 'Liquidado',      en: 'Paid Off',     pt: 'Liquidado' },
  'status.draft':          { es: 'Borrador',       en: 'Draft',        pt: 'Rascunho' },
  'status.disbursed':      { es: 'Desembolsado',   en: 'Disbursed',    pt: 'Desembolsado' },
  'status.voided':         { es: 'Anulado',        en: 'Voided',       pt: 'Anulado' },
  'status.rejected':       { es: 'Rechazado',      en: 'Rejected',     pt: 'Rejeitado' },
  'status.cancelled':      { es: 'Cancelado',      en: 'Cancelled',    pt: 'Cancelado' },
  'status.written_off':    { es: 'Incobrable',     en: 'Written Off',  pt: 'Incobrável' },
  'status.restructured':   { es: 'Reestructurado', en: 'Restructured', pt: 'Reestruturado' },
  'status.paid':           { es: 'Pagado',         en: 'Paid',         pt: 'Pago' },
  'status.current':        { es: 'Al día',         en: 'Current',      pt: 'Em dia' },

  // ── Columnas de tabla (reutilizable) ─────────────────────────────────────────
  'col.client':  { es: 'Cliente', en: 'Client',  pt: 'Cliente' },
  'col.balance': { es: 'Saldo',   en: 'Balance', pt: 'Saldo' },
  'col.days':    { es: 'Días',    en: 'Days',    pt: 'Dias' },
  'col.amount':  { es: 'Monto',   en: 'Amount',  pt: 'Valor' },
  'col.date':    { es: 'Fecha',   en: 'Date',    pt: 'Data' },

  // ── Dashboard ────────────────────────────────────────────────────────────────
  'dash.subtitle':            { es: 'Resumen general de tu cartera de préstamos', en: 'Overview of your loan portfolio', pt: 'Resumo geral da sua carteira de empréstimos' },
  'dash.load_error':          { es: 'Error al cargar el dashboard', en: 'Failed to load dashboard', pt: 'Erro ao carregar o painel' },
  'dash.kpi.total_portfolio': { es: 'Cartera Total',     en: 'Total Portfolio',  pt: 'Carteira Total' },
  'dash.kpi.active_portfolio':{ es: 'Cartera Activa',    en: 'Active Portfolio', pt: 'Carteira Ativa' },
  'dash.kpi.mora_pending':    { es: 'Mora Pendiente',    en: 'Pending Late Fees',pt: 'Mora Pendente' },
  'dash.kpi.today_collections':{ es: 'Cobros del Día',   en: "Today's Collections", pt: 'Cobranças do Dia' },
  'dash.kpi.total_clients':   { es: 'Total Clientes',    en: 'Total Clients',    pt: 'Total de Clientes' },
  'dash.kpi.active_loans':    { es: 'Préstamos Activos', en: 'Active Loans',     pt: 'Empréstimos Ativos' },
  'dash.kpi.liquidated':      { es: 'Liquidados',        en: 'Paid Off',         pt: 'Liquidados' },
  'dash.foot.loans':          { es: '{n} préstamos',     en: '{n} loans',        pt: '{n} empréstimos' },
  'dash.foot.active_loans':   { es: '{n} préstamos activos', en: '{n} active loans', pt: '{n} empréstimos ativos' },
  'dash.foot.overdue':        { es: '{n} en mora/vencidos', en: '{n} overdue', pt: '{n} em atraso/vencidos' },
  'dash.foot.today_count':    { es: '{n} cobros realizados', en: '{n} payments received', pt: '{n} cobranças realizadas' },
  'dash.foot.clients_registered': { es: 'Clientes registrados', en: 'Registered clients', pt: 'Clientes cadastrados' },
  'dash.foot.of_total_loans': { es: 'de {n} préstamos totales', en: 'of {n} total loans', pt: 'de {n} empréstimos no total' },
  'dash.foot.loans_completed':{ es: 'Préstamos completados', en: 'Completed loans', pt: 'Empréstimos concluídos' },
  'dash.inv.own':             { es: 'Cartera Propia',    en: 'Own Portfolio',    pt: 'Carteira Própria' },
  'dash.inv.own_foot':        { es: 'Financiada con capital propio', en: 'Funded with own capital', pt: 'Financiada com capital próprio' },
  'dash.inv.third':           { es: 'Cartera de Terceros', en: 'Third-Party Portfolio', pt: 'Carteira de Terceiros' },
  'dash.inv.third_foot':      { es: 'Financiada por inversionistas', en: 'Funded by investors', pt: 'Financiada por investidores' },
  'dash.inv.liability':       { es: 'Pasivo a Inversionistas', en: 'Investor Liability', pt: 'Passivo a Investidores' },
  'dash.inv.liability_foot':  { es: 'Neto pendiente de liquidar', en: 'Net pending settlement', pt: 'Líquido pendente de liquidação' },
  'dash.chart.by_status':     { es: 'Préstamos por Estado', en: 'Loans by Status', pt: 'Empréstimos por Status' },
  'dash.chart.no_data':       { es: 'Sin datos disponibles', en: 'No data available', pt: 'Sem dados disponíveis' },
  'dash.chart.collections_7d':{ es: 'Recaudación Últimos 7 Días', en: 'Collections — Last 7 Days', pt: 'Arrecadação — Últimos 7 Dias' },
  'dash.chart.no_collections':{ es: 'Sin cobros registrados en los últimos días', en: 'No collections in recent days', pt: 'Sem cobranças nos últimos dias' },
  'dash.chart.collected':     { es: 'Recaudado',        en: 'Collected',        pt: 'Arrecadado' },
  'dash.chart.loans_unit':    { es: '{n} préstamo(s)',  en: '{n} loan(s)',      pt: '{n} empréstimo(s)' },
  'dash.tbl.top_overdue':     { es: 'Préstamos en Mora (Top)', en: 'Top Overdue Loans', pt: 'Empréstimos em Atraso (Top)' },
  'dash.tbl.no_overdue':      { es: 'Sin préstamos en mora 🎉', en: 'No overdue loans 🎉', pt: 'Sem empréstimos em atraso 🎉' },
  'dash.tbl.recent':          { es: 'Cobros Recientes', en: 'Recent Collections', pt: 'Cobranças Recentes' },
  'dash.tbl.no_recent':       { es: 'Sin cobros recientes', en: 'No recent collections', pt: 'Sem cobranças recentes' },
  'dash.quick.title':         { es: 'Acciones Rápidas', en: 'Quick Actions',    pt: 'Ações Rápidas' },
  'dash.quick.subtitle':      { es: 'Realiza las operaciones más comunes', en: 'Perform the most common operations', pt: 'Realize as operações mais comuns' },
  'dash.quick.new_client':    { es: 'Nuevo Cliente',    en: 'New Client',       pt: 'Novo Cliente' },
  'dash.quick.new_loan':      { es: 'Nuevo Préstamo',   en: 'New Loan',         pt: 'Novo Empréstimo' },
  'dash.quick.register_payment': { es: 'Registrar Pago', en: 'Register Payment', pt: 'Registrar Pagamento' },

  // ── Landing ──────────────────────────────────────────────────────────────────
  'landing.subtitle':          { es: 'Plataforma de gestión de préstamos personales y comerciales para prestamistas profesionales.', en: 'Personal and commercial loan management platform for professional lenders.', pt: 'Plataforma de gestão de empréstimos pessoais e comerciais para credores profissionais.' },
  'landing.feature.dashboard': { es: 'Dashboard en tiempo real', en: 'Real-time dashboard', pt: 'Painel em tempo real' },
  'landing.feature.score':     { es: 'Score crediticio interno', en: 'Internal credit score', pt: 'Score de crédito interno' },
  'landing.feature.multi':     { es: 'Multi-moneda', en: 'Multi-currency', pt: 'Multi-moeda' },
  'landing.feature.apply':     { es: 'Solicitud en línea', en: 'Online application', pt: 'Solicitação online' },
  'landing.feature.whatsapp':  { es: 'WhatsApp y notificaciones', en: 'WhatsApp & notifications', pt: 'WhatsApp e notificações' },
  'landing.feature.secure':    { es: 'Seguro y multi-empresa', en: 'Secure & multi-company', pt: 'Seguro e multi-empresa' },
}

// Diccionarios derivados por locale (compatibilidad con el lookup existente)
type Dict = Record<string, string>
const DICTIONARIES: Record<Locale, Dict> = { es: {}, en: {}, pt: {} }
for (const key in TR) {
  DICTIONARIES.es[key] = TR[key].es
  DICTIONARIES.en[key] = TR[key].en
  DICTIONARIES.pt[key] = TR[key].pt
}

// ── Store con listeners (para que React re-renderice al cambiar locale) ──────
let _locale: Locale = (() => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null
    if (saved && ['es', 'en', 'pt'].includes(saved)) return saved
  } catch (_) { /* SSR/private mode */ }
  return 'es' // default
})()

const listeners = new Set<() => void>()
function emit() { for (const l of listeners) l() }

export function getLocale(): Locale { return _locale }

export function setLocale(loc: Locale) {
  if (!['es', 'en', 'pt'].includes(loc)) return
  _locale = loc
  try { localStorage.setItem(STORAGE_KEY, loc) } catch (_) {}
  try { document.documentElement.setAttribute('lang', loc) } catch (_) {}
  emit()
}

function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb) } }

// Aplicar idioma al HTML lang al cargar
try { document.documentElement.setAttribute('lang', _locale) } catch (_) {}

// ── API publica: useT() devuelve la funcion de traduccion ──────────────────
export function useT() {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale)
  return (key: string, fallback?: string): string => {
    const dict = DICTIONARIES[locale] || DICTIONARIES.es
    return dict[key] ?? (DICTIONARIES.es[key] ?? fallback ?? key)
  }
}

// Version no-hook (para usar fuera de componentes)
export function t(key: string, fallback?: string): string {
  const dict = DICTIONARIES[_locale] || DICTIONARIES.es
  return dict[key] ?? (DICTIONARIES.es[key] ?? fallback ?? key)
}

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

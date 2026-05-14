// ─────────────────────────────────────────────────────────────────────────────
// i18n minimalista — sin dependencias externas
// Idiomas soportados: español (default), inglés, portugués
// Uso:
//   import { useT, setLocale, getLocale } from '@/lib/i18n'
//   const t = useT()
//   <h1>{t('login.title')}</h1>
// ─────────────────────────────────────────────────────────────────────────────
import { useSyncExternalStore } from 'react'

export type Locale = 'es' | 'en' | 'pt'

const STORAGE_KEY = 'prestamax_locale'

export const SUPPORTED_LOCALES: { code: Locale; name: string; flag: string }[] = [
  { code: 'es', name: 'Español',    flag: '🇩🇴' },
  { code: 'en', name: 'English',    flag: '🇺🇸' },
  { code: 'pt', name: 'Português',  flag: '🇧🇷' },
]

// ── Diccionarios ─────────────────────────────────────────────────────────────
type Dict = Record<string, string>

const dictES: Dict = {
  // Auth
  'auth.login':           'Iniciar Sesión',
  'auth.logout':          'Cerrar sesión',
  'auth.register':        'Regístrate aquí',
  'auth.email':           'Correo electrónico',
  'auth.password':        'Contraseña',
  'auth.no_account':      '¿Aún no tienes cuenta?',
  'auth.need_help':       '¿Necesitas ayuda? Contacta a',
  'auth.terms':           'Términos de Uso',
  'auth.privacy':         'Política de Privacidad',
  'auth.welcome':         'Bienvenido a PrestaMax',
  // Common
  'common.cancel':        'Cancelar',
  'common.save':          'Guardar',
  'common.delete':        'Eliminar',
  'common.edit':          'Editar',
  'common.search':        'Buscar',
  'common.loading':       'Cargando...',
  'common.language':      'Idioma',
  // Nav
  'nav.dashboard':        'Dashboard',
  'nav.clients':          'Clientes',
  'nav.loans':            'Préstamos',
  'nav.payments':         'Pagos',
  'nav.contracts':        'Contratos',
  'nav.calculator':       'Calculadora',
  'nav.requests':         'Solicitudes',
  'nav.collections':      'Cobranzas',
  'nav.reports':          'Reportes',
  'nav.settings':         'Configuración',
  // Landing
  'landing.subtitle':         'Plataforma de gestión de préstamos personales y comerciales para prestamistas profesionales.',
  'landing.feature.dashboard':'Dashboard en tiempo real',
  'landing.feature.score':    'Score crediticio interno',
  'landing.feature.multi':    'Multi-moneda',
  'landing.feature.apply':    'Solicitud en línea',
  'landing.feature.whatsapp': 'WhatsApp y notificaciones',
  'landing.feature.secure':   'Seguro y multi-empresa',
}

const dictEN: Dict = {
  'auth.login':           'Sign in',
  'auth.logout':          'Sign out',
  'auth.register':        'Sign up here',
  'auth.email':           'Email',
  'auth.password':        'Password',
  'auth.no_account':      "Don't have an account?",
  'auth.need_help':       'Need help? Contact',
  'auth.terms':           'Terms of Use',
  'auth.privacy':         'Privacy Policy',
  'auth.welcome':         'Welcome to PrestaMax',
  'common.cancel':        'Cancel',
  'common.save':          'Save',
  'common.delete':        'Delete',
  'common.edit':          'Edit',
  'common.search':        'Search',
  'common.loading':       'Loading...',
  'common.language':      'Language',
  'nav.dashboard':        'Dashboard',
  'nav.clients':          'Clients',
  'nav.loans':            'Loans',
  'nav.payments':         'Payments',
  'nav.contracts':        'Contracts',
  'nav.calculator':       'Calculator',
  'nav.requests':         'Requests',
  'nav.collections':      'Collections',
  'nav.reports':          'Reports',
  'nav.settings':         'Settings',
  'landing.subtitle':         'Personal and commercial loan management platform for professional lenders.',
  'landing.feature.dashboard':'Real-time dashboard',
  'landing.feature.score':    'Internal credit score',
  'landing.feature.multi':    'Multi-currency',
  'landing.feature.apply':    'Online application',
  'landing.feature.whatsapp': 'WhatsApp & notifications',
  'landing.feature.secure':   'Secure & multi-company',
}

const dictPT: Dict = {
  'auth.login':           'Entrar',
  'auth.logout':          'Sair',
  'auth.register':        'Cadastre-se aqui',
  'auth.email':           'E-mail',
  'auth.password':        'Senha',
  'auth.no_account':      'Ainda não tem uma conta?',
  'auth.need_help':       'Precisa de ajuda? Contate',
  'auth.terms':           'Termos de Uso',
  'auth.privacy':         'Política de Privacidade',
  'auth.welcome':         'Bem-vindo ao PrestaMax',
  'common.cancel':        'Cancelar',
  'common.save':          'Salvar',
  'common.delete':        'Excluir',
  'common.edit':          'Editar',
  'common.search':        'Buscar',
  'common.loading':       'Carregando...',
  'common.language':      'Idioma',
  'nav.dashboard':        'Painel',
  'nav.clients':          'Clientes',
  'nav.loans':            'Empréstimos',
  'nav.payments':         'Pagamentos',
  'nav.contracts':        'Contratos',
  'nav.calculator':       'Calculadora',
  'nav.requests':         'Solicitações',
  'nav.collections':      'Cobranças',
  'nav.reports':          'Relatórios',
  'nav.settings':         'Configurações',
  'landing.subtitle':         'Plataforma de gestão de empréstimos pessoais e comerciais para credores profissionais.',
  'landing.feature.dashboard':'Painel em tempo real',
  'landing.feature.score':    'Score de crédito interno',
  'landing.feature.multi':    'Multi-moeda',
  'landing.feature.apply':    'Solicitação online',
  'landing.feature.whatsapp': 'WhatsApp e notificações',
  'landing.feature.secure':   'Seguro e multi-empresa',
}

const DICTIONARIES: Record<Locale, Dict> = { es: dictES, en: dictEN, pt: dictPT }

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

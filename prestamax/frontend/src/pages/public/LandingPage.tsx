// LandingPage — pagina publica de marketing de PrestaMax
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  DollarSign,
  CreditCard,
  FileText,
  ClipboardList,
  BarChart3,
  Calculator,
  MessageCircle,
  Inbox,
  ShieldCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Menu,
  X,
  ArrowRight,
  Smartphone,
  Lock,
  Cloud,
  Zap,
} from 'lucide-react'

interface Plan {
  name: string
  price: number
  description: string
  collectors: string
  clients: string
  users: string
  features: string[]
  highlighted?: boolean
  ctaLabel?: string
}

const plans: Plan[] = [
  {
    name: 'Starter',
    price: 29.99,
    description: 'Ideal para emprendedores que recién empiezan',
    collectors: '1 cobrador',
    clients: 'Hasta 100 clientes',
    users: 'Hasta 3 usuarios',
    features: [
      'Gestión completa de clientes',
      'Préstamos con amortización automática',
      'Pagos y recibos digitales',
      'Calculadora de préstamos',
      'Dashboard básico',
      'Soporte por correo',
    ],
  },
  {
    name: 'Básico',
    price: 59.99,
    description: 'Para negocios en crecimiento con varios cobradores',
    collectors: '3 cobradores',
    clients: 'Hasta 500 clientes',
    users: 'Hasta 8 usuarios',
    features: [
      'Todo lo del plan Starter',
      'Módulo de Cobranzas',
      'Promesas de pago',
      'Contratos digitales',
      'Reportes avanzados',
      'WhatsApp integrado',
      'Plantillas de mensajes',
    ],
    highlighted: true,
    ctaLabel: 'Más popular',
  },
  {
    name: 'Profesional',
    price: 119.99,
    description: 'Para empresas con operación consolidada',
    collectors: '10 cobradores',
    clients: 'Hasta 2,000 clientes',
    users: 'Hasta 20 usuarios',
    features: [
      'Todo lo del plan Básico',
      'Múltiples sucursales',
      'Solicitudes públicas de préstamo',
      'Proyecciones de cartera',
      'Gestión de ingresos',
      'Roles y permisos avanzados',
      'Soporte prioritario',
    ],
  },
  {
    name: 'Enterprise',
    price: 249.99,
    description: 'Para grandes instituciones financieras',
    collectors: 'Cobradores ilimitados',
    clients: 'Clientes ilimitados',
    users: 'Usuarios ilimitados',
    features: [
      'Todo lo del plan Profesional',
      'Sin límites de uso',
      'Cuentas bancarias múltiples',
      'API de integración (próximamente)',
      'Onboarding personalizado',
      'Soporte 24/7 dedicado',
      'SLA garantizado',
    ],
  },
]

const features = [
  {
    icon: Users,
    title: 'Clientes',
    description: 'Base de datos completa con historial crediticio, documentos, referencias y score interno.',
  },
  {
    icon: DollarSign,
    title: 'Préstamos',
    description: 'Crea préstamos con amortización francesa o cuota fija. Tasas, plazos y frecuencias 100% configurables.',
  },
  {
    icon: CreditCard,
    title: 'Pagos',
    description: 'Registra pagos parciales o completos, aplica a capital, interés o mora. Recibos automáticos en PDF.',
  },
  {
    icon: ClipboardList,
    title: 'Cobranzas',
    description: 'Asigna carteras a cobradores, gestiona promesas de pago y monitorea la mora en tiempo real.',
  },
  {
    icon: FileText,
    title: 'Contratos',
    description: 'Genera contratos legales con tus plantillas. Firma digital y respaldo en la nube.',
  },
  {
    icon: BarChart3,
    title: 'Reportes',
    description: 'Dashboard ejecutivo, cartera vencida, proyecciones, rentabilidad y reportes exportables.',
  },
  {
    icon: Calculator,
    title: 'Calculadora',
    description: 'Simula préstamos antes de crearlos. Compara escenarios y muestra al cliente cuotas claras.',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp',
    description: 'Envía recordatorios de pago, notificaciones y avisos directamente desde el sistema.',
  },
  {
    icon: Inbox,
    title: 'Solicitudes online',
    description: 'Recibe solicitudes de préstamo desde un enlace público. Aprueba o rechaza con un clic.',
  },
]

const faqs = [
  {
    q: '¿Hay prueba gratis?',
    a: 'Sí. Todos los planes incluyen 10 días de prueba gratuita sin tarjeta de crédito. Puedes cancelar en cualquier momento.',
  },
  {
    q: '¿Puedo cambiar de plan después?',
    a: 'Por supuesto. Puedes subir o bajar de plan en cualquier momento desde Configuración → Suscripción. El cambio aplica de inmediato.',
  },
  {
    q: '¿Mis datos están seguros?',
    a: 'Sí. PrestaMax usa cifrado en tránsito (HTTPS/TLS), almacenamiento aislado por empresa (multi-tenant) y respaldos diarios. Cumplimos con buenas prácticas de seguridad de la información.',
  },
  {
    q: '¿Necesito instalar algo?',
    a: 'No. PrestaMax es 100% web. Funciona desde cualquier navegador moderno en computadora, tableta o celular. No requiere instalación ni mantenimiento.',
  },
  {
    q: '¿En qué países y monedas funciona PrestaMax?',
    a: 'PrestaMax es multi-país y multi-moneda. Soporta 12 monedas: Peso Dominicano (DOP), Dólar Estadounidense (USD), Euro (EUR), Gourde Haitiano (HTG), Peso Mexicano (MXN), Peso Colombiano (COP), Sol Peruano (PEN), Peso Chileno (CLP), Boliviano (BOB), Peso Uruguayo (UYU), Real Brasileño (BRL) y Quetzal Guatemalteco (GTQ). Toda la interfaz está en español, inglés y portugués.',
  },
  {
    q: '¿Qué pasa si excedo los límites de mi plan?',
    a: 'Te notificamos cuando estés cerca del límite. Si lo excedes, simplemente cambias a un plan superior. No bloqueamos tu operación de inmediato.',
  },
  {
    q: '¿Puedo cancelar cuando quiera?',
    a: 'Sí. No hay contratos a largo plazo. Cancelas con un clic y mantienes acceso hasta que termine tu período pagado.',
  },
  {
    q: '¿Qué método de pago aceptan?',
    a: 'Aceptamos tarjetas de crédito y débito (Visa, Mastercard, American Express) a través de Stripe, un procesador de pagos certificado a nivel mundial.',
  },
]

const LandingPage: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-slate-900">PrestaMax</span>
            </div>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-slate-600 hover:text-slate-900">Funciones</a>
              <a href="#pricing" className="text-sm text-slate-600 hover:text-slate-900">Precios</a>
              <a href="#faq" className="text-sm text-slate-600 hover:text-slate-900">Preguntas</a>
              <Link to="/login" className="text-sm text-slate-600 hover:text-slate-900">Iniciar sesión</Link>
              <Link
                to="/register"
                className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition"
              >
                Empezar gratis
              </Link>
            </nav>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-md text-slate-600 hover:bg-slate-100"
              aria-label="Menú"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Mobile nav */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-slate-200 space-y-2">
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded">Funciones</a>
              <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded">Precios</a>
              <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded">Preguntas</a>
              <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded">Iniciar sesión</Link>
              <Link
                to="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded text-center"
              >
                Empezar gratis
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-medium text-emerald-700 mb-6">
              <Zap className="w-3.5 h-3.5" />
              10 días de prueba gratis · Sin tarjeta de crédito
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-slate-900 leading-tight">
              Gestiona tu negocio de préstamos
              <span className="block text-emerald-600">de forma profesional</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-slate-600 max-w-2xl mx-auto">
              PrestaMax es el sistema completo para administrar clientes, préstamos, cobranzas, pagos y contratos.
              Multi-país y multi-moneda: soporte para 12 monedas de Latinoamérica, USD y EUR.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/register"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition shadow-lg shadow-emerald-600/20"
              >
                Empezar gratis
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#pricing"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-slate-700 font-medium rounded-lg border border-slate-300 hover:bg-slate-50 transition"
              >
                Ver planes
              </a>
            </div>
            <div className="mt-8 flex items-center justify-center gap-6 text-sm text-slate-500">
              <div className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-600" />
                Sin instalación
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-600" />
                Cancela cuando quieras
              </div>
              <div className="hidden sm:flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-600" />
                Multi-moneda
              </div>
            </div>
          </div>

          {/* Hero mockup illustration */}
          <div className="mt-16 relative max-w-5xl mx-auto">
            <div className="bg-gradient-to-br from-emerald-500/10 via-blue-500/10 to-purple-500/10 rounded-2xl p-2 md:p-4 shadow-2xl">
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-1.5 px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <div className="flex-1 text-center text-xs text-slate-500 font-mono">prestamax.com/dashboard</div>
                </div>
                <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Cartera activa', value: '$ 2.4M', color: 'emerald' },
                    { label: 'Clientes', value: '347', color: 'blue' },
                    { label: 'Préstamos activos', value: '142', color: 'purple' },
                    { label: 'Cobrado este mes', value: '$ 412K', color: 'orange' },
                  ].map((stat, i) => (
                    <div key={i} className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="text-xs text-slate-500">{stat.label}</div>
                      <div className={`mt-1 text-xl md:text-2xl font-bold text-${stat.color}-600`}>{stat.value}</div>
                    </div>
                  ))}
                </div>
                <div className="px-6 pb-6">
                  <div className="h-32 bg-gradient-to-t from-emerald-100 to-emerald-50 rounded-lg flex items-end p-3 gap-1.5">
                    {[40, 65, 50, 75, 60, 85, 70, 90, 75, 95, 80, 100].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 bg-emerald-500 rounded-t opacity-80"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-y border-slate-200 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="flex flex-col items-center gap-1">
              <Smartphone className="w-6 h-6 text-emerald-600" />
              <div className="text-sm font-medium text-slate-900">100% Web</div>
              <div className="text-xs text-slate-500">Desde cualquier dispositivo</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Lock className="w-6 h-6 text-emerald-600" />
              <div className="text-sm font-medium text-slate-900">Datos cifrados</div>
              <div className="text-xs text-slate-500">HTTPS y aislamiento por empresa</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Cloud className="w-6 h-6 text-emerald-600" />
              <div className="text-sm font-medium text-slate-900">Respaldos diarios</div>
              <div className="text-xs text-slate-500">Tu información siempre segura</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <ShieldCheck className="w-6 h-6 text-emerald-600" />
              <div className="text-sm font-medium text-slate-900">Multi-país y multi-moneda</div>
              <div className="text-xs text-slate-500">12 monedas · ES / EN / PT</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
              Todo lo que necesitas para gestionar tu negocio
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Una plataforma completa que reemplaza Excel, papel y sistemas dispersos.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => {
              const Icon = feature.icon
              return (
                <div
                  key={i}
                  className="p-6 bg-white rounded-xl border border-slate-200 hover:border-emerald-300 hover:shadow-md transition"
                >
                  <div className="w-11 h-11 bg-emerald-50 rounded-lg flex items-center justify-center">
                    <Icon className="w-5 h-5 text-emerald-600" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-900">{feature.title}</h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">{feature.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-16 md:py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
              Precios simples y transparentes
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Sin sorpresas. Cancela cuando quieras. Todos los planes incluyen 10 días gratis.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col p-6 bg-white rounded-2xl border-2 transition ${
                  plan.highlighted
                    ? 'border-emerald-500 shadow-xl shadow-emerald-500/10 scale-100 md:scale-105'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded-full">
                      {plan.ctaLabel}
                    </span>
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                  <p className="mt-1 text-sm text-slate-500 min-h-[40px]">{plan.description}</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-slate-900">${plan.price}</span>
                    <span className="text-sm text-slate-500">/mes</span>
                  </div>
                </div>

                <div className="mt-6 space-y-2 text-sm text-slate-700 border-y border-slate-100 py-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-400" />
                    {plan.collectors}
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-400" />
                    {plan.clients}
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-400" />
                    {plan.users}
                  </div>
                </div>

                <ul className="mt-4 space-y-2 flex-1">
                  {plan.features.map((feat, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                      <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  to="/register"
                  className={`mt-6 block text-center px-4 py-2.5 rounded-lg font-medium transition ${
                    plan.highlighted
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  Empezar gratis
                </Link>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-slate-500">
            Todos los precios en USD. Pago seguro procesado por Stripe.
          </p>
        </div>
      </section>

      {/* CTA banner */}
      <section className="py-16 md:py-20 bg-gradient-to-br from-emerald-600 to-emerald-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white">
            Empieza a profesionalizar tu negocio hoy
          </h2>
          <p className="mt-4 text-lg text-emerald-50">
            10 días de prueba gratis. Sin tarjeta de crédito. Configura tu cuenta en minutos.
          </p>
          <Link
            to="/register"
            className="mt-8 inline-flex items-center gap-2 px-8 py-3 bg-white text-emerald-700 font-semibold rounded-lg hover:bg-emerald-50 transition shadow-lg"
          >
            Crear cuenta gratis
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">Preguntas frecuentes</h2>
            <p className="mt-4 text-lg text-slate-600">Resolvemos las dudas más comunes</p>
          </div>

          <div className="mt-10 space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="border border-slate-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left bg-white hover:bg-slate-50 transition"
                >
                  <span className="font-medium text-slate-900">{faq.q}</span>
                  {openFaq === i ? (
                    <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
                  )}
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 text-sm text-slate-600 leading-relaxed">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-white" />
                </div>
                <span className="text-lg font-bold text-white">PrestaMax</span>
              </div>
              <p className="mt-3 text-sm text-slate-400">
                Sistema profesional de gestión de préstamos multi-país y multi-moneda.
              </p>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white">Producto</h4>
              <ul className="mt-3 space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white">Funciones</a></li>
                <li><a href="#pricing" className="hover:text-white">Precios</a></li>
                <li><a href="#faq" className="hover:text-white">Preguntas</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white">Cuenta</h4>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link to="/login" className="hover:text-white">Iniciar sesión</Link></li>
                <li><Link to="/register" className="hover:text-white">Crear cuenta</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white">Legal</h4>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link to="/terms" className="hover:text-white">Términos y condiciones</Link></li>
                <li><Link to="/privacy" className="hover:text-white">Política de privacidad</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-400">
              © {new Date().getFullYear()} PrestaMax. Todos los derechos reservados.
            </p>
            <p className="text-xs text-slate-400">
              PrestaMax — Powered by JPRS Digital Connect
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage

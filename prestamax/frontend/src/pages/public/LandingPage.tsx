// LandingPage — pagina publica de marketing de PrestaMax
import React, { useState, useEffect } from 'react'
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

import PlanInquiryModal from '@/components/public/PlanInquiryModal'
import LanguageSwitcher from '@/components/shared/LanguageSwitcher'
import { useT } from '@/lib/i18n'
import { Reveal, AnimatedCounter } from '@/components/shared/Reveal'
import { trackEvent } from '@/lib/analytics'

type TFn = (key: string) => string
interface Plan {
  slug?: string
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

const buildPlans = (t: TFn): Plan[] => [
  {
    name: t('lp.plan.starter'), slug: 'starter', price: 29.99,
    description: t('lp.plan.starter.d'),
    collectors: t('lp.lim.col1'), clients: t('lp.lim.cli100'), users: t('lp.lim.usr3'),
    features: [
      t('lp.pf.clients_mgmt'), t('lp.pf.amort'), t('lp.pf.digital_pay'),
      t('lp.pf.calc'), t('lp.pf.dash_basic'), t('lp.pf.email_support'),
    ],
  },
  {
    name: t('lp.plan.basico'), slug: 'basico', price: 59.99,
    description: t('lp.plan.basico.d'),
    collectors: t('lp.lim.col3'), clients: t('lp.lim.cli500'), users: t('lp.lim.usr8'),
    features: [
      t('lp.pf.all_starter'), t('lp.pf.collections'), t('lp.pf.promises'),
      t('lp.pf.contracts'), t('lp.pf.adv_reports'), t('lp.pf.whatsapp'), t('lp.pf.templates'),
    ],
    highlighted: true,
    ctaLabel: t('lp.pricing.popular'),
  },
  {
    name: t('lp.plan.profesional'), slug: 'profesional', price: 119.99,
    description: t('lp.plan.profesional.d'),
    collectors: t('lp.lim.col10'), clients: t('lp.lim.cli2000'), users: t('lp.lim.usr20'),
    features: [
      t('lp.pf.all_basico'), t('lp.pf.branches'), t('lp.pf.public_req'),
      t('lp.pf.projections'), t('lp.pf.income_mgmt'), t('lp.pf.roles'), t('lp.pf.priority'),
    ],
  },
  {
    name: t('lp.plan.enterprise'), slug: 'enterprise', price: 249.99,
    description: t('lp.plan.enterprise.d'),
    collectors: t('lp.lim.colInf'), clients: t('lp.lim.cliInf'), users: t('lp.lim.usrInf'),
    features: [
      t('lp.pf.all_pro'), t('lp.pf.no_limits'), t('lp.pf.multi_bank'),
      t('lp.pf.api'), t('lp.pf.onboarding'), t('lp.pf.support_247'), t('lp.pf.sla'),
    ],
  },
]

const buildFeatures = (t: TFn) => [
  { icon: Users,         title: t('lp.f.clients.t'),     description: t('lp.f.clients.d') },
  { icon: DollarSign,    title: t('lp.f.loans.t'),       description: t('lp.f.loans.d') },
  { icon: CreditCard,    title: t('lp.f.payments.t'),    description: t('lp.f.payments.d') },
  { icon: ClipboardList, title: t('lp.f.collections.t'), description: t('lp.f.collections.d') },
  { icon: FileText,      title: t('lp.f.contracts.t'),   description: t('lp.f.contracts.d') },
  { icon: BarChart3,     title: t('lp.f.reports.t'),     description: t('lp.f.reports.d') },
  { icon: Calculator,    title: t('lp.f.calc.t'),        description: t('lp.f.calc.d') },
  { icon: MessageCircle, title: t('lp.f.whatsapp.t'),    description: t('lp.f.whatsapp.d') },
  { icon: Inbox,         title: t('lp.f.requests.t'),    description: t('lp.f.requests.d') },
]

const buildFaqs = (t: TFn) => [
  { q: t('lp.faq.q1'), a: t('lp.faq.a1') },
  { q: t('lp.faq.q2'), a: t('lp.faq.a2') },
  { q: t('lp.faq.q3'), a: t('lp.faq.a3') },
  { q: t('lp.faq.q4'), a: t('lp.faq.a4') },
  { q: t('lp.faq.q5'), a: t('lp.faq.a5') },
  { q: t('lp.faq.q6'), a: t('lp.faq.a6') },
  { q: t('lp.faq.q7'), a: t('lp.faq.a7') },
  { q: t('lp.faq.q8'), a: t('lp.faq.a8') },
]

const LandingPage: React.FC = () => {
  const t = useT()
  const plans = buildPlans(t)
  const features = buildFeatures(t)
  const faqs = buildFaqs(t)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [inquiryOpen, setInquiryOpen]       = useState(false)
  const [inquiryPlan, setInquiryPlan]       = useState<string>('')
  const openInquiry = (planSlug: string = '') => {
    setInquiryPlan(planSlug)
    setInquiryOpen(true)
    setMobileMenuOpen(false)
  }
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <header className={`sticky top-0 z-50 bg-white/95 backdrop-blur border-b transition-shadow duration-300 ${scrolled ? 'border-slate-200 shadow-md' : 'border-transparent'}`}>
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-12 xl:px-16">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-gradient-to-br from-[#1e3a5f] to-[#152a45] rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-slate-900">PrestaMax</span>
            </div>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-slate-600 hover:text-slate-900">{t('lp.nav.features')}</a>
              <a href="#pricing" className="text-sm text-slate-600 hover:text-slate-900">{t('lp.nav.pricing')}</a>
              <a href="#faq" className="text-sm text-slate-600 hover:text-slate-900">{t('lp.nav.faq')}</a>
              <Link to="/login" className="text-sm text-slate-600 hover:text-slate-900">{t('lp.nav.login')}</Link>
              <LanguageSwitcher />
              <button
                type="button"
                onClick={() => openInquiry('')}
                className="px-4 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded-lg hover:bg-[#152a45] transition"
              >
                {t('lp.cta.request')}
              </button>
            </nav>

            {/* Mobile: selector de idioma + botón menú */}
            <div className="md:hidden flex items-center gap-1">
              <LanguageSwitcher />
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-md text-slate-600 hover:bg-slate-100"
                aria-label={t('lp.menu')}
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>

          {/* Mobile nav */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-slate-200 space-y-2">
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded">{t('lp.nav.features')}</a>
              <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded">{t('lp.nav.pricing')}</a>
              <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded">{t('lp.nav.faq')}</a>
              <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded">{t('lp.nav.login')}</Link>
              <button
                type="button"
                onClick={() => openInquiry('')}
                className="block w-full px-3 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded text-center"
              >
                {t('lp.cta.request')}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-12 xl:px-16 py-16 md:py-24">
          <div className="text-center max-w-4xl mx-auto">
            <div className="lp-hero-item lp-delay-1 inline-flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs font-medium text-amber-700 mb-6">
              <Zap className="w-3.5 h-3.5" />
              {t('lp.hero.badge')}
            </div>
            <h1 className="lp-hero-item lp-delay-2 text-4xl md:text-6xl font-bold text-slate-900 leading-tight">
              {t('lp.hero.title1')}
              <span className="block text-[#f59e0b]">{t('lp.hero.title2')}</span>
            </h1>
            <p className="lp-hero-item lp-delay-3 mt-6 text-lg md:text-xl text-slate-600 max-w-2xl mx-auto">
              {t('lp.hero.subtitle')}
            </p>
            <div className="lp-hero-item lp-delay-4 mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={() => { trackEvent('cta_request_plan', { location: 'hero' }); openInquiry('') }}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#1e3a5f] text-white font-medium rounded-lg hover:bg-[#152a45] transition shadow-lg shadow-[#1e3a5f]/30 hover:scale-[1.02]"
              >
                {t('lp.cta.request')}
                <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="#pricing"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-slate-700 font-medium rounded-lg border border-slate-300 hover:bg-slate-50 transition"
              >
                {t('lp.cta.see_plans')}
              </a>
            </div>
            <div className="mt-8 flex items-center justify-center gap-6 text-sm text-slate-500">
              <div className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-[#1e3a5f]" />
                {t('lp.hero.no_install')}
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-[#1e3a5f]" />
                {t('lp.hero.cancel_any')}
              </div>
              <div className="hidden sm:flex items-center gap-1.5">
                <Check className="w-4 h-4 text-[#1e3a5f]" />
                {t('lp.hero.multi')}
              </div>
            </div>
          </div>

          {/* Hero mockup illustration */}
          <div className="mt-16 relative max-w-6xl mx-auto">
            <div className="bg-gradient-to-br from-[#1e3a5f]/10 via-[#f59e0b]/10 to-blue-500/10 rounded-2xl p-2 md:p-4 shadow-2xl">
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-1.5 px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <div className="flex-1 text-center text-xs text-slate-500 font-mono">prestamax.com/dashboard</div>
                </div>
                <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: t('lp.mock.portfolio'),    node: <AnimatedCounter value={2.4} format={(n) => `$ ${n.toFixed(1)}M`} />, colorClass: 'text-[#1e3a5f]' },
                    { label: t('lp.mock.clients'),      node: <AnimatedCounter value={347} />, colorClass: 'text-blue-600' },
                    { label: t('lp.mock.active_loans'), node: <AnimatedCounter value={142} />, colorClass: 'text-purple-600' },
                    { label: t('lp.mock.collected'),    node: <AnimatedCounter value={412} format={(n) => `$ ${Math.round(n)}K`} />, colorClass: 'text-[#f59e0b]' },
                  ].map((stat, i) => (
                    <div key={i} className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="text-xs text-slate-500">{stat.label}</div>
                      <div className={`mt-1 text-xl md:text-2xl font-bold ${stat.colorClass}`}>{stat.node}</div>
                    </div>
                  ))}
                </div>
                <div className="px-6 pb-6">
                  <div className="h-32 bg-gradient-to-t from-blue-100 to-slate-50 rounded-lg flex items-end p-3 gap-1.5">
                    {[40, 65, 50, 75, 60, 85, 70, 90, 75, 95, 80, 100].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 bg-[#1e3a5f] rounded-t opacity-80"
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
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-12 xl:px-16 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="flex flex-col items-center gap-1">
              <Smartphone className="w-6 h-6 text-[#1e3a5f]" />
              <div className="text-sm font-medium text-slate-900">{t('lp.trust.web')}</div>
              <div className="text-xs text-slate-500">{t('lp.trust.web_d')}</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Lock className="w-6 h-6 text-[#1e3a5f]" />
              <div className="text-sm font-medium text-slate-900">{t('lp.trust.enc')}</div>
              <div className="text-xs text-slate-500">{t('lp.trust.enc_d')}</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Cloud className="w-6 h-6 text-[#1e3a5f]" />
              <div className="text-sm font-medium text-slate-900">{t('lp.trust.backup')}</div>
              <div className="text-xs text-slate-500">{t('lp.trust.backup_d')}</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <ShieldCheck className="w-6 h-6 text-[#f59e0b]" />
              <div className="text-sm font-medium text-slate-900">{t('lp.trust.multi')}</div>
              <div className="text-xs text-slate-500">{t('lp.trust.multi_d')}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 md:py-24 scroll-mt-20">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-12 xl:px-16">
          <Reveal className="text-center max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
              {t('lp.features.title')}
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              {t('lp.features.subtitle')}
            </p>
          </Reveal>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => {
              const Icon = feature.icon
              return (
                <Reveal
                  key={i}
                  delay={(i % 3) * 80}
                  className="lp-card-hover p-6 bg-white rounded-xl border border-slate-200 hover:border-[#1e3a5f]/40"
                >
                  <div className="w-11 h-11 bg-amber-50 rounded-lg flex items-center justify-center">
                    <Icon className="w-5 h-5 text-[#f59e0b]" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-900">{feature.title}</h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">{feature.description}</p>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-16 md:py-24 bg-slate-50 scroll-mt-20">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-12 xl:px-16">
          <Reveal className="text-center max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
              {t('lp.pricing.title')}
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              {t('lp.pricing.subtitle')}
            </p>
          </Reveal>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan, pi) => (
              <Reveal
                key={plan.name}
                delay={pi * 80}
                className={`lp-card-hover relative flex flex-col p-6 bg-white rounded-2xl border-2 ${
                  plan.highlighted
                    ? 'border-[#f59e0b] shadow-xl shadow-[#f59e0b]/20 scale-100 md:scale-105'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 bg-[#f59e0b] text-white text-xs font-medium rounded-full">
                      {plan.ctaLabel}
                    </span>
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                  <p className="mt-1 text-sm text-slate-500 min-h-[40px]">{plan.description}</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-slate-900">${plan.price}</span>
                    <span className="text-sm text-slate-500">{t('lp.pricing.per_month')}</span>
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
                      <Check className="w-4 h-4 text-[#1e3a5f] flex-shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => { trackEvent('cta_request_plan', { location: 'pricing', plan: plan.slug }); openInquiry(plan.slug || '') }}
                  className={`mt-6 block w-full text-center px-4 py-2.5 rounded-lg font-medium transition ${
                    plan.highlighted
                      ? 'bg-[#1e3a5f] text-white hover:bg-[#152a45]'
                      : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  {t('lp.cta.request')}
                </button>
              </Reveal>
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-slate-500">
            {t('lp.pricing.note')}
          </p>
        </div>
      </section>

      {/* CTA banner */}
      <section className="py-16 md:py-20 bg-gradient-to-br from-[#1e3a5f] to-[#152a45]">
        <Reveal className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white">
            {t('lp.ctab.title')}
          </h2>
          <p className="mt-4 text-lg text-blue-100">
            {t('lp.ctab.subtitle')}
          </p>
          <button
            type="button"
            onClick={() => { trackEvent('cta_request_plan', { location: 'cta_banner' }); openInquiry('') }}
            className="mt-8 inline-flex items-center gap-2 px-8 py-3 bg-white text-[#1e3a5f] font-semibold rounded-lg hover:bg-slate-50 transition shadow-lg hover:scale-[1.02]"
          >
            {t('lp.cta.request_mine')}
            <ArrowRight className="w-4 h-4" />
          </button>
        </Reveal>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-16 md:py-24 scroll-mt-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">{t('lp.faq.title')}</h2>
            <p className="mt-4 text-lg text-slate-600">{t('lp.faq.subtitle')}</p>
          </Reveal>

          <div className="mt-10 space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="border border-slate-200 rounded-lg overflow-hidden transition-colors hover:border-slate-300">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left bg-white hover:bg-slate-50 transition"
                >
                  <span className="font-medium text-slate-900">{faq.q}</span>
                  {openFaq === i ? (
                    <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0 transition-transform" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0 transition-transform" />
                  )}
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 text-sm text-slate-600 leading-relaxed" style={{ animation: 'lp-fade-in 0.3s ease' }}>
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
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-12 xl:px-16 py-12">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-[#1e3a5f] to-[#152a45] rounded-lg flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-white" />
                </div>
                <span className="text-lg font-bold text-white">PrestaMax</span>
              </div>
              <p className="mt-3 text-sm text-slate-400">
                {t('lp.footer.tagline')}
              </p>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white">{t('lp.footer.product')}</h4>
              <ul className="mt-3 space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white">{t('lp.nav.features')}</a></li>
                <li><a href="#pricing" className="hover:text-white">{t('lp.nav.pricing')}</a></li>
                <li><a href="#faq" className="hover:text-white">{t('lp.nav.faq')}</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white">{t('lp.footer.account')}</h4>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link to="/login" className="hover:text-white">{t('lp.nav.login')}</Link></li>
                <li><Link to="/register" className="hover:text-white">{t('lp.footer.create')}</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white">{t('lp.footer.legal')}</h4>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link to="/terms" className="hover:text-white">{t('lp.footer.terms')}</Link></li>
                <li><Link to="/privacy" className="hover:text-white">{t('lp.footer.privacy')}</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white">{t('lp.footer.contact')}</h4>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link to="/contact" className="hover:text-white">{t('lp.footer.contact_us')}</Link></li>
                <li>
                  <span className="block text-xs text-slate-500">{t('lp.footer.sales')}</span>
                  <a href="mailto:prestamax@digitalconnectdr.com" className="hover:text-white text-xs">prestamax@digitalconnectdr.com</a>
                </li>
                <li>
                  <span className="block text-xs text-slate-500">{t('lp.footer.support')}</span>
                  <a href="mailto:prestamaxsupport@digitalconnectdr.com" className="hover:text-white text-xs">prestamaxsupport@digitalconnectdr.com</a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-400">
              © {new Date().getFullYear()} PrestaMax. {t('lp.footer.rights')}
            </p>
            <p className="text-xs text-slate-400">
              PrestaMax — Powered by JPRS Digital Connect
            </p>
          </div>
        </div>
      </footer>

      <PlanInquiryModal
        open={inquiryOpen}
        onClose={() => setInquiryOpen(false)}
        initialPlan={inquiryPlan}
      />
    </div>
  )
}

export default LandingPage

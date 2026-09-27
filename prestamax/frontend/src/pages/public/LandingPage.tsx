// LandingPage — pagina publica de marketing de CredyTek (V2 — Fase 2, foco en conversion)
import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Users,
  DollarSign,
  CreditCard,
  FileText,
  ClipboardList,
  BarChart3,
  MessageCircle,
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
  TrendingUp,
  Settings,
  KeyRound,
  Building2,
  FileSpreadsheet,
  Upload,
} from 'lucide-react'

import PlanInquiryModal from '@/components/public/PlanInquiryModal'
import LanguageSwitcher from '@/components/shared/LanguageSwitcher'
import ShareButton from '@/components/shared/ShareButton'
import { useT } from '@/lib/i18n'
import { Reveal } from '@/components/shared/Reveal'
import { trackEvent, trackLandingVisit, track, trackTrialCtaClick, trackPlanSelected } from '@/lib/analytics'
import { useLandingTracking } from '@/hooks/useLandingTracking'
import dashboardScreenshot from '@/assets/landing/dashboard-screenshot.png'

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
      t('lp.pf.projections'), t('lp.pf.income_mgmt'), t('lp.pf.csv_import'), t('lp.pf.roles'), t('lp.pf.priority'),
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

const buildCapabilities = (t: TFn) => [
  { icon: Users,      title: t('lp.cap.clients.t'),     description: t('lp.cap.clients.d') },
  { icon: DollarSign, title: t('lp.cap.loans.t'),        description: t('lp.cap.loans.d') },
  { icon: CreditCard, title: t('lp.cap.payments.t'),     description: t('lp.cap.payments.d') },
  { icon: ClipboardList, title: t('lp.cap.collections.t'), description: t('lp.cap.collections.d') },
  { icon: BarChart3,  title: t('lp.cap.reports.t'),      description: t('lp.cap.reports.d') },
  { icon: Settings,   title: t('lp.cap.ops.t'),          description: t('lp.cap.ops.d') },
]

const buildHowSteps = (t: TFn) => [
  { icon: Users,      title: t('lp.how.s1') },
  { icon: DollarSign, title: t('lp.how.s2') },
  { icon: CreditCard, title: t('lp.how.s3') },
  { icon: TrendingUp, title: t('lp.how.s4') },
]

const buildSecurityItems = (t: TFn) => [
  { icon: KeyRound,   title: t('lp.sec.auth.t'),      description: t('lp.sec.auth.d') },
  { icon: Building2,  title: t('lp.sec.isolation.t'), description: t('lp.sec.isolation.d') },
  { icon: Lock,       title: t('lp.sec.https.t'),     description: t('lp.sec.https.d') },
  { icon: Cloud,      title: t('lp.sec.backup.t'),    description: t('lp.sec.backup.d') },
]

const buildFaqs = (t: TFn) => [
  { q: t('lp.faq.q1'), a: t('lp.faq.a1') },
  { q: t('lp.faq.q2'), a: t('lp.faq.a2') },
  { q: t('lp.faq.q3'), a: t('lp.faq.a3') },
  { q: t('lp.faq.q4'), a: t('lp.faq.a4') },
  { q: t('lp.faq.q5'), a: t('lp.faq.a5') },
  { q: t('lp.faq.q6'), a: t('lp.faq.a6') },
]

const LandingPage: React.FC = () => {
  const t = useT()
  const navigate = useNavigate()
  const plans = buildPlans(t)
  const capabilities = buildCapabilities(t)
  const howSteps = buildHowSteps(t)
  const securityItems = buildSecurityItems(t)
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
  useEffect(() => { trackLandingVisit('/'); track('landing_view') }, [])
  useLandingTracking()
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const goTry = (location: 'hero' | 'nav' | 'nav_mobile' | 'final') => {
    trackEvent('cta_register', { location })
    trackTrialCtaClick(location)
    navigate('/register')
  }

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Navbar */}
      <header className={`sticky top-0 z-50 bg-white/95 backdrop-blur border-b transition-shadow duration-300 ${scrolled ? 'border-slate-200 shadow-md' : 'border-transparent'}`}>
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-12 xl:px-16">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-gradient-to-br from-[#1e3a5f] to-[#152a45] rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-slate-900">CredyTek</span>
            </div>

            {/* Desktop nav */}
            <nav className="hidden lg:flex items-center gap-6 xl:gap-8">
              <a href="#capabilities" className="text-sm text-slate-600 hover:text-slate-900">{t('lp.nav.product')}</a>
              <a href="#how-it-works" className="text-sm text-slate-600 hover:text-slate-900">{t('lp.nav.how')}</a>
              <a href="#pricing" className="text-sm text-slate-600 hover:text-slate-900">{t('lp.nav.pricing')}</a>
              <a href="#faq" className="text-sm text-slate-600 hover:text-slate-900">{t('lp.nav.faq')}</a>
              <Link to="/login" className="text-sm text-slate-600 hover:text-slate-900">{t('lp.nav.login')}</Link>
              <ShareButton />
              <LanguageSwitcher />
              <button
                type="button"
                onClick={() => goTry('nav')}
                className="px-4 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded-lg hover:bg-[#152a45] transition"
              >
                {t('lp.cta.try')}
              </button>
            </nav>

            {/* Mobile: compartir + selector de idioma + botón menú */}
            <div className="lg:hidden flex items-center gap-1">
              <ShareButton />
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
            <div className="lg:hidden py-4 border-t border-slate-200 space-y-2">
              <a href="#capabilities" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded">{t('lp.nav.product')}</a>
              <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded">{t('lp.nav.how')}</a>
              <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded">{t('lp.nav.pricing')}</a>
              <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded">{t('lp.nav.faq')}</a>
              <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded">{t('lp.nav.login')}</Link>
              <button
                type="button"
                onClick={() => { goTry('nav_mobile'); setMobileMenuOpen(false) }}
                className="block w-full px-3 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded text-center"
              >
                {t('lp.cta.try')}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 1. Hero */}
      <section id="hero" className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -right-24 w-[24rem] h-[24rem] bg-[#f59e0b]/8 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-[#1e3a5f]/5 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-12 xl:px-16 py-16 md:py-24">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs font-medium text-amber-700 mb-6">
              <Zap className="w-3.5 h-3.5" />
              {t('lp.hero.badge')}
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-slate-900 leading-tight">
              {t('lp.hero.title1')}
              <span className="block text-[#f59e0b]">{t('lp.hero.title2')}</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-slate-600 max-w-2xl mx-auto">
              {t('lp.hero.subtitle')}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={() => goTry('hero')}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#1e3a5f] text-white font-medium rounded-lg hover:bg-[#152a45] transition shadow-lg shadow-[#1e3a5f]/30"
              >
                {t('lp.cta.try')}
                <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-slate-700 font-medium rounded-lg border border-slate-300 hover:bg-slate-50 transition"
              >
                {t('lp.cta.how')}
              </a>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500">
              <div className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-[#1e3a5f]" />
                {t('lp.hero.no_install')}
              </div>
              <div className="flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-[#1e3a5f]" />
                {t('lp.hero.mobile')}
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

          {/* Captura real del producto */}
          <div className="mt-14 relative max-w-5xl mx-auto">
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xl shadow-slate-900/10 overflow-hidden">
              <img
                src={dashboardScreenshot}
                alt={t('lp.hero.shot_alt')}
                width={1440}
                height={900}
                loading="eager"
                fetchPriority="high"
                className="w-full h-auto block"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Problema → Resultado */}
      <section id="problem-result" className="py-14 md:py-20 bg-white">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-12 xl:px-16">
          <Reveal className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">{t('lp.pr.title')}</h2>
            <p className="mt-4 text-lg text-slate-600">{t('lp.pr.subtitle')}</p>
          </Reveal>

          <div className="mt-10 grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <Reveal className="rounded-2xl border border-red-200 bg-red-50/40 p-6 md:p-7">
              <ul className="space-y-3">
                {[t('lp.pr.p1'), t('lp.pr.p2'), t('lp.pr.p3')].map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <X className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={100} className="rounded-2xl border-2 border-[#1e3a5f]/20 bg-white p-6 md:p-7 shadow-lg shadow-[#1e3a5f]/5">
              <ul className="space-y-3">
                {[t('lp.pr.r1'), t('lp.pr.r2'), t('lp.pr.r3')].map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-800 font-medium">
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 3. Cómo funciona */}
      <section id="how-it-works" className="py-16 md:py-24 bg-slate-50 scroll-mt-20">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-12 xl:px-16">
          <Reveal className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">{t('lp.how.title')}</h2>
            <p className="mt-4 text-lg text-slate-600">{t('lp.how.subtitle')}</p>
          </Reveal>

          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {howSteps.map((step, i) => {
              const StepIcon = step.icon
              return (
                <Reveal key={i} delay={i * 80} className="text-center">
                  <div className="relative inline-flex">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1e3a5f] to-[#152a45] flex items-center justify-center shadow-lg shadow-[#1e3a5f]/20">
                      <StepIcon className="w-7 h-7 text-white" />
                    </div>
                    <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#f59e0b] text-white text-xs font-bold flex items-center justify-center shadow">{i + 1}</span>
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-slate-900 max-w-[14rem] mx-auto">{step.title}</h3>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* 4. Capacidades principales */}
      <section id="capabilities" className="py-16 md:py-24 scroll-mt-20">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-12 xl:px-16">
          <Reveal className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">{t('lp.cap.title')}</h2>
            <p className="mt-4 text-lg text-slate-600">{t('lp.cap.subtitle')}</p>
          </Reveal>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {capabilities.map((cap, i) => {
              const Icon = cap.icon
              return (
                <Reveal
                  key={i}
                  delay={(i % 3) * 80}
                  className="p-6 bg-white rounded-xl border border-slate-200 hover:border-[#1e3a5f]/40 transition-colors"
                >
                  <div className="w-11 h-11 bg-amber-50 rounded-lg flex items-center justify-center">
                    <Icon className="w-5 h-5 text-[#f59e0b]" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-900">{cap.title}</h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">{cap.description}</p>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* 5. Diferenciadora */}
      <section id="differentiator" className="py-16 md:py-24 bg-slate-50">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-12 xl:px-16">
          <Reveal className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">{t('lp.diff.title')}</h2>
            <p className="mt-4 text-lg text-slate-600">{t('lp.diff.subtitle')}</p>
          </Reveal>

          <div className="mt-12 grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <Reveal className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t('lp.diff.before_t')}</h3>
              <ul className="mt-5 space-y-3">
                {[t('lp.diff.b1'), t('lp.diff.b2'), t('lp.diff.b3'), t('lp.diff.b4'), t('lp.diff.b5')].map((item, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-sm text-slate-500">
                    <X className="w-4 h-4 text-slate-300 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={100} className="rounded-2xl border-2 border-[#1e3a5f]/20 bg-white p-6 md:p-8 shadow-lg shadow-[#1e3a5f]/5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1e3a5f]">{t('lp.diff.after_t')}</h3>
              <ul className="mt-5 space-y-3">
                {[t('lp.diff.g1'), t('lp.diff.g2'), t('lp.diff.g3'), t('lp.diff.g4'), t('lp.diff.g5'), t('lp.diff.g6')].map((item, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-sm text-slate-800 font-medium">
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 6. Migración / barrera de cambio */}
      <section id="migration" className="py-16 md:py-24">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-12 xl:px-16">
          <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-10 items-center">
            <Reveal>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900">{t('lp.mig.title')}</h2>
              <p className="mt-4 text-slate-600 leading-relaxed">{t('lp.mig.desc')}</p>
              <p className="mt-4 text-sm text-slate-500">{t('lp.mig.note')}</p>
            </Reveal>
            <Reveal delay={100} className="rounded-2xl border border-slate-200 bg-slate-50 p-6 md:p-8">
              <ol className="space-y-5">
                {[
                  { icon: FileSpreadsheet, label: t('lp.mig.s1') },
                  { icon: Upload,          label: t('lp.mig.s2') },
                  { icon: Check,           label: t('lp.mig.s3') },
                ].map((step, i) => {
                  const StepIcon = step.icon
                  return (
                    <li key={i} className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
                        <StepIcon className="w-4 h-4 text-[#1e3a5f]" />
                      </div>
                      <span className="text-sm font-medium text-slate-800">{step.label}</span>
                    </li>
                  )
                })}
              </ol>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 7. Seguridad y confianza */}
      <section id="security" className="py-16 md:py-24 bg-slate-50">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-12 xl:px-16">
          <Reveal className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">{t('lp.sec.title')}</h2>
            <p className="mt-4 text-lg text-slate-600">{t('lp.sec.subtitle')}</p>
          </Reveal>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
            {securityItems.map((item, i) => {
              const Icon = item.icon
              return (
                <Reveal key={i} delay={i * 80} className="p-5 bg-white rounded-xl border border-slate-200 text-center">
                  <div className="mx-auto w-11 h-11 bg-blue-50 rounded-lg flex items-center justify-center">
                    <Icon className="w-5 h-5 text-[#1e3a5f]" />
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{item.description}</p>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* 8. Pricing */}
      <section id="pricing" className="py-16 md:py-24 scroll-mt-20">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-12 xl:px-16">
          <Reveal className="text-center max-w-2xl mx-auto">
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
                className={`relative flex flex-col p-6 bg-white rounded-2xl border-2 ${
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
                  onClick={() => { trackEvent('cta_start', { location: 'pricing', plan: plan.slug }); trackTrialCtaClick('pricing', { plan: plan.slug || 'unknown' }); trackPlanSelected(plan.slug || 'unknown'); navigate('/register') }}
                  className={`mt-6 block w-full text-center px-4 py-2.5 rounded-lg font-medium transition ${
                    plan.highlighted
                      ? 'bg-[#1e3a5f] text-white hover:bg-[#152a45]'
                      : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  {t('lp.cta.start')}
                </button>
              </Reveal>
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-slate-500">
            {t('lp.pricing.note')}
          </p>
        </div>
      </section>

      {/* 9. FAQ */}
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
                  aria-expanded={openFaq === i}
                  aria-controls={`faq-panel-${i}`}
                >
                  <span className="font-medium text-slate-900">{faq.q}</span>
                  {openFaq === i ? (
                    <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0 transition-transform" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0 transition-transform" aria-hidden="true" />
                  )}
                </button>
                {openFaq === i && (
                  <div id={`faq-panel-${i}`} role="region" className="px-5 pb-4 text-sm text-slate-600 leading-relaxed">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="mt-6 text-center text-sm">
            <button
              type="button"
              onClick={() => { trackEvent('cta_advice', { location: 'faq' }); openInquiry('') }}
              className="inline-flex items-center gap-1.5 text-[#1e3a5f] hover:text-[#152a45] font-medium"
            >
              <MessageCircle className="w-4 h-4" />
              {t('lp.advice.link')}
            </button>
          </p>
        </div>
      </section>

      {/* 10. CTA final */}
      <section id="cta-final" className="py-16 md:py-20 bg-gradient-to-br from-[#1e3a5f] to-[#152a45]">
        <Reveal className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white">
            {t('lp.ctab.title')}
          </h2>
          <p className="mt-4 text-lg text-blue-100">
            {t('lp.ctab.subtitle')}
          </p>
          <button
            type="button"
            onClick={() => goTry('final')}
            className="mt-8 inline-flex items-center gap-2 px-8 py-3 bg-white text-[#1e3a5f] font-semibold rounded-lg hover:bg-slate-50 transition shadow-lg"
          >
            {t('lp.cta.try')}
            <ArrowRight className="w-4 h-4" />
          </button>
        </Reveal>
      </section>

      {/* Respaldo de marca — JPRS Digital Connect */}
      <section className="py-14 md:py-16 bg-slate-50 border-t border-slate-200">
        <Reveal className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{t('lp.brand.label')}</p>
          <h3 className="mt-3 text-2xl font-bold text-slate-900">{t('lp.brand.title')}</h3>
          <p className="mt-3 text-sm md:text-base text-slate-600 leading-relaxed">{t('lp.brand.desc')}</p>
          <a
            href="https://digitalconnectdr.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-100 hover:border-slate-400 transition"
          >
            {t('lp.brand.cta')}
            <ArrowRight className="w-4 h-4" />
          </a>
        </Reveal>
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
                <span className="text-lg font-bold text-white">CredyTek</span>
              </div>
              <p className="mt-3 text-sm text-slate-400">
                {t('lp.footer.tagline')}
              </p>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white">{t('lp.footer.product')}</h4>
              <ul className="mt-3 space-y-2 text-sm">
                <li><a href="#how-it-works" className="hover:text-white">{t('lp.nav.how')}</a></li>
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
                  <a href="mailto:credytek@digitalconnectdr.com" className="hover:text-white text-xs break-all">credytek@digitalconnectdr.com</a>
                </li>
                <li>
                  <span className="block text-xs text-slate-500">{t('lp.footer.support')}</span>
                  <a href="mailto:credyteksupport@digitalconnectdr.com" className="hover:text-white text-xs break-all">credyteksupport@digitalconnectdr.com</a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-400">
              © {new Date().getFullYear()} CredyTek. {t('lp.footer.rights')}
            </p>
            <p className="text-xs text-slate-400">
              CredyTek — Powered by{' '}
              <a
                href="https://digitalconnectdr.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-slate-300 hover:text-white transition-colors"
              >
                JPRS Digital Connect
              </a>
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

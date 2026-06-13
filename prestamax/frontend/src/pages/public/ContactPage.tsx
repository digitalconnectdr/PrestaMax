import React, { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Mail, Headphones, Briefcase, Clock, DollarSign } from 'lucide-react'
import { useT } from '@/lib/i18n'
import LanguageSwitcher from '@/components/shared/LanguageSwitcher'
import { trackEvent } from '@/lib/analytics'

const SALES_EMAIL = 'prestamax@digitalconnectdr.com'
const SUPPORT_EMAIL = 'prestamaxsupport@digitalconnectdr.com'

const ContactPage: React.FC = () => {
  const t = useT()
  useEffect(() => { window.scrollTo(0, 0) }, [])

  const cards = [
    {
      icon: Briefcase,
      title: t('contact.sales_title'),
      desc: t('contact.sales_desc'),
      email: SALES_EMAIL,
      accent: 'text-[#1e3a5f] bg-[#1e3a5f]/10',
      ev: 'contact_email_sales',
    },
    {
      icon: Headphones,
      title: t('contact.support_title'),
      desc: t('contact.support_desc'),
      email: SUPPORT_EMAIL,
      accent: 'text-[#f59e0b] bg-amber-50',
      ev: 'contact_email_support',
    },
  ]

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gradient-to-br from-[#1e3a5f] to-[#152a45] rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900">PrestaMax</span>
          </Link>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t('contact.back_home')}
          </Link>

          <div className="text-center max-w-2xl mx-auto">
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900">{t('contact.title')}</h1>
            <p className="mt-3 text-lg text-slate-600">{t('contact.subtitle')}</p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
            {cards.map((c) => {
              const Icon = c.icon
              return (
                <div key={c.email} className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col shadow-sm hover:shadow-md transition-shadow">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${c.accent}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-slate-900">{c.title}</h2>
                  <p className="mt-1 text-sm text-slate-600 leading-relaxed flex-1">{c.desc}</p>
                  <a
                    href={`mailto:${c.email}`}
                    onClick={() => trackEvent(c.ev)}
                    className="mt-4 flex items-center gap-2 text-[#1e3a5f] font-medium hover:underline break-all"
                  >
                    <Mail className="w-4 h-4 flex-shrink-0" />
                    {c.email}
                  </a>
                  <a
                    href={`mailto:${c.email}`}
                    onClick={() => trackEvent(c.ev)}
                    className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1e3a5f] text-white text-sm font-medium rounded-lg hover:bg-[#152a45] transition"
                  >
                    <Mail className="w-4 h-4" /> {t('contact.write_btn')}
                  </a>
                </div>
              )
            })}
          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-x-8 gap-y-2 text-sm text-slate-500">
            <span className="flex items-center gap-2"><Clock className="w-4 h-4" /> {t('contact.hours')}</span>
            <span>{t('contact.response_note')}</span>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} PrestaMax — JPRS Digital Connect
      </footer>
    </div>
  )
}

export default ContactPage

// PlanInquiryModal — form publico para que prospectos soliciten contacto
// de ventas. POST a /api/public/plan-inquiry que envia email al admin y
// queda en la tabla plan_inquiries para revision en /admin.

import React, { useState } from 'react'
import { X, Loader2, CheckCircle2, MessageCircle, AlertCircle } from 'lucide-react'
import api from '@/lib/api'
import { useT } from '@/lib/i18n'

interface Props {
  open: boolean
  onClose: () => void
  initialPlan?: string
}

// value + i18n key (+ precio fijo donde aplica). Nombres de plan propios quedan literales.
const PLANS: { value: string; labelKey?: string; name?: string; price?: string; priceKey?: string }[] = [
  { value: 'unsure',      labelKey: 'piq.plan_unsure' },
  { value: 'trial',       labelKey: 'piq.plan_trial',   priceKey: 'piq.plan_trial_price' },
  { value: 'starter',     name: 'Starter',      price: '$29.99' },
  { value: 'basico',      labelKey: 'piq.plan_basico', price: '$59.99' },
  { value: 'profesional', name: 'Profesional',  price: '$119.99' },
  { value: 'enterprise',  name: 'Enterprise',   price: '$249.99' },
]

const COUNTRIES = [
  { value: 'DO', flag: '🇩🇴' }, { value: 'MX', flag: '🇲🇽' }, { value: 'CO', flag: '🇨🇴' },
  { value: 'PE', flag: '🇵🇪' }, { value: 'CL', flag: '🇨🇱' }, { value: 'AR', flag: '🇦🇷' },
  { value: 'VE', flag: '🇻🇪' }, { value: 'EC', flag: '🇪🇨' }, { value: 'BO', flag: '🇧🇴' },
  { value: 'PY', flag: '🇵🇾' }, { value: 'UY', flag: '🇺🇾' }, { value: 'CR', flag: '🇨🇷' },
  { value: 'PA', flag: '🇵🇦' }, { value: 'GT', flag: '🇬🇹' }, { value: 'SV', flag: '🇸🇻' },
  { value: 'HN', flag: '🇭🇳' }, { value: 'NI', flag: '🇳🇮' }, { value: 'HT', flag: '🇭🇹' },
  { value: 'US', flag: '🇺🇸' }, { value: 'ES', flag: '🇪🇸' }, { value: 'OTHER', flag: '🌍' },
]

const PORTFOLIO_SIZES = [
  { value: '<50',     labelKey: 'piq.size_lt50' },
  { value: '50-200',  labelKey: 'piq.size_50_200' },
  { value: '200-500', labelKey: 'piq.size_200_500' },
  { value: '500+',    labelKey: 'piq.size_500' },
  { value: 'unsure',  labelKey: 'piq.size_unsure' },
]

const SOURCES = [
  { value: 'google',    labelKey: 'piq.src_google' },
  { value: 'facebook',  labelKey: 'piq.src_facebook' },
  { value: 'instagram', labelKey: 'piq.src_instagram' },
  { value: 'whatsapp',  labelKey: 'piq.src_whatsapp' },
  { value: 'youtube',   labelKey: 'piq.src_youtube' },
  { value: 'referral',  labelKey: 'piq.src_referral' },
  { value: 'other',     labelKey: 'piq.src_other' },
]

const PlanInquiryModal: React.FC<Props> = ({ open, onClose, initialPlan }) => {
  const t = useT()
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [errorMsg, setErrorMsg]     = useState<string | null>(null)
  const [form, setForm] = useState({
    full_name: '',
    business_name: '',
    whatsapp: '',
    email: '',
    country: 'DO',
    plan_interest: initialPlan || 'unsure',
    portfolio_size: '',
    source: '',
    message: '',
  })

  React.useEffect(() => {
    if (open) {
      // Reset si se abre con plan inicial nuevo
      setForm(prev => ({ ...prev, plan_interest: initialPlan || prev.plan_interest || 'unsure' }))
      setSubmitted(false)
      setErrorMsg(null)
    }
  }, [open, initialPlan])

  if (!open) return null

  const handleChange = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (!form.full_name.trim())      return setErrorMsg(t('piq.err_name'))
    if (!form.whatsapp.trim())       return setErrorMsg(t('piq.err_whatsapp'))
    if (!form.email.trim())          return setErrorMsg(t('piq.err_email'))
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setErrorMsg(t('piq.err_email_inv'))

    try {
      setSubmitting(true)
      await api.post('/public/plan-inquiry', form)
      setSubmitted(true)
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || t('piq.send_error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[95vh] overflow-y-auto my-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-start justify-between rounded-t-2xl">
          <div>
            <h3 className="font-bold text-lg text-slate-900">
              {submitted ? t('piq.title_done') : t('piq.title')}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {submitted ? t('piq.subtitle_done') : t('piq.subtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500"
            aria-label={t('piq.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        {submitted ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-9 h-9 text-emerald-600" />
            </div>
            <div>
              <h4 className="text-lg font-semibold text-slate-900">{t('piq.sent_title')}</h4>
              <p className="text-sm text-slate-600 mt-2">
                {t('piq.sent_a')} <strong>WhatsApp</strong> {t('piq.sent_b')}
                <strong> {t('piq.sent_hours')}</strong> {t('piq.sent_c')}
              </p>
              <p className="text-xs text-slate-500 mt-3">
                {t('piq.urgent')}
                {' '}
                <a
                  href="https://wa.me/18498891220?text=Hola%2C%20me%20interesa%20PrestaMax"
                  target="_blank" rel="noopener noreferrer"
                  className="text-emerald-600 font-medium hover:underline"
                >
                  +1 849-889-1220
                </a>
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 bg-[#1e3a5f] text-white rounded-lg font-medium hover:bg-[#152a45] transition"
            >
              {t('piq.close')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-3">
            {errorMsg && (
              <div className="flex gap-2 items-start text-sm bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded-lg">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">{t('piq.full_name')}</label>
              <input
                type="text"
                value={form.full_name}
                onChange={e => handleChange('full_name', e.target.value)}
                placeholder="Juan Pérez"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">{t('piq.business')}</label>
              <input
                type="text"
                value={form.business_name}
                onChange={e => handleChange('business_name', e.target.value)}
                placeholder={t('piq.business_ph')}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">WhatsApp *</label>
                <input
                  type="tel"
                  value={form.whatsapp}
                  onChange={e => handleChange('whatsapp', e.target.value)}
                  placeholder="+1 809 555 1234"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">{t('piq.country')}</label>
                <select
                  value={form.country}
                  onChange={e => handleChange('country', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white"
                  required
                >
                  {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.flag} {t(`piq.c_${c.value}`)}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">{t('piq.email')}</label>
              <input
                type="email"
                value={form.email}
                onChange={e => handleChange('email', e.target.value)}
                placeholder="tu@email.com"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">{t('piq.plan_interest')}</label>
              <select
                value={form.plan_interest}
                onChange={e => handleChange('plan_interest', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white"
              >
                {PLANS.map(p => {
                  const planLabel = p.labelKey ? t(p.labelKey) : (p.name || '')
                  const planPrice = p.priceKey ? t(p.priceKey) : (p.price ? p.price + t('piq.per_month') : '')
                  return (
                    <option key={p.value} value={p.value}>
                      {planLabel}{planPrice ? ` · ${planPrice}` : ''}
                    </option>
                  )
                })}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">{t('piq.portfolio')}</label>
              <select
                value={form.portfolio_size}
                onChange={e => handleChange('portfolio_size', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white"
              >
                <option value="">{t('piq.select')}</option>
                {PORTFOLIO_SIZES.map(s => <option key={s.value} value={s.value}>{t(s.labelKey)}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">{t('piq.source')}</label>
              <select
                value={form.source}
                onChange={e => handleChange('source', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white"
              >
                <option value="">{t('piq.select')}</option>
                {SOURCES.map(s => <option key={s.value} value={s.value}>{t(s.labelKey)}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">{t('piq.message')}</label>
              <textarea
                value={form.message}
                onChange={e => handleChange('message', e.target.value)}
                rows={3}
                placeholder={t('piq.message_ph')}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 resize-none"
                maxLength={1500}
              />
            </div>

            <p className="text-xs text-slate-500">
              {t('piq.consent')}
            </p>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-[#1e3a5f] text-white rounded-lg font-semibold hover:bg-[#152a45] transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {t('piq.sending')}</>
              ) : (
                <><MessageCircle className="w-4 h-4" /> {t('piq.submit')}</>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default PlanInquiryModal

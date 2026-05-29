// PlanInquiryModal — form publico para que prospectos soliciten contacto
// de ventas. POST a /api/public/plan-inquiry que envia email al admin y
// queda en la tabla plan_inquiries para revision en /admin.

import React, { useState } from 'react'
import { X, Loader2, CheckCircle2, MessageCircle, AlertCircle } from 'lucide-react'
import api from '@/lib/api'

interface Props {
  open: boolean
  onClose: () => void
  initialPlan?: string
}

const PLANS = [
  { value: 'unsure',      label: 'No estoy seguro — asesórame',       price: '' },
  { value: 'trial',       label: 'Plan Trial (14 días gratis)',        price: 'Sin costo' },
  { value: 'starter',     label: 'Starter',                            price: '$29.99/mes' },
  { value: 'basico',      label: 'Básico',                             price: '$59.99/mes' },
  { value: 'profesional', label: 'Profesional',                        price: '$119.99/mes' },
  { value: 'enterprise',  label: 'Enterprise',                         price: '$249.99/mes' },
]

const COUNTRIES = [
  { value: 'DO',    label: '🇩🇴 República Dominicana' },
  { value: 'MX',    label: '🇲🇽 México' },
  { value: 'CO',    label: '🇨🇴 Colombia' },
  { value: 'PE',    label: '🇵🇪 Perú' },
  { value: 'CL',    label: '🇨🇱 Chile' },
  { value: 'AR',    label: '🇦🇷 Argentina' },
  { value: 'VE',    label: '🇻🇪 Venezuela' },
  { value: 'EC',    label: '🇪🇨 Ecuador' },
  { value: 'BO',    label: '🇧🇴 Bolivia' },
  { value: 'PY',    label: '🇵🇾 Paraguay' },
  { value: 'UY',    label: '🇺🇾 Uruguay' },
  { value: 'CR',    label: '🇨🇷 Costa Rica' },
  { value: 'PA',    label: '🇵🇦 Panamá' },
  { value: 'GT',    label: '🇬🇹 Guatemala' },
  { value: 'SV',    label: '🇸🇻 El Salvador' },
  { value: 'HN',    label: '🇭🇳 Honduras' },
  { value: 'NI',    label: '🇳🇮 Nicaragua' },
  { value: 'HT',    label: '🇭🇹 Haití' },
  { value: 'US',    label: '🇺🇸 Estados Unidos' },
  { value: 'ES',    label: '🇪🇸 España' },
  { value: 'OTHER', label: '🌍 Otro' },
]

const PORTFOLIO_SIZES = [
  { value: '<50',     label: 'Menos de 50 préstamos' },
  { value: '50-200',  label: '50 - 200 préstamos' },
  { value: '200-500', label: '200 - 500 préstamos' },
  { value: '500+',    label: 'Más de 500 préstamos' },
  { value: 'unsure',  label: 'No estoy seguro' },
]

const SOURCES = [
  { value: 'google',    label: 'Búsqueda en Google' },
  { value: 'facebook',  label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'whatsapp',  label: 'WhatsApp' },
  { value: 'youtube',   label: 'YouTube' },
  { value: 'referral',  label: 'Alguien me lo recomendó' },
  { value: 'other',     label: 'Otra fuente' },
]

const PlanInquiryModal: React.FC<Props> = ({ open, onClose, initialPlan }) => {
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

    if (!form.full_name.trim())      return setErrorMsg('Tu nombre completo es requerido')
    if (!form.whatsapp.trim())       return setErrorMsg('Tu WhatsApp es requerido')
    if (!form.email.trim())          return setErrorMsg('Tu email es requerido')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setErrorMsg('Email no es válido')

    try {
      setSubmitting(true)
      await api.post('/public/plan-inquiry', form)
      setSubmitted(true)
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || 'No se pudo enviar. Inténtalo de nuevo.')
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
              {submitted ? '¡Recibido!' : 'Solicita tu plan'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {submitted
                ? 'Te contactaremos pronto'
                : 'Cuéntanos un poco sobre ti — te contactamos por WhatsApp en máx 24h'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500"
            aria-label="Cerrar"
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
              <h4 className="text-lg font-semibold text-slate-900">Solicitud enviada</h4>
              <p className="text-sm text-slate-600 mt-2">
                Te enviaremos un mensaje por <strong>WhatsApp</strong> en las próximas
                <strong> 24 horas</strong> para conversar sobre tus necesidades.
              </p>
              <p className="text-xs text-slate-500 mt-3">
                ¿Urgente? Escríbenos directamente al
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
              Cerrar
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
              <label className="text-xs font-medium text-slate-600 block mb-1">Nombre completo *</label>
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
              <label className="text-xs font-medium text-slate-600 block mb-1">Nombre de tu empresa</label>
              <input
                type="text"
                value={form.business_name}
                onChange={e => handleChange('business_name', e.target.value)}
                placeholder="Préstamos del Caribe SRL (opcional)"
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
                <label className="text-xs font-medium text-slate-600 block mb-1">País *</label>
                <select
                  value={form.country}
                  onChange={e => handleChange('country', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white"
                  required
                >
                  {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Email *</label>
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
              <label className="text-xs font-medium text-slate-600 block mb-1">Plan que te interesa</label>
              <select
                value={form.plan_interest}
                onChange={e => handleChange('plan_interest', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white"
              >
                {PLANS.map(p => (
                  <option key={p.value} value={p.value}>
                    {p.label}{p.price ? ` · ${p.price}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Tamaño de tu cartera actual</label>
              <select
                value={form.portfolio_size}
                onChange={e => handleChange('portfolio_size', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white"
              >
                <option value="">— Selecciona —</option>
                {PORTFOLIO_SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">¿Cómo nos conociste?</label>
              <select
                value={form.source}
                onChange={e => handleChange('source', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white"
              >
                <option value="">— Selecciona —</option>
                {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Mensaje (opcional)</label>
              <textarea
                value={form.message}
                onChange={e => handleChange('message', e.target.value)}
                rows={3}
                placeholder="Cuéntanos qué buscas, dudas que tengas, etc."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 resize-none"
                maxLength={1500}
              />
            </div>

            <p className="text-xs text-slate-500">
              Al enviar aceptas que te contactemos por WhatsApp / email. Sin spam.
            </p>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-[#1e3a5f] text-white rounded-lg font-semibold hover:bg-[#152a45] transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
              ) : (
                <><MessageCircle className="w-4 h-4" /> Solicitar contacto</>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default PlanInquiryModal

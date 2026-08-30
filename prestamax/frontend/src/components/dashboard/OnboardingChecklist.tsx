// OnboardingChecklist — panel "Primeros pasos" del dashboard.
// Progreso AUTOMÁTICO: cada paso se detecta consultando /onboarding/status
// (¿ya tiene cuenta bancaria? ¿ya creó un cliente? etc), así que el usuario
// nunca tiene que marcar nada a mano. Pausable: se puede ocultar y se recuerda
// esa preferencia en localStorage; vuelve a aparecer si hay pasos pendientes
// y el usuario no lo ocultó explícitamente.
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Package, UserPlus, DollarSign, CreditCard, Link2, Truck, Calendar as CalendarIcon, ChevronDown, ChevronUp, X, PartyPopper } from 'lucide-react'
import api from '@/lib/api'
import { useT } from '@/lib/i18n'
import { runTour } from '@/lib/tourEngine'
import { getTourSteps, getTourLabels } from '@/lib/tours'

interface Status {
  bankAccount: boolean
  product: boolean
  client: boolean
  loan: boolean
  payment: boolean
  publicRequest: boolean
  promise: boolean
}

const HIDE_KEY = 'credytek_onboarding_hidden'

const OnboardingChecklist: React.FC = () => {
  const t = useT()
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [hidden, setHidden] = useState<boolean>(() => {
    try { return localStorage.getItem(HIDE_KEY) === '1' } catch { return false }
  })

  useEffect(() => {
    api.get('/onboarding/status').then(res => setStatus(res.data)).catch(() => setStatus(null))
  }, [])

  const STEPS = [
    { key: 'bankAccount',   icon: Building2,    label: t('onb.s.bank'),    desc: t('onb.s.bank_d'),    tourId: 'bank-account' },
    { key: 'product',       icon: Package,      label: t('onb.s.product'), desc: t('onb.s.product_d'), tourId: 'product' },
    { key: 'client',        icon: UserPlus,     label: t('onb.s.client'),  desc: t('onb.s.client_d'),  tourId: 'client' },
    { key: 'loan',          icon: DollarSign,   label: t('onb.s.loan'),    desc: t('onb.s.loan_d'),    tourId: 'loan' },
    { key: 'payment',       icon: CreditCard,   label: t('onb.s.payment'), desc: t('onb.s.payment_d'), tourId: 'payment' },
    { key: 'publicRequest', icon: Link2,        label: t('onb.s.link'),    desc: t('onb.s.link_d'),    tourId: 'public-link' },
    { key: 'promise',       icon: CalendarIcon, label: t('onb.s.promise'), desc: t('onb.s.promise_d'), tourId: 'collections' },
  ] as const

  const pendingSteps = status ? STEPS.filter(s => !status[s.key as keyof Status]) : []

  const startTour = (tourId: string) => {
    runTour(tourId, getTourSteps(tourId, t), navigate, getTourLabels(t))
  }

  if (!status) return null

  const done = STEPS.filter(s => status[s.key as keyof Status]).length
  const total = STEPS.length
  const allDone = done === total

  const hide = () => {
    setHidden(true)
    try { localStorage.setItem(HIDE_KEY, '1') } catch {}
  }
  const unhide = () => {
    setHidden(false)
    try { localStorage.removeItem(HIDE_KEY) } catch {}
  }

  // Ocultado por el usuario: dejamos un enlace discreto para retomarlo luego
  // (solo si aún quedan pasos pendientes — si ya completó todo, no hace falta).
  if (hidden) {
    if (allDone) return null
    return (
      <button
        onClick={unhide}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-600 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-slate-400" />
          {t('onb.progress').replace('{done}', String(done)).replace('{total}', String(total))}
        </span>
        <span className="font-medium text-[#1e3a5f]">{t('onb.show')}</span>
      </button>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[#1e3a5f]/10 flex items-center justify-center flex-shrink-0">
            {allDone ? <PartyPopper className="w-4.5 h-4.5 text-[#1e3a5f]" /> : <Truck className="w-4.5 h-4.5 text-[#1e3a5f]" />}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900 text-sm truncate">{t('onb.title')}</h3>
            <p className="text-xs text-slate-500 truncate">
              {allDone ? t('onb.done_all') : t('onb.progress').replace('{done}', String(done)).replace('{total}', String(total))}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setCollapsed(c => !c)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500" title={collapsed ? t('onb.show') : t('onb.hide')}>
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          <button onClick={hide} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400" title={t('onb.hide')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="h-1.5 bg-slate-100">
        <div
          className="h-full bg-gradient-to-r from-[#1e3a5f] to-[#f59e0b] transition-all duration-500"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>

      {!collapsed && !allDone && (
        <ul className="divide-y divide-slate-100">
          {pendingSteps.map(step => {
            const Icon = step.icon
            return (
              <li key={step.key} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-slate-100 text-slate-400">
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate text-slate-900">{step.label}</p>
                  <p className="text-xs text-slate-500 truncate">{step.desc}</p>
                </div>
                <button
                  onClick={() => startTour(step.tourId)}
                  className="text-xs px-3 py-1.5 bg-[#1e3a5f] text-white rounded-lg font-medium hover:bg-[#152a45] transition flex-shrink-0"
                >
                  {t('onb.go')}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default OnboardingChecklist

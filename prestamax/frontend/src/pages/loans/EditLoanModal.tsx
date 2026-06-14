import React, { useState, useEffect } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { X, AlertTriangle, Settings, Calendar, Percent, RefreshCw, ShieldOff } from 'lucide-react'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import { AMORTIZATION_TYPES } from '@/lib/amortization'
import { useT } from '@/lib/i18n'

interface EditLoanModalProps {
  loan: any
  onClose: () => void
  onSaved: () => void
}

const FREQ_OPTIONS = [
  { value: 'weekly',     labelKey: 'elm.freq_weekly' },
  { value: 'biweekly',   labelKey: 'elm.freq_biweekly' },
  { value: 'monthly',    labelKey: 'elm.freq_monthly' },
  { value: 'quarterly',  labelKey: 'elm.freq_quarterly' },
]

// AMORT_OPTIONS importado de @/lib/amortization (AMORTIZATION_TYPES)

const RATE_TYPE_OPTIONS = [
  { value: 'monthly',  labelKey: 'elm.rate_monthly' },
  { value: 'annual',   labelKey: 'elm.rate_annual' },
  { value: 'daily',    labelKey: 'elm.rate_daily' },
  { value: 'weekly',   labelKey: 'elm.rate_weekly' },
  { value: 'biweekly', labelKey: 'elm.rate_biweekly' },
]

type Tab = 'terminos' | 'fechas' | 'mora' | 'otros'

const EditLoanModal: React.FC<EditLoanModalProps> = ({ loan, onClose, onSaved }) => {
  const t = useT()
  const isDisbursed = ['active', 'in_mora', 'disbursed', 'restructured', 'liquidated'].includes(loan.status)
  const [activeTab, setActiveTab] = useState<Tab>('terminos')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [collectors, setCollectors] = useState<any[]>([])

  // Form state — pre-populate from loan
  const [form, setForm] = useState({
    // Términos
    requestedAmount:   String(loan.requestedAmount   ?? loan.requested_amount   ?? ''),
    approvedAmount:    String(loan.approvedAmount    ?? loan.approved_amount    ?? ''),
    rate:              String(loan.rate              ?? ''),
    rateType:          loan.rateType                ?? loan.rate_type          ?? 'monthly',
    term:              String(loan.term              ?? ''),
    termUnit:          loan.termUnit                ?? loan.term_unit          ?? 'months',
    paymentFrequency:  loan.paymentFrequency        ?? loan.payment_frequency  ?? 'monthly',
    amortizationType:  loan.amortizationType        ?? loan.amortization_type  ?? 'fixed_installment',
    // Fechas
    applicationDate:   (loan.applicationDate  ?? loan.application_date  ?? '').split('T')[0],
    approvalDate:      (loan.approvalDate     ?? loan.approval_date     ?? '').split('T')[0],
    disbursementDate:  (loan.disbursementDate ?? loan.disbursement_date ?? '').split('T')[0],
    firstPaymentDate:  (loan.firstPaymentDate ?? loan.first_payment_date ?? '').split('T')[0],
    maturityDate:      (loan.maturityDate     ?? loan.maturity_date     ?? '').split('T')[0],
    // Mora
    moraRateDaily:     String(((loan.moraRateDaily ?? loan.mora_rate_daily ?? 0.001) * 100).toFixed(4)),
    moraGraceDays:     String(loan.moraGraceDays  ?? loan.mora_grace_days ?? 3),
    moraBase:          loan.moraBase ?? loan.mora_base ?? 'cuota_vencida',
    moraFixedEnabled:  String((loan.moraFixedEnabled ?? loan.mora_fixed_enabled ?? 0) ? 1 : 0),
    moraFixedAmount:   String(loan.moraFixedAmount ?? loan.mora_fixed_amount ?? 0),
    moraStartDate:     (loan.moraStartDate ?? loan.mora_start_date ?? '').toString().split('T')[0],
    // Otros
    collectorId:       loan.collectorId ?? loan.collector_id ?? '',
    purpose:           loan.purpose ?? '',
    notes:             loan.notes   ?? '',
    prorrogaFee:       String(loan.prorrogaFee ?? loan.prorroga_fee ?? 0),
  })

  const set = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }))

  useEffect(() => {
    api.get('/settings/users').then(r => {
      const list = Array.isArray(r.data) ? r.data : []
      setCollectors(list.filter((u: any) => u.isActive !== 0 && u.user_active !== 0))
    }).catch(() => {})
  }, [])

  // Detecta si el usuario cambio algun campo del schedule
  const scheduleFieldsChanged = (): boolean => {
    return (
      parseFloat(form.rate) !== (loan.rate ?? 0) ||
      form.rateType !== (loan.rateType ?? loan.rate_type) ||
      parseInt(form.term) !== (loan.term ?? 0) ||
      form.termUnit !== (loan.termUnit ?? loan.term_unit) ||
      form.paymentFrequency !== (loan.paymentFrequency ?? loan.payment_frequency) ||
      form.amortizationType !== (loan.amortizationType ?? loan.amortization_type)
    )
  }

  const handleSave = async () => {
    // Confirmacion extra si vamos a reestructurar un prestamo activo
    if (isDisbursed && scheduleFieldsChanged()) {
      const ok = window.confirm(t('elm.restructure_confirm'))
      if (!ok) return
    }
    setIsSubmitting(true)
    try {
      const payload: Record<string, any> = {
        // Términos
        requestedAmount:  parseFloat(form.requestedAmount)  || undefined,
        approvedAmount:   parseFloat(form.approvedAmount)   || undefined,
        rate:             parseFloat(form.rate)             || undefined,
        rateType:         form.rateType,
        term:             parseInt(form.term)               || undefined,
        termUnit:         form.termUnit,
        paymentFrequency: form.paymentFrequency,
        amortizationType: form.amortizationType,
        // Fechas
        applicationDate:  form.applicationDate  || null,
        approvalDate:     form.approvalDate     || null,
        disbursementDate: form.disbursementDate || null,
        firstPaymentDate: form.firstPaymentDate || null,
        maturityDate:     form.maturityDate     || null,
        // Mora
        moraRateDaily:       parseFloat(form.moraRateDaily) / 100,
        moraGraceDays:       parseInt(form.moraGraceDays),
        moraBase:            form.moraBase,
        moraFixedEnabled:    parseInt(form.moraFixedEnabled),
        moraFixedAmount:     parseFloat(form.moraFixedAmount) || 0,
        moraStartDate:       form.moraStartDate || null,
        // Otros
        collectorId:      form.collectorId || null,
        purpose:          form.purpose,
        notes:            form.notes,
        prorrogaFee:      parseFloat(form.prorrogaFee) || 0,
      }
      const res = await api.put(`/loans/${loan.id}`, payload)
      toast.success(t('elm.updated_ok'))
      onSaved()
      onClose()
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setPermissionDenied(true)
      } else {
        toast.error(err?.response?.data?.error || t('elm.update_error'))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'terminos', label: t('elm.tab_terms'),  icon: Percent },
    { id: 'fechas',   label: t('elm.tab_dates'),  icon: Calendar },
    { id: 'mora',     label: t('elm.tab_mora'),   icon: AlertTriangle },
    { id: 'otros',    label: t('elm.tab_other'),  icon: Settings },
  ]

  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1'
  const disabledInputCls = `${inputCls} bg-slate-50 text-slate-400 cursor-not-allowed`

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <Card className="w-full max-w-2xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div>
            <h2 className="section-title flex items-center gap-2">
              <Settings className="w-4 h-4" /> {t('elm.title')}
            </h2>
            <p className="text-xs text-slate-500">{loan.loanNumber ?? loan.loan_number} · {loan.clientName ?? loan.client_name}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Permission denied banner */}
        {permissionDenied && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
            <ShieldOff className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-800 text-sm">{t('elm.access_denied')}</p>
              <p className="text-red-700 text-sm mt-0.5">
                {t('elm.access_denied_desc')}
              </p>
            </div>
          </div>
        )}

        {/* Warning for active loans — reestructuración */}
        {isDisbursed && !permissionDenied && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-semibold">{t('elm.warn_title')}</p>
              <p className="mt-0.5 text-amber-700">
                {t('elm.warn_intro')} <strong>{t('elm.warn_fields')}</strong>{t('elm.warn_the_system')}
              </p>
              <ul className="mt-1 ml-4 list-disc text-amber-700 space-y-0.5">
                <li>{t('elm.warn_li1_a')} <strong>{t('elm.warn_li1_b')}</strong> {t('elm.warn_li1_c')}</li>
                <li>{t('elm.warn_li2_a')} <strong>{t('elm.warn_li2_b')}</strong>.</li>
                <li>{t('elm.warn_li3')}</li>
                <li>{t('elm.warn_li4')}</li>
              </ul>
              <p className="mt-1 text-amber-700">
                {t('elm.warn_footer_a')} <strong>{t('elm.warn_footer_b')}</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Tabs — hidden if permission denied */}
        <div className={`flex gap-1 border-b border-slate-200 mb-4 ${permissionDenied ? 'opacity-40 pointer-events-none' : ''}`}>
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white border border-b-white border-slate-200 text-blue-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab: Términos */}
        {activeTab === 'terminos' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>{t('elm.requested_amount')}</label>
                <input type="number" step="0.01" value={form.requestedAmount} onChange={e => set('requestedAmount', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('elm.approved_amount')}</label>
                <input type="number" step="0.01" value={form.approvedAmount} onChange={e => set('approvedAmount', e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>{t('elm.rate')}</label>
                <input type="number" step="0.01" value={form.rate} onChange={e => set('rate', e.target.value)} className={inputCls} placeholder={t('elm.rate_ph')} />
              </div>
              <div>
                <label className={labelCls}>{t('elm.rate_type')}</label>
                <select value={form.rateType} onChange={e => set('rateType', e.target.value)} className={inputCls}>
                  {RATE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>{t('elm.term')}</label>
                <div className="flex gap-2">
                  <input type="number" value={form.term} onChange={e => set('term', e.target.value)} className={`${inputCls} flex-1`} placeholder="12" />
                  <select value={form.termUnit} onChange={e => {
                      const u = e.target.value
                      const freqMap: Record<string, string> = { months: 'monthly', biweekly: 'biweekly', weeks: 'weekly', days: 'daily' }
                      set('termUnit', u)
                      if (freqMap[u]) set('paymentFrequency', freqMap[u])
                    }} className={`${inputCls} w-auto`}>
                    <option value="months">{t('elm.u_months')}</option>
                    <option value="biweekly">{t('elm.u_biweekly')}</option>
                    <option value="weeks">{t('elm.u_weeks')}</option>
                    <option value="days">{t('elm.u_days')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>{t('elm.pay_freq')}</label>
                <select value={form.paymentFrequency} onChange={e => set('paymentFrequency', e.target.value)} className={inputCls}>
                  {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>{t('elm.amort_type')}</label>
              <select value={form.amortizationType} onChange={e => set('amortizationType', e.target.value)} className={inputCls}>
                {AMORTIZATION_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {!isDisbursed && (
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                <RefreshCw className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-blue-600" />
                <p>{t('elm.schedule_regen')}</p>
              </div>
            )}
          </div>
        )}

        {/* Tab: Fechas */}
        {activeTab === 'fechas' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">{t('elm.dates_intro')}</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>{t('elm.application_date')}</label>
                <input type="date" value={form.applicationDate} onChange={e => set('applicationDate', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('elm.approval_date')}</label>
                <input type="date" value={form.approvalDate} onChange={e => set('approvalDate', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('elm.disbursement_date')}</label>
                <input type="date" value={form.disbursementDate} onChange={e => set('disbursementDate', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('elm.first_payment_date')}</label>
                <input type="date" value={form.firstPaymentDate} onChange={e => set('firstPaymentDate', e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>{t('elm.maturity_date')}</label>
                <input type="date" value={form.maturityDate} onChange={e => set('maturityDate', e.target.value)} className={inputCls} />
                <p className="text-xs text-slate-400 mt-1">{t('elm.maturity_hint')}</p>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Mora */}
        {activeTab === 'mora' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">{t('elm.mora_intro')}</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>{t('elm.mora_rate')}</label>
                <input
                  type="number" step="0.0001" min="0" max="10"
                  value={form.moraRateDaily}
                  onChange={e => set('moraRateDaily', e.target.value)}
                  className={inputCls}
                  placeholder="0.1000"
                />
                <p className="text-xs text-slate-400 mt-1">
                  {t('elm.mora_rate_hint').replace('{d}', form.moraRateDaily).replace('{m}', (parseFloat(form.moraRateDaily || '0') * 30).toFixed(2))}
                </p>
              </div>
              <div>
                <label className={labelCls}>{t('elm.grace_days')}</label>
                <input
                  type="number" step="1" min="0"
                  value={form.moraGraceDays}
                  onChange={e => set('moraGraceDays', e.target.value)}
                  className={inputCls}
                  placeholder="3"
                />
                <p className="text-xs text-slate-400 mt-1">
                  {t('elm.grace_hint')}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>{t('elm.mora_base')}</label>
                <select value={form.moraBase} onChange={e => set('moraBase', e.target.value)} className={inputCls}>
                  <option value="cuota_vencida">{t('elm.mora_cuota')}</option>
                  <option value="capital_pendiente">{t('elm.mora_cap_pend')}</option>
                  <option value="capital_vencido">{t('elm.mora_cap_venc')}</option>
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  {t('elm.mora_base_hint')}
                </p>
              </div>
              <div>
                <label className={labelCls}>{t('elm.mora_fixed')}</label>
                <select value={form.moraFixedEnabled} onChange={e => set('moraFixedEnabled', e.target.value)} className={inputCls}>
                  <option value="0">{t('elm.disabled')}</option>
                  <option value="1">{t('elm.enabled')}</option>
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  {t('elm.mora_fixed_hint')}
                </p>
              </div>
            </div>
            {parseInt(form.moraFixedEnabled) === 1 && (
              <div>
                <label className={labelCls}>{t('elm.mora_fixed_amt')}</label>
                <input
                  type="number" step="0.01" min="0"
                  value={form.moraFixedAmount}
                  onChange={e => set('moraFixedAmount', e.target.value)}
                  className={inputCls}
                  placeholder="50.00"
                />
                <p className="text-xs text-slate-400 mt-1">
                  {t('elm.mora_fixed_amt_hint')}
                </p>
              </div>
            )}

            {/* mora_start_date: control para prestamos migrados que estaban al dia */}
            <div className="border-t border-slate-200 pt-4 mt-2">
              <label className={labelCls}>
                {t('elm.mora_from')}
                <span className="text-xs text-slate-400 font-normal ml-1">{t('elm.mora_from_opt')}</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={form.moraStartDate}
                  onChange={e => set('moraStartDate', e.target.value)}
                  className={inputCls + ' flex-1'}
                />
                {form.moraStartDate ? (
                  <button
                    type="button"
                    onClick={() => set('moraStartDate', '')}
                    className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
                  >
                    {t('elm.clear')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => set('moraStartDate', new Date().toISOString().split('T')[0])}
                    className="px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg whitespace-nowrap"
                  >
                    {t('elm.uptodate_today')}
                  </button>
                )}
              </div>
              <div className="mt-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 space-y-1">
                <p><strong>{t('elm.mora_from_when')}</strong> {t('elm.mora_from_when_d')}</p>
                <p>
                  <strong>{t('elm.mora_from_empty')}</strong> {t('elm.mora_from_empty_d')}<br/>
                  <strong>{t('elm.mora_from_set')}</strong> {t('elm.mora_from_set_d')}
                </p>
                <p className="italic">{t('elm.mora_from_tip')}</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-1.5">
              <p className="font-semibold">{t('elm.example_title')}</p>
              <p>{t('elm.example_intro').replace('{n}', String(parseInt(form.moraGraceDays) + 10)).replace('{g}', String(parseInt(form.moraGraceDays)))}</p>
              {parseInt(form.moraFixedEnabled) === 1 ? (
                <p className="font-semibold text-amber-700">
                  {t('elm.example_fixed').replace('{amt}', parseFloat(form.moraFixedAmount || '0').toFixed(2))}
                  <span className="font-normal text-slate-500"> {t('elm.example_fixed_note')}</span>
                </p>
              ) : (
                <p className="font-semibold">
                  {t('elm.example_pct').replace('{base}', form.moraBase === 'cuota_vencida' ? t('elm.base_cuota') : t('elm.base_capital')).replace('{rate}', parseFloat(form.moraRateDaily || '0').toFixed(4))}
                </p>
              )}
              <div className="pt-1.5 border-t border-slate-200 text-slate-500 space-y-0.5">
                <p className="font-semibold text-slate-600">{t('elm.precedence')}</p>
                <p>① <strong>{t('elm.prec1')}</strong> {t('elm.prec1_d')}</p>
                <p>② <strong>{t('elm.prec2')}</strong> {t('elm.prec2_d')}</p>
                <p>③ <strong>{t('elm.prec3')}</strong> {t('elm.prec3_d')}</p>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Otros */}
        {activeTab === 'otros' && (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>{t('elm.collector')}</label>
              <select value={form.collectorId} onChange={e => set('collectorId', e.target.value)} className={inputCls}>
                <option value="">{t('elm.no_collector')}</option>
                {collectors.map((c: any) => (
                  <option key={c.userId ?? c.user_id} value={c.userId ?? c.user_id}>
                    {c.fullName ?? c.full_name ?? c.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t('elm.purpose')}</label>
              <input
                type="text"
                value={form.purpose}
                onChange={e => set('purpose', e.target.value)}
                className={inputCls}
                placeholder={t('elm.purpose_ph')}
              />
            </div>
            <div>
              <label className={labelCls}>{t('elm.notes')}</label>
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                rows={4}
                className={`${inputCls} resize-none`}
                placeholder={t('elm.notes_ph')}
              />
            </div>
            <div>
              <label className={labelCls}>{t('elm.prorroga_fee')}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.prorrogaFee}
                  onChange={e => set('prorrogaFee', e.target.value)}
                  className={`${inputCls} pl-8`}
                  placeholder="0.00"
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {t('elm.prorroga_hint')}
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-2 mt-6 pt-4 border-t border-slate-200">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700"
            onClick={handleSave}
            disabled={isSubmitting || permissionDenied}
          >
            {isSubmitting ? t('elm.saving') : t('elm.save_changes')}
          </Button>
        </div>
      </Card>
    </div>
  )
}

export default EditLoanModal

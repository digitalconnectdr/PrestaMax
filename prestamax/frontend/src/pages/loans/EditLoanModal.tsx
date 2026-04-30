import React, { useState, useEffect } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { X, AlertTriangle, Settings, Calendar, Percent, RefreshCw, ShieldOff } from 'lucide-react'
import api from '@/lib/api'
import toast from 'react-hot-toast'

interface EditLoanModalProps {
  loan: any
  onClose: () => void
  onSaved: () => void
}

const FREQ_OPTIONS = [
  { value: 'weekly',     label: 'Semanal' },
  { value: 'biweekly',   label: 'Quincenal' },
  { value: 'monthly',    label: 'Mensual' },
  { value: 'quarterly',  label: 'Trimestral' },
]

const AMORT_OPTIONS = [
  { value: 'fixed_installment', label: 'Cuota Nivelada' },
  { value: 'flat_interest',     label: 'Interés Plano' },
  { value: 'interest_only',     label: 'Solo Intereses (Réditos)' },
  { value: 'declining_balance', label: 'Saldo Decreciente' },
]

const RATE_TYPE_OPTIONS = [
  { value: 'monthly', label: 'Mensual' },
  { value: 'annual',  label: 'Anual' },
]

type Tab = 'terminos' | 'fechas' | 'mora' | 'otros'

const EditLoanModal: React.FC<EditLoanModalProps> = ({ loan, onClose, onSaved }) => {
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

  const handleSave = async () => {
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
        // Otros
        collectorId:      form.collectorId || null,
        purpose:          form.purpose,
        notes:            form.notes,
        prorrogaFee:      parseFloat(form.prorrogaFee) || 0,
      }
      const res = await api.put(`/loans/${loan.id}`, payload)
      toast.success('Préstamo actualizado correctamente')
      onSaved()
      onClose()
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setPermissionDenied(true)
      } else {
        toast.error(err?.response?.data?.error || 'Error al actualizar préstamo')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'terminos', label: 'Términos',  icon: Percent },
    { id: 'fechas',   label: 'Fechas',    icon: Calendar },
    { id: 'mora',     label: 'Mora',      icon: AlertTriangle },
    { id: 'otros',    label: 'Otros',     icon: Settings },
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
              <Settings className="w-4 h-4" /> Editar Préstamo
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
              <p className="font-semibold text-red-800 text-sm">Acceso denegado</p>
              <p className="text-red-700 text-sm mt-0.5">
                No tienes permisos para editar este préstamo. Comunícate con tu encargado.
              </p>
            </div>
          </div>
        )}

        {/* Warning for active loans */}
        {isDisbursed && !permissionDenied && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-semibold">Préstamo activo — cambios de términos no regeneran el calendario</p>
              <p className="mt-0.5 text-amber-700">Los montos, tasa, plazo y frecuencia se actualizarán en el registro pero <strong>no afectan las cuotas ya generadas</strong>. Usa esta función para corregir datos incorrectos.</p>
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
                <label className={labelCls}>Monto Solicitado</label>
                <input type="number" step="0.01" value={form.requestedAmount} onChange={e => set('requestedAmount', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Monto Aprobado</label>
                <input type="number" step="0.01" value={form.approvedAmount} onChange={e => set('approvedAmount', e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Tasa de Interés (%)</label>
                <input type="number" step="0.01" value={form.rate} onChange={e => set('rate', e.target.value)} className={inputCls} placeholder="Ej. 3 para 3%" />
              </div>
              <div>
                <label className={labelCls}>Tipo de Tasa</label>
                <select value={form.rateType} onChange={e => set('rateType', e.target.value)} className={inputCls}>
                  {RATE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Plazo</label>
                <div className="flex gap-2">
                  <input type="number" value={form.term} onChange={e => set('term', e.target.value)} className={`${inputCls} flex-1`} placeholder="12" />
                  <select value={form.termUnit} onChange={e => set('termUnit', e.target.value)} className={`${inputCls} w-auto`}>
                    <option value="months">Meses</option>
                    <option value="weeks">Semanas</option>
                    <option value="days">Días</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Frecuencia de Pago</label>
                <select value={form.paymentFrequency} onChange={e => set('paymentFrequency', e.target.value)} className={inputCls}>
                  {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Tipo de Amortización</label>
              <select value={form.amortizationType} onChange={e => set('amortizationType', e.target.value)} className={inputCls}>
                {AMORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {!isDisbursed && (
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                <RefreshCw className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-blue-600" />
                <p>El calendario de pagos se regenerará automáticamente al guardar (si hay fecha de primer pago configurada).</p>
              </div>
            )}
          </div>
        )}

        {/* Tab: Fechas */}
        {activeTab === 'fechas' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">Correcciones de fechas en el registro del préstamo.</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Fecha de Solicitud</label>
                <input type="date" value={form.applicationDate} onChange={e => set('applicationDate', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Fecha de Aprobación</label>
                <input type="date" value={form.approvalDate} onChange={e => set('approvalDate', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Fecha de Desembolso</label>
                <input type="date" value={form.disbursementDate} onChange={e => set('disbursementDate', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Fecha del Primer Pago</label>
                <input type="date" value={form.firstPaymentDate} onChange={e => set('firstPaymentDate', e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Fecha de Vencimiento (Maturity)</label>
                <input type="date" value={form.maturityDate} onChange={e => set('maturityDate', e.target.value)} className={inputCls} />
                <p className="text-xs text-slate-400 mt-1">Útil para extender el plazo del préstamo manualmente.</p>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Mora */}
        {activeTab === 'mora' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">Configura los parámetros de mora para este préstamo específico.</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Tasa de Mora Diaria (%)</label>
                <input
                  type="number" step="0.0001" min="0" max="10"
                  value={form.moraRateDaily}
                  onChange={e => set('moraRateDaily', e.target.value)}
                  className={inputCls}
                  placeholder="0.1000"
                />
                <p className="text-xs text-slate-400 mt-1">
                  {form.moraRateDaily}% diario ≈ {(parseFloat(form.moraRateDaily || '0') * 30).toFixed(2)}% mensual
                </p>
              </div>
              <div>
                <label className={labelCls}>Días de Gracia</label>
                <input
                  type="number" step="1" min="0"
                  value={form.moraGraceDays}
                  onChange={e => set('moraGraceDays', e.target.value)}
                  className={inputCls}
                  placeholder="3"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Días después del vencimiento antes de aplicar mora.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Base de Cálculo de Mora</label>
                <select value={form.moraBase} onChange={e => set('moraBase', e.target.value)} className={inputCls}>
                  <option value="cuota_vencida">Cuota Vencida (capital + interés)</option>
                  <option value="capital_pendiente">Capital Pendiente</option>
                  <option value="capital_vencido">Capital Vencido</option>
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  Monto sobre el cual se calcula el porcentaje de mora.
                </p>
              </div>
              <div>
                <label className={labelCls}>Cargo de Mora Fijo</label>
                <select value={form.moraFixedEnabled} onChange={e => set('moraFixedEnabled', e.target.value)} className={inputCls}>
                  <option value="0">Deshabilitado</option>
                  <option value="1">Habilitado</option>
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  Cargo fijo por cada cuota vencida. Cuando está habilitado, <strong>reemplaza</strong> la tasa porcentual.
                </p>
              </div>
            </div>
            {parseInt(form.moraFixedEnabled) === 1 && (
              <div>
                <label className={labelCls}>Monto Fijo de Mora (por cuota vencida)</label>
                <input
                  type="number" step="0.01" min="0"
                  value={form.moraFixedAmount}
                  onChange={e => set('moraFixedAmount', e.target.value)}
                  className={inputCls}
                  placeholder="50.00"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Se suma al cargo porcentual por cada cuota que esté vencida.
                </p>
              </div>
            )}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-1.5">
              <p className="font-semibold">Ejemplo con los valores actuales:</p>
              <p>Si una cuota vence y el cliente paga {parseInt(form.moraGraceDays) + 10} días después ({parseInt(form.moraGraceDays)} gracia + 10 días de mora):</p>
              {parseInt(form.moraFixedEnabled) === 1 ? (
                <p className="font-semibold text-amber-700">
                  Mora = RD${parseFloat(form.moraFixedAmount || '0').toFixed(2)} fijo por cuota vencida
                  <span className="font-normal text-slate-500"> (la tasa % queda inactiva)</span>
                </p>
              ) : (
                <p className="font-semibold">
                  Mora = Base ({form.moraBase === 'cuota_vencida' ? 'cuota vencida' : 'capital pendiente'}) × {parseFloat(form.moraRateDaily || '0').toFixed(4)}% × 10 días
                </p>
              )}
              <div className="pt-1.5 border-t border-slate-200 text-slate-500 space-y-0.5">
                <p className="font-semibold text-slate-600">Reglas de precedencia:</p>
                <p>① <strong>Cargo fijo habilitado</strong> → anula la tasa % de este préstamo y la configuración global.</p>
                <p>② <strong>Tasa % por préstamo</strong> → anula la tasa % configurada a nivel global.</p>
                <p>③ <strong>Sin configuración por préstamo</strong> → se aplica la tasa global de Configuración → General.</p>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Otros */}
        {activeTab === 'otros' && (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Cobrador Asignado</label>
              <select value={form.collectorId} onChange={e => set('collectorId', e.target.value)} className={inputCls}>
                <option value="">— Sin cobrador asignado —</option>
                {collectors.map((c: any) => (
                  <option key={c.userId ?? c.user_id} value={c.userId ?? c.user_id}>
                    {c.fullName ?? c.full_name ?? c.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Propósito del Préstamo</label>
              <input
                type="text"
                value={form.purpose}
                onChange={e => set('purpose', e.target.value)}
                className={inputCls}
                placeholder="Ej. Capital de trabajo, Consumo personal..."
              />
            </div>
            <div>
              <label className={labelCls}>Notas Internas</label>
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                rows={4}
                className={`${inputCls} resize-none`}
                placeholder="Notas internas sobre el préstamo..."
              />
            </div>
            <div>
              <label className={labelCls}>Cargo de Pr&#xF3;rroga</label>
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
                Cargo fijo para extender el vencimiento de una cuota un per&#xED;odo. Dejar en 0 para deshabilitar la opci&#xF3;n de pr&#xF3;rroga.
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-2 mt-6 pt-4 border-t border-slate-200">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700"
            onClick={handleSave}
            disabled={isSubmitting || permissionDenied}
          >
            {isSubmitting ? 'Guardando...' : '✓ Guardar Cambios'}
          </Button>
        </div>
      </Card>
    </div>
  )
}

export default EditLoanModal

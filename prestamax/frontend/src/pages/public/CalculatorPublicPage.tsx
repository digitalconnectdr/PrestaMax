// CalculatorPublicPage — /calculadora-prestamos. Herramienta SEO pública, sin
// registro. Reutiliza EXACTAMENTE el motor de cálculo real de CredyTek
// (lib/loanMath.ts — el mismo port usado por LoanCreatePage y la calculadora
// interna) en vez de reimplementar otra fórmula.
import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Calculator, ArrowRight, RefreshCw } from 'lucide-react'
import PublicShell from '@/components/public/PublicShell'
import SeoHead from '@/components/public/SeoHead'
import { generateSchedule, type ScheduleRow } from '@/lib/loanMath'
import { AMORTIZATION_TYPES, DEFAULT_AMORTIZATION } from '@/lib/amortization'
import { formatCurrency, SUPPORTED_CURRENCIES } from '@/lib/utils'
import { trackCalculatorUsed, trackSeoCtaClick } from '@/lib/analytics'

interface Result {
  schedule: ScheduleRow[]
  totalPayment: number
  totalInterest: number
}

const FREQ_LABEL: Record<string, string> = { monthly: 'Mensual', biweekly: 'Quincenal', weekly: 'Semanal', daily: 'Diario' }
const TERM_UNIT_LABEL: Record<string, string> = { months: 'Meses', biweekly: 'Quincenas', weeks: 'Semanas', days: 'Días' }

const CalculatorPublicPage: React.FC = () => {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    amount: '50000',
    rate: '5',
    rateType: 'monthly',
    term: '12',
    termUnit: 'months',
    freq: 'monthly',
    amortType: DEFAULT_AMORTIZATION as string,
    currency: 'DOP',
  })
  const [result, setResult] = useState<Result | null>(null)

  const calculate = () => {
    const amount = parseFloat(form.amount)
    const rate = parseFloat(form.rate)
    const term = parseInt(form.term, 10)
    if (!amount || !rate || !term) return
    const schedule = generateSchedule({
      amount, rate, rateType: form.rateType, term, termUnit: form.termUnit,
      freq: form.freq, type: form.amortType, firstDate: new Date(),
    })
    const totalPayment = schedule.reduce((s, i) => s + i.total_amount, 0)
    const totalInterest = schedule.reduce((s, i) => s + i.interest_amount, 0)
    setResult({ schedule, totalPayment: Math.round(totalPayment * 100) / 100, totalInterest: Math.round(totalInterest * 100) / 100 })
    // No se envían monto/tasa/plazo — solo el hecho de que se usó la herramienta.
    trackCalculatorUsed('loan_calculator')
  }

  const goTry = () => {
    trackSeoCtaClick('calculadora-prestamos', 'calculator_result')
    navigate('/register')
  }

  return (
    <PublicShell>
      <SeoHead
        title="Calculadora de préstamos gratis | CredyTek"
        description="Calcula la cuota, el interés total y el plan de pagos de un préstamo. Usa el mismo motor de cálculo real de CredyTek: amortización francesa, cuota fija o solo interés."
        path="/calculadora-prestamos"
      />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs font-medium text-amber-700 mb-4">
            <Calculator className="w-3.5 h-3.5" />
            Herramienta gratuita
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900">Calculadora de préstamos</h1>
          <p className="mt-4 text-lg text-slate-600">
            Calcula la cuota, el interés total y el plan de pagos completo de un préstamo, sin registrarte. Usa el mismo motor de cálculo que usa CredyTek.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Formulario */}
          <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200 p-5 h-fit">
            <h2 className="font-semibold text-slate-900 mb-4">Parámetros del préstamo</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Monto</label>
                <div className="flex gap-2">
                  <select
                    value={form.currency}
                    onChange={e => setForm(p => ({ ...p, currency: e.target.value }))}
                    className="px-2 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  >
                    {SUPPORTED_CURRENCIES.slice(0, 6).map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </select>
                  <input
                    type="number" step="0.01" value={form.amount}
                    onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tasa de interés (%)</label>
                <div className="flex gap-2">
                  <input
                    type="number" step="0.01" value={form.rate}
                    onChange={e => setForm(p => ({ ...p, rate: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  />
                  <select
                    value={form.rateType}
                    onChange={e => setForm(p => ({ ...p, rateType: e.target.value }))}
                    className="px-2 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  >
                    <option value="monthly">Mensual</option>
                    <option value="annual">Anual</option>
                    <option value="weekly">Semanal</option>
                    <option value="daily">Diaria</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Plazo</label>
                  <input
                    type="number" value={form.term}
                    onChange={e => setForm(p => ({ ...p, term: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Unidad</label>
                  <select
                    value={form.termUnit}
                    onChange={e => {
                      const u = e.target.value
                      const map: Record<string, string> = { months: 'monthly', weeks: 'weekly', days: 'daily' }
                      setForm(p => ({ ...p, termUnit: u, freq: map[u] || p.freq }))
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  >
                    <option value="months">Meses</option>
                    <option value="weeks">Semanas</option>
                    <option value="days">Días</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Frecuencia de pago</label>
                <select
                  value={form.freq}
                  onChange={e => setForm(p => ({ ...p, freq: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                >
                  <option value="monthly">Mensual</option>
                  <option value="biweekly">Quincenal</option>
                  <option value="weekly">Semanal</option>
                  <option value="daily">Diario</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de amortización</label>
                <select
                  value={form.amortType}
                  onChange={e => setForm(p => ({ ...p, amortType: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                >
                  {AMORTIZATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <button
                type="button"
                onClick={calculate}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1e3a5f] text-white text-sm font-medium rounded-lg hover:bg-[#152a45] transition mt-2"
              >
                <RefreshCw className="w-4 h-4" /> Calcular
              </button>
            </div>
          </div>

          {/* Resultado */}
          <div className="lg:col-span-2 space-y-4">
            {result ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                    <p className="text-xs text-slate-500 uppercase font-medium">Cuota</p>
                    <p className="text-xl font-bold text-[#1e3a5f]">{formatCurrency(result.schedule[0]?.total_amount || 0, form.currency)}</p>
                    <p className="text-xs text-slate-400">{FREQ_LABEL[form.freq]}</p>
                  </div>
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <p className="text-xs text-slate-500 uppercase font-medium">Total a pagar</p>
                    <p className="text-xl font-bold text-emerald-700">{formatCurrency(result.totalPayment, form.currency)}</p>
                    <p className="text-xs text-slate-400">{result.schedule.length} cuotas</p>
                  </div>
                </div>

                {/* CTA contextual — exacto según el pedido */}
                <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl text-center">
                  <p className="font-medium text-slate-800">¿Administras varios préstamos?</p>
                  <p className="text-sm text-slate-600 mt-0.5">Organízalos con CredyTek.</p>
                  <button
                    type="button"
                    onClick={goTry}
                    className="mt-3 inline-flex items-center gap-2 px-5 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded-lg hover:bg-[#152a45] transition"
                  >
                    Probar CredyTek
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-800 mb-3">Plan de pagos</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left">
                          <th className="py-2 px-2 font-semibold text-slate-600 text-right">#</th>
                          <th className="py-2 px-2 font-semibold text-slate-600">Vence</th>
                          <th className="py-2 px-2 font-semibold text-slate-600 text-right">Cuota</th>
                          <th className="py-2 px-2 font-semibold text-slate-600 text-right">Capital</th>
                          <th className="py-2 px-2 font-semibold text-slate-600 text-right">Interés</th>
                          <th className="py-2 px-2 font-semibold text-slate-600 text-right">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.schedule.map(row => (
                          <tr key={row.installment_number} className="border-b border-slate-50">
                            <td className="py-1.5 px-2 text-right text-slate-400 font-mono text-xs">{row.installment_number}</td>
                            <td className="py-1.5 px-2 text-slate-600">{row.due_date.slice(0, 10)}</td>
                            <td className="py-1.5 px-2 text-right font-medium text-slate-800">{formatCurrency(row.total_amount, form.currency)}</td>
                            <td className="py-1.5 px-2 text-right text-[#1e3a5f]">{formatCurrency(row.principal_amount, form.currency)}</td>
                            <td className="py-1.5 px-2 text-right text-amber-600">{formatCurrency(row.interest_amount, form.currency)}</td>
                            <td className="py-1.5 px-2 text-right text-slate-500 font-mono text-xs">{formatCurrency(row.balance, form.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <Calculator className="w-10 h-10 text-slate-300 mb-3" />
                <p className="text-slate-500 font-medium">Completa los datos y presiona Calcular</p>
                <p className="text-slate-400 text-sm mt-1">El plan de pagos aparecerá aquí</p>
              </div>
            )}
          </div>
        </div>

        <p className="mt-8 text-center text-sm">
          <Link to="/recursos" className="text-[#1e3a5f] hover:underline font-medium">Ver guías de administración de préstamos →</Link>
        </p>
      </div>
    </PublicShell>
  )
}

export default CalculatorPublicPage

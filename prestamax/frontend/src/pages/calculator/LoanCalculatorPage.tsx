import React, { useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Calculator, MessageCircle, Download, RefreshCw } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { usePermission } from '@/hooks/usePermission'

interface Installment {
  num: number
  dueDate: string
  payment: number
  principal: number
  interest: number
  balance: number
}

interface CalcResult {
  installments: Installment[]
  totalPayment: number
  totalInterest: number
  totalPrincipal: number
  monthlyPayment: number
}

function addFreqMonths(date: Date, freq: string, n: number): Date {
  const d = new Date(date)
  if (freq === 'monthly') d.setMonth(d.getMonth() + n)
  else if (freq === 'biweekly') d.setDate(d.getDate() + n * 15) // 15 days = backend standard
  else if (freq === 'weekly') d.setDate(d.getDate() + n * 7)
  else if (freq === 'daily') d.setDate(d.getDate() + n)
  return d
}

function calcSchedule(
  amount: number,
  rate: number,       // monthly % (always entered as monthly in the calculator)
  term: number,
  termUnit: string,   // months | weeks | days
  freq: string,       // monthly | biweekly | weekly | daily
  amortType: string,  // fixed_installment | interest_only | flat_interest
  firstDate: Date
): Installment[] {
  const r = rate / 100  // monthly rate as decimal
  // Convert term to number of payments based on frequency
  let nPay = term
  if (termUnit === 'months') {
    if (freq === 'biweekly') nPay = term * 2
    else if (freq === 'weekly') nPay = term * 4
    else if (freq === 'daily') nPay = term * 30
  } else if (termUnit === 'weeks') {
    if (freq === 'monthly') nPay = Math.ceil(term / 4)
    else if (freq === 'biweekly') nPay = Math.ceil(term / 2)
    else if (freq === 'weekly') nPay = term
    else if (freq === 'daily') nPay = term * 7
  } else if (termUnit === 'days') {
    if (freq === 'monthly') nPay = Math.ceil(term / 30)
    else if (freq === 'biweekly') nPay = Math.ceil(term / 15)
    else if (freq === 'weekly') nPay = Math.ceil(term / 7)
    else if (freq === 'daily') nPay = term
  }
  nPay = Math.max(1, nPay)

  // Convert monthly rate to per-period rate
  const rPeriod = freq === 'biweekly' ? r / 2 : freq === 'weekly' ? r / 4 : freq === 'daily' ? r / 30 : r

  const installments: Installment[] = []
  let balance = amount

  if (amortType === 'flat_interest') {
    // Flat interest: total interest = principal × monthly_rate × term_in_months
    const termInMonths = termUnit === 'months' ? term : termUnit === 'weeks' ? term / 4 : term / 30
    const totalInterest = amount * r * termInMonths
    const totalPayable = amount + totalInterest
    const payment = totalPayable / nPay
    const principalPay = amount / nPay
    const interestPay = totalInterest / nPay
    for (let i = 1; i <= nPay; i++) {
      balance -= principalPay
      installments.push({
        num: i,
        dueDate: addFreqMonths(firstDate, freq, i - 1).toLocaleDateString('es-DO'),
        payment,
        principal: principalPay,
        interest: interestPay,
        balance: Math.max(0, balance),
      })
    }
  } else if (amortType === 'interest_only') {
    // Interest-only: each period pays rPeriod × principal; last period also pays full principal
    const interestPay = Math.round(amount * rPeriod * 100) / 100
    for (let i = 1; i <= nPay; i++) {
      const isLast = i === nPay
      const principalPay = isLast ? amount : 0
      installments.push({
        num: i,
        dueDate: addFreqMonths(firstDate, freq, i - 1).toLocaleDateString('es-DO'),
        payment: interestPay + principalPay,
        principal: principalPay,
        interest: interestPay,
        balance: isLast ? 0 : amount,
      })
    }
  } else {
    // fixed_installment (French / reducing-balance amortization)
    let fixedPayment: number
    if (rPeriod === 0) {
      fixedPayment = amount / nPay
    } else {
      fixedPayment = amount * (rPeriod * Math.pow(1 + rPeriod, nPay)) / (Math.pow(1 + rPeriod, nPay) - 1)
    }
    fixedPayment = Math.round(fixedPayment * 100) / 100

    for (let i = 1; i <= nPay; i++) {
      const interestPay = Math.round(balance * rPeriod * 100) / 100
      let principalPay = Math.round((fixedPayment - interestPay) * 100) / 100
      const isLast = i === nPay
      if (isLast) principalPay = balance
      balance = Math.max(0, Math.round((balance - principalPay) * 100) / 100)
      installments.push({
        num: i,
        dueDate: addFreqMonths(firstDate, freq, i - 1).toLocaleDateString('es-DO'),
        payment: interestPay + principalPay,
        principal: principalPay,
        interest: interestPay,
        balance,
      })
    }
  }
  return installments
}

const FREQ_LABEL: Record<string, string> = { monthly: 'Mensual', biweekly: 'Quincenal', weekly: 'Semanal', daily: 'Diario' }
const AMORT_LABEL: Record<string, string> = { fixed_installment: 'Cuota Fija', interest_only: 'Solo Interés', flat_interest: 'Interés Plano' }

const LoanCalculatorPage: React.FC = () => {
  // ── All hooks must be called before any conditional return ────────────────
  const { can } = usePermission()
  const [form, setForm] = useState({
    amount: '',
    rate: '',
    term: '',
    termUnit: 'months',
    freq: 'monthly',
    amortType: 'fixed_installment',
    firstDate: new Date().toISOString().split('T')[0],
  })
  const [result, setResult] = useState<CalcResult | null>(null)

  // useCallback must be declared before the permission guard (Rules of Hooks)
  const calculate = useCallback(() => {
    const amount = parseFloat(form.amount)
    const rate = parseFloat(form.rate)
    const term = parseInt(form.term)
    if (!amount || !rate || !term) return

    const firstDate = new Date(form.firstDate + 'T12:00:00')
    const installments = calcSchedule(amount, rate, term, form.termUnit, form.freq, form.amortType, firstDate)
    const totalPayment = installments.reduce((s, i) => s + i.payment, 0)
    const totalInterest = installments.reduce((s, i) => s + i.interest, 0)

    setResult({
      installments,
      totalPayment: Math.round(totalPayment * 100) / 100,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalPrincipal: amount,
      monthlyPayment: installments[0]?.payment || 0,
    })
  }, [form])

  // Permission guard — all hooks declared above, safe to return early now
  if (!can('calculator.use')) return <Navigate to="/dashboard" replace />

  const buildWhatsAppText = () => {
    if (!result) return ''
    const lines = [
      `📊 *SIMULACIÓN DE PRÉSTAMO*`,
      ``,
      `💰 Monto: ${formatCurrency(parseFloat(form.amount))}`,
      `📈 Tasa: ${form.rate}% mensual`,
      `📅 Plazo: ${form.term} ${form.termUnit === 'months' ? 'meses' : form.termUnit === 'weeks' ? 'semanas' : 'días'}`,
      `🔄 Frecuencia: ${FREQ_LABEL[form.freq]}`,
      `📝 Tipo: ${AMORT_LABEL[form.amortType]}`,
      ``,
      `💵 Cuota: ${formatCurrency(result.monthlyPayment)}`,
      `💳 Total a pagar: ${formatCurrency(result.totalPayment)}`,
      `🏦 Total intereses: ${formatCurrency(result.totalInterest)}`,
      ``,
      `_Simulación generada por PrestaMax_`,
    ]
    return encodeURIComponent(lines.join('\n'))
  }

  const exportCSV = () => {
    if (!result) return
    const rows = [
      ['#', 'Fecha', 'Cuota', 'Capital', 'Interés', 'Saldo'].join(','),
      ...result.installments.map(i =>
        [i.num, i.dueDate, i.payment.toFixed(2), i.principal.toFixed(2), i.interest.toFixed(2), i.balance.toFixed(2)].join(',')
      ),
      '',
      ['', 'TOTALES', result.totalPayment.toFixed(2), result.totalPrincipal.toFixed(2), result.totalInterest.toFixed(2), ''].join(','),
    ].join('\n')
    const blob = new Blob([rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'simulacion-prestamo.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2"><Calculator className="w-6 h-6"/>Calculadora de Préstamos</h1>
        <p className="text-slate-600 text-sm mt-1">Simula cuotas, intereses y plan de pagos antes de crear un préstamo</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <Card className="lg:col-span-1">
          <h3 className="section-title mb-4">Parámetros</h3>
          <div className="space-y-3">
            <Input label="Monto del Préstamo *" type="number" step="0.01" value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="50,000.00" />
            <Input label="Tasa de Interés Mensual (%) *" type="number" step="0.01" value={form.rate}
              onChange={e => setForm(p => ({ ...p, rate: e.target.value }))} placeholder="5.00" />
            <div className="grid grid-cols-2 gap-2">
              <Input label="Plazo *" type="number" value={form.term}
                onChange={e => setForm(p => ({ ...p, term: e.target.value }))} placeholder="12" />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Unidad</label>
                <select value={form.termUnit} onChange={e => setForm(p => ({ ...p, termUnit: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="months">Meses</option>
                  <option value="weeks">Semanas</option>
                  <option value="days">Días</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Frecuencia de Pago</label>
              <select value={form.freq} onChange={e => setForm(p => ({ ...p, freq: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="monthly">Mensual</option>
                <option value="biweekly">Quincenal</option>
                <option value="weekly">Semanal</option>
                <option value="daily">Diario</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Amortización</label>
              <select value={form.amortType} onChange={e => setForm(p => ({ ...p, amortType: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="fixed_installment">Cuota Fija</option>
                <option value="interest_only">Solo Interés</option>
                <option value="flat_interest">Interés Plano</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fecha Primer Pago</label>
              <input type="date" value={form.firstDate} onChange={e => setForm(p => ({ ...p, firstDate: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <Button onClick={calculate} className="w-full flex items-center justify-center gap-2 mt-2">
              <RefreshCw className="w-4 h-4"/>Calcular
            </Button>
          </div>
        </Card>

        {/* Results */}
        <div className="lg:col-span-2 space-y-4">
          {result ? (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="p-3 bg-blue-50 border-blue-200">
                  <p className="text-xs text-slate-500 uppercase font-medium">Cuota</p>
                  <p className="text-lg font-bold text-blue-700">{formatCurrency(result.monthlyPayment)}</p>
                  <p className="text-xs text-slate-400">{FREQ_LABEL[form.freq]}</p>
                </Card>
                <Card className="p-3 bg-emerald-50 border-emerald-200">
                  <p className="text-xs text-slate-500 uppercase font-medium">Total a Pagar</p>
                  <p className="text-lg font-bold text-emerald-700">{formatCurrency(result.totalPayment)}</p>
                  <p className="text-xs text-slate-400">{result.installments.length} cuotas</p>
                </Card>
                <Card className="p-3 bg-amber-50 border-amber-200">
                  <p className="text-xs text-slate-500 uppercase font-medium">Total Interés</p>
                  <p className="text-lg font-bold text-amber-700">{formatCurrency(result.totalInterest)}</p>
                  <p className="text-xs text-slate-400">{((result.totalInterest / result.totalPrincipal) * 100).toFixed(1)}% del capital</p>
                </Card>
                <Card className="p-3 bg-slate-50">
                  <p className="text-xs text-slate-500 uppercase font-medium">Capital</p>
                  <p className="text-lg font-bold text-slate-700">{formatCurrency(result.totalPrincipal)}</p>
                  <p className="text-xs text-slate-400">{AMORT_LABEL[form.amortType]}</p>
                </Card>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <a href={`https://wa.me/?text=${buildWhatsAppText()}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
                  <MessageCircle className="w-4 h-4"/>Compartir por WhatsApp
                </a>
                <button onClick={exportCSV}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">
                  <Download className="w-4 h-4"/>Exportar CSV
                </button>
              </div>

              {/* Schedule table */}
              <Card>
                <h4 className="font-semibold text-slate-700 mb-3">Plan de Pagos</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-right py-2 px-3 font-semibold text-slate-700">#</th>
                        <th className="text-left py-2 px-3 font-semibold text-slate-700">Vence</th>
                        <th className="text-right py-2 px-3 font-semibold text-slate-700">Cuota</th>
                        <th className="text-right py-2 px-3 font-semibold text-slate-700">Capital</th>
                        <th className="text-right py-2 px-3 font-semibold text-slate-700">Interés</th>
                        <th className="text-right py-2 px-3 font-semibold text-slate-700">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.installments.map(inst => (
                        <tr key={inst.num} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-2 px-3 text-right text-slate-400 font-mono text-xs">{inst.num}</td>
                          <td className="py-2 px-3 text-slate-600">{inst.dueDate}</td>
                          <td className="py-2 px-3 text-right font-semibold text-slate-800">{formatCurrency(inst.payment)}</td>
                          <td className="py-2 px-3 text-right text-blue-700">{formatCurrency(inst.principal)}</td>
                          <td className="py-2 px-3 text-right text-amber-600">{formatCurrency(inst.interest)}</td>
                          <td className="py-2 px-3 text-right text-slate-500 font-mono text-xs">{formatCurrency(inst.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50">
                        <td colSpan={2} className="py-2 px-3 font-bold text-slate-700">TOTALES</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-800">{formatCurrency(result.totalPayment)}</td>
                        <td className="py-2 px-3 text-right font-bold text-blue-700">{formatCurrency(result.totalPrincipal)}</td>
                        <td className="py-2 px-3 text-right font-bold text-amber-600">{formatCurrency(result.totalInterest)}</td>
                        <td className="py-2 px-3"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Calculator className="w-12 h-12 text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">Ingresa los datos y presiona Calcular</p>
              <p className="text-slate-400 text-sm mt-1">El plan de pagos aparecera aqui</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default LoanCalculatorPage

import React, { useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useContext } from 'react'
import { TenantContext } from '@/contexts/TenantContext'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Calculator, MessageCircle, Download, RefreshCw, Percent, DollarSign } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import api from '@/lib/api'
import { usePermission } from '@/hooks/usePermission'
import { AMORTIZATION_TYPES, AMORT_LABELS, DEFAULT_AMORTIZATION } from '@/lib/amortization'
import AmortizationHelpModal from '@/components/shared/AmortizationHelpModal'
import { HelpCircle } from 'lucide-react'

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
  computedRate: number   // Tasa mensual (%) usada para el calculo
}

function addFreqMonths(date: Date, freq: string, n: number): Date {
  const d = new Date(date)
  if (freq === 'monthly') d.setMonth(d.getMonth() + n)
  else if (freq === 'biweekly') d.setDate(d.getDate() + n * 15) // 15 dias = standard
  else if (freq === 'weekly') d.setDate(d.getDate() + n * 7)
  else if (freq === 'daily') d.setDate(d.getDate() + n)
  return d
}

// Periodos por mes segun la frecuencia (factor k para convertir tasa mensual)
function periodsPerMonth(freq: string): number {
  if (freq === 'biweekly') return 2
  if (freq === 'weekly') return 4
  if (freq === 'daily') return 30
  return 1 // monthly
}

// Convierte una tasa expresada en `rateType` a su equivalente mensual (en %).
// Util porque calcSchedule espera la tasa mensual.
function rateToMonthly(rate: number, rateType: string): number {
  switch (rateType) {
    case 'daily':    return rate * 30
    case 'weekly':   return rate * 4.33
    case 'biweekly': return rate * 2
    case 'annual':   return rate / 12
    case 'monthly':
    default:         return rate
  }
}

// Convierte una tasa mensual (%) a su equivalente expresado en `rateType`.
function monthlyToRate(monthly: number, rateType: string): number {
  switch (rateType) {
    case 'daily':    return monthly / 30
    case 'weekly':   return monthly / 4.33
    case 'biweekly': return monthly / 2
    case 'annual':   return monthly * 12
    case 'monthly':
    default:         return monthly
  }
}

const RATE_TYPE_LABEL: Record<string, string> = {
  daily: 'Diaria', weekly: 'Semanal', biweekly: 'Quincenal',
  monthly: 'Mensual', annual: 'Anual',
}

// Calcula numero total de pagos basado en termino, unidad y frecuencia
function getNPay(term: number, termUnit: string, freq: string): number {
  let nPay = term
  if (termUnit === 'months') {
    if (freq === 'biweekly') nPay = term * 2
    else if (freq === 'weekly') nPay = term * 4
    else if (freq === 'daily') nPay = term * 30
  } else if (termUnit === 'biweekly') {
    if (freq === 'monthly') nPay = Math.ceil(term / 2)
    else if (freq === 'biweekly') nPay = term
    else if (freq === 'weekly') nPay = Math.ceil(term * 2)
    else if (freq === 'daily') nPay = term * 15
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
  return Math.max(1, nPay)
}

// Convierte termino a meses (para flat_interest)
function getTermInMonths(term: number, termUnit: string): number {
  if (termUnit === 'months') return term
  if (termUnit === 'biweekly') return term / 2
  if (termUnit === 'weeks') return term / 4
  return term / 30 // days
}

// MODO INVERSO: dada una ganancia deseada (en pesos), calcula la tasa mensual (%)
// que produce esa ganancia total en intereses para el plan especificado.
function findRateFromProfit(
  amount: number,
  profit: number,
  term: number,
  termUnit: string,
  freq: string,
  amortType: string,
): number {
  if (amount <= 0 || profit <= 0 || term <= 0) return 0
  const k = periodsPerMonth(freq)
  const nPay = getNPay(term, termUnit, freq)

  if (amortType === 'flat_interest') {
    // total_interest = amount * r_monthly * term_in_months
    const termInMonths = getTermInMonths(term, termUnit)
    if (termInMonths === 0) return 0
    return (profit / (amount * termInMonths)) * 100
  }

  if (amortType === 'interest_only') {
    // total_interest = nPay * r_period * amount
    // r_period = r_monthly / k
    const rPeriod = profit / (nPay * amount)
    return rPeriod * k * 100
  }

  // fixed_installment: biseccion para encontrar r_period tal que
  //   payment = amount * (r * (1+r)^n) / ((1+r)^n - 1)
  //   total_paid = payment * n
  //   total_interest = total_paid - amount = profit
  let lo = 0
  let hi = 1.0  // 100% por periodo es un techo holgado
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (mid === 0) { lo = 0.0001; continue }
    const payment = amount * (mid * Math.pow(1 + mid, nPay)) / (Math.pow(1 + mid, nPay) - 1)
    const totalInterest = payment * nPay - amount
    if (Math.abs(totalInterest - profit) < 0.01) return mid * k * 100
    if (totalInterest < profit) lo = mid
    else hi = mid
  }
  return ((lo + hi) / 2) * k * 100
}

function calcSchedule(
  amount: number,
  rate: number,       // monthly % (always entered as monthly)
  term: number,
  termUnit: string,   // months | biweekly | weeks | days
  freq: string,       // monthly | biweekly | weekly | daily
  amortType: string,  // fixed_installment | interest_only | flat_interest
  firstDate: Date
): Installment[] {
  const r = rate / 100  // monthly rate as decimal
  const nPay = getNPay(term, termUnit, freq)

  // Convert monthly rate to per-period rate
  const k = periodsPerMonth(freq)
  const rPeriod = r / k

  const installments: Installment[] = []
  let balance = amount

  if (amortType === 'flat_interest') {
    const termInMonths = getTermInMonths(term, termUnit)
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
// AMORT_LABEL movido a @/lib/amortization (AMORT_LABELS)
const TERM_UNIT_LABEL: Record<string, string> = { months: 'meses', biweekly: 'quincenas', weeks: 'semanas', days: 'dias' }

const LoanCalculatorPage: React.FC = () => {
  const { can } = usePermission()
  const { state: authState } = useAuth()
  const { state: tenantState } = useContext(TenantContext)
  const [tenantInfo, setTenantInfo] = useState<any>(null)
  const [mode, setMode] = useState<'rate' | 'profit'>('rate')
  const [form, setForm] = useState({
    amount: '',
    rate: '',
    rateType: 'monthly',  // unidad en la que el usuario expresa la tasa
    profit: '',
    term: '',
    termUnit: 'months',
    freq: 'monthly',
    amortType: DEFAULT_AMORTIZATION,
    firstDate: new Date().toISOString().split('T')[0],
  })
  const [result, setResult] = useState<CalcResult | null>(null)
  const [showAmortHelp, setShowAmortHelp] = useState(false)

  const calculate = useCallback(() => {
    const amount = parseFloat(form.amount)
    const term = parseInt(form.term)
    if (!amount || !term) return

    // Convertir la tasa ingresada (en su unidad) a equivalente mensual,
    // porque calcSchedule y findRateFromProfit operan con tasa mensual.
    let monthlyRate = 0
    if (mode === 'profit') {
      const profit = parseFloat(form.profit)
      if (!profit) return
      // findRateFromProfit retorna la tasa MENSUAL necesaria para esa ganancia
      monthlyRate = findRateFromProfit(amount, profit, term, form.termUnit, form.freq, form.amortType)
    } else {
      const userRate = parseFloat(form.rate)
      if (!userRate) return
      monthlyRate = rateToMonthly(userRate, form.rateType)
    }
    if (!monthlyRate) return

    const firstDate = new Date(form.firstDate + 'T12:00:00')
    const installments = calcSchedule(amount, monthlyRate, term, form.termUnit, form.freq, form.amortType, firstDate)
    const totalPayment = installments.reduce((s, i) => s + i.payment, 0)
    const totalInterest = installments.reduce((s, i) => s + i.interest, 0)

    // Devolver la tasa en la unidad seleccionada por el usuario
    const displayRate = monthlyToRate(monthlyRate, form.rateType)

    setResult({
      installments,
      totalPayment: Math.round(totalPayment * 100) / 100,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalPrincipal: amount,
      monthlyPayment: installments[0]?.payment || 0,
      computedRate: Math.round(displayRate * 100) / 100,
    })
  }, [form, mode])

  if (!can('calculator.use')) return <Navigate to="/dashboard" replace />

  const buildWhatsAppText = (overrideInfo?: any) => {
    if (!result) return ''
    const tenant   = (tenantState.currentTenant as any) || {}
    const user     = (authState.user as any) || {}
    const info     = overrideInfo || tenantInfo || {}
    const tName    = info.name || info.legalName || tenant.tenantName || tenant.name || tenant.legalName || 'Prestamista'
    const tPhone   = info.phone || tenant.tenantPhone || tenant.phone || ''
    const tEmail   = info.email || tenant.tenantEmail || tenant.email || ''
    const officer  = user.fullName || user.full_name || ''
    const dateStr  = new Date().toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' })

    // Fechas claves
    const fmtDate = (d: Date) => d.toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' })
    const firstPay = form.firstDate ? new Date(form.firstDate + 'T12:00:00') : new Date()

    // WhatsApp colapsa lineas vacias consecutivas. Usamos \u200B (zero-width
    // space) como contenido invisible para forzar la linea en blanco visible.
    const BLANK = '\u200B'
    const lines = [
      `🏦 *${tName.toUpperCase()}*`,
      tPhone ? `📞 Tel: ${tPhone}` : null,
      tEmail ? `✉️ ${tEmail}` : null,
      BLANK,
      `*COTIZACIÓN DE PRÉSTAMO*`,
      `📅 Fecha de solicitud: *${dateStr}*`,
      `🗓️ Primer pago: *${fmtDate(firstPay)}*`,
      BLANK,
      `*Condiciones propuestas:*`,
      `• Monto del préstamo: *${formatCurrency(parseFloat(form.amount))}*`,
      `• Plazo: *${form.term} ${TERM_UNIT_LABEL[form.termUnit] || form.termUnit}*`,
      `• Frecuencia de pago: *${FREQ_LABEL[form.freq]}*`,
      BLANK,
      `*Resumen financiero:*`,
      `💰 Cuota: *${formatCurrency(result.monthlyPayment)}*`,
      `📊 Total a pagar: *${formatCurrency(result.totalPayment)}*`,
      BLANK,
      officer ? `Atendido por: *${officer}*` : null,
      BLANK,
      `_Esta es una simulación referencial. Las condiciones finales pueden variar según evaluación crediticia._`,
      BLANK,
      `Para más información, contáctanos.`,
    ].filter(Boolean)
    return encodeURIComponent(lines.join('\n'))
  }

  const exportCSV = () => {
    if (!result) return
    const rows = [
      ['#', 'Fecha', 'Cuota', 'Capital', 'Interes', 'Saldo'].join(','),
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
        <h1 className="page-title flex items-center gap-2"><Calculator className="w-6 h-6"/>Calculadora de Prestamos</h1>
        <p className="text-slate-600 text-sm mt-1">Simula cuotas, intereses y plan de pagos antes de crear un prestamo</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <Card className="lg:col-span-1">
          <h3 className="section-title mb-4">Parametros</h3>

          {/* Toggle de modo */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Modo de calculo</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('rate')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'rate' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              >
                <Percent className="w-4 h-4"/>Por Tasa
              </button>
              <button
                type="button"
                onClick={() => setMode('profit')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'profit' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              >
                <DollarSign className="w-4 h-4"/>Por Ganancia
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              {mode === 'rate'
                ? 'Ingresa la tasa y el sistema calcula las cuotas.'
                : 'Ingresa cuanto quieres ganar y el sistema calcula la tasa necesaria.'}
            </p>
          </div>

          <div className="space-y-3">
            <Input label="Monto del Prestamo *" type="number" step="0.01" value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="50,000.00" />

            {mode === 'rate' ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tasa de Interes (%) *</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={form.rate}
                    onChange={e => setForm(p => ({ ...p, rate: e.target.value }))}
                    placeholder="5.00"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={form.rateType}
                    onChange={e => setForm(p => ({ ...p, rateType: e.target.value }))}
                    className="px-2 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="monthly">Mensual</option>
                    <option value="biweekly">Quincenal</option>
                    <option value="weekly">Semanal</option>
                    <option value="daily">Diaria</option>
                    <option value="annual">Anual</option>
                  </select>
                </div>
              </div>
            ) : (
              <>
                <Input label="Ganancia Deseada (RD$) *" type="number" step="0.01" value={form.profit}
                  onChange={e => setForm(p => ({ ...p, profit: e.target.value }))} placeholder="5,000.00" />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Mostrar tasa calculada en</label>
                  <select
                    value={form.rateType}
                    onChange={e => setForm(p => ({ ...p, rateType: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="monthly">Mensual</option>
                    <option value="biweekly">Quincenal</option>
                    <option value="weekly">Semanal</option>
                    <option value="daily">Diaria</option>
                    <option value="annual">Anual</option>
                  </select>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Input label="Plazo *" type="number" value={form.term}
                onChange={e => setForm(p => ({ ...p, term: e.target.value }))} placeholder="12" />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Unidad</label>
                <select value={form.termUnit} onChange={e => {
                  const u = e.target.value
                  // Auto-sync: la Unidad del Plazo determina la Frecuencia de Pago Y la unidad de la Tasa
                  const map: Record<string, string> = { months: 'monthly', biweekly: 'biweekly', weeks: 'weekly', days: 'daily' }
                  const synced = map[u]
                  setForm(p => ({ ...p, termUnit: u, freq: synced || p.freq, rateType: synced || p.rateType }))
                }} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="months">Meses</option>
                  <option value="biweekly">Quincenas</option>
                  <option value="weeks">Semanas</option>
                  <option value="days">Dias</option>
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
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-slate-700">Tipo de Amortización</label>
                <button
                  type="button"
                  onClick={() => setShowAmortHelp(true)}
                  className="text-xs text-[#1e3a5f] hover:text-[#152a45] flex items-center gap-1"
                  title="Ver explicación de cada tipo"
                >
                  <HelpCircle className="w-3.5 h-3.5" /> ¿Qué significa?
                </button>
              </div>
              <select value={form.amortType} onChange={e => setForm(p => ({ ...p, amortType: e.target.value as any }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {AMORTIZATION_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
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
              {/* Banner especial cuando se calculo por ganancia */}
              {mode === 'profit' && (
                <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-emerald-100 rounded-full p-2">
                      <Percent className="w-5 h-5 text-emerald-700"/>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600 uppercase font-medium">Tasa calculada para tu ganancia</p>
                      <p className="text-2xl font-bold text-emerald-700">{result.computedRate.toFixed(2)}% <span className="text-base font-normal text-slate-600">{(RATE_TYPE_LABEL[form.rateType] || 'Mensual').toLowerCase()}</span></p>
                    </div>
                  </div>
                </div>
              )}

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
                  <p className="text-xs text-slate-500 uppercase font-medium">Total Interes</p>
                  <p className="text-lg font-bold text-amber-700">{formatCurrency(result.totalInterest)}</p>
                  <p className="text-xs text-slate-400">{((result.totalInterest / result.totalPrincipal) * 100).toFixed(1)}% del capital</p>
                </Card>
                <Card className="p-3 bg-slate-50">
                  <p className="text-xs text-slate-500 uppercase font-medium">Capital</p>
                  <p className="text-lg font-bold text-slate-700">{formatCurrency(result.totalPrincipal)}</p>
                  <p className="text-xs text-slate-400">{AMORT_LABELS[form.amortType]}</p>
                </Card>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    // Fetch JIT del tenant-info para garantizar datos frescos
                    let info = tenantInfo
                    try {
                      const r = await api.get('/settings/tenant-info')
                      info = r.data || tenantInfo
                      setTenantInfo(info)
                    } catch { /* fallback al state */ }
                    const txt = buildWhatsAppText(info)
                    window.open(`https://wa.me/?text=${txt}`, '_blank')
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  <MessageCircle className="w-4 h-4"/>Compartir por WhatsApp
                </button>
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
                        <th className="text-right py-2 px-3 font-semibold text-slate-700">Interes</th>
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
    <AmortizationHelpModal open={showAmortHelp} onClose={() => setShowAmortHelp(false)} highlight={form.amortType} />
    </div>
  )
}

export default LoanCalculatorPage

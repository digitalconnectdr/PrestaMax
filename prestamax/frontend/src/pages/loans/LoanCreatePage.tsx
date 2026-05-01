import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { PageLoadingState } from '@/components/ui/Loading'
import { ArrowLeft, ArrowRight, Check, DollarSign, User, Settings, Globe } from 'lucide-react'
import { formatCurrency, SUPPORTED_CURRENCIES } from '@/lib/utils'
import api, { isAccessDenied } from '@/lib/api'
import toast from 'react-hot-toast'

interface Client {
  id: string
  fullName: string
  firstName: string
  lastName: string
  idNumber: string
  phonePersonal: string
  score: number
}

interface LoanProduct {
  id: string
  name: string
  type: string
  minAmount: number
  maxAmount: number
  rate: number
  rateType: string
  minTerm: number
  maxTerm: number
  termUnit: string
  paymentFrequency: string
  amortizationType: string
  requiresApproval: boolean
  isReditos: boolean
  isSanType: boolean
  moraRateDaily: number
  moraGraceDays: number
}

const AMORT_LABELS: Record<string, string> = {
  fixed_installment: 'Cuota Nivelada',
  flat_interest: 'Interés Plano',
  interest_only: 'Solo Intereses (Réditos)',
  declining_balance: 'Saldo Decreciente',
}

const FREQ_LABELS: Record<string, string> = {
  daily: 'Diaria',
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
}

const TYPE_LABELS: Record<string, string> = {
  personal: 'Personal',
  commercial: 'Comercial',
  san: 'Tipo San',
  secured: 'Con Garantía',
}

interface BankAccount {
  id: string
  bankName: string
  accountNumber: string
  accountType: string
  accountHolder: string
  currency: string
  currentBalance: number
  loanedBalance: number
  isActive: number
}

interface LoanFormData {
  clientId: string
  productId: string
  requestedAmount: string
  term: string
  termUnit: string
  rate: string
  rateType: string
  paymentFrequency: string
  amortizationType: string
  purpose: string
  notes: string
  firstPaymentDate: string
  disbursementBankAccountId: string
  currency: string
  exchangeRateToDop: string
  prorrogaFee: string
}

const LoanCreatePage: React.FC = () => {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [clients, setClients] = useState<Client[]>([])
  const [products, setProducts] = useState<LoanProduct[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<LoanProduct | null>(null)
  const [previewSchedule, setPreviewSchedule] = useState<any[]>([])
  const [enabledCurrencies, setEnabledCurrencies] = useState<string[]>(['DOP'])
  const [multiCurrencyEnabled, setMultiCurrencyEnabled] = useState(false)
  // Derived: currencies the user can choose for a new loan.
  // Sources (merged): enabled currencies from settings + currencies of existing bank accounts.
  // The selector only appears when there is more than one option.
  const availableCurrencies = React.useMemo(() => {
    const fromAccounts = [...new Set(bankAccounts.map(a => a.currency || 'DOP'))]
    // Include enabled currencies from settings whenever multi-currency is ON
    const fromSettings = multiCurrencyEnabled ? enabledCurrencies : []
    const merged = [...new Set(['DOP', ...fromSettings, ...fromAccounts])]
    return merged
  }, [bankAccounts, enabledCurrencies, multiCurrencyEnabled])

  const [form, setForm] = useState<LoanFormData>({
    clientId: '',
    productId: '',
    requestedAmount: '',
    term: '',
    termUnit: 'months',
    rate: '',
    rateType: 'monthly',
    paymentFrequency: 'monthly',
    amortizationType: 'fixed_installment',
    purpose: '',
    notes: '',
    firstPaymentDate: '',
    disbursementBankAccountId: '',
    currency: 'DOP',
    exchangeRateToDop: '1',
    prorrogaFee: '0',
  })

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Use allSettled so a 403 on one endpoint (e.g. /products) doesn't block the others
        const [clientsResult, productsResult, settingsResult] = await Promise.allSettled([
          api.get('/clients?limit=200'),
          api.get('/products'),
          api.get('/settings'),
        ])

        // Clients — critical, always load
        if (clientsResult.status === 'fulfilled') {
          setClients(clientsResult.value.data.data || [])
        } else if (!isAccessDenied(clientsResult.reason)) {
          toast.error('Error al cargar clientes')
        }

        // Products — graceful degradation if user lacks settings.products perm
        if (productsResult.status === 'fulfilled') {
          setProducts(Array.isArray(productsResult.value.data) ? productsResult.value.data : [])
        }
        // (403 on products is silently ignored — wizard step 2 will show empty list)

        // Settings — bank accounts + currency config
        if (settingsResult.status === 'fulfilled') {
          const accounts = (settingsResult.value.data?.bankAccounts || []).filter((a: BankAccount) => a.isActive !== 0)
          setBankAccounts(accounts)
          if (accounts.length === 1) {
            const acc = accounts[0]
            setForm(f => ({
              ...f,
              disbursementBankAccountId: acc.id,
              currency: acc.currency || 'DOP',
              exchangeRateToDop: (acc.currency || 'DOP') === 'DOP' ? '1' : f.exchangeRateToDop,
            }))
          }
          const s = settingsResult.value.data?.settings
          const mcEnabled = !!(s?.multiCurrencyEnabled || s?.multi_currency_enabled)
          setMultiCurrencyEnabled(mcEnabled)
          try {
            const raw = s?.enabledCurrencies ?? s?.enabled_currencies ?? '["DOP"]'
            const parsed: string[] = Array.isArray(raw) ? raw : JSON.parse(raw)
            if (parsed.length > 1) setEnabledCurrencies(parsed)
          } catch(_) { /* keep default ['DOP'] */ }
        }
      } catch (err) {
        if (!isAccessDenied(err)) toast.error('Error al cargar datos')
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [])

  const filteredClients = clients.filter((c) => {
    const q = clientSearch.toLowerCase()
    return (
      (c.fullName || `${c.firstName} ${c.lastName}`).toLowerCase().includes(q) ||
      (c.idNumber || '').toLowerCase().includes(q) ||
      (c.phonePersonal || '').includes(q)
    )
  })

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client)
    setForm((f) => ({ ...f, clientId: client.id }))
  }

  const handleSelectProduct = (product: LoanProduct) => {
    setSelectedProduct(product)
    setForm((f) => ({
      ...f,
      productId: product.id,
      rate: String(product.rate),
      rateType: product.rateType,
      paymentFrequency: product.paymentFrequency,
      amortizationType: product.amortizationType,
      termUnit: product.termUnit,
      term: String(product.minTerm),
    }))
  }

  const computePreview = () => {
    const amount = parseFloat(form.requestedAmount)
    const rate = parseFloat(form.rate)
    const n = parseInt(form.term)
    if (!amount || !rate || !n) return

    const mRate = form.rateType === 'annual' ? rate / 100 / 12 : rate / 100
    const schedule = []
    let balance = amount

    const fixedPayment = mRate > 0
      ? amount * (mRate * Math.pow(1 + mRate, n)) / (Math.pow(1 + mRate, n) - 1)
      : amount / n

    for (let i = 1; i <= n; i++) {
      let principal = 0, interest = 0
      if (form.amortizationType === 'fixed_installment') {
        interest = Math.round(balance * mRate * 100) / 100
        principal = i === n ? Math.round(balance * 100) / 100 : Math.round((fixedPayment - interest) * 100) / 100
      } else if (form.amortizationType === 'flat_interest') {
        interest = Math.round(amount * mRate * 100) / 100
        principal = Math.round(amount / n * 100) / 100
      } else if (form.amortizationType === 'interest_only') {
        interest = Math.round(balance * mRate * 100) / 100
        principal = i === n ? Math.round(balance * 100) / 100 : 0
      } else {
        interest = Math.round(balance * mRate * 100) / 100
        principal = Math.round(amount / n * 100) / 100
      }
      principal = Math.max(0, Math.min(principal, balance))
      balance = Math.round((balance - principal) * 100) / 100
      schedule.push({ num: i, principal, interest, total: Math.round((principal + interest) * 100) / 100, balance })
      if (Math.abs(balance) < 0.01) break
    }
    setPreviewSchedule(schedule)
  }

  const handleSubmit = async () => {
    if (!form.clientId || !form.productId || !form.requestedAmount || !form.term) {
      toast.error('Completa todos los campos requeridos')
      return
    }
    if (!form.disbursementBankAccountId) {
      toast.error('Debes seleccionar la cuenta bancaria de desembolso')
      return
    }
    if (form.currency !== 'DOP' && (!form.exchangeRateToDop || parseFloat(form.exchangeRateToDop) <= 0)) {
      toast.error('Ingresa la tasa de cambio respecto al peso dominicano')
      return
    }

    // Validate sufficient funds in selected account
    const selectedAccount = bankAccounts.find(a => a.id === form.disbursementBankAccountId)
    if (selectedAccount && selectedAccount.currentBalance < parseFloat(form.requestedAmount)) {
      toast.error(`Fondos insuficientes en ${selectedAccount.bankName}. Disponible: ${formatCurrency(selectedAccount.currentBalance, selectedAccount.currency || 'DOP')}`)
      return
    }

    try {
      setIsSubmitting(true)
      const payload = {
        clientId: form.clientId,
        productId: form.productId,
        requestedAmount: parseFloat(form.requestedAmount),
        term: parseInt(form.term),
        termUnit: form.termUnit,
        rate: parseFloat(form.rate),
        rateType: form.rateType,
        paymentFrequency: form.paymentFrequency,
        amortizationType: form.amortizationType,
        purpose: form.purpose || null,
        notes: form.notes || null,
        disbursementBankAccountId: form.disbursementBankAccountId || null,
        currency: form.currency || 'DOP',
        exchange_rate_to_dop: form.currency !== 'DOP' ? parseFloat(form.exchangeRateToDop) || 1 : 1,
        prorroga_fee: parseFloat(form.prorrogaFee) || 0,
      }
      const res = await api.post('/loans', payload)
      const loanId = res.data.id

      // If product doesn't require approval, immediately disburse
      if (!selectedProduct?.requiresApproval) {
        const firstPayDate = form.firstPaymentDate
          ? form.firstPaymentDate
          : (() => {
              const d = new Date()
              d.setMonth(d.getMonth() + 1)
              return d.toISOString().split('T')[0]
            })()
        try {
          await api.post(`/loans/${loanId}/disburse`, {
            disbursedAmount: parseFloat(form.requestedAmount),
            firstPaymentDate: firstPayDate,
            bankAccountId: form.disbursementBankAccountId,
          })
          toast.success('Préstamo desembolsado exitosamente')
        } catch (disbErr: any) {
          toast.error(disbErr?.response?.data?.error || 'Préstamo creado pero error al desembolsar')
        }
      } else {
        toast.success('Solicitud creada — pendiente de aprobación')
      }
      navigate(`/loans/${loanId}`)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al crear préstamo')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) return <PageLoadingState />

  const steps = [
    { num: 1, label: 'Cliente', icon: User },
    { num: 2, label: 'Producto', icon: Settings },
    { num: 3, label: 'Condiciones', icon: DollarSign },
    { num: 4, label: 'Confirmar', icon: Check },
  ]

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/loans')}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="page-title">Nuevo Préstamo</h1>
          <p className="text-slate-600 text-sm mt-1">Solicitud de préstamo paso a paso</p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center justify-between relative">
        <div className="absolute top-4 left-8 right-8 h-0.5 bg-slate-200 z-0" />
        {steps.map((s, idx) => {
          const Icon = s.icon
          const isActive = step === s.num
          const isDone = step > s.num
          return (
            <div key={s.num} className="flex flex-col items-center gap-2 z-10">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                  isDone
                    ? 'bg-green-600 text-white'
                    : isActive
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border-2 border-slate-300 text-slate-400'
                }`}
              >
                {isDone ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${isActive ? 'text-blue-700' : isDone ? 'text-green-600' : 'text-slate-400'}`}>
                {s.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Step 1: Select Client */}
      {step === 1 && (
        <Card>
          <h2 className="section-title mb-4">Seleccionar Cliente</h2>
          <Input
            type="text"
            placeholder="Buscar por nombre, cédula o teléfono..."
            value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)}
            className="mb-4"
          />
          {selectedClient && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
              <div>
                <p className="font-semibold text-blue-900">{selectedClient.fullName || `${selectedClient.firstName} ${selectedClient.lastName}`}</p>
                <p className="text-sm text-blue-600">{selectedClient.idNumber}</p>
              </div>
              <Check className="w-5 h-5 text-blue-600" />
            </div>
          )}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {filteredClients.length === 0 && (
              <p className="py-8 text-center text-slate-500">No se encontraron clientes</p>
            )}
            {filteredClients.map((client) => (
              <div
                key={client.id}
                onClick={() => handleSelectClient(client)}
                className={`p-3 cursor-pointer hover:bg-slate-50 transition-colors flex items-center justify-between ${
                  selectedClient?.id === client.id ? 'bg-blue-50' : ''
                }`}
              >
                <div>
                  <p className="font-medium text-slate-900">{client.fullName || `${client.firstName} ${client.lastName}`}</p>
                  <p className="text-sm text-slate-500">{client.idNumber} · {client.phonePersonal}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                    client.score >= 4 ? 'bg-green-100 text-green-700' :
                    client.score >= 3 ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>★{client.score}</span>
                  {selectedClient?.id === client.id && <Check className="w-4 h-4 text-blue-600" />}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-4 pt-4 border-t border-slate-200">
            <Button variant="outline" onClick={() => navigate('/clients/new')}>
              + Nuevo Cliente
            </Button>
            <Button
              onClick={() => setStep(2)}
              disabled={!selectedClient}
              className="flex items-center gap-2"
            >
              Siguiente <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* Step 2: Select Product */}
      {step === 2 && (
        <Card>
          <h2 className="section-title mb-4">Seleccionar Producto de Préstamo</h2>
          {products.length === 0 && (
            <div className="py-8 text-center text-slate-500">
              <p>No hay productos configurados.</p>
              <button onClick={() => navigate('/settings?tab=products')} className="text-blue-600 text-sm hover:underline mt-1">
                Configurar productos →
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {products.map((product) => (
              <div
                key={product.id}
                onClick={() => handleSelectProduct(product)}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md ${
                  selectedProduct?.id === product.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:border-blue-300'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-slate-900">{product.name}</p>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {TYPE_LABELS[product.type] || product.type}
                    </span>
                  </div>
                  {selectedProduct?.id === product.id && (
                    <Check className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  )}
                </div>
                <div className="text-sm text-slate-600 space-y-1">
                  <p>Tasa: <strong>{product.rate}% {product.rateType === 'monthly' ? 'mensual' : 'anual'}</strong></p>
                  <p>Monto: <strong>{formatCurrency(product.minAmount)} – {formatCurrency(product.maxAmount)}</strong></p>
                  <p>Plazo: <strong>{product.minTerm} – {product.maxTerm} {product.termUnit === 'months' ? 'meses' : 'sem.'}</strong></p>
                  <p>Frecuencia: <strong>{FREQ_LABELS[product.paymentFrequency] || product.paymentFrequency}</strong></p>
                  {product.isReditos && <span className="inline-block text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Réditos</span>}
                  {product.isSanType && <span className="inline-block text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full ml-1">San</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-4 pt-4 border-t border-slate-200">
            <Button variant="outline" onClick={() => setStep(1)} className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Atrás
            </Button>
            <Button
              onClick={() => setStep(3)}
              disabled={!selectedProduct}
              className="flex items-center gap-2"
            >
              Siguiente <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* Step 3: Loan Conditions */}
      {step === 3 && selectedProduct && (
        <div className="space-y-4">
          <Card>
            <h2 className="section-title mb-4">Condiciones del Préstamo</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Monto Solicitado *
                  <span className="text-slate-400 ml-1 font-normal">
                    ({formatCurrency(selectedProduct.minAmount)} – {formatCurrency(selectedProduct.maxAmount)})
                  </span>
                </label>
                <input
                  type="number"
                  step="100"
                  min={selectedProduct.minAmount}
                  max={selectedProduct.maxAmount}
                  value={form.requestedAmount}
                  onChange={(e) => setForm({ ...form, requestedAmount: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Plazo *
                  <span className="text-slate-400 ml-1 font-normal">
                    ({selectedProduct.minTerm} – {selectedProduct.maxTerm})
                  </span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={selectedProduct.minTerm}
                    max={selectedProduct.maxTerm}
                    value={form.term}
                    onChange={(e) => setForm({ ...form, term: e.target.value })}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={form.termUnit}
                    onChange={(e) => setForm({ ...form, termUnit: e.target.value })}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="months">Meses</option>
                    <option value="biweekly">Quincenal</option>
                    <option value="weeks">Semanas</option>
                    <option value="days">Días</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tasa de Interés (%)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={form.rate}
                    onChange={(e) => setForm({ ...form, rate: e.target.value })}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={form.rateType}
                    onChange={(e) => setForm({ ...form, rateType: e.target.value })}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="monthly">Mensual</option>
                    <option value="annual">Anual</option>
                    <option value="daily">Diario</option>
                    <option value="weekly">Semanal</option>
                    <option value="biweekly">Quincenal</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Frecuencia de Pago</label>
                <select
                  value={form.paymentFrequency}
                  onChange={(e) => setForm({ ...form, paymentFrequency: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(FREQ_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Amortización</label>
                <select
                  value={form.amortizationType}
                  onChange={(e) => setForm({ ...form, amortizationType: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(AMORT_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Primer Pago (opcional)</label>
                <input
                  type="date"
                  value={form.firstPaymentDate}
                  onChange={(e) => setForm({ ...form, firstPaymentDate: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* ── Currency Selector: auto-shows when bank accounts exist in multiple currencies ── */}
              {availableCurrencies.length > 1 && (
                <div className="col-span-full">
                  <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-blue-500"/>Moneda del Préstamo
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {availableCurrencies.map(code => {
                      const cur = SUPPORTED_CURRENCIES.find(c => c.code === code)
                      const isSelected = form.currency === code
                      return (
                        <button key={code} type="button"
                          onClick={() => setForm(f => ({
                            ...f,
                            currency: code,
                            exchangeRateToDop: code === 'DOP' ? '1' : f.exchangeRateToDop,
                            disbursementBankAccountId: '', // reset account when currency changes
                          }))}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                            isSelected ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}>
                          <span className="font-bold">{cur?.symbol ?? code}</span>{code}
                          {code !== 'DOP' && <span className="text-xs text-slate-400">— {cur?.name}</span>}
                        </button>
                      )
                    })}
                  </div>
                  {form.currency !== 'DOP' && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <label className="block text-sm font-medium text-amber-800 mb-1">
                        Tasa de Cambio: 1 {form.currency} = ? DOP *
                      </label>
                      <div className="flex items-center gap-2">
                        <input type="number" step="0.01" min="0.01"
                          value={form.exchangeRateToDop}
                          onChange={e => setForm(f => ({ ...f, exchangeRateToDop: e.target.value }))}
                          placeholder="Ej: 58.50"
                          className="w-40 px-3 py-2 border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                        />
                        <span className="text-sm text-amber-700">
                          {form.requestedAmount && form.exchangeRateToDop
                            ? `= ${formatCurrency(parseFloat(form.requestedAmount) * parseFloat(form.exchangeRateToDop), 'DOP')} equivalente`
                            : 'Ingresa el monto para ver el equivalente en DOP'}
                        </span>
                      </div>
                      <p className="text-xs text-amber-600 mt-1">Esta tasa se guarda con el préstamo para reportes consolidados. No afecta los cálculos de cuotas.</p>
                    </div>
                  )}
                </div>
              )}

              <div className="col-span-full">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Cuenta de Desembolso *
                  <span className="text-xs text-slate-400 font-normal ml-1">— cuenta desde donde saldrá el dinero</span>
                  {availableCurrencies.length > 1 && (
                    <span className="text-xs text-blue-600 font-normal ml-1">· mostrando cuentas en {form.currency}</span>
                  )}
                </label>
                {/* Always filter accounts by loan currency */}
                {(() => {
                  const filteredAccounts = availableCurrencies.length > 1
                    ? bankAccounts.filter(a => (a.currency || 'DOP') === form.currency)
                    : bankAccounts
                  if (filteredAccounts.length === 0) return (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      {bankAccounts.length === 0
                        ? <>No hay cuentas bancarias configuradas. <a href="/settings?tab=bank_accounts" className="underline font-medium">Agregar cuenta →</a></>
                        : <>No tienes cuentas bancarias en <strong>{form.currency}</strong>. <a href="/settings?tab=bank_accounts" className="underline font-medium">Agregar cuenta {form.currency} →</a></>
                      }
                    </p>
                  )
                  return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {filteredAccounts.map(acc => {
                      const available = acc.currentBalance
                      const requested = parseFloat(form.requestedAmount) || 0
                      const enoughFunds = available >= requested
                      const isSelected = form.disbursementBankAccountId === acc.id
                      return (
                        <div
                          key={acc.id}
                          onClick={() => {
                            const accCurrency = acc.currency || 'DOP'
                            setForm(f => ({
                              ...f,
                              disbursementBankAccountId: acc.id,
                              currency: accCurrency,
                              exchangeRateToDop: accCurrency === 'DOP' ? '1' : f.exchangeRateToDop,
                            }))
                          }}
                          className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-slate-200 hover:border-blue-300'
                          } ${!enoughFunds && requested > 0 ? 'opacity-60' : ''}`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium text-sm">{acc.bankName}</p>
                              <p className="text-xs text-slate-500">{acc.accountNumber || 'Sin número'} · {acc.currency}</p>
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                          </div>
                          <div className="mt-1.5 flex items-center justify-between">
                            <span className="text-xs text-slate-500">Disponible:</span>
                            <span className={`text-sm font-semibold ${enoughFunds ? 'text-emerald-600' : 'text-red-600'}`}>
                              {formatCurrency(available, acc.currency || 'DOP')}
                            </span>
                          </div>
                          {!enoughFunds && requested > 0 && (
                            <p className="text-xs text-red-600 mt-1">Fondos insuficientes</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  )
                })()}
              </div>

              <div className="col-span-full">
                <label className="block text-sm font-medium text-slate-700 mb-1">Propósito del Préstamo</label>
                <input
                  type="text"
                  value={form.purpose}
                  onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                  placeholder="Ej: Capital de trabajo, compra de vehículo..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="col-span-full">
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas Internas</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Observaciones adicionales..."
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Cargo de Prorroga <span className="text-slate-400 font-normal">(opcional)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.prorrogaFee}
                    onChange={(e) => setForm({ ...form, prorrogaFee: e.target.value })}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Cargo fijo para extender el vencimiento un periodo. Dejar en 0 para no aplicar.
                </p>
              </div>
            </div>

            {/* Preview button */}
            <div className="mt-4 pt-4 border-t border-slate-200">
              <Button variant="outline" size="sm" onClick={computePreview}>
                Vista Previa del Plan de Pagos
              </Button>
            </div>
          </Card>

          {previewSchedule.length > 0 && (
            <Card>
              <h3 className="section-title mb-3">Vista Previa (primeras cuotas)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-center py-2 px-3 font-semibold text-slate-700">#</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700">Capital</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700">Interés</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700">Cuota</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewSchedule.map((row) => (
                      <tr key={row.num} className="border-b border-slate-100">
                        <td className="py-2 px-3 text-center">{row.num}</td>
                        <td className="py-2 px-3 text-right">{formatCurrency(row.principal)}</td>
                        <td className="py-2 px-3 text-right text-blue-600">{formatCurrency(row.interest)}</td>
                        <td className="py-2 px-3 text-right font-semibold">{formatCurrency(row.total)}</td>
                        <td className="py-2 px-3 text-right text-slate-500">{formatCurrency(row.balance)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-300">
                      <td colSpan={5} className="py-2 px-3 text-center text-xs text-slate-500 font-medium">
                        Total: {previewSchedule.length} cuotas · {formatCurrency(previewSchedule.reduce((s,r)=>s+r.total,0))} total
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)} className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Atrás
            </Button>
            <Button
              onClick={() => setStep(4)}
              disabled={!form.requestedAmount || !form.term}
              className="flex items-center gap-2"
            >
              Siguiente <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Confirm */}
      {step === 4 && selectedClient && selectedProduct && (
        <div className="space-y-4">
          <Card>
            <h2 className="section-title mb-4">Confirmar Solicitud de Préstamo</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <User className="w-4 h-4" /> Cliente
                </h3>
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{selectedClient.fullName || `${selectedClient.firstName} ${selectedClient.lastName}`}</p>
                  <p className="text-slate-500">{selectedClient.idNumber}</p>
                  <p className="text-slate-500">{selectedClient.phonePersonal}</p>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <Settings className="w-4 h-4" /> Producto
                </h3>
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{selectedProduct.name}</p>
                  <p className="text-slate-500">{TYPE_LABELS[selectedProduct.type] || selectedProduct.type}</p>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> Condiciones
                </h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Monto</span>
                    <div className="text-right">
                      <span className="font-semibold text-lg text-blue-700">{formatCurrency(parseFloat(form.requestedAmount) || 0, form.currency)}</span>
                      {form.currency !== 'DOP' && (
                        <p className="text-xs text-slate-400">≈ {formatCurrency((parseFloat(form.requestedAmount) || 0) * (parseFloat(form.exchangeRateToDop) || 1), 'DOP')}</p>
                      )}
                    </div>
                  </div>
                  {form.currency !== 'DOP' && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Moneda</span>
                      <span className="font-medium inline-flex items-center gap-1">
                        <Globe className="w-3 h-3 text-blue-500" />
                        {form.currency}
                        <span className="text-slate-400 text-xs">@ {formatCurrency(parseFloat(form.exchangeRateToDop) || 1, 'DOP')}</span>
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500">Plazo</span>
                    <span className="font-medium">{form.term} {form.termUnit === 'months' ? 'meses' : form.termUnit}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tasa</span>
                    <span className="font-medium">{form.rate}% {form.rateType === 'monthly' ? 'mensual' : 'anual'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Frecuencia</span>
                    <span className="font-medium">{FREQ_LABELS[form.paymentFrequency] || form.paymentFrequency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Amortización</span>
                    <span className="font-medium">{AMORT_LABELS[form.amortizationType] || form.amortizationType}</span>
                  </div>
                </div>
              </div>
              {form.purpose && (
                <div>
                  <h3 className="font-semibold text-slate-700 mb-2">Propósito</h3>
                  <p className="text-sm text-slate-600">{form.purpose}</p>
                </div>
              )}
            </div>

            {/* Bank account summary */}
            {form.disbursementBankAccountId && (() => {
              const acc = bankAccounts.find(a => a.id === form.disbursementBankAccountId)
              return acc ? (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                  <p className="font-semibold text-blue-800 mb-1">Cuenta de Desembolso</p>
                  <p className="text-blue-700">{acc.bankName} · {acc.accountNumber || 'Sin número'}</p>
                  <p className="text-blue-600">Balance disponible: <strong>{formatCurrency(acc.currentBalance, form.currency)}</strong></p>
                  <p className="text-blue-600">Después del desembolso: <strong>{formatCurrency(acc.currentBalance - (parseFloat(form.requestedAmount) || 0), form.currency)}</strong></p>
                </div>
              ) : null
            })()}

            {selectedProduct.requiresApproval && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                Este producto requiere aprobación. El préstamo quedará en estado <strong>En Revisión</strong> hasta que sea aprobado.
              </div>
            )}
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(3)} className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Atrás
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
            >
              {isSubmitting ? 'Creando...' : (
                <>
                  <Check className="w-4 h-4" />
                  Crear Préstamo
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default LoanCreatePage

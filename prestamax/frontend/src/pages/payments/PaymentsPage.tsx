import React, { useState, useEffect, useContext } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { PageLoadingState } from '@/components/ui/Loading'
import EmptyState from '@/components/ui/EmptyState'
import {
  CreditCard, Plus, X, Landmark, Percent, TrendingDown,
  Zap, Info, AlertTriangle, Calendar, Coins, Edit2, Trash2,
  Printer, MessageCircle, User, RotateCcw
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import api, { isAccessDenied } from '@/lib/api'
import toast from 'react-hot-toast'
import { AuthContext } from '@/contexts/AuthContext'
import { TenantContext } from '@/contexts/TenantContext'
import { usePermission } from '@/hooks/usePermission'

interface Payment {
  id: string
  paymentNumber: string
  paymentDate: string
  clientName: string
  clientPhone: string | null
  loanNumber: string
  amount: number
  appliedCapital: number
  appliedInterest: number
  appliedMora: number
  paymentMethod: string
  bankAccountId: string | null
  bankAccountName: string | null
  bankAccountNumber: string | null
  reference: string | null
  notes: string | null
  isVoided: boolean
  registeredByName: string | null
  receiptNumber: string | null
}

interface ActiveLoan {
  id: string
  loanNumber: string
  clientName: string
  totalBalance: number
  principalBalance: number
  interestBalance: number
  moraBalance: number
  overdueBalance?: number
  prorrogaFee?: number
}

interface BankAccount {
  id: string
  bankName: string
  accountNumber: string
  accountType: string
  currency: string
}

interface PaymentPreview {
  breakdown: { interest: number; capital: number; mora: number; excessToCapital: number }
  remaining: number
  isOverpayment: boolean
  currentMora: number
  totalDue: number
  nextInstallment: { number: number; dueDate: string; total: number } | null
}

const METHOD_LABELS: Record<string, string> = { cash: 'Efectivo', transfer: 'Transferencia', check: 'Cheque', card: 'Tarjeta' }

// ── Print receipt for a payment ───────────────────────────────────────────────
const printPaymentReceipt = (p: Payment, tenantName: string) => {
  const win = window.open('', '_blank', 'width=420,height=600')
  if (!win) { alert('Activa ventanas emergentes para imprimir'); return }
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const fmtMoney = (n: number) => `RD$${(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`
  const rows = [
    ['Capital aplicado', fmtMoney(p.appliedCapital || 0)],
    ['Interés aplicado', fmtMoney(p.appliedInterest || 0)],
    ['Mora aplicada', fmtMoney(p.appliedMora || 0)],
  ].map(([l, v]) => `<tr><td style="padding:3px 0;color:#555">${l}</td><td style="padding:3px 0;text-align:right">${v}</td></tr>`).join('')
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo</title>
  <style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px;color:#333}
  h2{font-size:16px;margin:0 0 4px}hr{border:none;border-top:1px dashed #ccc;margin:10px 0}
  .total{font-size:16px;font-weight:bold;color:#16a34a}.num{color:#1e3a5f;font-weight:bold}
  table{width:100%;border-collapse:collapse}.void{color:red;font-size:14px;font-weight:bold;text-align:center}
  @media print{@page{margin:10mm}}</style></head><body>
  <div style="text-align:center;margin-bottom:12px">
    <h2>${tenantName}</h2>
    <p style="margin:0;font-size:11px;color:#888">Comprobante de Pago</p>
  </div>
  <hr/>
  <table><tbody>
    <tr><td>Recibo Nº</td><td style="text-align:right" class="num">${p.receiptNumber || p.paymentNumber}</td></tr>
    <tr><td>Pago Nº</td><td style="text-align:right" class="num">${p.paymentNumber}</td></tr>
    <tr><td>Fecha</td><td style="text-align:right">${fmtDate(p.paymentDate)}</td></tr>
    <tr><td>Cliente</td><td style="text-align:right">${p.clientName}</td></tr>
    <tr><td>Préstamo</td><td style="text-align:right" class="num">${p.loanNumber}</td></tr>
    <tr><td>Método</td><td style="text-align:right">${METHOD_LABELS[p.paymentMethod] || p.paymentMethod}</td></tr>
    ${p.bankAccountName ? `<tr><td>Cuenta</td><td style="text-align:right">${p.bankAccountName}</td></tr>` : ''}
    ${p.reference ? `<tr><td>Referencia</td><td style="text-align:right">${p.reference}</td></tr>` : ''}
  </tbody></table>
  <hr/>
  <table><tbody>${rows}</tbody></table>
  <hr/>
  <div style="display:flex;justify-content:space-between;align-items:center">
    <span>TOTAL PAGADO</span><span class="total">${fmtMoney(p.amount)}</span>
  </div>
  <hr/>
  ${p.isVoided ? '<div class="void">⚠ PAGO ANULADO</div><hr/>' : ''}
  <p style="font-size:10px;color:#888;text-align:center;margin-top:12px">
    Registrado por: ${p.registeredByName || '—'}<br/>
    ${p.notes ? `Notas: ${p.notes}` : ''}
  </p>
  <script>window.onload=()=>{window.print();}</script>
  </body></html>`)
  win.document.close()
}

// ── Send WhatsApp confirmation ─────────────────────────────────────────────────
const sendWhatsApp = (p: Payment, tenantName: string) => {
  const phone = (p.clientPhone || '').replace(/\D/g, '')
  if (!phone) { alert('El cliente no tiene número de teléfono registrado'); return }
  const fmtMoney = (n: number) => `RD$${(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const msg = `✅ *Confirmación de Pago*\n\n🏢 *${tenantName}*\nRecibo: ${p.receiptNumber || p.paymentNumber}\nFecha: ${fmtDate(p.paymentDate)}\nPréstamo: ${p.loanNumber}\nMonto: *${fmtMoney(p.amount)}*\nMétodo: ${METHOD_LABELS[p.paymentMethod] || p.paymentMethod}\n\n_Gracias por su pago._`
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
  window.open(url, '_blank')
}

const BASE_PAYMENT_TYPES = [
  { value: 'regular',       icon: CreditCard,   label: 'Cuota Regular',    desc: 'Interés primero, luego capital' },
  { value: 'interest_only', icon: Percent,       label: 'Solo Interés',     desc: 'Abona únicamente a intereses' },
  { value: 'capital_only',  icon: TrendingDown,  label: 'Abono al Capital', desc: 'Interés primero, resto al capital' },
  { value: 'full_payoff',   icon: Zap,           label: 'Liquidar Total',   desc: 'Paga el saldo completo' },
]

function getPaymentTypes(loan?: ActiveLoan | null) {
  const types = [...BASE_PAYMENT_TYPES]
  if (loan && (loan.prorrogaFee || 0) > 0) {
    types.push({ value: 'prorroga', icon: RotateCcw, label: 'Cargo de Prórroga', desc: `Extiende el vencimiento un período` })
  }
  return types
}

const INITIAL_FORM = {
  loanId: '',
  amount: '',
  paymentMethod: 'cash',
  bankAccountId: '',
  reference: '',
  notes: '',
  paymentDate: new Date().toISOString().split('T')[0],
  paymentType: 'regular',
  overpaymentAction: 'apply_to_next_installment',
}

const PaymentsPage: React.FC = () => {
  const { state: authState } = useContext(AuthContext)
  const { state: tenantState } = useContext(TenantContext)
  const { can } = usePermission()

  const [payments, setPayments] = useState<Payment[]>([])
  const [activeLoans, setActiveLoans] = useState<ActiveLoan[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [loanDetail, setLoanDetail] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [payForm, setPayForm] = useState(INITIAL_FORM)
  const [preview, setPreview] = useState<PaymentPreview | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [overpaymentStep, setOverpaymentStep] = useState(false)

  // Edit payment state
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null)
  const [editForm, setEditForm] = useState({ paymentDate: '', paymentMethod: 'cash', bankAccountId: '', reference: '', notes: '' })
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Void payment state
  const [voidingPayment, setVoidingPayment] = useState<Payment | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [isVoiding, setIsVoiding] = useState(false)

  const selectedLoan = activeLoans.find(l => l.id === payForm.loanId)

  const fetchPayments = async () => {
    try {
      const res = await api.get('/payments')
      setPayments(res.data.data || [])
    } catch (err) {
      if (!isAccessDenied(err)) toast.error('Error al cargar pagos')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPayments()
    api.get('/loans?status=active,in_mora,overdue,disbursed,current&limit=200').then(res => setActiveLoans(res.data.data || [])).catch(() => {})
    api.get('/settings/bank-accounts').then(res => setBankAccounts(Array.isArray(res.data) ? res.data.filter((a: BankAccount) => a) : [])).catch(() => {})
  }, [])

  // Cargar detalle del prestamo (con cuotas) al seleccionar uno
  useEffect(() => {
    if (!payForm.loanId) { setLoanDetail(null); return }
    api.get(`/loans/${payForm.loanId}`)
      .then(res => setLoanDetail(res.data))
      .catch(() => setLoanDetail(null))
  }, [payForm.loanId])

  // Live preview
  useEffect(() => {
    if (!payForm.loanId || !payForm.amount || parseFloat(payForm.amount) <= 0) {
      setPreview(null); return
    }
    const timeout = setTimeout(async () => {
      setIsPreviewLoading(true)
      try {
        const res = await api.post('/payments/preview', {
          loanId: payForm.loanId,
          amount: parseFloat(payForm.amount),
          paymentType: payForm.paymentType,
          overpaymentAction: payForm.overpaymentAction,
        })
        setPreview(res.data)
      } catch { setPreview(null) }
      finally { setIsPreviewLoading(false) }
    }, 400)
    return () => clearTimeout(timeout)
  }, [payForm.loanId, payForm.amount, payForm.paymentType, payForm.overpaymentAction])

  const closeModal = () => {
    setShowModal(false)
    setOverpaymentStep(false)
    setPreview(null)
    setPayForm(INITIAL_FORM)
  }

  const openEditPayment = (payment: Payment) => {
    setEditingPayment(payment)
    setEditForm({
      paymentDate: payment.paymentDate ? payment.paymentDate.slice(0, 10) : '',
      paymentMethod: payment.paymentMethod || 'cash',
      bankAccountId: payment.bankAccountId || '',
      reference: payment.reference || '',
      notes: payment.notes || '',
    })
  }

  const handleSaveEdit = async () => {
    if (!editingPayment) return
    setIsSavingEdit(true)
    try {
      await api.put(`/payments/${editingPayment.id}`, {
        paymentDate: editForm.paymentDate,
        paymentMethod: editForm.paymentMethod,
        bankAccountId: editForm.bankAccountId || null,
        reference: editForm.reference,
        notes: editForm.notes,
      })
      toast.success('Pago actualizado correctamente')
      setEditingPayment(null)
      fetchPayments()
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Error al actualizar pago'
      toast.error(msg)
    } finally { setIsSavingEdit(false) }
  }

  const handleVoidPayment = async () => {
    if (!voidingPayment || !voidReason.trim()) {
      toast.error('Ingresa un motivo para anular el pago')
      return
    }
    setIsVoiding(true)
    try {
      await api.post(`/payments/${voidingPayment.id}/void`, { voidReason })
      toast.success('Pago anulado correctamente')
      setVoidingPayment(null)
      setVoidReason('')
      fetchPayments()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al anular pago')
    } finally { setIsVoiding(false) }
  }

  const handleRegisterPayment = async (confirmedOverpaymentAction?: string) => {
    if (!payForm.loanId || !payForm.amount) {
      toast.error('Selecciona el préstamo e ingresa el monto')
      return
    }
    // Overpayment step needed
    if (preview?.isOverpayment && !overpaymentStep && !confirmedOverpaymentAction) {
      setOverpaymentStep(true)
      return
    }
    try {
      setIsSubmitting(true)
      await api.post('/payments', {
        loanId: payForm.loanId,
        amount: parseFloat(payForm.amount),
        paymentMethod: payForm.paymentMethod,
        bankAccountId: payForm.bankAccountId || undefined,
        reference: payForm.reference || undefined,
        paymentDate: new Date(payForm.paymentDate + 'T12:00:00').toISOString(),
        notes: payForm.notes || undefined,
        paymentType: payForm.paymentType,
        overpaymentAction: confirmedOverpaymentAction || payForm.overpaymentAction,
      })
      toast.success('Pago registrado exitosamente')
      closeModal()
      fetchPayments()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al registrar pago')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) return <PageLoadingState />

  const filtered = payments.filter(p => {
    const matchSearch = (p.paymentNumber||'').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.clientName||'').toLowerCase().includes(searchTerm.toLowerCase())
    const matchMethod = !methodFilter || p.paymentMethod === methodFilter
    const payDate = new Date(p.paymentDate)
    const matchFrom = fromDate ? payDate >= new Date(fromDate) : true
    const matchTo = toDate ? payDate <= new Date(toDate + 'T23:59:59') : true
    return matchSearch && matchMethod && matchFrom && matchTo
  })

  const totalAmount = filtered.filter(p => !p.isVoided).reduce((s, p) => s + p.amount, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="page-title">Pagos</h1>
          <p className="text-slate-600 text-sm mt-1">Registro y seguimiento de pagos</p>
        </div>
        {can('payments.create') && (
          <Button onClick={() => setShowModal(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />Registrar Pago
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="p-4 text-center bg-green-50">
          <p className="text-xs text-slate-500 uppercase font-medium">Total Filtrado</p>
          <p className="text-lg font-bold text-green-700 mt-1">{formatCurrency(totalAmount)}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xs text-slate-500 uppercase font-medium">Pagos</p>
          <p className="text-lg font-bold text-slate-800 mt-1">{filtered.filter(p=>!p.isVoided).length}</p>
        </Card>
        <Card className="p-4 text-center bg-slate-50">
          <p className="text-xs text-slate-500 uppercase font-medium">Anulados</p>
          <p className="text-lg font-bold text-slate-500 mt-1">{filtered.filter(p=>p.isVoided).length}</p>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input type="text" placeholder="Buscar por número o cliente..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todos los métodos</option>
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
              <option value="check">Cheque</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
        </div>
      </Card>

      {/* Table */}
      {filtered.length > 0 ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Número</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Fecha</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Cliente</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Préstamo</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Monto</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Método</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Cuenta Bancaria</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Registrado por</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Estado</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(payment => (
                  <tr key={payment.id} className={`border-b border-slate-100 hover:bg-slate-50 ${payment.isVoided ? 'opacity-60' : ''}`}>
                    <td className="py-3 px-4 font-mono text-xs font-medium">{payment.paymentNumber}</td>
                    <td className="py-3 px-4">{formatDate(payment.paymentDate)}</td>
                    <td className="py-3 px-4 font-medium">{payment.clientName}</td>
                    <td className="py-3 px-4 font-mono text-xs">{payment.loanNumber}</td>
                    <td className={`py-3 px-4 text-right font-semibold ${payment.isVoided ? 'line-through text-slate-400' : 'text-green-700'}`}>
                      {formatCurrency(payment.amount)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs">{METHOD_LABELS[payment.paymentMethod] || payment.paymentMethod}</span>
                    </td>
                    <td className="py-3 px-4">
                      {payment.bankAccountName ? (
                        <div className="flex items-center gap-1.5">
                          <Landmark className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-slate-700 leading-tight">{payment.bankAccountName}</p>
                            {payment.bankAccountNumber && <p className="text-xs text-slate-400 font-mono leading-tight">{payment.bankAccountNumber}</p>}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Efectivo</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {payment.registeredByName ? (
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400 flex-shrink-0"/>
                          <span className="text-xs text-slate-600">{payment.registeredByName}</span>
                        </div>
                      ) : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    <td className="py-3 px-4">
                      {payment.isVoided ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-slate-200 text-slate-600">Anulado</span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Registrado</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        {/* Print receipt */}
                        <button
                          onClick={() => printPaymentReceipt(payment, (tenantState as any)?.currentTenant?.name || 'PrestaMax')}
                          className="p-1.5 hover:bg-blue-50 rounded text-blue-500 transition-colors"
                          title="Imprimir recibo"
                        >
                          <Printer className="w-3.5 h-3.5"/>
                        </button>
                        {/* WhatsApp */}
                        {!payment.isVoided && payment.clientPhone && (
                          <button
                            onClick={() => sendWhatsApp(payment, (tenantState as any)?.currentTenant?.name || 'PrestaMax')}
                            className="p-1.5 hover:bg-green-50 rounded text-green-600 transition-colors"
                            title="Enviar por WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5"/>
                          </button>
                        )}
                        {/* Edit / Void */}
                        {can('payments.void') && !payment.isVoided && (
                          <>
                            <button
                              onClick={() => openEditPayment(payment)}
                              className="p-1.5 hover:bg-blue-50 rounded text-blue-400 transition-colors"
                              title="Editar pago"
                            >
                              <Edit2 className="w-3.5 h-3.5"/>
                            </button>
                            <button
                              onClick={() => { setVoidingPayment(payment); setVoidReason('') }}
                              className="p-1.5 hover:bg-red-50 rounded text-red-400 transition-colors"
                              title="Anular pago"
                            >
                              <Trash2 className="w-3.5 h-3.5"/>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState icon={CreditCard} title="Sin pagos registrados" description="Los pagos aparecerán aquí cuando se registren" action={{label:'Registrar Pago',onClick:()=>setShowModal(true)}} />
      )}

      {/* Payment Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <Card className="w-full max-w-lg my-4 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="section-title">Registrar Pago</h2>
                {selectedLoan && (
                  <p className="text-xs text-slate-500">{selectedLoan.loanNumber} · {selectedLoan.clientName}</p>
                )}
              </div>
              <button onClick={closeModal} className="p-1 hover:bg-slate-100 rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Overpayment step */}
            {overpaymentStep && preview ? (
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                  <p className="text-amber-800 font-semibold text-sm">Pago excede el saldo adeudado</p>
                  <p className="text-2xl font-bold text-amber-700 mt-1">
                    Excedente: {formatCurrency((parseFloat(payForm.amount) || 0) - preview.totalDue)}
                  </p>
                  <p className="text-xs text-amber-600 mt-1">¿Cómo deseas aplicar este excedente?</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleRegisterPayment('apply_to_capital')}
                    disabled={isSubmitting}
                    className="p-4 border-2 border-blue-300 rounded-lg text-center hover:bg-blue-50 transition-colors disabled:opacity-50"
                  >
                    <TrendingDown className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                    <p className="font-semibold text-blue-900 text-sm">Abonar al Capital</p>
                    <p className="text-xs text-slate-500 mt-1">Reduce el saldo pendiente del préstamo</p>
                  </button>
                  <button
                    onClick={() => handleRegisterPayment('apply_to_next_installment')}
                    disabled={isSubmitting}
                    className="p-4 border-2 border-emerald-300 rounded-lg text-center hover:bg-emerald-50 transition-colors disabled:opacity-50"
                  >
                    <Calendar className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                    <p className="font-semibold text-emerald-900 text-sm">Próxima Cuota</p>
                    <p className="text-xs text-slate-500 mt-1">Anticipa el pago de la siguiente cuota</p>
                  </button>
                </div>
                <Button variant="outline" className="w-full" onClick={() => setOverpaymentStep(false)} disabled={isSubmitting}>
                  ← Volver y editar monto
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Loan selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Préstamo *</label>
                  <select
                    value={payForm.loanId}
                    onChange={e => {
                      const loan = activeLoans.find(l => l.id === e.target.value)
                      setPayForm(f => ({ ...f, loanId: e.target.value, amount: '' }))
                      setPreview(null)
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Selecciona el préstamo —</option>
                    {activeLoans.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.loanNumber} – {l.clientName} ({formatCurrency(l.totalBalance)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Balance summary chips (when loan selected) */}
                {selectedLoan && (
                  <div className="flex gap-2 flex-wrap text-xs">
                    <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-full font-medium">
                      Capital: {formatCurrency(selectedLoan.principalBalance || 0)}
                    </span>
                    <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                      Interés: {formatCurrency(selectedLoan.interestBalance || 0)}
                    </span>
                    {(selectedLoan.moraBalance || 0) > 0 && (
                      <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
                        Mora: {formatCurrency(selectedLoan.moraBalance)}
                      </span>
                    )}
                    <span className="bg-slate-800 text-white px-2 py-1 rounded-full font-semibold ml-auto">
                      Total: {formatCurrency(selectedLoan.totalBalance)}
                    </span>
                  </div>
                )}

                {/* Tabla de cuotas pendientes/vencidas */}
                {selectedLoan && loanDetail?.installments && loanDetail.installments.filter((i: any) => i.status !== 'paid' && i.status !== 'waived').length > 0 && (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Estado de cuotas</span>
                      <div className="flex gap-1.5 flex-wrap text-[10px]">
                        {(() => {
                          const overdueCount = loanDetail.installments.filter((i: any) => i.status !== 'paid' && i.status !== 'waived' && (i.mora_days || 0) > 0).length
                          const totalMoraInst = loanDetail.installments.reduce((s: number, i: any) => s + (i.status !== 'paid' && i.status !== 'waived' ? (i.mora_amount || 0) : 0), 0)
                          return (<>
                            {overdueCount > 0 && (
                              <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{overdueCount} vencida{overdueCount > 1 ? 's' : ''}</span>
                            )}
                            {totalMoraInst > 0 && (
                              <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">Mora: {formatCurrency(totalMoraInst)}</span>
                            )}
                            {(loanDetail.prorroga_fee || 0) > 0 && (
                              <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-medium">Prorroga: {formatCurrency(loanDetail.prorroga_fee)}</span>
                            )}
                          </>)
                        })()}
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-1.5 font-semibold text-slate-600">#</th>
                            <th className="text-left px-3 py-1.5 font-semibold text-slate-600">Vence</th>
                            <th className="text-center px-3 py-1.5 font-semibold text-slate-600">Días</th>
                            <th className="text-right px-3 py-1.5 font-semibold text-slate-600">Cuota</th>
                            <th className="text-right px-3 py-1.5 font-semibold text-slate-600">Mora</th>
                            <th className="text-right px-3 py-1.5 font-semibold text-slate-600">Pendiente</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loanDetail.installments.filter((i: any) => i.status !== 'paid' && i.status !== 'waived').slice(0, 12).map((inst: any) => {
                            const moraDays = inst.mora_days || 0
                            const isOverdue = moraDays > 0
                            const cuota = (inst.principal_amount || 0) + (inst.interest_amount || 0)
                            const pendiente = Math.max(0, cuota - (inst.paid_total || 0)) + (inst.mora_amount || 0)
                            const isPartial = inst.status === 'partial' || (inst.paid_total || 0) > 0
                            return (
                              <tr key={inst.id} className={`border-t border-slate-100 ${isOverdue ? 'bg-red-50' : isPartial ? 'bg-amber-50' : ''}`}>
                                <td className="px-3 py-1.5 text-slate-600">{inst.installment_number}</td>
                                <td className="px-3 py-1.5 text-slate-700">{inst.due_date ? new Date(inst.due_date).toLocaleDateString('es-DO') : '—'}</td>
                                <td className="px-3 py-1.5 text-center">
                                  {isOverdue
                                    ? <span className="text-red-700 font-semibold">{moraDays}d atraso</span>
                                    : isPartial
                                      ? <span className="text-amber-700">parcial</span>
                                      : <span className="text-slate-400">—</span>}
                                </td>
                                <td className="px-3 py-1.5 text-right text-slate-700">{formatCurrency(cuota)}</td>
                                <td className="px-3 py-1.5 text-right">
                                  {(inst.mora_amount || 0) > 0
                                    ? <span className="text-red-600 font-semibold">{formatCurrency(inst.mora_amount)}</span>
                                    : <span className="text-slate-300">—</span>}
                                </td>
                                <td className="px-3 py-1.5 text-right font-semibold text-slate-900">{formatCurrency(pendiente)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Payment type selector */}
                {payForm.loanId && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Tipo de Pago</label>
                    <div className="grid grid-cols-2 gap-2">
                      {getPaymentTypes(selectedLoan).map((pt) => {
                        const Icon = pt.icon
                        const isSelected = payForm.paymentType === pt.value
                        return (
                          <button
                            key={pt.value}
                            onClick={() => setPayForm(f => ({ ...f, paymentType: pt.value }))}
                            className={`p-3 rounded-lg border-2 text-left transition-all ${
                              isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <Icon className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-slate-500'}`} />
                              <span className={`text-sm font-semibold ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>{pt.label}</span>
                            </div>
                            <p className="text-xs text-slate-500 leading-tight">{pt.desc}</p>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Amount */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-slate-700">Monto a Pagar</label>
                    {selectedLoan && (
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          onClick={() => {
                            const ov = selectedLoan.overdueBalance || 0
                            if (ov > 0) setPayForm(f => ({ ...f, amount: String(ov.toFixed(2)) }))
                          }}
                          disabled={(selectedLoan.overdueBalance || 0) <= 0}
                          className={`text-xs font-medium flex items-center gap-1 ${(selectedLoan.overdueBalance || 0) > 0 ? 'text-amber-700 hover:underline' : 'text-slate-400 cursor-not-allowed'}`}
                          title={(selectedLoan.overdueBalance || 0) > 0 ? 'Suma de cuotas vencidas + mora a la fecha' : 'No hay cuotas vencidas en este momento'}
                        >
                          <Zap className="w-3 h-3" />
                          {(selectedLoan.overdueBalance || 0) > 0
                            ? `Pagar vencido (${formatCurrency(selectedLoan.overdueBalance || 0)})`
                            : 'Sin saldo vencido'}
                        </button>
                        <button
                          onClick={() => setPayForm(f => ({ ...f, amount: String(selectedLoan.totalBalance.toFixed(2)) }))}
                          className="text-xs text-blue-600 hover:underline font-medium flex items-center gap-1"
                          title="Liquidar el prestamo completo"
                        >
                          <Zap className="w-3 h-3" />
                          Pagar saldo total
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={payForm.amount}
                    onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-lg"
                  />
                </div>

                {/* Live preview */}
                {payForm.loanId && payForm.amount && parseFloat(payForm.amount) > 0 && (
                  <div className={`rounded-lg border p-3 transition-all ${
                    isPreviewLoading ? 'opacity-50' : ''
                  } ${preview?.isOverpayment ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                    {isPreviewLoading ? (
                      <p className="text-xs text-slate-500 text-center py-1">Calculando...</p>
                    ) : preview ? (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600 flex items-center gap-1"><Percent className="w-3 h-3" /> Interés aplicado</span>
                          <span className="font-semibold text-blue-700">{formatCurrency(preview.breakdown.interest)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Capital abonado</span>
                          <span className="font-semibold text-slate-900">{formatCurrency(preview.breakdown.capital)}</span>
                        </div>
                        {preview.breakdown.mora > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-red-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Mora cubierta</span>
                            <span className="font-semibold text-red-600">{formatCurrency(preview.breakdown.mora)}</span>
                          </div>
                        )}
                        {preview.breakdown.excessToCapital > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-emerald-600 flex items-center gap-1"><Coins className="w-3 h-3" /> Excedente</span>
                            <span className="font-semibold text-emerald-700">{formatCurrency(preview.breakdown.excessToCapital)}</span>
                          </div>
                        )}
                        <div className="border-t border-slate-200 pt-1.5 flex justify-between text-xs">
                          <span className="text-slate-600 font-medium">Saldo restante</span>
                          <span className={`font-bold ${preview.remaining <= 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
                            {preview.remaining <= 0 ? '✓ Saldado' : formatCurrency(preview.remaining)}
                          </span>
                        </div>
                        {preview.isOverpayment && (
                          <div className="flex items-center gap-1 pt-0.5">
                            <Info className="w-3 h-3 text-amber-600" />
                            <p className="text-xs text-amber-700 font-medium">Hay un excedente — se te pedirá cómo aplicarlo</p>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Method + Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Método</label>
                    <select
                      value={payForm.paymentMethod}
                      onChange={e => setPayForm(f => ({ ...f, paymentMethod: e.target.value, bankAccountId: e.target.value === 'cash' ? '' : f.bankAccountId }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="cash">Efectivo</option>
                      <option value="transfer">Transferencia</option>
                      <option value="check">Cheque</option>
                      <option value="card">Tarjeta</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Fecha de Pago</label>
                    <input
                      type="date"
                      value={payForm.paymentDate}
                      onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Bank account */}
                {bankAccounts.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1 flex items-center gap-1">
                      <Landmark className="w-3.5 h-3.5" />
                      Cuenta Bancaria{payForm.paymentMethod !== 'cash' ? ' Receptora *' : ' (opcional)'}
                    </label>
                    <select
                      value={payForm.bankAccountId}
                      onChange={e => setPayForm(f => ({ ...f, bankAccountId: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">{payForm.paymentMethod === 'cash' ? '— Sin cuenta (efectivo) —' : '— Selecciona la cuenta —'}</option>
                      {bankAccounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.bankName}{acc.accountNumber ? ` – ${acc.accountNumber}` : ''} ({acc.currency})
                        </option>
                      ))}
                    </select>
                    {payForm.paymentMethod !== 'cash' && !payForm.bankAccountId && (
                      <p className="text-xs text-amber-600 mt-1">Requerido para pagos que no son en efectivo</p>
                    )}
                  </div>
                )}
                {bankAccounts.length === 0 && payForm.paymentMethod !== 'cash' && (
                  <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                    No hay cuentas bancarias configuradas. Ve a <strong>Configuración → Cuentas Bancarias</strong>.
                  </div>
                )}

                {/* Reference */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Referencia <span className="font-normal text-slate-400">(opcional)</span></label>
                  <input
                    type="text"
                    value={payForm.reference}
                    onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))}
                    placeholder="Núm. de transferencia o cheque..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Notas <span className="font-normal text-slate-400">(opcional)</span></label>
                  <textarea
                    value={payForm.notes}
                    onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={closeModal} disabled={isSubmitting}>Cancelar</Button>
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => handleRegisterPayment()}
                    disabled={isSubmitting || !payForm.loanId || !payForm.amount || parseFloat(payForm.amount) <= 0}
                  >
                    {isSubmitting ? 'Registrando...' : preview?.isOverpayment ? 'Continuar →' : 'Registrar Pago'}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Edit Payment Modal ── */}
      {editingPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="section-title">Editar Pago</h2>
                <p className="text-xs text-slate-500">{editingPayment.paymentNumber} · {editingPayment.clientName}</p>
              </div>
              <button onClick={() => setEditingPayment(null)} className="p-1 hover:bg-slate-100 rounded">
                <X className="w-5 h-5 text-slate-500"/>
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5"/>
              <p className="text-xs text-amber-800">Solo se pueden corregir datos como fecha, método de pago, referencia y notas. El monto del pago no puede modificarse para mantener la integridad contable.</p>
            </div>

            {/* Edit form fields */}
            <div className="space-y-3">
              {/* Payment date */}
              <div>
                <label className="form-label">Fecha de Pago *</label>
                <input
                  type="date"
                  className="input-field"
                  value={editForm.paymentDate}
                  onChange={e => setEditForm(f => ({ ...f, paymentDate: e.target.value }))}
                />
              </div>

              {/* Payment method */}
              <div>
                <label className="form-label">Metodo de Pago *</label>
                <select
                  className="input-field"
                  value={editForm.paymentMethod}
                  onChange={e => setEditForm(f => ({ ...f, paymentMethod: e.target.value, bankAccountId: e.target.value === 'cash' ? '' : f.bankAccountId }))}
                >
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia</option>
                  <option value="check">Cheque</option>
                  <option value="card">Tarjeta</option>
                </select>
              </div>

              {/* Bank account */}
              <div>
                <label className="form-label">
                  Cuenta Bancaria{editForm.paymentMethod !== 'cash' ? ' Receptora' : ' (opcional)'}
                </label>
                <select
                  className="input-field"
                  value={editForm.bankAccountId}
                  onChange={e => setEditForm(f => ({ ...f, bankAccountId: e.target.value }))}
                >
                  <option value="">{editForm.paymentMethod === 'cash' ? '— Sin cuenta (efectivo) —' : '— Selecciona la cuenta —'}</option>
                  {bankAccounts.map(ba => (
                    <option key={ba.id} value={ba.id}>{ba.bankName} – {ba.accountNumber}</option>
                  ))}
                </select>
              </div>

              {/* Reference */}
              <div>
                <label className="form-label">Referencia / Núm. Comprobante</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Núm. de transferencia o cheque..."
                  value={editForm.reference}
                  onChange={e => setEditForm(f => ({ ...f, reference: e.target.value }))}
                />
              </div>

              {/* Notes */}
              <div>
                <label className="form-label">Notas</label>
                <textarea
                  className="input-field resize-none"
                  rows={2}
                  placeholder="Observaciones adicionales..."
                  value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditingPayment(null)} disabled={isSubmitting}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  onClick={handleSaveEdit}
                  disabled={isSubmitting || !editForm.paymentDate}
                >
                  {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Void Confirmation Modal ── */}
      {voidingPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600"/>
              </div>
              <div>
                <h2 className="section-title text-red-700">Anular Pago</h2>
                <p className="text-xs text-slate-500">{voidingPayment.paymentNumber} · {voidingPayment.clientName}</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              Esta acción anulará el pago de{' '}
              <span className="font-semibold text-slate-800">
                ${parseFloat(voidingPayment.amount as any || '0').toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </span>{' '}
              y revertirá su efecto en el préstamo. Esta operación no se puede deshacer.
            </p>

            <div className="mb-4">
              <label className="form-label">Motivo de Anulación *</label>
              <textarea
                className="input-field resize-none"
                rows={3}
                placeholder="Describe el motivo de la anulación..."
                value={voidReason}
                onChange={e => setVoidReason(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setVoidingPayment(null); setVoidReason('') }}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700"
                onClick={handleVoidPayment}
                disabled={isSubmitting || !voidReason.trim()}
              >
                {isSubmitting ? 'Anulando...' : 'Confirmar Anulación'}
              </Button>
            </div>
          </Card>
        </div>
      )}

    </div>
  )
}

export default PaymentsPage

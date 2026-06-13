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
import api, { isAccessDenied, isSubscriptionExpired } from '@/lib/api'
import toast from 'react-hot-toast'
import { printPaymentReceipt, sendReceiptByWhatsApp } from '@/lib/printReceipt'
import { AuthContext } from '@/contexts/AuthContext'
import { TenantContext } from '@/contexts/TenantContext'
import { usePermission } from '@/hooks/usePermission'
import { useT, t as tg } from '@/lib/i18n'

interface Payment {
  id: string
  loanId: string
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

// Etiquetas de método: usan el motor i18n (tg = traductor no-hook).
const methodLabel = (m: string): string => tg('method.' + m, m)

// ── Send WhatsApp confirmation ─────────────────────────────────────────────────
const sendWhatsApp = (p: Payment, tenantName: string) => {
  const phone = (p.clientPhone || '').replace(/\D/g, '')
  if (!phone) { alert(tg('pay.no_phone')); return }
  const fmtMoney = (n: number) => `RD$${(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const msg = `✅ *${tg('pay.wa.title')}*\n\n🏢 *${tenantName}*\n${tg('pay.wa.receipt')}: ${p.receiptNumber || p.paymentNumber}\n${tg('pay.wa.date')}: ${fmtDate(p.paymentDate)}\n${tg('pay.wa.loan')}: ${p.loanNumber}\n${tg('pay.wa.amount')}: *${fmtMoney(p.amount)}*\n${tg('pay.wa.method')}: ${methodLabel(p.paymentMethod)}\n\n_${tg('pay.wa.thanks')}_`
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
  window.open(url, '_blank')
}

function getPaymentTypes(loan?: ActiveLoan | null) {
  const types = [
    { value: 'regular',       icon: CreditCard,   label: tg('pay.type.regular'),  desc: tg('pay.type.regular_desc') },
    { value: 'interest_only', icon: Percent,      label: tg('pay.type.interest'), desc: tg('pay.type.interest_desc') },
    { value: 'capital_only',  icon: TrendingDown, label: tg('pay.type.capital'),  desc: tg('pay.type.capital_desc') },
    { value: 'full_payoff',   icon: Zap,          label: tg('pay.type.payoff'),   desc: tg('pay.type.payoff_desc') },
  ]
  if (loan && (loan.prorrogaFee || 0) > 0) {
    types.push({ value: 'prorroga', icon: RotateCcw, label: tg('pay.type.prorroga'), desc: tg('pay.type.prorroga_desc') })
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
  const t = useT()

  const [payments, setPayments] = useState<Payment[]>([])
  const [lastPayment, setLastPayment] = useState<any>(null)
  const [showPostPaymentModal, setShowPostPaymentModal] = useState(false)
  const [activeLoans, setActiveLoans] = useState<ActiveLoan[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [loanDetail, setLoanDetail] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [voidedFilter, setVoidedFilter] = useState<'valid' | 'voided' | 'all'>('valid')
  const [voidedCounts, setVoidedCounts] = useState<{ valid: number; voided: number }>({ valid: 0, voided: 0 })
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

  const fetchPayments = async (filter: 'valid' | 'voided' | 'all' = voidedFilter) => {
    try {
      const res = await api.get(`/payments?voided_filter=${filter}&limit=500`)
      setPayments(res.data.data || [])
      if (res.data.counts) setVoidedCounts(res.data.counts)
    } catch (err) {
      if (!isAccessDenied(err) && !isSubscriptionExpired(err)) toast.error(t('pay.load_error'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPayments(voidedFilter)
  }, [voidedFilter])

  useEffect(() => {
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
      toast.success(t('pay.updated'))
      setEditingPayment(null)
      fetchPayments()
    } catch (err: any) {
      const msg = err?.response?.data?.error || t('pay.update_error')
      toast.error(msg)
    } finally { setIsSavingEdit(false) }
  }

  const handleVoidPayment = async () => {
    if (!voidingPayment || !voidReason.trim()) {
      toast.error(t('pay.void_reason_required'))
      return
    }
    setIsVoiding(true)
    try {
      await api.post(`/payments/${voidingPayment.id}/void`, { voidReason })
      toast.success(t('pay.voided_ok'))
      setVoidingPayment(null)
      setVoidReason('')
      fetchPayments()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('pay.void_error'))
    } finally { setIsVoiding(false) }
  }

  const handleRegisterPayment = async (confirmedOverpaymentAction?: string, overrideAmount?: number) => {
    const amountToPay = overrideAmount ?? parseFloat(payForm.amount)
    if (!payForm.loanId || !amountToPay || amountToPay <= 0) {
      toast.error(t('pay.select_loan_amount'))
      return
    }
    // Si el monto excede la deuda, mostrar paso informativo. El backend ahora
    // RECHAZA montos no asignables — este paso ofrece registrar el maximo aplicable.
    if (preview?.isOverpayment && !overpaymentStep && !confirmedOverpaymentAction && overrideAmount === undefined) {
      setOverpaymentStep(true)
      return
    }
    try {
      setIsSubmitting(true)
      const payRes = await api.post('/payments', {
        loanId: payForm.loanId,
        amount: amountToPay,
        paymentMethod: payForm.paymentMethod,
        bankAccountId: payForm.bankAccountId || undefined,
        reference: payForm.reference || undefined,
        paymentDate: new Date(payForm.paymentDate + 'T12:00:00').toISOString(),
        notes: payForm.notes || undefined,
        paymentType: payForm.paymentType,
        overpaymentAction: confirmedOverpaymentAction || payForm.overpaymentAction,
      })
      toast.success(t('pay.registered_ok'))
      const loanForReceipt = selectedLoan
      closeModal()
      fetchPayments()
      if (payRes?.data?.payment && loanForReceipt) {
        const pmt = payRes.data.payment as any
        const rcp = payRes.data.receipt as any
        setLastPayment({
          ...pmt,
          receiptNumber: rcp?.receiptNumber || pmt.receiptNumber,
          clientName: (loanForReceipt as any).clientName,
          loanNumber: (loanForReceipt as any).loanNumber,
          loanId: payForm.loanId,
          clientWhatsapp: (loanForReceipt as any).clientWhatsapp || (loanForReceipt as any).clientPhone || '',
          principalBalance: (loanForReceipt as any).principalBalance,
          interestBalance: (loanForReceipt as any).interestBalance,
          moraBalance: (loanForReceipt as any).moraBalance,
        })
        setShowPostPaymentModal(true)
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('pay.register_error'))
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
          <h1 className="page-title">{t('nav.payments')}</h1>
          <p className="text-slate-600 text-sm mt-1">{t('pay.subtitle')}</p>
        </div>
        {can('payments.create') && (
          <Button onClick={() => setShowModal(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />{t('pay.register')}
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="p-4 text-center bg-green-50">
          <p className="text-xs text-slate-500 uppercase font-medium">{t('pay.total_filtered')}</p>
          <p className="text-lg font-bold text-green-700 mt-1">{formatCurrency(totalAmount)}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xs text-slate-500 uppercase font-medium">{t('pay.valid_payments')}</p>
          <p className="text-lg font-bold text-slate-800 mt-1">{voidedCounts.valid}</p>
        </Card>
        <Card className="p-4 text-center bg-slate-50">
          <p className="text-xs text-slate-500 uppercase font-medium">{t('pay.voided')}</p>
          <p className="text-lg font-bold text-slate-500 mt-1">{voidedCounts.voided}</p>
        </Card>
      </div>

      {/* Toggle Validos / Anulados / Todos */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setVoidedFilter('valid')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${voidedFilter === 'valid' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
        >{t('pay.valid')} ({voidedCounts.valid})</button>
        <button
          onClick={() => setVoidedFilter('voided')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${voidedFilter === 'voided' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
        >{t('pay.voided')} ({voidedCounts.voided})</button>
        <button
          onClick={() => setVoidedFilter('all')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${voidedFilter === 'all' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
        >{t('common.all')} ({voidedCounts.valid + voidedCounts.voided})</button>
      </div>

      {/* Filters */}
      <Card>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input type="text" placeholder={t('pay.search_ph')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">{t('pay.all_methods')}</option>
              <option value="cash">{t('method.cash')}</option>
              <option value="transfer">{t('method.transfer')}</option>
              <option value="check">{t('method.check')}</option>
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
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('col.number')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('col.date')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('col.client')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('col.loan')}</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('col.amount')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('col.method')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('col.bank')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('col.registered_by')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('col.status')}</th>
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
                      <span className="text-xs">{methodLabel(payment.paymentMethod)}</span>
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
                        <span className="text-xs text-slate-400">{t('method.cash')}</span>
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
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-slate-200 text-slate-600">{t('pay.st_voided')}</span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">{t('pay.st_registered')}</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        {/* Print receipt */}
                        <button
                          onClick={() => printPaymentReceipt(payment, (tenantState as any)?.currentTenant?.tenant || { name: 'Negocio' })}
                          className="p-1.5 hover:bg-blue-50 rounded text-blue-500 transition-colors"
                          title={t('pay.print_receipt')}
                        >
                          <Printer className="w-3.5 h-3.5"/>
                        </button>
                        {/* WhatsApp */}
                        {!payment.isVoided && payment.clientPhone && (
                          <button
                            onClick={() => sendWhatsApp(payment, (tenantState as any)?.currentTenant?.tenant?.name || 'Negocio')}
                            className="p-1.5 hover:bg-green-50 rounded text-green-600 transition-colors"
                            title={t('pay.send_whatsapp')}
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
                              title={t('pay.edit_title')}
                            >
                              <Edit2 className="w-3.5 h-3.5"/>
                            </button>
                            <button
                              onClick={() => { setVoidingPayment(payment); setVoidReason('') }}
                              className="p-1.5 hover:bg-red-50 rounded text-red-400 transition-colors"
                              title={t('pay.void_title')}
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
        <EmptyState icon={CreditCard} title={t('pay.empty_title')} description={t('pay.empty_desc')} action={{label:t('pay.register'),onClick:()=>setShowModal(true)}} />
      )}

      {/* Payment Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-2 sm:p-4 overflow-y-auto">
          <Card className="w-full max-w-lg my-2 sm:my-4 max-h-[95vh] sm:max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="section-title">{t('pay.register')}</h2>
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
                {(() => {
                  const maxPayable = (preview as any).maxPayable ?? preview.totalDue
                  const excess = (parseFloat(payForm.amount) || 0) - maxPayable
                  return (<>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                      <p className="text-amber-800 font-semibold text-sm">{t('pay.over_title')}</p>
                      <p className="text-2xl font-bold text-amber-700 mt-1">
                        {t('pay.excess')}: {formatCurrency(excess)}
                      </p>
                      <p className="text-xs text-amber-600 mt-1">
                        {t('pay.over_desc')}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRegisterPayment(undefined, maxPayable)}
                      disabled={isSubmitting || maxPayable <= 0}
                      className="w-full p-4 border-2 border-emerald-300 rounded-lg text-center hover:bg-emerald-50 transition-colors disabled:opacity-50"
                    >
                      <TrendingDown className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                      <p className="font-semibold text-emerald-900 text-sm">
                        {t('pay.register_full').replace('{amt}', formatCurrency(maxPayable))}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {t('pay.payoff_change').replace('{amt}', formatCurrency(excess))}
                      </p>
                    </button>
                    <Button variant="outline" className="w-full" onClick={() => setOverpaymentStep(false)} disabled={isSubmitting}>
                      {t('pay.back_edit')}
                    </Button>
                  </>)
                })()}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Loan selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{t('pay.loan_label')}</label>
                  <select
                    value={payForm.loanId}
                    onChange={e => {
                      const loan = activeLoans.find(l => l.id === e.target.value)
                      setPayForm(f => ({ ...f, loanId: e.target.value, amount: '' }))
                      setPreview(null)
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">{t('pay.select_loan_opt')}</option>
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
                      {t('pay.cap_label')}: {formatCurrency(selectedLoan.principalBalance || 0)}
                    </span>
                    <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                      {t('pay.int_label')}: {formatCurrency(selectedLoan.interestBalance || 0)}
                    </span>
                    {(selectedLoan.moraBalance || 0) > 0 && (
                      <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
                        {t('pay.mora_label')}: {formatCurrency(selectedLoan.moraBalance)}
                      </span>
                    )}
                    <span className="bg-slate-800 text-white px-2 py-1 rounded-full font-semibold ml-auto">
                      {t('pay.total_label')}: {formatCurrency(selectedLoan.totalBalance)}
                    </span>
                  </div>
                )}

                {/* Tabla de cuotas pendientes/vencidas */}
                {selectedLoan && loanDetail?.installments && loanDetail.installments.filter((i: any) => i.status !== 'paid' && i.status !== 'waived').length > 0 && (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{t('pay.installments_status')}</span>
                      <div className="flex gap-1.5 flex-wrap text-[10px]">
                        {(() => {
                          const overdueCount = loanDetail.installments.filter((i: any) => i.status !== 'paid' && i.status !== 'waived' && (i.moraDays || 0) > 0).length
                          const totalMoraInst = loanDetail.installments.reduce((s: number, i: any) => s + (i.status !== 'paid' && i.status !== 'waived' ? (i.moraAmount || 0) : 0), 0)
                          return (<>
                            {overdueCount > 0 && (
                              <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{t('pay.overdue_badge').replace('{n}', String(overdueCount))}</span>
                            )}
                            {totalMoraInst > 0 && (
                              <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">{t('pay.mora_label')}: {formatCurrency(totalMoraInst)}</span>
                            )}
                            {(loanDetail.prorrogaFee || 0) > 0 && (
                              <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-medium">{t('pay.prorroga_label')}: {formatCurrency(loanDetail.prorrogaFee)}</span>
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
                            <th className="text-left px-3 py-1.5 font-semibold text-slate-600">{t('pay.due')}</th>
                            <th className="text-center px-3 py-1.5 font-semibold text-slate-600">{t('col.days')}</th>
                            <th className="text-right px-3 py-1.5 font-semibold text-slate-600">{t('pay.cuota')}</th>
                            <th className="text-right px-3 py-1.5 font-semibold text-slate-600">{t('pay.mora_label')}</th>
                            <th className="text-right px-3 py-1.5 font-semibold text-slate-600">{t('pay.pending')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loanDetail.installments.filter((i: any) => i.status !== 'paid' && i.status !== 'waived').slice(0, 12).map((inst: any) => {
                            const moraDays = inst.moraDays || 0
                            const isOverdue = moraDays > 0
                            const cuota = (inst.principalAmount || 0) + (inst.interestAmount || 0)
                            const pendiente = Math.max(0, cuota - (inst.paidTotal || 0)) + (inst.moraAmount || 0)
                            const isPartial = inst.status === 'partial' || (inst.paidTotal || 0) > 0
                            return (
                              <tr key={inst.id} className={`border-t border-slate-100 ${isOverdue ? 'bg-red-50' : isPartial ? 'bg-amber-50' : ''}`}>
                                <td className="px-3 py-1.5 text-slate-600">{inst.installmentNumber}</td>
                                <td className="px-3 py-1.5 text-slate-700">{inst.dueDate ? new Date(inst.dueDate).toLocaleDateString('es-DO') : '—'}</td>
                                <td className="px-3 py-1.5 text-center">
                                  {isOverdue
                                    ? <span className="text-red-700 font-semibold">{t('pay.days_overdue').replace('{n}', String(moraDays))}</span>
                                    : isPartial
                                      ? <span className="text-amber-700">{t('pay.partial')}</span>
                                      : <span className="text-slate-400">—</span>}
                                </td>
                                <td className="px-3 py-1.5 text-right text-slate-700">{formatCurrency(cuota)}</td>
                                <td className="px-3 py-1.5 text-right">
                                  {(inst.moraAmount || 0) > 0
                                    ? <span className="text-red-600 font-semibold">{formatCurrency(inst.moraAmount)}</span>
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
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">{t('pay.payment_type')}</label>
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
                    <label className="block text-sm font-medium text-slate-700">{t('pay.amount_to_pay')}</label>
                    {selectedLoan && (
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          onClick={() => {
                            const ov = selectedLoan.overdueBalance || 0
                            if (ov > 0) setPayForm(f => ({ ...f, amount: String(ov.toFixed(2)) }))
                          }}
                          disabled={(selectedLoan.overdueBalance || 0) <= 0}
                          className={`text-xs font-medium flex items-center gap-1 ${(selectedLoan.overdueBalance || 0) > 0 ? 'text-amber-700 hover:underline' : 'text-slate-400 cursor-not-allowed'}`}
                          title={(selectedLoan.overdueBalance || 0) > 0 ? t('pay.pay_overdue_title') : t('pay.no_overdue_title')}
                        >
                          <Zap className="w-3 h-3" />
                          {(selectedLoan.overdueBalance || 0) > 0
                            ? t('pay.pay_overdue').replace('{amt}', formatCurrency(selectedLoan.overdueBalance || 0))
                            : t('pay.no_overdue')}
                        </button>
                        <button
                          onClick={() => setPayForm(f => ({ ...f, amount: String(selectedLoan.totalBalance.toFixed(2)) }))}
                          className="text-xs text-blue-600 hover:underline font-medium flex items-center gap-1"
                          title={t('pay.pay_full_title')}
                        >
                          <Zap className="w-3 h-3" />
                          {t('pay.pay_full')}
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
                      <p className="text-xs text-slate-500 text-center py-1">{t('pay.calculating')}</p>
                    ) : preview ? (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600 flex items-center gap-1"><Percent className="w-3 h-3" /> {t('pay.applied_interest')}</span>
                          <span className="font-semibold text-blue-700">{formatCurrency(preview.breakdown.interest)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> {t('pay.applied_capital')}</span>
                          <span className="font-semibold text-slate-900">{formatCurrency(preview.breakdown.capital)}</span>
                        </div>
                        {preview.breakdown.mora > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-red-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {t('pay.mora_covered')}</span>
                            <span className="font-semibold text-red-600">{formatCurrency(preview.breakdown.mora)}</span>
                          </div>
                        )}
                        {preview.breakdown.excessToCapital > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-emerald-600 flex items-center gap-1"><Coins className="w-3 h-3" /> {t('pay.excess_label')}</span>
                            <span className="font-semibold text-emerald-700">{formatCurrency(preview.breakdown.excessToCapital)}</span>
                          </div>
                        )}
                        <div className="border-t border-slate-200 pt-1.5 flex justify-between text-xs">
                          <span className="text-slate-600 font-medium">{t('pay.remaining')}</span>
                          <span className={`font-bold ${preview.remaining <= 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
                            {preview.remaining <= 0 ? t('pay.settled') : formatCurrency(preview.remaining)}
                          </span>
                        </div>
                        {preview.isOverpayment && (
                          <div className="flex items-center gap-1 pt-0.5">
                            <Info className="w-3 h-3 text-amber-600" />
                            <p className="text-xs text-amber-700 font-medium">{t('pay.over_info')}</p>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Method + Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{t('col.method')}</label>
                    <select
                      value={payForm.paymentMethod}
                      onChange={e => setPayForm(f => ({ ...f, paymentMethod: e.target.value, bankAccountId: e.target.value === 'cash' ? '' : f.bankAccountId }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="cash">{t('method.cash')}</option>
                      <option value="transfer">{t('method.transfer')}</option>
                      <option value="check">{t('method.check')}</option>
                      <option value="card">{t('method.card')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{t('pay.payment_date')}</label>
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
                      {t('col.bank')}{payForm.paymentMethod !== 'cash' ? ` ${t('pay.receiver')} *` : ` (${t('common.optional')})`}
                    </label>
                    <select
                      value={payForm.bankAccountId}
                      onChange={e => setPayForm(f => ({ ...f, bankAccountId: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">{payForm.paymentMethod === 'cash' ? t('pay.no_account') : t('pay.select_account')}</option>
                      {bankAccounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.bankName}{acc.accountNumber ? ` – ${acc.accountNumber}` : ''} ({acc.currency})
                        </option>
                      ))}
                    </select>
                    {payForm.paymentMethod !== 'cash' && !payForm.bankAccountId && (
                      <p className="text-xs text-amber-600 mt-1">{t('pay.bank_required')}</p>
                    )}
                  </div>
                )}
                {bankAccounts.length === 0 && payForm.paymentMethod !== 'cash' && (
                  <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                    {t('pay.no_banks')}
                  </div>
                )}

                {/* Reference */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{t('pay.reference')} <span className="font-normal text-slate-400">({t('common.optional')})</span></label>
                  <input
                    type="text"
                    value={payForm.reference}
                    onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))}
                    placeholder={t('pay.reference_ph')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{t('pay.notes')} <span className="font-normal text-slate-400">({t('common.optional')})</span></label>
                  <textarea
                    value={payForm.notes}
                    onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={closeModal} disabled={isSubmitting}>{t('common.cancel')}</Button>
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => handleRegisterPayment()}
                    disabled={isSubmitting || !payForm.loanId || !payForm.amount || parseFloat(payForm.amount) <= 0}
                  >
                    {isSubmitting ? t('pay.registering') : preview?.isOverpayment ? t('pay.continue') : t('pay.register')}
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
                <h2 className="section-title">{t('pay.edit_payment')}</h2>
                <p className="text-xs text-slate-500">{editingPayment.paymentNumber} · {editingPayment.clientName}</p>
              </div>
              <button onClick={() => setEditingPayment(null)} className="p-1 hover:bg-slate-100 rounded">
                <X className="w-5 h-5 text-slate-500"/>
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5"/>
              <p className="text-xs text-amber-800">{t('pay.edit_warning')}</p>
            </div>

            {/* Edit form fields */}
            <div className="space-y-3">
              {/* Payment date */}
              <div>
                <label className="form-label">{t('pay.payment_date')} *</label>
                <input
                  type="date"
                  className="input-field"
                  value={editForm.paymentDate}
                  onChange={e => setEditForm(f => ({ ...f, paymentDate: e.target.value }))}
                />
              </div>

              {/* Payment method */}
              <div>
                <label className="form-label">{t('pay.method_label')}</label>
                <select
                  className="input-field"
                  value={editForm.paymentMethod}
                  onChange={e => setEditForm(f => ({ ...f, paymentMethod: e.target.value, bankAccountId: e.target.value === 'cash' ? '' : f.bankAccountId }))}
                >
                  <option value="cash">{t('method.cash')}</option>
                  <option value="transfer">{t('method.transfer')}</option>
                  <option value="check">{t('method.check')}</option>
                  <option value="card">{t('method.card')}</option>
                </select>
              </div>

              {/* Bank account */}
              <div>
                <label className="form-label">
                  {t('col.bank')}{editForm.paymentMethod !== 'cash' ? ` ${t('pay.receiver')}` : ` (${t('common.optional')})`}
                </label>
                <select
                  className="input-field"
                  value={editForm.bankAccountId}
                  onChange={e => setEditForm(f => ({ ...f, bankAccountId: e.target.value }))}
                >
                  <option value="">{editForm.paymentMethod === 'cash' ? t('pay.no_account') : t('pay.select_account')}</option>
                  {bankAccounts.map(ba => (
                    <option key={ba.id} value={ba.id}>{ba.bankName} – {ba.accountNumber}</option>
                  ))}
                </select>
              </div>

              {/* Reference */}
              <div>
                <label className="form-label">{t('pay.reference_voucher')}</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder={t('pay.reference_ph')}
                  value={editForm.reference}
                  onChange={e => setEditForm(f => ({ ...f, reference: e.target.value }))}
                />
              </div>

              {/* Notes */}
              <div>
                <label className="form-label">{t('pay.notes')}</label>
                <textarea
                  className="input-field resize-none"
                  rows={2}
                  placeholder={t('pay.notes_ph')}
                  value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditingPayment(null)} disabled={isSubmitting}>
                  {t('common.cancel')}
                </Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  onClick={handleSaveEdit}
                  disabled={isSubmitting || !editForm.paymentDate}
                >
                  {isSubmitting ? t('pay.saving') : t('common.save_changes')}
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
                <h2 className="section-title text-red-700">{t('pay.void_payment')}</h2>
                <p className="text-xs text-slate-500">{voidingPayment.paymentNumber} · {voidingPayment.clientName}</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              {t('pay.void_desc_pre')}{' '}
              <span className="font-semibold text-slate-800">
                ${parseFloat(voidingPayment.amount as any || '0').toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </span>{' '}
              {t('pay.void_desc_post')}
            </p>

            <div className="mb-4">
              <label className="form-label">{t('pay.void_reason_label')}</label>
              <textarea
                className="input-field resize-none"
                rows={3}
                placeholder={t('pay.void_reason_ph')}
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
                {t('common.cancel')}
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700"
                onClick={handleVoidPayment}
                disabled={isSubmitting || !voidReason.trim()}
              >
                {isSubmitting ? t('pay.voiding') : t('pay.confirm_void')}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Modal Post-Pago */}
      {showPostPaymentModal && lastPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowPostPaymentModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CreditCard className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{t('pay.post_title')}</h3>
                  <p className="text-xs text-slate-500">{t('pay.receipt_word')} {lastPayment.receiptNumber || lastPayment.paymentNumber} · {formatCurrency(lastPayment.amount || 0)}</p>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-slate-600">{t('pay.post_question')}</p>
              <button type="button" onClick={async () => { const tn = (tenantState as any)?.currentTenant?.tenant || { name: 'Negocio' }; await printPaymentReceipt(lastPayment, tn); }} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#1e3a5f] text-white rounded-lg font-medium hover:bg-[#152a45] transition">
                <Printer className="w-4 h-4" /> {t('pay.print_receipt')}
              </button>
              <button type="button" onClick={() => { const tn = (tenantState as any)?.currentTenant?.tenant || { name: 'Negocio' }; const phone = lastPayment.clientWhatsapp || ''; if (!phone) toast(t('pay.no_whatsapp'), { icon: '⚠️' }); sendReceiptByWhatsApp(phone, lastPayment, tn, { principalBalance: lastPayment.principalBalance, interestBalance: lastPayment.interestBalance, moraBalance: lastPayment.moraBalance }); }} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition">
                <MessageCircle className="w-4 h-4" /> {t('pay.send_whatsapp')}
              </button>
              <button type="button" onClick={() => setShowPostPaymentModal(false)} className="w-full px-4 py-2 text-sm text-slate-600 hover:text-slate-900">{t('common.close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PaymentsPage

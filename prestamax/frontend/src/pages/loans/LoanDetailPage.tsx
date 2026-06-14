import React, { useContext, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { PageLoadingState } from '@/components/ui/Loading'
import LoanStatusBadge from '@/components/shared/LoanStatusBadge'
import ScoreBadge from '@/components/shared/ScoreBadge'
import {
  ArrowLeft, DollarSign, FileText, Send, CheckCircle,
  XCircle, User, Calendar, Percent, CreditCard, AlertTriangle, X,
  TrendingDown, Coins, Zap, Info, Edit2, Trash2, Users, MessageCircle,
  Printer, FileCheck, ChevronDown, Globe
} from 'lucide-react'
import { formatCurrency, formatDate, getCurrencySymbol } from '@/lib/utils'
import api, { isAccessDenied, isSubscriptionExpired } from '@/lib/api'
import toast from 'react-hot-toast'
import EditLoanModal from './EditLoanModal'
import { AuthContext } from '@/contexts/AuthContext'
import { TenantContext } from '@/contexts/TenantContext'
import { usePermission } from '@/hooks/usePermission'
import { AMORT_LABELS, getAmortLabel } from '@/lib/amortization'
import { printPaymentReceipt, sendReceiptByWhatsApp } from '@/lib/printReceipt'
import { useT } from '@/lib/i18n'

interface Installment {
  id: string
  installmentNumber: number
  dueDate: string
  principalAmount: number
  interestAmount: number
  totalAmount: number
  paidPrincipal: number
  paidInterest: number
  paidMora: number
  paidTotal: number
  moraAmount: number
  moraDays: number
  status: string
  paidAt: string | null
  // Interest-only deferral fields
  deferredDueDate?: string | null
  effectiveDueDate?: string | null
  interestPaidAt?: string | null
  interestPaidAmount?: number
  // Prorroga extension counter
  prorrogaCount?: number
  prorroga_count?: number
}

interface LoanDetail {
  id: string
  loanNumber: string
  status: string
  requestedAmount: number
  approvedAmount: number
  disbursedAmount: number
  rate: number
  rateType: string
  term: number
  termUnit: string
  paymentFrequency: string
  amortizationType: string
  applicationDate: string
  approvalDate: string | null
  disbursementDate: string | null
  firstPaymentDate: string | null
  maturityDate: string | null
  principalBalance: number
  interestBalance: number
  moraBalance: number
  totalBalance: number
  totalPaid: number
  daysOverdue: number
  purpose: string | null
  clientName: string
  clientIdNumber: string
  clientPhone: string
  clientWhatsapp: string
  clientScore: number
  clientId: string
  productName: string
  productType: string
  installments: Installment[]
  overtimeCharge: number
  overtimeDays: number
  moraRateDaily: number
  collectorId: string | null
  collectorName: string | null
  currency?: string
  exchangeRateToDop?: number
  prorrogaFee?: number
}

interface LoanPayment {
  id: string
  paymentNumber: number
  paymentDate: string
  amount: number
  appliedInterest: number
  appliedCapital: number
  appliedMora: number
  paymentMethod: string
  reference: string | null
  notes: string | null
  status: string
  voidedAt: string | null
  voidReason: string | null
}

const FREQ_KEYS: Record<string, string> = {
  daily: 'ld.freq.daily', biweekly: 'ld.freq.biweekly', weekly: 'ld.freq.weekly',
  monthly: 'ld.freq.monthly', quarterly: 'ld.freq.quarterly'
}

// AMORT_LABELS importado de @/lib/amortization

const INSTALLMENT_STATUS: Record<string, { labelKey: string; cls: string }> = {
  pending:       { labelKey: 'ld.ist.pending',       cls: 'bg-slate-100 text-slate-700' },
  partial:       { labelKey: 'ld.ist.partial',       cls: 'bg-amber-100 text-amber-700' },
  paid:          { labelKey: 'ld.ist.paid',          cls: 'bg-emerald-100 text-emerald-700' },
  overdue:       { labelKey: 'ld.ist.overdue',       cls: 'bg-red-100 text-red-700' },
  interest_paid: { labelKey: 'ld.ist.interest_paid', cls: 'bg-purple-100 text-purple-700' },
}

// ── Payment type definitions ──────────────────────────────────────────────────
const PAYMENT_TYPES = [
  { value: 'regular',       icon: CreditCard,   labelKey: 'ld.pt.regular',       descKey: 'ld.pt.regular_d' },
  { value: 'interest_only', icon: Percent,       labelKey: 'ld.pt.interest_only', descKey: 'ld.pt.interest_only_d' },
  { value: 'capital_only',  icon: TrendingDown,  labelKey: 'ld.pt.capital_only',  descKey: 'ld.pt.capital_only_d' },
  { value: 'full_payoff',   icon: Zap,           labelKey: 'ld.pt.full_payoff',   descKey: 'ld.pt.full_payoff_d' },
  { value: 'prorroga', icon: Calendar, labelKey: 'ld.pt.prorroga', descKey: 'ld.pt.prorroga_d' },
]

interface PaymentPreview {
  breakdown: { interest: number; capital: number; mora: number; excessToCapital: number }
  remaining: number
  isOverpayment: boolean
  currentMora: number
  totalDue: number
  nextInstallment: { number: number; dueDate: string; total: number; interest: number; capital: number; pendingTotal: number } | null
}

const LoanDetailPage: React.FC = () => {
  const t = useT()
  const { id } = useParams()
  const navigate = useNavigate()
  const freqLabel = (f: string) => FREQ_KEYS[f] ? t(FREQ_KEYS[f]) : f
  // unit label with singular/plural by count
  const unitLabel = (u: string, n: number) => {
    const map: Record<string, [string, string]> = {
      months: ['ld.unit.month', 'ld.unit.months'], biweekly: ['ld.unit.biweek', 'ld.unit.biweeks'],
      weeks: ['ld.unit.week', 'ld.unit.weeks'], days: ['ld.unit.day', 'ld.unit.days'],
      years: ['ld.unit.year', 'ld.unit.years'],
    }
    const pair = map[u]
    return pair ? t(pair[n === 1 ? 0 : 1]) : u
  }
  const { state: authState } = useContext(AuthContext)
  const { state: tenantState } = useContext(TenantContext)
  const { can } = usePermission()
  const [loan, setLoan] = useState<LoanDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'installments' | 'info' | 'payments'>('installments')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [lastPayment, setLastPayment] = useState<any>(null)
  const [showPostPaymentModal, setShowPostPaymentModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showVoidLoanModal, setShowVoidLoanModal] = useState(false)
  const [voidLoanReason, setVoidLoanReason] = useState('')
  const [isVoidingLoan, setIsVoidingLoan] = useState(false)
  const [showWriteOffModal, setShowWriteOffModal] = useState(false)
  const [writeOffReason, setWriteOffReason] = useState('')
  const [writeOffRecordLoss, setWriteOffRecordLoss] = useState(true)
  const [writeOffComponents, setWriteOffComponents] = useState({ capital: true, interest: true, mora: true })
  const [isWritingOff, setIsWritingOff] = useState(false)
  const [loanPayments, setLoanPayments] = useState<LoanPayment[]>([])
  const [isLoadingPayments, setIsLoadingPayments] = useState(false)

  // Permission: can edit loan if platform owner/admin or tenant owner
  const platformRole: string = (authState.user as any)?.platform_role || (authState.user as any)?.platformRole || ''
  const isPlatformAdmin = ['platform_owner', 'platform_admin'].includes(platformRole)
  const currentMembershipRoles: string[] = (() => {
    try { return JSON.parse((tenantState.currentTenant as any)?.roles || '[]') } catch(_) { return [] }
  })()
  const isTenantOwner = currentMembershipRoles.includes('tenant_owner')
  const canEditLoan = isPlatformAdmin || isTenantOwner
  const [paymentData, setPaymentData] = useState({
    amount: '', paymentMethod: 'cash', bankAccountId: '', reference: '',
    notes: '', paymentDate: new Date().toISOString().split('T')[0],
    paymentType: 'regular', overpaymentAction: 'apply_to_next_installment',
  })
  const [preview, setPreview] = useState<PaymentPreview | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [overpaymentStep, setOverpaymentStep] = useState(false)
  const [bankAccounts, setBankAccounts] = useState<any[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Contract generation
  const [showContractModal, setShowContractModal] = useState(false)
  const [contractTemplates, setContractTemplates] = useState<any[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [generatedContractContent, setGeneratedContractContent] = useState<string | null>(null)
  const [isGeneratingContract, setIsGeneratingContract] = useState(false)

  const [showDisbursementModal, setShowDisbursementModal] = useState(false)
  const [disbursementData, setDisbursementData] = useState({
    bankAccountId: '',
    firstPaymentDate: '',
    disbursedAmount: '',
    disbursementDate: '',
  })
  const [showMigrateModal, setShowMigrateModal] = useState(false)
  const [migrateData, setMigrateData] = useState({
    totalPaid: '',
    installmentsPaid: '',
    paymentDate: new Date().toISOString().split('T')[0],
    notes: '',
  })
  const [isMigrating, setIsMigrating] = useState(false)

  useEffect(() => {
    const fetchLoan = async () => {
      try {
        const res = await api.get(`/loans/${id}`)
        setLoan(res.data)
      } catch (err: any) {
        if (!isAccessDenied(err) && !isSubscriptionExpired(err)) toast.error(t('ld.load_error'))
        navigate('/loans')
      } finally {
        setIsLoading(false)
      }
    }
    fetchLoan()
    api.get('/settings/bank-accounts').then(r => setBankAccounts(Array.isArray(r.data) ? r.data : [])).catch(() => {})
  }, [id])

  const loadPayments = async () => {
    if (!id) return
    setIsLoadingPayments(true)
    try {
      const res = await api.get(`/payments?loan_id=${id}&limit=200`)
      const raw = Array.isArray(res.data) ? res.data : (res.data?.data || [])
      setLoanPayments(raw.map((p: any) => ({
        id: p.id,
        paymentNumber: p.paymentNumber ?? p.payment_number,
        paymentDate: p.paymentDate ?? p.payment_date,
        amount: p.amount,
        appliedInterest: p.appliedInterest ?? p.applied_interest ?? 0,
        appliedCapital: p.appliedCapital ?? p.applied_capital ?? 0,
        appliedMora: p.appliedMora ?? p.applied_mora ?? 0,
        paymentMethod: p.paymentMethod ?? p.payment_method,
        reference: p.reference,
        notes: p.notes,
        status: p.isVoided || p.is_voided ? 'voided' : 'applied',
        voidedAt: p.voidedAt ?? p.voided_at,
        voidReason: p.voidReason ?? p.void_reason,
      })))
    } catch { setLoanPayments([]) }
    finally { setIsLoadingPayments(false) }
  }

  useEffect(() => {
    if (activeTab === 'payments') loadPayments()
  }, [activeTab, id])

  // Live preview whenever amount or type changes
  useEffect(() => {
    if (!loan || !paymentData.amount || parseFloat(paymentData.amount) <= 0) {
      setPreview(null); return
    }
    const timeout = setTimeout(async () => {
      setIsPreviewLoading(true)
      try {
        const res = await api.post('/payments/preview', {
          loanId: loan.id,
          amount: parseFloat(paymentData.amount),
          paymentType: paymentData.paymentType,
          overpaymentAction: paymentData.overpaymentAction,
        })
        setPreview(res.data)
      } catch { setPreview(null) }
      finally { setIsPreviewLoading(false) }
    }, 400)
    return () => clearTimeout(timeout)
  }, [paymentData.amount, paymentData.paymentType, paymentData.overpaymentAction, loan])

  // Auto-set amount when prorroga type is selected
  useEffect(() => {
    if (paymentData.paymentType === 'prorroga' && loan) {
      const fee = loan.prorrogaFee || 0
      const mora = loan.moraBalance || 0
      const total = Math.round((fee + mora) * 100) / 100
      setPaymentData(prev => ({ ...prev, amount: String(total) }))
    }
  }, [paymentData.paymentType])

  if (isLoading || !loan) return <PageLoadingState />

  const handleApprove = async () => {
    if (!confirm(t('ld.approve_confirm'))) return
    try {
      setIsSubmitting(true)
      await api.post(`/loans/${id}/approve`)
      toast.success(t('ld.approved'))
      const res = await api.get(`/loans/${id}`)
      setLoan(res.data)
    } catch (err) {
      toast.error(t('ld.approve_error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReject = async () => {
    const reason = prompt(t('ld.reject_prompt'))
    if (!reason) return
    try {
      setIsSubmitting(true)
      await api.post(`/loans/${id}/reject`, { rejectionReason: reason })
      toast.success(t('ld.rejected'))
      navigate('/loans')
    } catch (err) {
      toast.error(t('ld.reject_error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const openDisbursementModal = () => {
    // Pre-fill con datos del prestamo si ya fueron capturados al crearlo.
    // Si firstPaymentDate ya existe, usarlo; sino fallback a hoy+1mes.
    const existingFirstPay = (loan as any)?.firstPaymentDate
    const fallbackDate = (() => {
      const d = new Date(); d.setMonth(d.getMonth() + 1)
      return d.toISOString().split('T')[0]
    })()
    setDisbursementData({
      bankAccountId: (loan as any)?.disbursementBankAccountId || bankAccounts[0]?.id || '',
      firstPaymentDate: existingFirstPay ? String(existingFirstPay).slice(0, 10) : fallbackDate,
      disbursedAmount: String((loan as any)?.approvedAmount || (loan as any)?.requestedAmount || ''),
      disbursementDate: new Date().toISOString().split('T')[0],
    })
    setShowDisbursementModal(true)
  }

  const handleDisburse = async () => {
    if (!disbursementData.bankAccountId) {
      toast.error(t('ld.disb_account_req'))
      return
    }
    const amount = parseFloat(disbursementData.disbursedAmount)
    if (!amount || amount <= 0) {
      toast.error(t('ld.disb_amount_req'))
      return
    }
    // Check funds
    const acc = bankAccounts.find(a => a.id === disbursementData.bankAccountId)
    if (acc && acc.currentBalance < amount) {
      toast.error(t('ld.funds_error').replace('{bank}', acc.bankName).replace('{amount}', `RD$${Number(acc.currentBalance).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`))
      return
    }
    try {
      setIsSubmitting(true)
      await api.post(`/loans/${id}/disburse`, {
        disbursedAmount: amount,
        bankAccountId: disbursementData.bankAccountId,
        firstPaymentDate: disbursementData.firstPaymentDate || undefined,
        disbursementDate: disbursementData.disbursementDate || undefined,
      })
      toast.success(t('ld.disbursed'))
      setShowDisbursementModal(false)
      const res = await api.get(`/loans/${id}`)
      setLoan(res.data)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('ld.disburse_error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Migracion de cartera: marca N cuotas como pagadas con un solo registro ──
  const handleMigrateHistory = async () => {
    const totalPaid = parseFloat(migrateData.totalPaid)
    const installmentsPaid = parseInt(migrateData.installmentsPaid)
    if (!totalPaid || totalPaid <= 0) { toast.error(t('ld.mig_total_req')); return }
    if (!installmentsPaid || installmentsPaid <= 0) { toast.error(t('ld.mig_inst_req')); return }
    try {
      setIsMigrating(true)
      const res = await api.post(`/loans/${id}/migrate-history`, {
        totalPaid,
        installmentsPaid,
        paymentDate: migrateData.paymentDate,
        notes: migrateData.notes,
      })
      toast.success(t('ld.mig_ok').replace('{n}', String(res.data.installmentsPaid || installmentsPaid)))
      setShowMigrateModal(false)
      setMigrateData({ totalPaid: '', installmentsPaid: '', paymentDate: new Date().toISOString().split('T')[0], notes: '' })
      const r = await api.get(`/loans/${id}`)
      setLoan(r.data)
      loadPayments()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('ld.mig_error'))
    } finally {
      setIsMigrating(false)
    }
  }

  const handlePaymentSubmit = async (confirmedOverpaymentAction?: string, overrideAmount?: number) => {
    const amountToPay = overrideAmount ?? parseFloat(paymentData.amount)
    if (!amountToPay || amountToPay <= 0) {
      toast.error(t('ld.amount_req'))
      return
    }
    // Si el monto excede la deuda, mostrar paso informativo (skip para prorroga).
    // El backend ahora RECHAZA montos no asignables — este paso ofrece registrar
    // el maximo aplicable en su lugar.
    if (paymentData.paymentType !== 'prorroga' && preview?.isOverpayment && !overpaymentStep && !confirmedOverpaymentAction && overrideAmount === undefined) {
      setOverpaymentStep(true)
      return
    }
    try {
      setIsSubmitting(true)
      const payRes = await api.post('/payments', {
        loanId: loan.id,
        amount: amountToPay,
        paymentMethod: paymentData.paymentMethod,
        bankAccountId: paymentData.bankAccountId || undefined,
        reference: paymentData.reference || undefined,
        paymentDate: paymentData.paymentDate,
        notes: paymentData.notes,
        paymentType: paymentData.paymentType,
        overpaymentAction: confirmedOverpaymentAction || paymentData.overpaymentAction,
      })
      toast.success(t('ld.payment_ok'))
      const res = await api.get(`/loans/${id}`)
      setLoan(res.data)
      loadPayments()
      setShowPaymentModal(false)
      // Modal post-pago con opciones de imprimir + WhatsApp.
      // Backend devuelve { payment, receipt, breakdown } — extraer correctamente.
      if (payRes?.data?.payment) {
        const pmt = payRes.data.payment as any
        const rcp = payRes.data.receipt as any
        setLastPayment({
          ...pmt,
          receiptNumber: rcp?.receiptNumber || pmt.receiptNumber,
          clientName: loan.clientName,
          loanNumber: loan.loanNumber,
          loanId: loan.id,
          clientWhatsapp: (loan as any).clientWhatsapp || (loan as any).clientPhone || '',
        })
        setShowPostPaymentModal(true)
      }
      setOverpaymentStep(false)
      setPreview(null)
      setPaymentData({
        amount: '', paymentMethod: 'cash', bankAccountId: '', reference: '',
        notes: '', paymentDate: new Date().toISOString().split('T')[0],
        paymentType: 'regular', overpaymentAction: 'apply_to_next_installment',
      })
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('ld.payment_error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVoidLoan = async () => {
    if (!voidLoanReason.trim()) { toast.error(t('ld.void_reason_req')); return }
    try {
      setIsVoidingLoan(true)
      await api.post(`/loans/${id}/void`, { reason: voidLoanReason })
      toast.success(t('ld.voided'))
      const res = await api.get(`/loans/${id}`)
      setLoan(res.data)
      setShowVoidLoanModal(false)
      setVoidLoanReason('')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('ld.void_error'))
    } finally {
      setIsVoidingLoan(false)
    }
  }

  const handleDeleteLoan = async () => {
    if (!loan) return
    if (!confirm(t('ld.delete_confirm').replace('{n}', loan.loanNumber))) return
    try {
      const res = await api.delete(`/loans/${id}`)
      const refunded = res?.data?.refundedAmount ?? res?.data?.refunded_amount ?? 0
      const reversed = res?.data?.bankReversed ?? res?.data?.bank_reversed
      toast.success(t('ld.deleted') + (reversed ? t('ld.deleted_refund').replace('{amount}', formatCurrency(refunded)) : ''))
      navigate('/loans')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('ld.delete_error'))
    }
  }

  const handleWriteOff = async () => {
    if (!writeOffReason.trim()) { toast.error(t('ld.writeoff_reason_req')); return }
    try {
      setIsWritingOff(true)
      await api.post(`/loans/${id}/write-off`, {
        reason: writeOffReason,
        record_loss: writeOffRecordLoss,
        loss_components: writeOffComponents,
      })
      toast.success(t('ld.writeoff_ok'))
      const res = await api.get(`/loans/${id}`)
      setLoan(res.data)
      setShowWriteOffModal(false)
      setWriteOffReason('')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('ld.process_error'))
    } finally {
      setIsWritingOff(false)
    }
  }

  const openContractModal = async () => {
    setGeneratedContractContent(null)
    setSelectedTemplateId('')
    setShowContractModal(true)
    try {
      const res = await api.get('/settings/templates')
      const tpls = Array.isArray(res.data) ? res.data : []
      setContractTemplates(tpls)
      if (tpls.length > 0) setSelectedTemplateId(tpls.find((t: any) => t.isDefault || t.is_default)?.id || tpls[0].id)
    } catch (err) {
      if (!isAccessDenied(err) && !isSubscriptionExpired(err)) toast.error(t('ld.tpl_load_error'))
      // 403 = plan doesn't include templates; modal stays open showing empty state
    }
  }

  const handleGenerateContract = async () => {
    if (!selectedTemplateId) { toast.error(t('ld.tpl_select_req')); return }
    setIsGeneratingContract(true)
    try {
      const res = await api.post('/contracts', { loan_id: loan!.id, template_id: selectedTemplateId })
      const content: string = res.data.content || ''
      setGeneratedContractContent(content)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('ld.contract_error'))
    } finally {
      setIsGeneratingContract(false)
    }
  }

  const handlePrintContract = () => {
    if (!generatedContractContent) return
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) { toast.error(t('ld.popup_error')); return }
    // Build a clean HTML document for the contract
    printWindow.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Contrato ${loan?.loanNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 12px; line-height: 1.6; color: #000; background: #fff; padding: 30px 40px; }
    pre { white-space: pre-wrap; word-wrap: break-word; font-family: inherit; font-size: 12px; line-height: 1.8; }
    img { max-width: 160px; max-height: 80px; object-fit: contain; display: block; margin: 4px 0; }
    @media print {
      body { padding: 15mm 20mm; }
      @page { margin: 15mm 20mm; size: letter; }
    }
  </style>
</head>
<body>
  <pre>${generatedContractContent
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\{\{company_logo\}\}/g, loan ? `</pre><img src="{{LOGO}}" /><pre>` : '')}</pre>
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`)
    printWindow.document.close()
  }

  const PAYMENT_METHOD_LABELS: Record<string, string> = {
    cash: t('ld.pm.cash'), transfer: t('ld.pm.transfer'), check: t('ld.pm.check'), card: t('ld.pm.card')
  }

  const totalOverdue = loan.principalBalance + loan.interestBalance + loan.moraBalance + loan.overtimeCharge
  // Include 'interest_paid' — it still owes principal; sort by effective date (deferred takes priority)
  const nextPendingInstallment = [...loan.installments]
    .filter(i => ['pending', 'partial', 'overdue', 'interest_paid'].includes(i.status))
    .sort((a, b) => {
      const dateA = a.deferredDueDate || a.effectiveDueDate || a.dueDate;
      const dateB = b.deferredDueDate || b.effectiveDueDate || b.dueDate;
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    })[0] ?? null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/loans')}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="page-title">{loan.loanNumber}</h1>
            <LoanStatusBadge status={loan.status as any} />
            {loan.currency && loan.currency !== 'DOP' && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-100 border border-blue-200 rounded-full px-2.5 py-1">
                <Globe className="w-3 h-3" />{loan.currency}
                {loan.exchangeRateToDop && loan.exchangeRateToDop !== 1 && (
                  <span className="text-blue-500 font-normal">@ {formatCurrency(loan.exchangeRateToDop, 'DOP')}</span>
                )}
              </span>
            )}
            {((loan as any).investorId || (loan as any).investor_id) && ((loan as any).investorName || (loan as any).investor_name) && (
              <button
                onClick={() => navigate(`/investors/${(loan as any).investorId ?? (loan as any).investor_id}`)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 bg-purple-100 border border-purple-200 rounded-full px-2.5 py-1 hover:bg-purple-200 transition-colors"
                title={t('ld.investor_title')}
              >
                {t('ld.investor')} {(loan as any).investorName ?? (loan as any).investor_name}
                {((loan as any).investorCommissionPercent ?? (loan as any).investor_commission_percent) != null && (
                  <span className="text-purple-500 font-normal"> · {(loan as any).investorCommissionPercent ?? (loan as any).investor_commission_percent}% {t('ld.commission')}</span>
                )}
              </button>
            )}
          </div>
          <p className="text-slate-600 text-sm mt-1">
            <button
              className="hover:text-blue-600 hover:underline transition-colors"
              onClick={() => navigate(`/clients/${loan.clientId}`)}
            >
              {loan.clientName}
            </button>
            {' '} · {loan.productName}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Balance Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="text-center p-4">
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">{t('ld.capital')}</p>
              <p className="text-xl font-bold text-slate-900 mt-1">{formatCurrency(loan.principalBalance, loan.currency || 'DOP')}</p>
            </Card>
            <Card className="text-center p-4">
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">{t('ld.interest')}</p>
              <p className="text-xl font-bold text-blue-700 mt-1">{formatCurrency(loan.interestBalance, loan.currency || 'DOP')}</p>
            </Card>
            <Card className={`text-center p-4 ${((loan as any).computedMora ?? loan.moraBalance) > 0 ? 'bg-red-50 border-red-200' : ''}`}>
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">{t('ld.mora')}</p>
              <p className={`text-xl font-bold mt-1 ${((loan as any).computedMora ?? loan.moraBalance) > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                {formatCurrency((loan as any).computedMora ?? loan.moraBalance, loan.currency || 'DOP')}
              </p>
            </Card>
            <Card className="text-center p-4 bg-slate-50">
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">{t('ld.total')}</p>
              <p className="text-xl font-bold text-slate-900 mt-1">{formatCurrency(totalOverdue, loan.currency || 'DOP')}</p>
            </Card>
          </div>

          {/* Overtime Warning */}
          {loan.overtimeDays > 0 && (
            <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-orange-900 text-sm">{t('ld.overtime_title')}</p>
                <p className="text-orange-700 text-sm">
                  {t('ld.overtime_desc').replace('{n}', String(loan.overtimeDays))} <strong>{formatCurrency(loan.overtimeCharge, loan.currency || 'DOP')}</strong>
                </p>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div>
            <div className="flex gap-1 border-b border-slate-200 mb-4 overflow-x-auto">
              <button
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'installments' ? 'bg-white border border-b-white border-slate-200 text-blue-700' : 'text-slate-600 hover:text-slate-900'}`}
                onClick={() => setActiveTab('installments')}
              >
                {t('ld.tab_installments')} ({loan.installments.length})
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'payments' ? 'bg-white border border-b-white border-slate-200 text-blue-700' : 'text-slate-600 hover:text-slate-900'}`}
                onClick={() => setActiveTab('payments')}
              >
                {t('ld.tab_payments')} {loanPayments.length > 0 && `(${loanPayments.length})`}
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'info' ? 'bg-white border border-b-white border-slate-200 text-blue-700' : 'text-slate-600 hover:text-slate-900'}`}
                onClick={() => setActiveTab('info')}
              >
                {t('ld.tab_info')}
              </button>
            </div>

            {activeTab === 'installments' && (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 px-3 font-semibold text-slate-700">#</th>
                        <th className="text-left py-2 px-3 font-semibold text-slate-700">{t('ld.h_due')}</th>
                        <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('ld.capital')}</th>
                        <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('ld.interest')}</th>
                        <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('ld.h_installment')}</th>
                        <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('ld.mora')}</th>
                        <th className="text-center py-2 px-3 font-semibold text-slate-700">{t('ld.h_delay')}</th>
                        <th className="text-center py-2 px-3 font-semibold text-slate-700">{t('ld.h_status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loan.installments.map((inst) => {
                        const statusInfo = INSTALLMENT_STATUS[inst.status] || INSTALLMENT_STATUS.pending
                        const effectiveDate = inst.deferredDueDate || inst.effectiveDueDate || inst.dueDate
                        const prorrogaCount = inst.prorrogaCount || inst.prorroga_count || 0
                        const isDeferred = !!inst.deferredDueDate
                        return (
                          <tr key={inst.id} className={`border-b border-slate-100 hover:bg-slate-50 ${inst.status === 'interest_paid' ? 'bg-purple-50/40' : ''}`}>
                            <td className="py-2 px-3 font-medium">{inst.installmentNumber}</td>
                            <td className="py-2 px-3 text-slate-600">
                              {isDeferred ? (
                                <span
                                  title={prorrogaCount > 0 ? t('ld.orig_date').replace('{date}', formatDate(inst.dueDate)) + t('ld.ext_prorroga').replace('{n}', String(prorrogaCount)) : t('ld.orig_date').replace('{date}', formatDate(inst.dueDate)) + t('ld.ext_interest')}
                                  className="flex items-center gap-1 cursor-help"
                                >
                                  <span className="text-purple-700 font-medium">{formatDate(effectiveDate)}</span>
                                  <span className="text-purple-400 text-xs leading-none">⟳</span>
                                </span>
                              ) : (
                                formatDate(inst.dueDate)
                              )}
                            </td>
                            <td className="py-2 px-3 text-right">{formatCurrency(inst.principalAmount, loan.currency || 'DOP')}</td>
                            <td className="py-2 px-3 text-right">
                              {inst.status === 'interest_paid' ? (
                                <span className="line-through text-slate-400 text-xs">{formatCurrency(inst.interestAmount, loan.currency || 'DOP')}</span>
                              ) : (
                                formatCurrency(inst.interestAmount, loan.currency || 'DOP')
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-semibold">
                              {formatCurrency(inst.totalAmount - (inst.paidTotal || 0), loan.currency || 'DOP')}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {inst.moraAmount > 0 ? (
                                <span className="text-red-600 font-medium">{formatCurrency(inst.moraAmount, loan.currency || 'DOP')}</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-center text-xs">
                              {(() => {
                                const isPaid = inst.status === 'paid'
                                const isWaived = inst.status === 'waived'
                                const dueRef = inst.deferredDueDate || inst.dueDate
                                if (isWaived) return <span className="text-slate-400">{t('ld.waived')}</span>
                                if (isPaid && inst.paidAt && dueRef) {
                                  const due = new Date(dueRef as string).setHours(0,0,0,0)
                                  const paid = new Date(inst.paidAt as string).setHours(0,0,0,0)
                                  const diff = Math.round((paid - due) / 86400000)
                                  if (diff === 0) return <span className="text-emerald-700 font-medium">{t('ld.on_time')}</span>
                                  if (diff < 0)  return <span className="text-emerald-700 font-medium">{t('ld.early').replace('{n}', String(Math.abs(diff))).replace('{s}', Math.abs(diff) === 1 ? '' : 's')}</span>
                                  return <span className="text-red-700 font-medium">{t('ld.late').replace('{n}', String(diff)).replace('{s}', diff === 1 ? '' : 's')}</span>
                                }
                                if (!isPaid && dueRef) {
                                  const due = new Date(dueRef as string).setHours(0,0,0,0)
                                  const today = new Date().setHours(0,0,0,0)
                                  const overdue = Math.round((today - due) / 86400000)
                                  if (overdue > 0) return <span className="text-amber-700 font-medium">{t('ld.overdue_d').replace('{n}', String(overdue)).replace('{s}', overdue === 1 ? '' : 's')}</span>
                                }
                                return <span className="text-slate-400">—</span>
                              })()}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${statusInfo.cls}`}>
                                {t(statusInfo.labelKey)}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {activeTab === 'payments' && (
              <Card>
                {isLoadingPayments ? (
                  <div className="text-center py-8 text-slate-500">{t('ld.loading_payments')}</div>
                ) : loanPayments.length === 0 ? (
                  <div className="text-center py-12">
                    <CreditCard className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">{t('ld.no_payments')}</p>
                    <p className="text-slate-400 text-sm mt-1">{t('ld.no_payments_d')}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-2 px-3 font-semibold text-slate-700">#</th>
                          <th className="text-left py-2 px-3 font-semibold text-slate-700">{t('ld.h_date')}</th>
                          <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('ld.h_amount')}</th>
                          <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('ld.capital')}</th>
                          <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('ld.interest')}</th>
                          <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('ld.mora')}</th>
                          <th className="text-left py-2 px-3 font-semibold text-slate-700">{t('ld.h_method')}</th>
                          <th className="text-center py-2 px-3 font-semibold text-slate-700">{t('ld.h_status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loanPayments.map((p) => (
                          <tr key={p.id} className={`border-b border-slate-100 hover:bg-slate-50 ${p.status === 'voided' ? 'opacity-50' : ''}`}>
                            <td className="py-2 px-3 font-medium text-slate-700">{p.paymentNumber}</td>
                            <td className="py-2 px-3 text-slate-600">{formatDate(p.paymentDate)}</td>
                            <td className="py-2 px-3 text-right font-semibold text-emerald-700">{formatCurrency(p.amount, loan.currency || 'DOP')}</td>
                            <td className="py-2 px-3 text-right text-slate-700">{formatCurrency(p.appliedCapital, loan.currency || 'DOP')}</td>
                            <td className="py-2 px-3 text-right text-blue-700">{formatCurrency(p.appliedInterest, loan.currency || 'DOP')}</td>
                            <td className="py-2 px-3 text-right">
                              {p.appliedMora > 0 ? (
                                <span className="text-red-600">{formatCurrency(p.appliedMora, loan.currency || 'DOP')}</span>
                              ) : <span className="text-slate-400">—</span>}
                            </td>
                            <td className="py-2 px-3 text-slate-600">{PAYMENT_METHOD_LABELS[p.paymentMethod] || p.paymentMethod}</td>
                            <td className="py-2 px-3 text-center">
                              {p.status === 'voided' ? (
                                <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">{t('ld.st_voided')}</span>
                              ) : (
                                <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">{t('ld.st_applied')}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                          <td colSpan={2} className="py-2 px-3 text-slate-700">{t('ld.total')}</td>
                          <td className="py-2 px-3 text-right text-emerald-700">
                            {formatCurrency(loanPayments.filter(p => p.status !== 'voided').reduce((s, p) => s + p.amount, 0), loan.currency || 'DOP')}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {formatCurrency(loanPayments.filter(p => p.status !== 'voided').reduce((s, p) => s + p.appliedCapital, 0), loan.currency || 'DOP')}
                          </td>
                          <td className="py-2 px-3 text-right text-blue-700">
                            {formatCurrency(loanPayments.filter(p => p.status !== 'voided').reduce((s, p) => s + p.appliedInterest, 0), loan.currency || 'DOP')}
                          </td>
                          <td className="py-2 px-3 text-right text-red-600">
                            {formatCurrency(loanPayments.filter(p => p.status !== 'voided').reduce((s, p) => s + p.appliedMora, 0), loan.currency || 'DOP')}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                    {loanPayments.some(p => p.voidReason) && (
                      <div className="mt-3 space-y-1 px-3 pb-2">
                        {loanPayments.filter(p => p.voidReason).map(p => (
                          <p key={p.id} className="text-xs text-red-500">
                            <span className="font-medium">{t('ld.payment_voided').replace('{n}', String(p.paymentNumber))}</span> {p.voidReason}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )}

            {activeTab === 'info' && (
              <Card>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                  <div>
                    <p className="text-slate-500 font-medium">{t('ld.disbursed_amount')}</p>
                    <p className="font-semibold text-slate-900">
                      {formatCurrency(loan.disbursedAmount, loan.currency || 'DOP')}
                      {loan.currency && loan.currency !== 'DOP' && (
                        <span className="ml-2 text-xs text-slate-400 font-normal">
                          ({loan.currency} @ {formatCurrency(loan.exchangeRateToDop || 1, 'DOP')})
                        </span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-medium">{t('ld.rate_label')}</p>
                    <p className="font-semibold text-slate-900">{loan.rate}% {loan.rateType === 'monthly' ? t('ld.monthly') : t('ld.annual')}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-medium">{t('ld.term')}</p>
                    <p className="font-semibold text-slate-900">{loan.term} {unitLabel(loan.termUnit, loan.term)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-medium">{t('ld.pay_freq')}</p>
                    <p className="font-semibold text-slate-900">{freqLabel(loan.paymentFrequency)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-medium">{t('ld.amort_type')}</p>
                    <p className="font-semibold text-slate-900">{getAmortLabel(loan.amortizationType)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-medium">{t('ld.mora_rate')}</p>
                    <p className="font-semibold text-slate-900">{t('ld.per_day').replace('{n}', (loan.moraRateDaily * 100).toFixed(2))}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-medium">{t('ld.disb_date')}</p>
                    <p className="font-semibold text-slate-900">{loan.disbursementDate ? formatDate(loan.disbursementDate) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-medium">{t('ld.maturity_date')}</p>
                    <p className="font-semibold text-slate-900">{loan.maturityDate ? formatDate(loan.maturityDate) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-medium">{t('ld.first_payment')}</p>
                    <p className="font-semibold text-slate-900">{loan.firstPaymentDate ? formatDate(loan.firstPaymentDate) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-medium">{t('ld.total_paid')}</p>
                    <p className="font-semibold text-green-600">{formatCurrency((loan as any).total_paid ?? loan.totalPaid ?? 0, loan.currency || 'DOP')}</p>
                  </div>
                  {loan.purpose && (
                    <div className="col-span-2">
                      <p className="text-slate-500 font-medium">{t('ld.purpose')}</p>
                      <p className="font-semibold text-slate-900">{loan.purpose}</p>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Client Info */}
          <Card>
            <h3 className="section-title mb-3 flex items-center gap-2">
              <User className="w-4 h-4" /> {t('ld.client')}
            </h3>
            <div className="space-y-2 text-sm">
              <button
                className="font-semibold text-blue-700 hover:underline text-left"
                onClick={() => navigate(`/clients/${loan.clientId}`)}
              >
                {loan.clientName}
              </button>
              <p className="text-slate-600">{loan.clientIdNumber}</p>
              {loan.clientPhone && <p className="text-slate-600">{loan.clientPhone}</p>}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-slate-500 text-xs">{t('ld.score')}</span>
                <ScoreBadge score={loan.clientScore ?? 50} compact />
              </div>
              {loan.collectorName && (
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <Users className="w-3 h-3 text-slate-400" />
                  <span className="text-slate-500 text-xs">{t('ld.collector')}</span>
                  <span className="text-xs font-medium text-slate-700">{loan.collectorName}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Actions */}
          <Card>
            <h3 className="section-title mb-3">{t('ld.actions')}</h3>
            <div className="space-y-2">
              {can('loans.edit') && (
                <Button
                  size="md"
                  variant="outline"
                  className="w-full flex items-center justify-center gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
                  onClick={() => setShowEditModal(true)}
                >
                  <Edit2 className="w-4 h-4" />
                  {t('ld.edit_loan')}
                </Button>
              )}
              {can('payments.create') && (loan.status === 'active' || loan.status === 'in_mora' || loan.status === 'disbursed') && (
                <Button
                  size="md"
                  className="w-full flex items-center justify-center gap-2"
                  onClick={() => setShowPaymentModal(true)}
                  disabled={isSubmitting}
                >
                  <DollarSign className="w-4 h-4" />
                  {t('ld.register_payment')}
                </Button>
              )}
              {(loan.status === 'pending_review' || loan.status === 'under_review') && (
                <>
                  {can('loans.approve') && (
                    <Button
                      size="md"
                      className="w-full flex items-center justify-center gap-2"
                      onClick={handleApprove}
                      disabled={isSubmitting}
                    >
                      <CheckCircle className="w-4 h-4" />
                      {t('ld.approve_loan')}
                    </Button>
                  )}
                  {can('loans.reject') && (
                    <Button
                      size="md"
                      variant="outline"
                      className="w-full flex items-center justify-center gap-2 text-red-600 border-red-300 hover:bg-red-50"
                      onClick={handleReject}
                      disabled={isSubmitting}
                    >
                      <XCircle className="w-4 h-4" />
                      {t('ld.reject')}
                    </Button>
                  )}
                </>
              )}
              {can('loans.disburse') && loan.status === 'approved' && (
                <Button
                  size="md"
                  className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700"
                  onClick={openDisbursementModal}
                  disabled={isSubmitting}
                >
                  <CreditCard className="w-4 h-4" />
                  {t('ld.disburse')}
                </Button>
              )}
              {/* Migracion de cartera: solo si activo/in_mora/disbursed Y sin pagos previos */}
              {can('loans.edit') && ['active','in_mora','disbursed'].includes(loan.status) && loanPayments.length === 0 && (
                <Button
                  size="md"
                  variant="outline"
                  className="w-full flex items-center justify-center gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
                  onClick={() => setShowMigrateModal(true)}
                  disabled={isSubmitting}
                >
                  <CreditCard className="w-4 h-4" />
                  {t('ld.migrate_history')}
                </Button>
              )}
              {/* Reparar paid_at de cuotas migradas: visible si hay un pago tipo 'migration' */}
              {can('loans.edit') && loanPayments.some((p: any) => p.type === 'migration') && (
                <Button
                  size="md"
                  variant="outline"
                  className="w-full flex items-center justify-center gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={async () => {
                    try {
                      const res = await api.post(`/loans/${id}/fix-migrated-paid-at`)
                      toast.success(res.data?.message || t('ld.fixed_n').replace('{n}', String(res.data?.fixed || 0)))
                      const r = await api.get(`/loans/${id}`)
                      setLoan(r.data)
                    } catch (err: any) {
                      toast.error(err?.response?.data?.error || t('ld.fix_error'))
                    }
                  }}
                  disabled={isSubmitting}
                  title={t('ld.fix_migrated_title')}
                >
                  <CheckCircle className="w-4 h-4" />
                  {t('ld.fix_migrated')}
                </Button>
              )}
              {can('contracts.create') && (
                <Button
                  size="md"
                  variant="outline"
                  className="w-full flex items-center justify-center gap-2 border-purple-300 text-purple-700 hover:bg-purple-50"
                  onClick={openContractModal}
                >
                  <Printer className="w-4 h-4" />
                  {t('ld.generate_contract')}
                </Button>
              )}
              {can('whatsapp.send') && loan.clientWhatsapp && (
                <a
                  href={`https://wa.me/${(loan.clientWhatsapp || '').replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-emerald-300 rounded-lg text-sm text-emerald-700 hover:bg-emerald-50 transition-colors font-medium"
                >
                  <MessageCircle className="w-4 h-4" />
                  {t('ld.send_whatsapp')}
                </a>
              )}
              {can('loans.write_off') && !['written_off', 'cancelled', 'paid', 'rejected', 'voided', 'liquidated'].includes(loan.status) && (
                <button
                  onClick={() => { setShowWriteOffModal(true); setWriteOffReason(''); setWriteOffRecordLoss(true); setWriteOffComponents({ capital: true, interest: true, mora: true }) }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-orange-300 rounded-lg text-sm text-orange-700 hover:bg-orange-50 transition-colors font-medium mt-2"
                >
                  <AlertTriangle className="w-4 h-4" />
                  {t('ld.mark_writeoff')}
                </button>
              )}
              {can('loans.void') && !['cancelled', 'paid', 'rejected', 'voided', 'written_off'].includes(loan.status) && (
                <button
                  onClick={() => setShowVoidLoanModal(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-red-300 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors font-medium mt-1"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('ld.void_loan')}
                </button>
              )}
              {can('loans.void') && (
                <button
                  onClick={handleDeleteLoan}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-red-400 rounded-lg text-sm text-white bg-red-600 hover:bg-red-700 transition-colors font-medium mt-1"
                  title={t('ld.delete_perm_title')}
                >
                  <Trash2 className="w-4 h-4" />
                  {t('ld.delete_perm')}
                </button>
              )}
            </div>
          </Card>

          {/* Dates Card */}
          <Card>
            <h3 className="section-title mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> {t('ld.key_dates')}
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('ld.d_application')}</span>
                <span className="font-medium">{formatDate(loan.applicationDate)}</span>
              </div>
              {loan.disbursementDate && (
                <div className="flex justify-between">
                  <span className="text-slate-500">{t('ld.d_disbursement')}</span>
                  <span className="font-medium">{formatDate(loan.disbursementDate)}</span>
                </div>
              )}
              {loan.maturityDate && (
                <div className="flex justify-between">
                  <span className="text-slate-500">{t('ld.d_maturity')}</span>
                  <span className="font-medium">{formatDate(loan.maturityDate)}</span>
                </div>
              )}
              {nextPendingInstallment && (() => {
                const nextEffectiveDate = nextPendingInstallment.deferredDueDate
                  || nextPendingInstallment.effectiveDueDate
                  || nextPendingInstallment.dueDate;
                const isLate = new Date(nextEffectiveDate) < new Date();
                const isDeferred = !!nextPendingInstallment.deferredDueDate;
                return (
                  <>
                    <div className="flex justify-between pt-1 border-t border-slate-200">
                      <span className="text-slate-500 flex items-center gap-1">
                        {t('ld.next_payment')}
                        {isDeferred && <span className="text-purple-400 text-xs" title={t('ld.deferred_title')}>⟳</span>}
                      </span>
                      <span className={`font-medium ${isLate ? 'text-red-600' : isDeferred ? 'text-purple-700' : 'text-emerald-700'}`}>
                        {formatDate(nextEffectiveDate)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">{t('ld.installment_n').replace('{n}', String(nextPendingInstallment.installmentNumber))}</span>
                      <span className="font-semibold text-slate-900">
                        {formatCurrency(nextPendingInstallment.totalAmount - (nextPendingInstallment.paidTotal || 0), loan.currency || 'DOP')}
                      </span>
                    </div>
                  </>
                )
              })()}
              {loan.daysOverdue > 0 && (
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="text-red-600 font-medium">{t('ld.days_in_mora')}</span>
                  <span className="text-red-600 font-bold">{t('ld.n_days').replace('{n}', String(loan.daysOverdue))}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Rate Info */}
          <Card>
            <h3 className="section-title mb-3 flex items-center gap-2">
              <Percent className="w-4 h-4" /> {t('ld.conditions')}
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('ld.rate')}</span>
                <span className="font-semibold text-blue-700">{loan.rate}% {loan.rateType === 'monthly' ? t('ld.monthly') : t('ld.annual')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('ld.amort')}</span>
                <span className="font-medium">{getAmortLabel(loan.amortizationType)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('ld.freq')}</span>
                <span className="font-medium">{freqLabel(loan.paymentFrequency)}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Disbursement Modal */}
      {showDisbursementModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-green-700 flex items-center gap-2">
                <CreditCard className="w-5 h-5" /> {t('ld.disburse_loan')}
              </h2>
              <button onClick={() => setShowDisbursementModal(false)} className="p-1 hover:bg-slate-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
              <p className="font-semibold">{loan.loanNumber} · {loan.clientName}</p>
              <p>{t('ld.approved_amount')} <strong className="text-blue-900">{formatCurrency((loan as any).approvedAmount || loan.requestedAmount, loan.currency || 'DOP')}</strong></p>
            </div>

            <div className="space-y-4">
              {/* Amount */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t('ld.amount_to_disburse')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={disbursementData.disbursedAmount}
                  onChange={e => setDisbursementData(d => ({ ...d, disbursedAmount: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Bank Account */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t('ld.disb_account')} <span className="text-red-500">*</span>
                  <span className="text-xs text-slate-400 font-normal ml-1">{t('ld.disb_account_hint')}</span>
                </label>
                {bankAccounts.length === 0 ? (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    {t('ld.no_accounts')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {bankAccounts.filter((a: any) => a.isActive !== 0).map((acc: any) => {
                      const available = acc.currentBalance
                      const requested = parseFloat(disbursementData.disbursedAmount) || 0
                      const enough = available >= requested
                      const selected = disbursementData.bankAccountId === acc.id
                      return (
                        <div
                          key={acc.id}
                          onClick={() => setDisbursementData(d => ({ ...d, bankAccountId: acc.id }))}
                          className={`p-3 rounded-lg border-2 cursor-pointer transition-all flex items-center justify-between ${
                            selected ? 'border-green-500 bg-green-50' : 'border-slate-200 hover:border-green-300'
                          } ${!enough && requested > 0 ? 'opacity-60' : ''}`}
                        >
                          <div>
                            <p className="font-medium text-sm">{acc.bankName}</p>
                            <p className="text-xs text-slate-500">{acc.accountNumber || t('ld.no_number')} · {acc.currency}</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-semibold ${enough ? 'text-emerald-600' : 'text-red-600'}`}>
                              {formatCurrency(available, (acc as any).currency || 'DOP')}
                            </p>
                            <p className="text-xs text-slate-400">{t('ld.available')}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Disbursement Date (NUEVO — para migracion de cartera) */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t('ld.disb_date_label')}
                  <span className="text-xs text-slate-400 font-normal ml-1">{t('ld.disb_date_hint')}</span>
                </label>
                <input
                  type="date"
                  value={disbursementData.disbursementDate}
                  onChange={e => setDisbursementData(d => ({ ...d, disbursementDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-slate-500 mt-1">
                  {t('ld.disb_date_note')}
                </p>
              </div>

              {/* First Payment Date */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('ld.first_payment_date')}</label>
                <input
                  type="date"
                  value={disbursementData.firstPaymentDate}
                  onChange={e => setDisbursementData(d => ({ ...d, firstPaymentDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <Button variant="secondary" className="flex-1" onClick={() => setShowDisbursementModal(false)} disabled={isSubmitting}>
                {t('common.cancel')}
              </Button>
              <button
                onClick={handleDisburse}
                disabled={isSubmitting || !disbursementData.bankAccountId || !disbursementData.disbursedAmount}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                {isSubmitting ? t('ld.disbursing') : t('ld.confirm_disburse')}
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Void Loan Modal */}
      {/* ── Write-Off / Incobrable Modal ── */}
      {showWriteOffModal && loan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-orange-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> {t('ld.writeoff_title')}
              </h2>
              <button onClick={() => setShowWriteOffModal(false)} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
              <p className="text-orange-800 text-sm font-medium">{t('ld.writeoff_warn')}</p>
              <p className="text-orange-700 text-sm mt-1">{t('ld.loan_client').replace('{loan}', loan.loanNumber).replace('{client}', loan.clientName)}</p>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-1">{t('ld.writeoff_reason')} <span className="text-red-500">*</span></label>
              <textarea
                value={writeOffReason}
                onChange={e => setWriteOffReason(e.target.value)}
                rows={2}
                placeholder={t('ld.writeoff_reason_ph')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            {/* Loss registration */}
            <div className="border border-slate-200 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <input type="checkbox" id="recordLoss" checked={writeOffRecordLoss} onChange={e => setWriteOffRecordLoss(e.target.checked)} className="rounded" />
                <label htmlFor="recordLoss" className="text-sm font-semibold text-slate-700">{t('ld.record_loss')}</label>
              </div>
              {writeOffRecordLoss && (
                <div className="ml-6 space-y-2">
                  <p className="text-xs text-slate-500 mb-2">{t('ld.select_components')}</p>
                  {[
                    { key: 'capital', label: t('ld.comp_capital'), amount: (loan as any).principal_balance ?? (loan as any).principalBalance ?? 0 },
                    { key: 'interest', label: t('ld.comp_interest'), amount: (loan as any).interest_balance ?? (loan as any).interestBalance ?? 0 },
                    { key: 'mora', label: t('ld.comp_mora'), amount: (loan as any).mora_balance ?? (loan as any).moraBalance ?? 0 },
                  ].map(({ key, label, amount }) => (
                    <div key={key} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`loss_${key}`}
                          checked={writeOffComponents[key as keyof typeof writeOffComponents]}
                          onChange={e => setWriteOffComponents(p => ({ ...p, [key]: e.target.checked }))}
                          className="rounded"
                          disabled={amount <= 0}
                        />
                        <label htmlFor={`loss_${key}`} className={`text-sm ${amount <= 0 ? 'text-slate-400' : 'text-slate-700'}`}>{label}</label>
                      </div>
                      <span className={`text-sm font-medium ${amount > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                        {amount > 0 ? `−RD$${amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : 'RD$0.00'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleWriteOff}
                disabled={isWritingOff || !writeOffReason.trim()}
                className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {isWritingOff ? t('ld.writeoff_processing') : t('ld.writeoff_confirm')}
              </button>
              <button onClick={() => setShowWriteOffModal(false)} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                {t('common.cancel')}
              </button>
            </div>
          </Card>
        </div>
      )}

      {showVoidLoanModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-red-700 flex items-center gap-2">
                <Trash2 className="w-5 h-5" /> {t('ld.void_loan')}
              </h2>
              <button onClick={() => { setShowVoidLoanModal(false); setVoidLoanReason('') }} className="p-1 hover:bg-slate-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-red-800 text-sm font-medium">{t('ld.void_irreversible')}</p>
              <p className="text-red-700 text-sm mt-1">
                {t('ld.void_desc').replace('{loan}', loan.loanNumber).replace('{client}', loan.clientName)}
              </p>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-1">{t('ld.void_reason')} <span className="text-red-500">*</span></label>
              <textarea
                value={voidLoanReason}
                onChange={(e) => setVoidLoanReason(e.target.value)}
                placeholder={t('ld.void_reason_ph')}
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => { setShowVoidLoanModal(false); setVoidLoanReason('') }} disabled={isVoidingLoan}>
                {t('common.cancel')}
              </Button>
              <button
                onClick={handleVoidLoan}
                disabled={isVoidingLoan || !voidLoanReason.trim()}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {isVoidingLoan ? t('ld.voiding') : t('ld.confirm_void')}
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Edit Loan Modal */}
      {showEditModal && (
        <EditLoanModal
          loan={loan}
          onClose={() => setShowEditModal(false)}
          onSaved={async () => {
            // Full refetch to get all computed fields (mora, installments, etc.)
            try {
              const res = await api.get(`/loans/${id}`)
              setLoan(res.data)
            } catch (_) {}
          }}
        />
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-2 sm:p-4 overflow-y-auto">
          <Card className="w-full max-w-lg my-2 sm:my-4 max-h-[95vh] sm:max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="section-title">{t('ld.payment_modal_title')}</h2>
                <p className="text-xs text-slate-500">{loan.loanNumber} · {loan.clientName}</p>
              </div>
              <button
                onClick={() => {
                  setShowPaymentModal(false)
                  setOverpaymentStep(false)
                  setPreview(null)
                  setPaymentData({
                    amount: '', paymentMethod: 'cash', bankAccountId: '', reference: '',
                    notes: '', paymentDate: new Date().toISOString().split('T')[0],
                    paymentType: 'regular', overpaymentAction: 'apply_to_next_installment',
                  })
                }}
                className="p-1 hover:bg-slate-100 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Overpayment step overlay */}
            {overpaymentStep && preview ? (
              <div className="space-y-4">
                {(() => {
                  const maxPayable = (preview as any).maxPayable ?? preview.totalDue
                  const excess = (parseFloat(paymentData.amount) || 0) - maxPayable
                  return (<>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                      <p className="text-amber-800 font-semibold text-sm">{t('ld.exceeds_debt')}</p>
                      <p className="text-2xl font-bold text-amber-700 mt-1">
                        {t('ld.excess').replace('{amount}', formatCurrency(excess, loan.currency || 'DOP'))}
                      </p>
                      <p className="text-xs text-amber-600 mt-1">
                        {t('ld.excess_note')}
                      </p>
                    </div>

                    <button
                      onClick={() => handlePaymentSubmit(undefined, maxPayable)}
                      disabled={isSubmitting || maxPayable <= 0}
                      className="w-full p-4 border-2 border-emerald-300 rounded-lg text-center hover:bg-emerald-50 transition-colors disabled:opacity-50"
                    >
                      <TrendingDown className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                      <p className="font-semibold text-emerald-900 text-sm">
                        {t('ld.register_max').replace('{amount}', formatCurrency(maxPayable, loan.currency || 'DOP'))}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {t('ld.register_max_d').replace('{amount}', formatCurrency(excess, loan.currency || 'DOP'))}
                      </p>
                    </button>

                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setOverpaymentStep(false)}
                      disabled={isSubmitting}
                    >
                      {t('ld.back_edit_amount')}
                    </Button>
                  </>)
                })()}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Balance summary chips */}
                <div className="flex gap-2 flex-wrap text-xs">
                  <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-full font-medium">
                    {t('ld.chip_capital').replace('{amount}', formatCurrency(loan.principalBalance, loan.currency || 'DOP'))}
                  </span>
                  <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                    {t('ld.chip_interest').replace('{amount}', formatCurrency(loan.interestBalance, loan.currency || 'DOP'))}
                  </span>
                  {loan.moraBalance > 0 && (
                    <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
                      {t('ld.chip_mora').replace('{amount}', formatCurrency(loan.moraBalance, loan.currency || 'DOP'))}
                    </span>
                  )}
                  <span className="bg-slate-800 text-white px-2 py-1 rounded-full font-semibold ml-auto">
                    {t('ld.chip_total').replace('{amount}', formatCurrency(totalOverdue, loan.currency || 'DOP'))}
                  </span>
                </div>

                {/* Tabla de cuotas pendientes/vencidas */}
                {loan.installments && loan.installments.filter((i: any) => i.status !== 'paid' && i.status !== 'waived').length > 0 && (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{t('ld.inst_status')}</span>
                      <div className="flex gap-1.5 flex-wrap text-[10px]">
                        {(() => {
                          const overdueCount = loan.installments.filter((i: any) => i.status !== 'paid' && i.status !== 'waived' && (i.moraDays || 0) > 0).length
                          const totalMoraInst = loan.installments.reduce((s: number, i: any) => s + (i.status !== 'paid' && i.status !== 'waived' ? (i.moraAmount || 0) : 0), 0)
                          return (<>
                            {overdueCount > 0 && (
                              <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{t('ld.n_overdue').replace('{n}', String(overdueCount)).replace('{s}', overdueCount > 1 ? 's' : '')}</span>
                            )}
                            {totalMoraInst > 0 && (
                              <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">{t('ld.mora_chip').replace('{amount}', formatCurrency(totalMoraInst, loan.currency || 'DOP'))}</span>
                            )}
                            {(loan.prorrogaFee || 0) > 0 && (
                              <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-medium">{t('ld.prorroga_chip').replace('{amount}', formatCurrency(loan.prorrogaFee || 0, loan.currency || 'DOP'))}</span>
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
                            <th className="text-left px-3 py-1.5 font-semibold text-slate-600">{t('ld.h_due')}</th>
                            <th className="text-center px-3 py-1.5 font-semibold text-slate-600">{t('ld.h_days')}</th>
                            <th className="text-right px-3 py-1.5 font-semibold text-slate-600">{t('ld.h_installment')}</th>
                            <th className="text-right px-3 py-1.5 font-semibold text-slate-600">{t('ld.mora')}</th>
                            <th className="text-right px-3 py-1.5 font-semibold text-slate-600">{t('ld.h_pending')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loan.installments.filter((i: any) => i.status !== 'paid' && i.status !== 'waived').slice(0, 12).map((inst: any) => {
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
                                    ? <span className="text-red-700 font-semibold">{t('ld.d_late').replace('{n}', String(moraDays))}</span>
                                    : isPartial
                                      ? <span className="text-amber-700">{t('ld.partial')}</span>
                                      : <span className="text-slate-400">—</span>}
                                </td>
                                <td className="px-3 py-1.5 text-right text-slate-700">{formatCurrency(cuota, loan.currency || 'DOP')}</td>
                                <td className="px-3 py-1.5 text-right">
                                  {(inst.moraAmount || 0) > 0
                                    ? <span className="text-red-600 font-semibold">{formatCurrency(inst.moraAmount, loan.currency || 'DOP')}</span>
                                    : <span className="text-slate-300">—</span>}
                                </td>
                                <td className="px-3 py-1.5 text-right font-semibold text-slate-900">{formatCurrency(pendiente, loan.currency || 'DOP')}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Payment type selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">{t('ld.payment_type')}</label>
                  <div className="grid grid-cols-2 gap-2">
                    {PAYMENT_TYPES.filter(pt => pt.value !== 'prorroga' || (loan.prorrogaFee && loan.prorrogaFee > 0)).map((pt) => {
                      const Icon = pt.icon
                      const isSelected = paymentData.paymentType === pt.value
                      return (
                        <button
                          key={pt.value}
                          onClick={() => setPaymentData({ ...paymentData, paymentType: pt.value })}
                          className={`p-3 rounded-lg border-2 text-left transition-all ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-slate-500'}`} />
                            <span className={`text-sm font-semibold ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>
                              {t(pt.labelKey)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 leading-tight">{t(pt.descKey)}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Interest-only notice */}
                {paymentData.paymentType === 'prorroga' && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-xs text-orange-800">
                    <p className="font-semibold flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 flex-shrink-0" />
                      {t('ld.prorroga_notice_title')}
                    </p>
                    <p className="mt-1 leading-relaxed">
                      {t('ld.prorroga_notice_a')} <strong>{formatCurrency(loan.prorrogaFee || 0, loan.currency || 'DOP')}</strong>
                      {(loan.moraBalance || 0) > 0 && <span>{t('ld.prorroga_notice_mora')} <strong>{formatCurrency(loan.moraBalance || 0, loan.currency || 'DOP')}</strong></span>}.
                    </p>
                  </div>
                )}

                {paymentData.paymentType === 'interest_only' && nextPendingInstallment && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-800">
                    <p className="font-semibold flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 flex-shrink-0" />
                      {t('ld.io_notice_title')}
                    </p>
                    <p className="mt-1 leading-relaxed">
                      {t('ld.io_notice').replace('{n}', String(nextPendingInstallment.installmentNumber))}{' '}
                      <strong>{t('ld.io_notice_b')}</strong> {t('ld.io_notice_c')}
                    </p>
                  </div>
                )}

                {/* Amount input */}
                <div>
                  <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                    <label className="block text-sm font-medium text-slate-700">{t('ld.amount_to_pay')}</label>
                    <div className="flex items-center gap-3 flex-wrap">
                      {(() => {
                        // Saldo vencido real: cuotas con due_date < hoy + mora
                        const today = new Date(); today.setHours(0,0,0,0)
                        const overdue = (loan.installments || [])
                          .filter((i: any) => i.status !== 'paid' && i.status !== 'waived' && i.dueDate && new Date(i.dueDate) < today)
                          .reduce((s: number, i: any) => s + Math.max(0, (i.totalAmount || 0) - (i.paidTotal || 0)) + (i.moraAmount || 0), 0)
                        return (
                          <button
                            type="button"
                            onClick={() => { if (overdue > 0) setPaymentData({ ...paymentData, amount: String(overdue.toFixed(2)) }) }}
                            disabled={overdue <= 0}
                            className={`text-xs font-medium flex items-center gap-1 ${overdue > 0 ? 'text-amber-700 hover:underline' : 'text-slate-400 cursor-not-allowed'}`}
                            title={overdue > 0 ? t('ld.pay_overdue_title') : t('ld.no_overdue_title')}
                          >
                            <Zap className="w-3 h-3" />
                            {overdue > 0
                              ? t('ld.pay_overdue').replace('{amount}', formatCurrency(overdue, loan.currency || 'DOP'))
                              : t('ld.no_overdue')}
                          </button>
                        )
                      })()}
                      <button
                        type="button"
                        onClick={() => setPaymentData({ ...paymentData, amount: String((loan.totalBalance || totalOverdue).toFixed(2)) })}
                        className="text-xs text-blue-600 hover:underline font-medium flex items-center gap-1"
                        title={t('ld.pay_full_title')}
                      >
                        <Zap className="w-3 h-3" />
                        {t('ld.pay_full')}
                      </button>
                    </div>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={paymentData.amount}
                    readOnly={paymentData.paymentType === 'prorroga'}
                    onChange={(e) => { if (paymentData.paymentType !== 'prorroga') setPaymentData({ ...paymentData, amount: e.target.value }) }}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-lg"
                    autoFocus
                  />
                </div>

                {/* Live preview breakdown */}
                {(paymentData.amount && parseFloat(paymentData.amount) > 0) && (
                  <div className={`rounded-lg border p-3 transition-all ${
                    isPreviewLoading ? 'opacity-50' : ''
                  } ${preview?.isOverpayment ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                    {isPreviewLoading ? (
                      <p className="text-xs text-slate-500 text-center py-1">{t('ld.calculating')}</p>
                    ) : preview ? (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600 flex items-center gap-1"><Percent className="w-3 h-3" /> {t('ld.interest_applied')}</span>
                          <span className="font-semibold text-blue-700">{formatCurrency(preview.breakdown.interest, loan.currency || 'DOP')}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> {t('ld.capital_applied')}</span>
                          <span className="font-semibold text-slate-900">{formatCurrency(preview.breakdown.capital, loan.currency || 'DOP')}</span>
                        </div>
                        {preview.breakdown.mora > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-red-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {t('ld.mora_covered')}</span>
                            <span className="font-semibold text-red-600">{formatCurrency(preview.breakdown.mora, loan.currency || 'DOP')}</span>
                          </div>
                        )}
                        {preview.breakdown.excessToCapital > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-emerald-600 flex items-center gap-1"><Coins className="w-3 h-3" /> {t('ld.excess_label')}</span>
                            <span className="font-semibold text-emerald-700">{formatCurrency(preview.breakdown.excessToCapital, loan.currency || 'DOP')}</span>
                          </div>
                        )}
                        <div className="border-t border-slate-200 pt-1.5 flex justify-between text-xs">
                          <span className="text-slate-600 font-medium">{t('ld.remaining_after')}</span>
                          <span className={`font-bold ${preview.remaining <= 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
                            {preview.remaining <= 0 ? t('ld.settled') : formatCurrency(preview.remaining, loan.currency || 'DOP')}
                          </span>
                        </div>
                        {preview.isOverpayment && (
                          <div className="flex items-center gap-1 pt-0.5">
                            <Info className="w-3 h-3 text-amber-600" />
                            <p className="text-xs text-amber-700 font-medium">
                              {t('ld.overpay_offer')}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Payment method */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{t('ld.method')}</label>
                    <select
                      value={paymentData.paymentMethod}
                      onChange={(e) => setPaymentData({ ...paymentData, paymentMethod: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="cash">{t('ld.pm.cash')}</option>
                      <option value="transfer">{t('ld.pm.transfer')}</option>
                      <option value="check">{t('ld.pm.check')}</option>
                      <option value="card">{t('ld.pm.card')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{t('ld.payment_date')}</label>
                    <input
                      type="date"
                      value={paymentData.paymentDate}
                      onChange={(e) => setPaymentData({ ...paymentData, paymentDate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Bank account (when transfer or check) */}
                {(paymentData.paymentMethod === 'transfer' || paymentData.paymentMethod === 'check') && bankAccounts.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{t('ld.bank_account')}</label>
                    <select
                      value={paymentData.bankAccountId}
                      onChange={(e) => setPaymentData({ ...paymentData, bankAccountId: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">{t('ld.unspecified')}</option>
                      {bankAccounts.map((ba: any) => (
                        <option key={ba.id} value={ba.id}>{ba.bankName} · {ba.accountNumber}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Reference */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{t('ld.reference')} <span className="font-normal text-slate-400">{t('ld.optional')}</span></label>
                  <input
                    type="text"
                    value={paymentData.reference}
                    onChange={(e) => setPaymentData({ ...paymentData, reference: e.target.value })}
                    placeholder={t('ld.reference_ph')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{t('ld.notes')} <span className="font-normal text-slate-400">{t('ld.optional')}</span></label>
                  <textarea
                    value={paymentData.notes}
                    onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                    placeholder={t('ld.notes_ph')}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => {
                      setShowPaymentModal(false)
                      setOverpaymentStep(false)
                      setPreview(null)
                      setPaymentData({
                        amount: '', paymentMethod: 'cash', bankAccountId: '', reference: '',
                        notes: '', paymentDate: new Date().toISOString().split('T')[0],
                        paymentType: 'regular', overpaymentAction: 'apply_to_next_installment',
                      })
                    }}
                    disabled={isSubmitting}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => handlePaymentSubmit()}
                    disabled={isSubmitting || !paymentData.amount || parseFloat(paymentData.amount) <= 0}
                  >
                    {isSubmitting ? t('ld.registering') : preview?.isOverpayment ? t('ld.continue') : t('ld.register_payment')}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
      {/* ── MODAL: Generar Contrato / Pagaré ── */}
      {showContractModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={e => { if (e.target === e.currentTarget && !generatedContractContent) setShowContractModal(false) }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-8">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-purple-100 rounded-lg">
                  <FileCheck className="w-5 h-5 text-purple-700" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{t('ld.contract_title')}</h3>
                  <p className="text-xs text-slate-500">{loan.loanNumber} · {loan.clientName}</p>
                </div>
              </div>
              <button onClick={() => { setShowContractModal(false); setGeneratedContractContent(null) }} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {!generatedContractContent ? (
                /* Step 1: Select template */
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">{t('ld.select_template')}</label>
                    {contractTemplates.length === 0 ? (
                      <div className="text-center py-8 bg-slate-50 rounded-lg border border-slate-200">
                        <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-slate-500 text-sm font-medium">{t('ld.no_templates')}</p>
                        <p className="text-xs text-slate-400 mt-1">{t('ld.no_templates_d')}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {contractTemplates.map((tpl: any) => (
                          <label key={tpl.id}
                            className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-all ${selectedTemplateId === tpl.id ? 'border-purple-400 bg-purple-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                          >
                            <input type="radio" name="template" value={tpl.id}
                              checked={selectedTemplateId === tpl.id}
                              onChange={() => setSelectedTemplateId(tpl.id)}
                              className="mt-0.5 accent-purple-600"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-800 text-sm">{tpl.name || tpl.name}</span>
                                {(tpl.isDefault || tpl.is_default) && (
                                  <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">{t('ld.tpl_default')}</span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5 capitalize">{tpl.type === 'general' ? t('ld.tpl_general') : tpl.type}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                    <strong>{t('ld.contract_note')}</strong> {t('ld.contract_note_d')}
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button
                      className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700"
                      onClick={handleGenerateContract}
                      disabled={isGeneratingContract || !selectedTemplateId || contractTemplates.length === 0}
                    >
                      <FileCheck className="w-4 h-4" />
                      {isGeneratingContract ? t('ld.generating') : t('ld.generate_contract')}
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => setShowContractModal(false)}>
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                /* Step 2: Preview & Print */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-emerald-700 flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4" />{t('ld.contract_generated')}
                    </p>
                    <button onClick={() => setGeneratedContractContent(null)} className="text-xs text-slate-500 hover:text-slate-700 underline">
                      {t('ld.back_select_tpl')}
                    </button>
                  </div>

                  {/* Contract preview */}
                  <div className="border border-slate-200 rounded-lg bg-slate-50 p-4 max-h-96 overflow-y-auto">
                    <pre className="text-xs font-mono whitespace-pre-wrap text-slate-800 leading-relaxed">
                      {generatedContractContent}
                    </pre>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      className="flex-1 flex items-center justify-center gap-2"
                      onClick={handlePrintContract}
                    >
                      <Printer className="w-4 h-4" />
                      {t('ld.print_pdf')}
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 flex items-center justify-center gap-2"
                      onClick={() => { setShowContractModal(false); navigate('/contracts') }}
                    >
                      <FileText className="w-4 h-4" />
                      {t('ld.view_contracts')}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-400 text-center">{t('ld.print_pdf_note')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ── Modal Post-Pago: opciones imprimir + WhatsApp ── */}
      {showPostPaymentModal && lastPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowPostPaymentModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{t('ld.pp_title')}</h3>
                  <p className="text-xs text-slate-500">{t('ld.pp_receipt').replace('{n}', String(lastPayment.receiptNumber || lastPayment.paymentNumber)).replace('{amount}', formatCurrency(lastPayment.amount, loan?.currency))}</p>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-slate-600">{t('ld.pp_question')}</p>
              <button
                type="button"
                onClick={async () => {
                  const tn = (tenantState as any)?.currentTenant?.tenant || { name: 'Negocio' }
                  await printPaymentReceipt(lastPayment, tn)
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#1e3a5f] text-white rounded-lg font-medium hover:bg-[#152a45] transition"
              >
                <Printer className="w-4 h-4" /> {t('ld.pp_print')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const tn = (tenantState as any)?.currentTenant?.tenant || { name: 'Negocio' }
                  const phone = lastPayment.clientWhatsapp || ''
                  if (!phone) {
                    toast(t('ld.no_wa_phone'), { icon: '⚠️' })
                  }
                  sendReceiptByWhatsApp(phone, lastPayment, tn, {
                    principalBalance: (loan as any)?.principalBalance,
                    interestBalance: (loan as any)?.interestBalance,
                    moraBalance: (loan as any)?.moraBalance,
                  })
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition"
              >
                <MessageCircle className="w-4 h-4" /> {t('ld.pp_whatsapp')}
              </button>
              <button
                type="button"
                onClick={() => setShowPostPaymentModal(false)}
                className="w-full px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
              >
                {t('ld.pp_close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Migrar Historial: wizard para cartera existente ── */}
      {showMigrateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !isMigrating && setShowMigrateModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-200 flex items-start justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">{t('ld.mig_title')}</h3>
                <p className="text-xs text-slate-500 mt-1">
                  {t('ld.mig_subtitle')}
                </p>
              </div>
              <button onClick={() => !isMigrating && setShowMigrateModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
                <p className="font-semibold mb-1">{t('ld.mig_how')}</p>
                <p>{t('ld.mig_how_d')}</p>
                <p className="mt-2"><strong>{t('ld.mig_admin_note')}</strong> {t('ld.mig_admin_note_d')}</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t('ld.mig_total')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="number" step="0.01" min="0.01"
                  value={migrateData.totalPaid}
                  onChange={e => setMigrateData(d => ({ ...d, totalPaid: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej. 50000.00"
                />
                <p className="text-xs text-slate-500 mt-1">{t('ld.mig_total_d')}</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t('ld.mig_inst')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="number" step="1" min="1"
                  value={migrateData.installmentsPaid}
                  onChange={e => setMigrateData(d => ({ ...d, installmentsPaid: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej. 3"
                />
                <p className="text-xs text-slate-500 mt-1">{t('ld.mig_inst_d')}</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('ld.mig_date')}</label>
                <input
                  type="date"
                  value={migrateData.paymentDate}
                  onChange={e => setMigrateData(d => ({ ...d, paymentDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('ld.mig_note')}</label>
                <textarea
                  value={migrateData.notes}
                  onChange={e => setMigrateData(d => ({ ...d, notes: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t('ld.mig_note_ph')}
                />
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowMigrateModal(false)}
                disabled={isMigrating}
              >
                {t('common.cancel')}
              </Button>
              <button
                onClick={handleMigrateHistory}
                disabled={isMigrating || !migrateData.totalPaid || !migrateData.installmentsPaid}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isMigrating ? t('ld.migrating') : t('ld.confirm_migration')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default LoanDetailPage

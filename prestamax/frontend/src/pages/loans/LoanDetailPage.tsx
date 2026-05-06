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
import api, { isAccessDenied } from '@/lib/api'
import toast from 'react-hot-toast'
import EditLoanModal from './EditLoanModal'
import { AuthContext } from '@/contexts/AuthContext'
import { TenantContext } from '@/contexts/TenantContext'
import { usePermission } from '@/hooks/usePermission'

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

const FREQ_LABELS: Record<string, string> = {
  daily: 'Diaria', biweekly: 'Quincenal', weekly: 'Semanal',
  monthly: 'Mensual', quarterly: 'Trimestral'
}

const AMORT_LABELS: Record<string, string> = {
  fixed_installment: 'Cuota Nivelada',
  flat_interest: 'Interés Plano',
  interest_only: 'Solo Intereses (Réditos)',
  declining_balance: 'Saldo Decreciente',
}

const INSTALLMENT_STATUS: Record<string, { label: string; cls: string }> = {
  pending:       { label: 'Pendiente',      cls: 'bg-slate-100 text-slate-700' },
  partial:       { label: 'Parcial',        cls: 'bg-amber-100 text-amber-700' },
  paid:          { label: 'Pagado',         cls: 'bg-emerald-100 text-emerald-700' },
  overdue:       { label: 'Vencido',        cls: 'bg-red-100 text-red-700' },
  interest_paid: { label: 'Interés Pagado', cls: 'bg-purple-100 text-purple-700' },
}

// ── Payment type definitions ──────────────────────────────────────────────────
const PAYMENT_TYPES = [
  { value: 'regular',       icon: CreditCard,   label: 'Cuota Regular',    desc: 'Paga interés primero, luego capital' },
  { value: 'interest_only', icon: Percent,       label: 'Solo Interés',     desc: 'Abona únicamente a los intereses' },
  { value: 'capital_only',  icon: TrendingDown,  label: 'Abono al Capital', desc: 'Interés primero, resto al capital' },
  { value: 'full_payoff',   icon: Zap,           label: 'Liquidar Total',   desc: 'Paga el saldo completo del préstamo' },
  { value: 'prorroga', icon: Calendar, label: 'Cargo de Prórroga', desc: 'Extiende el vencimiento un periodo' },
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
  const { id } = useParams()
  const navigate = useNavigate()
  const { state: authState } = useContext(AuthContext)
  const { state: tenantState } = useContext(TenantContext)
  const { can } = usePermission()
  const [loan, setLoan] = useState<LoanDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'installments' | 'info' | 'payments'>('installments')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
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
  })

  useEffect(() => {
    const fetchLoan = async () => {
      try {
        const res = await api.get(`/loans/${id}`)
        setLoan(res.data)
      } catch (err: any) {
        if (!isAccessDenied(err)) toast.error('Error al cargar el préstamo')
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
    if (!confirm('¿Estás seguro que deseas aprobar este préstamo?')) return
    try {
      setIsSubmitting(true)
      await api.post(`/loans/${id}/approve`)
      toast.success('Préstamo aprobado')
      const res = await api.get(`/loans/${id}`)
      setLoan(res.data)
    } catch (err) {
      toast.error('Error al aprobar préstamo')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReject = async () => {
    const reason = prompt('Ingresa el motivo del rechazo:')
    if (!reason) return
    try {
      setIsSubmitting(true)
      await api.post(`/loans/${id}/reject`, { rejectionReason: reason })
      toast.success('Préstamo rechazado')
      navigate('/loans')
    } catch (err) {
      toast.error('Error al rechazar préstamo')
    } finally {
      setIsSubmitting(false)
    }
  }

  const openDisbursementModal = () => {
    // Pre-fill with loan data
    const nextMonth = new Date()
    nextMonth.setMonth(nextMonth.getMonth() + 1)
    setDisbursementData({
      bankAccountId: (loan as any)?.disbursementBankAccountId || bankAccounts[0]?.id || '',
      firstPaymentDate: nextMonth.toISOString().split('T')[0],
      disbursedAmount: String((loan as any)?.approvedAmount || (loan as any)?.requestedAmount || ''),
    })
    setShowDisbursementModal(true)
  }

  const handleDisburse = async () => {
    if (!disbursementData.bankAccountId) {
      toast.error('Selecciona la cuenta bancaria de desembolso')
      return
    }
    const amount = parseFloat(disbursementData.disbursedAmount)
    if (!amount || amount <= 0) {
      toast.error('Ingresa el monto a desembolsar')
      return
    }
    // Check funds
    const acc = bankAccounts.find(a => a.id === disbursementData.bankAccountId)
    if (acc && acc.currentBalance < amount) {
      toast.error(`Fondos insuficientes en ${acc.bankName}. Disponible: RD$${Number(acc.currentBalance).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`)
      return
    }
    try {
      setIsSubmitting(true)
      await api.post(`/loans/${id}/disburse`, {
        disbursedAmount: amount,
        bankAccountId: disbursementData.bankAccountId,
        firstPaymentDate: disbursementData.firstPaymentDate || undefined,
      })
      toast.success('Préstamo desembolsado exitosamente')
      setShowDisbursementModal(false)
      const res = await api.get(`/loans/${id}`)
      setLoan(res.data)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al desembolsar')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePaymentSubmit = async (confirmedOverpaymentAction?: string) => {
    if (!paymentData.amount) {
      toast.error('Ingresa el monto')
      return
    }
    // If overpayment detected, need action choice first (skip for prorroga)
    if (paymentData.paymentType !== 'prorroga' && preview?.isOverpayment && !overpaymentStep && !confirmedOverpaymentAction) {
      setOverpaymentStep(true)
      return
    }
    try {
      setIsSubmitting(true)
      await api.post('/payments', {
        loanId: loan.id,
        amount: parseFloat(paymentData.amount),
        paymentMethod: paymentData.paymentMethod,
        bankAccountId: paymentData.bankAccountId || undefined,
        reference: paymentData.reference || undefined,
        paymentDate: paymentData.paymentDate,
        notes: paymentData.notes,
        paymentType: paymentData.paymentType,
        overpaymentAction: confirmedOverpaymentAction || paymentData.overpaymentAction,
      })
      toast.success('Pago registrado exitosamente')
      const res = await api.get(`/loans/${id}`)
      setLoan(res.data)
      loadPayments()
      setShowPaymentModal(false)
      setOverpaymentStep(false)
      setPreview(null)
      setPaymentData({
        amount: '', paymentMethod: 'cash', bankAccountId: '', reference: '',
        notes: '', paymentDate: new Date().toISOString().split('T')[0],
        paymentType: 'regular', overpaymentAction: 'apply_to_next_installment',
      })
    } catch (err) {
      toast.error('Error al registrar pago')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVoidLoan = async () => {
    if (!voidLoanReason.trim()) { toast.error('Ingresa un motivo para anular'); return }
    try {
      setIsVoidingLoan(true)
      await api.post(`/loans/${id}/void`, { reason: voidLoanReason })
      toast.success('Préstamo anulado')
      const res = await api.get(`/loans/${id}`)
      setLoan(res.data)
      setShowVoidLoanModal(false)
      setVoidLoanReason('')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al anular préstamo')
    } finally {
      setIsVoidingLoan(false)
    }
  }

  const handleWriteOff = async () => {
    if (!writeOffReason.trim()) { toast.error('Ingresa el motivo del castigo'); return }
    try {
      setIsWritingOff(true)
      await api.post(`/loans/${id}/write-off`, {
        reason: writeOffReason,
        record_loss: writeOffRecordLoss,
        loss_components: writeOffComponents,
      })
      toast.success('Préstamo marcado como incobrable')
      const res = await api.get(`/loans/${id}`)
      setLoan(res.data)
      setShowWriteOffModal(false)
      setWriteOffReason('')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al procesar')
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
      if (!isAccessDenied(err)) toast.error('Error al cargar plantillas')
      // 403 = plan doesn't include templates; modal stays open showing empty state
    }
  }

  const handleGenerateContract = async () => {
    if (!selectedTemplateId) { toast.error('Selecciona una plantilla'); return }
    setIsGeneratingContract(true)
    try {
      const res = await api.post('/contracts', { loan_id: loan!.id, template_id: selectedTemplateId })
      const content: string = res.data.content || ''
      setGeneratedContractContent(content)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al generar contrato')
    } finally {
      setIsGeneratingContract(false)
    }
  }

  const handlePrintContract = () => {
    if (!generatedContractContent) return
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) { toast.error('Permite las ventanas emergentes para imprimir'); return }
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
    cash: 'Efectivo', transfer: 'Transferencia', check: 'Cheque', card: 'Tarjeta'
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
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">Capital</p>
              <p className="text-xl font-bold text-slate-900 mt-1">{formatCurrency(loan.principalBalance, loan.currency || 'DOP')}</p>
            </Card>
            <Card className="text-center p-4">
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">Intereses</p>
              <p className="text-xl font-bold text-blue-700 mt-1">{formatCurrency(loan.interestBalance, loan.currency || 'DOP')}</p>
            </Card>
            <Card className={`text-center p-4 ${((loan as any).computedMora ?? loan.moraBalance) > 0 ? 'bg-red-50 border-red-200' : ''}`}>
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">Mora</p>
              <p className={`text-xl font-bold mt-1 ${((loan as any).computedMora ?? loan.moraBalance) > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                {formatCurrency((loan as any).computedMora ?? loan.moraBalance, loan.currency || 'DOP')}
              </p>
            </Card>
            <Card className="text-center p-4 bg-slate-50">
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">Total</p>
              <p className="text-xl font-bold text-slate-900 mt-1">{formatCurrency(totalOverdue, loan.currency || 'DOP')}</p>
            </Card>
          </div>

          {/* Overtime Warning */}
          {loan.overtimeDays > 0 && (
            <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-orange-900 text-sm">Préstamo con exceso de plazo</p>
                <p className="text-orange-700 text-sm">
                  {loan.overtimeDays} días después de la fecha de vencimiento.
                  Recargo acumulado: <strong>{formatCurrency(loan.overtimeCharge, loan.currency || 'DOP')}</strong>
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
                Plan de Pagos ({loan.installments.length})
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'payments' ? 'bg-white border border-b-white border-slate-200 text-blue-700' : 'text-slate-600 hover:text-slate-900'}`}
                onClick={() => setActiveTab('payments')}
              >
                Pagos Realizados {loanPayments.length > 0 && `(${loanPayments.length})`}
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'info' ? 'bg-white border border-b-white border-slate-200 text-blue-700' : 'text-slate-600 hover:text-slate-900'}`}
                onClick={() => setActiveTab('info')}
              >
                Detalles del Préstamo
              </button>
            </div>

            {activeTab === 'installments' && (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 px-3 font-semibold text-slate-700">#</th>
                        <th className="text-left py-2 px-3 font-semibold text-slate-700">Vence</th>
                        <th className="text-right py-2 px-3 font-semibold text-slate-700">Capital</th>
                        <th className="text-right py-2 px-3 font-semibold text-slate-700">Interés</th>
                        <th className="text-right py-2 px-3 font-semibold text-slate-700">Cuota</th>
                        <th className="text-right py-2 px-3 font-semibold text-slate-700">Mora</th>
                        <th className="text-center py-2 px-3 font-semibold text-slate-700">Atraso/Anticipo</th>
                        <th className="text-center py-2 px-3 font-semibold text-slate-700">Estado</th>
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
                                  title={prorrogaCount > 0 ? `Fecha original: ${formatDate(inst.dueDate)} · Extendida ${prorrogaCount} vez(veces) por prórroga` : `Fecha original: ${formatDate(inst.dueDate)} · Diferida por pago de solo interés`}
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
                                if (isWaived) return <span className="text-slate-400">Perdonada</span>
                                if (isPaid && inst.paidAt && dueRef) {
                                  const due = new Date(dueRef as string).setHours(0,0,0,0)
                                  const paid = new Date(inst.paidAt as string).setHours(0,0,0,0)
                                  const diff = Math.round((paid - due) / 86400000)
                                  if (diff === 0) return <span className="text-emerald-700 font-medium">A tiempo</span>
                                  if (diff < 0)  return <span className="text-emerald-700 font-medium">{Math.abs(diff)} día{Math.abs(diff) === 1 ? '' : 's'} anticipo</span>
                                  return <span className="text-red-700 font-medium">{diff} día{diff === 1 ? '' : 's'} atraso</span>
                                }
                                if (!isPaid && dueRef) {
                                  const due = new Date(dueRef as string).setHours(0,0,0,0)
                                  const today = new Date().setHours(0,0,0,0)
                                  const overdue = Math.round((today - due) / 86400000)
                                  if (overdue > 0) return <span className="text-amber-700 font-medium">{overdue} día{overdue === 1 ? '' : 's'} vencido</span>
                                }
                                return <span className="text-slate-400">—</span>
                              })()}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${statusInfo.cls}`}>
                                {statusInfo.label}
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
                  <div className="text-center py-8 text-slate-500">Cargando pagos...</div>
                ) : loanPayments.length === 0 ? (
                  <div className="text-center py-12">
                    <CreditCard className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">No hay pagos registrados</p>
                    <p className="text-slate-400 text-sm mt-1">Los pagos aparecerán aquí una vez registrados</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-2 px-3 font-semibold text-slate-700">#</th>
                          <th className="text-left py-2 px-3 font-semibold text-slate-700">Fecha</th>
                          <th className="text-right py-2 px-3 font-semibold text-slate-700">Monto</th>
                          <th className="text-right py-2 px-3 font-semibold text-slate-700">Capital</th>
                          <th className="text-right py-2 px-3 font-semibold text-slate-700">Interés</th>
                          <th className="text-right py-2 px-3 font-semibold text-slate-700">Mora</th>
                          <th className="text-left py-2 px-3 font-semibold text-slate-700">Método</th>
                          <th className="text-center py-2 px-3 font-semibold text-slate-700">Estado</th>
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
                                <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">Anulado</span>
                              ) : (
                                <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Aplicado</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                          <td colSpan={2} className="py-2 px-3 text-slate-700">Total</td>
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
                            <span className="font-medium">Pago #{p.paymentNumber} anulado:</span> {p.voidReason}
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
                    <p className="text-slate-500 font-medium">Monto Desembolsado</p>
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
                    <p className="text-slate-500 font-medium">Tasa de Interés</p>
                    <p className="font-semibold text-slate-900">{loan.rate}% {loan.rateType === 'monthly' ? 'mensual' : 'anual'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-medium">Plazo</p>
                    <p className="font-semibold text-slate-900">{loan.term} {loan.termUnit === 'months' ? 'meses' : 'semanas'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-medium">Frecuencia de Pago</p>
                    <p className="font-semibold text-slate-900">{FREQ_LABELS[loan.paymentFrequency] || loan.paymentFrequency}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-medium">Tipo de Amortización</p>
                    <p className="font-semibold text-slate-900">{AMORT_LABELS[loan.amortizationType] || loan.amortizationType}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-medium">Tasa Mora Diaria</p>
                    <p className="font-semibold text-slate-900">{(loan.moraRateDaily * 100).toFixed(2)}% por día</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-medium">Fecha Desembolso</p>
                    <p className="font-semibold text-slate-900">{loan.disbursementDate ? formatDate(loan.disbursementDate) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-medium">Fecha Vencimiento</p>
                    <p className="font-semibold text-slate-900">{loan.maturityDate ? formatDate(loan.maturityDate) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-medium">Primer Pago</p>
                    <p className="font-semibold text-slate-900">{loan.firstPaymentDate ? formatDate(loan.firstPaymentDate) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-medium">Total Pagado</p>
                    <p className="font-semibold text-green-600">{formatCurrency((loan as any).total_paid ?? loan.totalPaid ?? 0, loan.currency || 'DOP')}</p>
                  </div>
                  {loan.purpose && (
                    <div className="col-span-2">
                      <p className="text-slate-500 font-medium">Propósito del Préstamo</p>
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
              <User className="w-4 h-4" /> Cliente
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
                <span className="text-slate-500 text-xs">Score:</span>
                <ScoreBadge score={loan.clientScore ?? 50} compact />
              </div>
              {loan.collectorName && (
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <Users className="w-3 h-3 text-slate-400" />
                  <span className="text-slate-500 text-xs">Cobrador:</span>
                  <span className="text-xs font-medium text-slate-700">{loan.collectorName}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Actions */}
          <Card>
            <h3 className="section-title mb-3">Acciones</h3>
            <div className="space-y-2">
              {can('loans.edit') && (
                <Button
                  size="md"
                  variant="outline"
                  className="w-full flex items-center justify-center gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
                  onClick={() => setShowEditModal(true)}
                >
                  <Edit2 className="w-4 h-4" />
                  Editar Préstamo
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
                  Registrar Pago
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
                      Aprobar Préstamo
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
                      Rechazar
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
                  Desembolsar
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
                  Generar Contrato
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
                  Enviar WhatsApp
                </a>
              )}
              {can('loans.write_off') && !['written_off', 'cancelled', 'paid', 'rejected', 'voided', 'liquidated'].includes(loan.status) && (
                <button
                  onClick={() => { setShowWriteOffModal(true); setWriteOffReason(''); setWriteOffRecordLoss(true); setWriteOffComponents({ capital: true, interest: true, mora: true }) }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-orange-300 rounded-lg text-sm text-orange-700 hover:bg-orange-50 transition-colors font-medium mt-2"
                >
                  <AlertTriangle className="w-4 h-4" />
                  Marcar Incobrable
                </button>
              )}
              {can('loans.void') && !['cancelled', 'paid', 'rejected', 'voided', 'written_off'].includes(loan.status) && (
                <button
                  onClick={() => setShowVoidLoanModal(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-red-300 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors font-medium mt-1"
                >
                  <Trash2 className="w-4 h-4" />
                  Anular Préstamo
                </button>
              )}
            </div>
          </Card>

          {/* Dates Card */}
          <Card>
            <h3 className="section-title mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Fechas Clave
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Solicitud</span>
                <span className="font-medium">{formatDate(loan.applicationDate)}</span>
              </div>
              {loan.disbursementDate && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Desembolso</span>
                  <span className="font-medium">{formatDate(loan.disbursementDate)}</span>
                </div>
              )}
              {loan.maturityDate && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Vencimiento</span>
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
                        Próximo Pago
                        {isDeferred && <span className="text-purple-400 text-xs" title="Fecha diferida por pago de solo interés">⟳</span>}
                      </span>
                      <span className={`font-medium ${isLate ? 'text-red-600' : isDeferred ? 'text-purple-700' : 'text-emerald-700'}`}>
                        {formatDate(nextEffectiveDate)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Cuota #{nextPendingInstallment.installmentNumber}</span>
                      <span className="font-semibold text-slate-900">
                        {formatCurrency(nextPendingInstallment.totalAmount - (nextPendingInstallment.paidTotal || 0), loan.currency || 'DOP')}
                      </span>
                    </div>
                  </>
                )
              })()}
              {loan.daysOverdue > 0 && (
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="text-red-600 font-medium">Días en mora</span>
                  <span className="text-red-600 font-bold">{loan.daysOverdue} días</span>
                </div>
              )}
            </div>
          </Card>

          {/* Rate Info */}
          <Card>
            <h3 className="section-title mb-3 flex items-center gap-2">
              <Percent className="w-4 h-4" /> Condiciones
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Tasa</span>
                <span className="font-semibold text-blue-700">{loan.rate}% {loan.rateType === 'monthly' ? 'mensual' : 'anual'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Amortización</span>
                <span className="font-medium">{AMORT_LABELS[loan.amortizationType] || loan.amortizationType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Frecuencia</span>
                <span className="font-medium">{FREQ_LABELS[loan.paymentFrequency] || loan.paymentFrequency}</span>
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
                <CreditCard className="w-5 h-5" /> Desembolsar Préstamo
              </h2>
              <button onClick={() => setShowDisbursementModal(false)} className="p-1 hover:bg-slate-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
              <p className="font-semibold">{loan.loanNumber} · {loan.clientName}</p>
              <p>Monto aprobado: <strong className="text-blue-900">{formatCurrency((loan as any).approvedAmount || loan.requestedAmount, loan.currency || 'DOP')}</strong></p>
            </div>

            <div className="space-y-4">
              {/* Amount */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Monto a Desembolsar <span className="text-red-500">*</span>
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
                  Cuenta de Desembolso <span className="text-red-500">*</span>
                  <span className="text-xs text-slate-400 font-normal ml-1">— de donde saldrá el dinero</span>
                </label>
                {bankAccounts.length === 0 ? (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    No hay cuentas bancarias configuradas.
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
                            <p className="text-xs text-slate-500">{acc.accountNumber || 'Sin número'} · {acc.currency}</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-semibold ${enough ? 'text-emerald-600' : 'text-red-600'}`}>
                              {formatCurrency(available, (acc as any).currency || 'DOP')}
                            </p>
                            <p className="text-xs text-slate-400">disponible</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* First Payment Date */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Fecha del Primer Pago</label>
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
                Cancelar
              </Button>
              <button
                onClick={handleDisburse}
                disabled={isSubmitting || !disbursementData.bankAccountId || !disbursementData.disbursedAmount}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                {isSubmitting ? 'Desembolsando...' : 'Confirmar Desembolso'}
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
                <AlertTriangle className="w-5 h-5" /> Marcar como Incobrable
              </h2>
              <button onClick={() => setShowWriteOffModal(false)} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
              <p className="text-orange-800 text-sm font-medium">⚠ El préstamo pasará a estado "Incobrable" y el score del cliente se reducirá al mínimo.</p>
              <p className="text-orange-700 text-sm mt-1">Préstamo <strong>{loan.loanNumber}</strong> · Cliente: <strong>{loan.clientName}</strong></p>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Motivo del castigo <span className="text-red-500">*</span></label>
              <textarea
                value={writeOffReason}
                onChange={e => setWriteOffReason(e.target.value)}
                rows={2}
                placeholder="Ej: Cliente insolvente, no localizado, fallecido..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            {/* Loss registration */}
            <div className="border border-slate-200 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <input type="checkbox" id="recordLoss" checked={writeOffRecordLoss} onChange={e => setWriteOffRecordLoss(e.target.checked)} className="rounded" />
                <label htmlFor="recordLoss" className="text-sm font-semibold text-slate-700">Registrar como pérdida en Ingresos/Gastos</label>
              </div>
              {writeOffRecordLoss && (
                <div className="ml-6 space-y-2">
                  <p className="text-xs text-slate-500 mb-2">Selecciona qué componentes registrar como pérdida:</p>
                  {[
                    { key: 'capital', label: 'Capital pendiente', amount: (loan as any).principal_balance ?? (loan as any).principalBalance ?? 0 },
                    { key: 'interest', label: 'Intereses pendientes', amount: (loan as any).interest_balance ?? (loan as any).interestBalance ?? 0 },
                    { key: 'mora', label: 'Mora pendiente', amount: (loan as any).mora_balance ?? (loan as any).moraBalance ?? 0 },
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
                {isWritingOff ? 'Procesando...' : 'Confirmar — Marcar Incobrable'}
              </button>
              <button onClick={() => setShowWriteOffModal(false)} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                Cancelar
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
                <Trash2 className="w-5 h-5" /> Anular Préstamo
              </h2>
              <button onClick={() => { setShowVoidLoanModal(false); setVoidLoanReason('') }} className="p-1 hover:bg-slate-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-red-800 text-sm font-medium">⚠ Esta acción no se puede deshacer.</p>
              <p className="text-red-700 text-sm mt-1">
                Se anulará el préstamo <strong>{loan.loanNumber}</strong> del cliente <strong>{loan.clientName}</strong>.
                Los pagos previos quedarán registrados pero el préstamo pasará a estado "Anulado".
              </p>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Motivo de anulación <span className="text-red-500">*</span></label>
              <textarea
                value={voidLoanReason}
                onChange={(e) => setVoidLoanReason(e.target.value)}
                placeholder="Describe el motivo por el cual se anula este préstamo..."
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => { setShowVoidLoanModal(false); setVoidLoanReason('') }} disabled={isVoidingLoan}>
                Cancelar
              </Button>
              <button
                onClick={handleVoidLoan}
                disabled={isVoidingLoan || !voidLoanReason.trim()}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {isVoidingLoan ? 'Anulando...' : 'Confirmar Anulación'}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <Card className="w-full max-w-lg my-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="section-title">Registrar Pago</h2>
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
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                  <p className="text-amber-800 font-semibold text-sm">Pago excede el saldo adeudado</p>
                  <p className="text-2xl font-bold text-amber-700 mt-1">
                    Excedente: {formatCurrency((parseFloat(paymentData.amount) || 0) - preview.totalDue, loan.currency || 'DOP')}
                  </p>
                  <p className="text-xs text-amber-600 mt-1">¿Cómo deseas aplicar este excedente?</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handlePaymentSubmit('apply_to_capital')}
                    disabled={isSubmitting}
                    className="p-4 border-2 border-blue-300 rounded-lg text-center hover:bg-blue-50 transition-colors disabled:opacity-50"
                  >
                    <TrendingDown className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                    <p className="font-semibold text-blue-900 text-sm">Abonar al Capital</p>
                    <p className="text-xs text-slate-500 mt-1">Reduce el saldo pendiente del préstamo</p>
                  </button>
                  <button
                    onClick={() => handlePaymentSubmit('apply_to_next_installment')}
                    disabled={isSubmitting}
                    className="p-4 border-2 border-emerald-300 rounded-lg text-center hover:bg-emerald-50 transition-colors disabled:opacity-50"
                  >
                    <Calendar className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                    <p className="font-semibold text-emerald-900 text-sm">Aplicar a Próxima Cuota</p>
                    <p className="text-xs text-slate-500 mt-1">Anticipa el pago de la siguiente cuota</p>
                  </button>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setOverpaymentStep(false)}
                  disabled={isSubmitting}
                >
                  ← Volver y editar monto
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Balance summary chips */}
                <div className="flex gap-2 flex-wrap text-xs">
                  <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-full font-medium">
                    Capital: {formatCurrency(loan.principalBalance, loan.currency || 'DOP')}
                  </span>
                  <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                    Interés: {formatCurrency(loan.interestBalance, loan.currency || 'DOP')}
                  </span>
                  {loan.moraBalance > 0 && (
                    <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
                      Mora: {formatCurrency(loan.moraBalance, loan.currency || 'DOP')}
                    </span>
                  )}
                  <span className="bg-slate-800 text-white px-2 py-1 rounded-full font-semibold ml-auto">
                    Total: {formatCurrency(totalOverdue, loan.currency || 'DOP')}
                  </span>
                </div>

                {/* Payment type selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Tipo de Pago</label>
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
                              {pt.label}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 leading-tight">{pt.desc}</p>
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
                      Cargo de Prórroga
                    </p>
                    <p className="mt-1 leading-relaxed">
                      El vencimiento de las cuotas pendientes se moverá un periodo adelante.
                      Se cobrará el cargo de <strong>{formatCurrency(loan.prorrogaFee || 0, loan.currency || 'DOP')}</strong>
                      {(loan.moraBalance || 0) > 0 && <span> + mora de <strong>{formatCurrency(loan.moraBalance || 0, loan.currency || 'DOP')}</strong></span>}.
                    </p>
                  </div>
                )}

                {paymentData.paymentType === 'interest_only' && nextPendingInstallment && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-800">
                    <p className="font-semibold flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 flex-shrink-0" />
                      Prórroga automática de vencimiento
                    </p>
                    <p className="mt-1 leading-relaxed">
                      Al pagar solo el interés de la cuota #{nextPendingInstallment.installmentNumber},
                      la fecha de vencimiento se moverá un período adelante. El préstamo{' '}
                      <strong>no caerá en mora</strong> — se aplicará a partir de la nueva fecha.
                    </p>
                  </div>
                )}

                {/* Amount input */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-slate-700">Monto a Pagar</label>
                    <button
                      onClick={() => setPaymentData({ ...paymentData, amount: String(totalOverdue.toFixed(2)) })}
                      className="text-xs text-blue-600 hover:underline font-medium flex items-center gap-1"
                    >
                      <Zap className="w-3 h-3" />
                      Pagar saldo total
                    </button>
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
                      <p className="text-xs text-slate-500 text-center py-1">Calculando...</p>
                    ) : preview ? (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600 flex items-center gap-1"><Percent className="w-3 h-3" /> Interés aplicado</span>
                          <span className="font-semibold text-blue-700">{formatCurrency(preview.breakdown.interest, loan.currency || 'DOP')}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Capital abonado</span>
                          <span className="font-semibold text-slate-900">{formatCurrency(preview.breakdown.capital, loan.currency || 'DOP')}</span>
                        </div>
                        {preview.breakdown.mora > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-red-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Mora cubierta</span>
                            <span className="font-semibold text-red-600">{formatCurrency(preview.breakdown.mora, loan.currency || 'DOP')}</span>
                          </div>
                        )}
                        {preview.breakdown.excessToCapital > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-emerald-600 flex items-center gap-1"><Coins className="w-3 h-3" /> Excedente</span>
                            <span className="font-semibold text-emerald-700">{formatCurrency(preview.breakdown.excessToCapital, loan.currency || 'DOP')}</span>
                          </div>
                        )}
                        <div className="border-t border-slate-200 pt-1.5 flex justify-between text-xs">
                          <span className="text-slate-600 font-medium">Saldo restante tras pago</span>
                          <span className={`font-bold ${preview.remaining <= 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
                            {preview.remaining <= 0 ? '✓ Saldado' : formatCurrency(preview.remaining, loan.currency || 'DOP')}
                          </span>
                        </div>
                        {preview.isOverpayment && (
                          <div className="flex items-center gap-1 pt-0.5">
                            <Info className="w-3 h-3 text-amber-600" />
                            <p className="text-xs text-amber-700 font-medium">
                              Hay un excedente — se te pedirá cómo aplicarlo
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
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Método</label>
                    <select
                      value={paymentData.paymentMethod}
                      onChange={(e) => setPaymentData({ ...paymentData, paymentMethod: e.target.value })}
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
                      value={paymentData.paymentDate}
                      onChange={(e) => setPaymentData({ ...paymentData, paymentDate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Bank account (when transfer or check) */}
                {(paymentData.paymentMethod === 'transfer' || paymentData.paymentMethod === 'check') && bankAccounts.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Cuenta Bancaria</label>
                    <select
                      value={paymentData.bankAccountId}
                      onChange={(e) => setPaymentData({ ...paymentData, bankAccountId: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— Sin especificar —</option>
                      {bankAccounts.map((ba: any) => (
                        <option key={ba.id} value={ba.id}>{ba.bankName} · {ba.accountNumber}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Reference */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Referencia / Comprobante <span className="font-normal text-slate-400">(opcional)</span></label>
                  <input
                    type="text"
                    value={paymentData.reference}
                    onChange={(e) => setPaymentData({ ...paymentData, reference: e.target.value })}
                    placeholder="Ej. TRF-00123"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Notas <span className="font-normal text-slate-400">(opcional)</span></label>
                  <textarea
                    value={paymentData.notes}
                    onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                    placeholder="Observaciones adicionales..."
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
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => handlePaymentSubmit()}
                    disabled={isSubmitting || !paymentData.amount || parseFloat(paymentData.amount) <= 0}
                  >
                    {isSubmitting ? 'Registrando...' : preview?.isOverpayment ? 'Continuar →' : 'Registrar Pago'}
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
                  <h3 className="font-bold text-slate-900">Generar Contrato / Pagaré</h3>
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
                    <label className="block text-sm font-medium text-slate-700 mb-2">Selecciona la Plantilla de Contrato</label>
                    {contractTemplates.length === 0 ? (
                      <div className="text-center py-8 bg-slate-50 rounded-lg border border-slate-200">
                        <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-slate-500 text-sm font-medium">No hay plantillas disponibles</p>
                        <p className="text-xs text-slate-400 mt-1">Ve a Configuración → Plantillas para crear una</p>
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
                                  <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">Predeterminado</span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5 capitalize">{tpl.type === 'general' ? 'Contrato general' : tpl.type}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                    <strong>Nota:</strong> Al generar el contrato se creará un registro en el módulo de Contratos y se completarán los datos automáticamente con la información del préstamo y el cliente.
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button
                      className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700"
                      onClick={handleGenerateContract}
                      disabled={isGeneratingContract || !selectedTemplateId || contractTemplates.length === 0}
                    >
                      <FileCheck className="w-4 h-4" />
                      {isGeneratingContract ? 'Generando...' : 'Generar Contrato'}
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => setShowContractModal(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                /* Step 2: Preview & Print */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-emerald-700 flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4" />Contrato generado correctamente
                    </p>
                    <button onClick={() => setGeneratedContractContent(null)} className="text-xs text-slate-500 hover:text-slate-700 underline">
                      ← Volver a seleccionar plantilla
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
                      Imprimir / Guardar PDF
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 flex items-center justify-center gap-2"
                      onClick={() => { setShowContractModal(false); navigate('/contracts') }}
                    >
                      <FileText className="w-4 h-4" />
                      Ver en Contratos
                    </Button>
                  </div>
                  <p className="text-xs text-slate-400 text-center">Al imprimir, usa "Guardar como PDF" en el cuadro de diálogo del navegador para obtener un PDF del contrato.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LoanDetailPage

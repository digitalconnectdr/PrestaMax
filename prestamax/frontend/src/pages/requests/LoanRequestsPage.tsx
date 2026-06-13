import React, { useState, useEffect } from 'react'
import { usePermission } from '@/hooks/usePermission'
import { useConfirm } from '@/hooks/useConfirm'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { PageLoadingState } from '@/components/ui/Loading'
import {
  ClipboardList, CheckCircle, XCircle, Clock, Eye, X,
  User, Phone, Mail, MapPin, FileText, DollarSign, Calendar,
  RefreshCw, Copy, Link2, AlertCircle, ShieldCheck, RotateCcw
} from 'lucide-react'
import api, { isAccessDenied, isSubscriptionExpired } from '@/lib/api'
import toast from 'react-hot-toast'
import { formatDate } from '@/lib/utils'
import { AMORTIZATION_TYPES } from '@/lib/amortization'
import { useT } from '@/lib/i18n'

interface LoanRequest {
  id: string
  tenantId: string
  clientName: string
  clientEmail: string | null
  clientPhone: string
  clientAddress: string | null
  idNumber: string | null
  dateOfBirth: string | null
  gender: string | null
  maritalStatus: string | null
  nationality: string | null
  whatsapp: string | null
  city: string | null
  province: string | null
  phoneWork: string | null
  phoneFamily: string | null
  familyContactName: string | null
  familyRelationship: string | null
  occupation: string | null
  employer: string | null
  monthlyIncome: number | null
  economicActivity: string | null
  loanAmount: number | null
  loanPurpose: string | null
  loanTerm: number | null
  idFrontImage: string | null
  idBackImage: string | null
  status: 'pending' | 'approved' | 'rejected' | 'converted'
  rejectionReason: string | null
  notes: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
}

const STATUS_CONFIG = {
  pending:   { labelKey: 'req.st_pending',   color: 'bg-amber-100 text-amber-700 border-amber-200',   icon: Clock },
  approved:  { labelKey: 'req.st_approved',  color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle },
  rejected:  { labelKey: 'req.st_rejected',  color: 'bg-red-100 text-red-700 border-red-200',          icon: XCircle },
  converted: { labelKey: 'req.st_converted', color: 'bg-blue-100 text-blue-700 border-blue-200',      icon: ShieldCheck },
}

const LoanRequestsPage: React.FC = () => {
  const t = useT()
  const { can } = usePermission()
  const { confirm, ConfirmHost } = useConfirm()
  const [requests, setRequests] = useState<LoanRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [selectedRequest, setSelectedRequest] = useState<LoanRequest | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [rejectForm, setRejectForm] = useState({ open: false, reason: '', notes: '' })
  const [isActing, setIsActing] = useState(false)
  const [publicLink, setPublicLink] = useState<string>('')
  const [publicLinkError, setPublicLinkError] = useState<string>('')
  const [showLinkPanel, setShowLinkPanel] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [showImageModal, setShowImageModal] = useState<{ src: string; label: string } | null>(null)
  const [showConvertModal, setShowConvertModal] = useState(false)
  const [products, setProducts] = useState<any[]>([])
  const [bankAccounts, setBankAccounts] = useState<any[]>([])
  const [convertForm, setConvertForm] = useState({
    productId: '', rate: '', rateType: 'monthly', term: '', termUnit: 'months',
    paymentFrequency: 'monthly', amortizationType: 'fixed_installment',
    firstPaymentDate: '', disbursementBankAccountId: '',
  })

  const loadRequests = async () => {
    setIsLoading(true)
    try {
      const res = await api.get('/loan-requests', { params: { status: filterStatus } })
      setRequests(res.data || [])
    } catch(err) { if (!isAccessDenied(err) && !isSubscriptionExpired(err)) toast.error(t('req.load_error')) }
    finally { setIsLoading(false) }
  }

  const loadPublicLink = async () => {
    try {
      const res = await api.get('/loan-requests/settings/public-link')
      const base = window.location.origin
      const token = res.data.publicToken || res.data.public_token
      if (!token) {
        setPublicLinkError(t('req.token_error'))
        return
      }
      setPublicLink(`${base}/apply/${token}`)
      setPublicLinkError('')
    } catch (err: any) {
      const code = err?.response?.data?.code
      const message = err?.response?.data?.error || t('req.link_load_error')
      if (code === 'PLAN_FEATURE_REQUIRED') {
        setPublicLinkError(t('req.plan_required'))
      } else if (err?.response?.status === 403) {
        setPublicLinkError(t('req.no_link_perm'))
      } else {
        setPublicLinkError(message)
      }
    }
  }

  useEffect(() => { loadRequests(); loadPublicLink() }, [filterStatus])

  useEffect(() => {
    api.get('/products').then(r => setProducts(Array.isArray(r.data) ? r.data : [])).catch(() => {})
    api.get('/settings/bank-accounts').then(r => setBankAccounts(Array.isArray(r.data) ? r.data : [])).catch(() => {})
  }, [])

  const openDetail = async (req: LoanRequest) => {
    setIsLoadingDetail(true)
    setSelectedRequest(req)
    try {
      const res = await api.get(`/loan-requests/${req.id}`)
      setSelectedRequest(res.data)
    } catch(err) { if (!isAccessDenied(err) && !isSubscriptionExpired(err)) toast.error(t('req.detail_error')) }
    finally { setIsLoadingDetail(false) }
  }

  const handleApprove = async () => {
    if (!selectedRequest) return
    setIsActing(true)
    try {
      await api.put(`/loan-requests/${selectedRequest.id}/approve`, {})
      toast.success(t('req.approved_ok'))
      setSelectedRequest(null)
      loadRequests()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('req.approve_error'))
    } finally { setIsActing(false) }
  }

  const handleReject = async () => {
    if (!selectedRequest || !rejectForm.reason) return toast.error(t('req.reason_required'))
    setIsActing(true)
    try {
      await api.put(`/loan-requests/${selectedRequest.id}/reject`, {
        rejectionReason: rejectForm.reason,
        notes: rejectForm.notes || undefined,
      })
      toast.success(t('req.rejected_ok'))
      setSelectedRequest(null)
      setRejectForm({ open: false, reason: '', notes: '' })
      loadRequests()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('req.reject_error'))
    } finally { setIsActing(false) }
  }

  const handleConvert = async () => {
    if (!selectedRequest) return
    if (!convertForm.productId) return toast.error(t('req.select_product'))
    if (!convertForm.term) return toast.error(t('req.enter_term'))
    if (!convertForm.rate) return toast.error(t('req.enter_rate'))
    const firstDate = convertForm.firstPaymentDate || (() => {
      const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().split('T')[0]
    })()
    setIsActing(true)
    try {
      const res = await api.put(`/loan-requests/${selectedRequest.id}/convert`, {
        productId: convertForm.productId,
        rate: parseFloat(convertForm.rate),
        rateType: convertForm.rateType,
        term: parseInt(convertForm.term),
        termUnit: convertForm.termUnit,
        paymentFrequency: convertForm.paymentFrequency,
        amortizationType: convertForm.amortizationType,
        firstPaymentDate: firstDate,
        disbursementBankAccountId: convertForm.disbursementBankAccountId || undefined,
      })
      toast.success(t('req.loan_created').replace('{n}', res.data.loanNumber))
      setSelectedRequest(null)
      setShowConvertModal(false)
      setConvertForm({ productId: '', rate: '', rateType: 'monthly', term: '', termUnit: 'months', paymentFrequency: 'monthly', amortizationType: 'fixed_installment', firstPaymentDate: '', disbursementBankAccountId: '' })
      loadRequests()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('req.convert_error'))
    } finally { setIsActing(false) }
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicLink)
    toast.success(t('req.link_copied'))
  }

  const handleRegenerateToken = async () => {
    const ok_ = await confirm({ title: t('common.confirm'), message: t('req.regen_confirm'), variant: 'warning' })
    if (!ok_) return
    setIsRegenerating(true)
    try {
      await api.post('/loan-requests/settings/regenerate-token', {})
      await loadPublicLink()
      toast.success(t('req.link_regen'))
    } catch { toast.error(t('common.error')) }
    finally { setIsRegenerating(false) }
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length

  return (
    <div className="space-y-6">
      <ConfirmHost />
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-blue-600" />
            {t('req.title')}
            {pendingCount > 0 && (
              <span className="ml-2 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{t('req.new_badge').replace('{n}', String(pendingCount)).replace('{s}', pendingCount !== 1 ? 's' : '')}</span>
            )}
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">{t('req.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowLinkPanel(!showLinkPanel)} className="flex items-center gap-1.5">
            <Link2 className="w-4 h-4" />{t('req.portal_link')}
          </Button>
          <Button size="sm" variant="outline" onClick={loadRequests} className="flex items-center gap-1">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Public Link Panel */}
      {showLinkPanel && (
        <Card className="bg-blue-50 border-blue-200">
          <div className="flex items-start gap-3">
            <Link2 className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-blue-900 mb-1">{t('req.link_panel_title')}</p>
              <p className="text-xs text-blue-600 mb-3">{t('req.link_panel_desc')}</p>
              {publicLinkError && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-2">
                  ⚠ {publicLinkError}
                </p>
              )}
              <div className="flex gap-2 flex-wrap">
                <div className={`flex-1 min-w-0 bg-white border rounded-lg px-3 py-2 font-mono text-xs truncate ${publicLinkError ? 'border-amber-200 text-amber-600' : 'border-blue-200 text-blue-800'}`}>
                  {publicLink || (publicLinkError ? t('req.unavailable') : t('req.loading'))}
                </div>
                <Button size="sm" onClick={handleCopyLink} className="flex items-center gap-1 flex-shrink-0">
                  <Copy className="w-3.5 h-3.5" />{t('req.copy')}
                </Button>
                <Button size="sm" variant="outline" onClick={handleRegenerateToken} disabled={isRegenerating}
                  className="flex items-center gap-1 flex-shrink-0 border-amber-300 text-amber-700 hover:bg-amber-50">
                  <RotateCcw className="w-3.5 h-3.5" />{isRegenerating ? t('req.regenerating') : t('req.new_link')}
                </Button>
              </div>
              <p className="text-xs text-blue-500 mt-2">{t('req.link_warning')}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { value: 'all', label: t('req.f_all') },
          { value: 'pending', label: t('req.f_pending') },
          { value: 'approved', label: t('req.f_approved') },
          { value: 'rejected', label: t('req.f_rejected') },
          { value: 'converted', label: t('req.f_converted') },
        ].map(f => (
          <button key={f.value} onClick={() => setFilterStatus(f.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filterStatus === f.value ? 'bg-[#1e3a5f] text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? <PageLoadingState /> : requests.length > 0 ? (
        <div className="space-y-3">
          {requests.map(req => {
            const statusConf = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending
            const StatusIcon = statusConf.icon
            return (
              <Card key={req.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => openDetail(req)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-slate-900">{req.clientName}</span>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${statusConf.color}`}>
                        <StatusIcon className="w-3 h-3" />{t(statusConf.labelKey)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                      <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{req.clientPhone}</span>
                      {req.clientEmail && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{req.clientEmail}</span>}
                      {req.loanAmount && <span className="flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" />${req.loanAmount.toLocaleString()}</span>}
                      {req.loanPurpose && <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" />{req.loanPurpose}</span>}
                    </div>
                    {req.status === 'rejected' && req.rejectionReason && (
                      <p className="text-xs text-red-600 mt-1">{t('req.reason_label').replace('{r}', req.rejectionReason)}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-slate-400">{req.createdAt?.slice(0,10)}</p>
                    <button className="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" />{t('req.view_detail')}
                    </button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        <EmptyState icon={ClipboardList} title={t('req.empty_title')}
          description={filterStatus === 'all' ? t('req.empty_all') : t('req.empty_filtered').replace('{s}', filterStatus)} />
      )}

      {/* ── Detail Modal ── */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">{selectedRequest.clientName}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{t('req.request_no').replace('{id}', selectedRequest.id.slice(0,8).toUpperCase())}</p>
              </div>
              <div className="flex items-center gap-2">
                {(() => { const sc = STATUS_CONFIG[selectedRequest.status]; const Icon = sc.icon; return (
                  <span className={`inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full border font-medium ${sc.color}`}>
                    <Icon className="w-3 h-3" />{t(sc.labelKey)}
                  </span>
                )})()}
                <button onClick={() => { setSelectedRequest(null); setRejectForm({ open: false, reason: '', notes: '' }) }}
                  className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
            </div>

            {isLoadingDetail ? (
              <div className="p-8 text-center text-slate-400">{t('req.loading')}</div>
            ) : (
              <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
                {/* Loan info summary */}
                {(selectedRequest.loanAmount || selectedRequest.loanTerm || selectedRequest.loanPurpose) && (
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-2">{t('req.loan_info')}</p>
                    <div className="grid grid-cols-3 gap-3">
                      {selectedRequest.loanAmount && (
                        <div><p className="text-xs text-blue-400">{t('req.amount')}</p><p className="font-bold text-blue-700">${selectedRequest.loanAmount.toLocaleString()}</p></div>
                      )}
                      {selectedRequest.loanTerm && (
                        <div><p className="text-xs text-blue-400">{t('req.term')}</p><p className="font-medium text-blue-700">{selectedRequest.loanTerm} {t('req.months')}</p></div>
                      )}
                      {selectedRequest.loanPurpose && (
                        <div><p className="text-xs text-blue-400">{t('req.purpose')}</p><p className="font-medium text-blue-700">{selectedRequest.loanPurpose}</p></div>
                      )}
                    </div>
                  </div>
                )}

                {/* Client personal data */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{t('req.personal_data')}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      { label: t('req.id_field'), value: selectedRequest.idNumber },
                      { label: t('req.dob'), value: selectedRequest.dateOfBirth },
                      { label: t('req.gender'), value: selectedRequest.gender === 'male' ? t('req.g_male') : selectedRequest.gender === 'female' ? t('req.g_female') : selectedRequest.gender },
                      { label: t('req.marital'), value: { single:t('req.m_single'), married:t('req.m_married'), divorced:t('req.m_divorced'), widowed:t('req.m_widowed'), cohabiting:t('req.m_cohabiting') }[selectedRequest.maritalStatus || ''] || selectedRequest.maritalStatus },
                      { label: t('req.nationality'), value: selectedRequest.nationality },
                    ].filter(f => f.value).map(f => (
                      <div key={f.label} className="p-2.5 bg-slate-50 rounded-lg">
                        <p className="text-xs text-slate-400">{f.label}</p>
                        <p className="font-medium text-slate-800">{f.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Contact */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{t('req.contact')}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      { label: t('req.phone_personal'), value: selectedRequest.clientPhone },
                      { label: 'WhatsApp', value: selectedRequest.whatsapp },
                      { label: t('req.email'), value: selectedRequest.clientEmail },
                      { label: t('req.phone_work'), value: selectedRequest.phoneWork },
                    ].filter(f => f.value).map(f => (
                      <div key={f.label} className="p-2.5 bg-slate-50 rounded-lg">
                        <p className="text-xs text-slate-400">{f.label}</p>
                        <p className="font-medium text-slate-800 truncate">{f.value}</p>
                      </div>
                    ))}
                    {(selectedRequest.clientAddress || selectedRequest.city || selectedRequest.province) && (
                      <div className="col-span-2 p-2.5 bg-slate-50 rounded-lg">
                        <p className="text-xs text-slate-400">{t('req.address')}</p>
                        <p className="font-medium text-slate-800">
                          {[selectedRequest.clientAddress, selectedRequest.city, selectedRequest.province].filter(Boolean).join(', ')}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Work info */}
                {(selectedRequest.occupation || selectedRequest.employer || selectedRequest.monthlyIncome || selectedRequest.economicActivity) && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{t('req.work_info')}</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {[
                        { label: t('req.occupation'), value: selectedRequest.occupation },
                        { label: t('req.employer'), value: selectedRequest.employer },
                        { label: t('req.monthly_income'), value: selectedRequest.monthlyIncome ? `RD$ ${selectedRequest.monthlyIncome.toLocaleString()}` : null },
                        { label: t('req.economic_act'), value: selectedRequest.economicActivity },
                      ].filter(f => f.value).map(f => (
                        <div key={f.label} className="p-2.5 bg-slate-50 rounded-lg">
                          <p className="text-xs text-slate-400">{f.label}</p>
                          <p className="font-medium text-slate-800">{f.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Family reference */}
                {(selectedRequest.familyContactName || selectedRequest.phoneFamily) && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{t('req.family_ref')}</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {[
                        { label: t('req.family_contact'), value: selectedRequest.familyContactName },
                        { label: t('req.relationship'), value: selectedRequest.familyRelationship },
                        { label: t('req.phone_family'), value: selectedRequest.phoneFamily },
                      ].filter(f => f.value).map(f => (
                        <div key={f.label} className="p-2.5 bg-slate-50 rounded-lg">
                          <p className="text-xs text-slate-400">{f.label}</p>
                          <p className="font-medium text-slate-800">{f.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ID Images */}
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2">{t('req.id_photos')}</p>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedRequest.idFrontImage ? (
                      <div>
                        <p className="text-xs text-slate-400 mb-1">{t('req.id_front')}</p>
                        <img src={selectedRequest.idFrontImage} alt={t('req.id_front_label')} onClick={() => setShowImageModal({ src: selectedRequest.idFrontImage!, label: t('req.id_front_label') })}
                          className="w-full h-36 object-cover rounded-xl border border-slate-200 cursor-zoom-in hover:opacity-90 transition-opacity" />
                      </div>
                    ) : <div className="bg-slate-100 rounded-xl h-36 flex items-center justify-center text-slate-300 text-xs">{t('req.no_image')}</div>}
                    {selectedRequest.idBackImage ? (
                      <div>
                        <p className="text-xs text-slate-400 mb-1">{t('req.id_back')}</p>
                        <img src={selectedRequest.idBackImage} alt={t('req.id_back_label')} onClick={() => setShowImageModal({ src: selectedRequest.idBackImage!, label: t('req.id_back_label') })}
                          className="w-full h-36 object-cover rounded-xl border border-slate-200 cursor-zoom-in hover:opacity-90 transition-opacity" />
                      </div>
                    ) : <div className="bg-slate-100 rounded-xl h-36 flex items-center justify-center text-slate-300 text-xs">{t('req.no_image')}</div>}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{t('req.click_to_zoom')}</p>
                </div>

                {/* Rejection reason (if rejected) */}
                {selectedRequest.status === 'rejected' && selectedRequest.rejectionReason && (
                  <div className="flex gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-700">{t('req.rejection_reason')}</p>
                      <p className="text-sm text-red-600">{selectedRequest.rejectionReason}</p>
                      {selectedRequest.notes && <p className="text-xs text-red-400 mt-1">{selectedRequest.notes}</p>}
                    </div>
                  </div>
                )}

                {/* Reject form inline */}
                {rejectForm.open && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-semibold text-red-800">{t('req.reject_title')}</p>
                    <select value={rejectForm.reason} onChange={e => setRejectForm(p => ({ ...p, reason: e.target.value }))}
                      className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400">
                      <option value="">{t('req.select_reason')}</option>
                      <option value={t('req.rr_incomplete')}>{t('req.rr_incomplete')}</option>
                      <option value={t('req.rr_income')}>{t('req.rr_income')}</option>
                      <option value={t('req.rr_credit')}>{t('req.rr_credit')}</option>
                      <option value={t('req.rr_unverifiable')}>{t('req.rr_unverifiable')}</option>
                      <option value={t('req.rr_exceeds')}>{t('req.rr_exceeds')}</option>
                      <option value={t('req.rr_active_debt')}>{t('req.rr_active_debt')}</option>
                      <option value={t('req.rr_other')}>{t('req.rr_other')}</option>
                    </select>
                    <textarea value={rejectForm.notes} onChange={e => setRejectForm(p => ({ ...p, notes: e.target.value }))}
                      placeholder={t('req.notes_ph')}
                      className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400" rows={2} />
                    <div className="flex gap-2">
                      <button onClick={handleReject} disabled={isActing || !rejectForm.reason}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg font-medium disabled:opacity-50">
                        {isActing ? t('req.processing') : t('req.confirm_reject')}
                      </button>
                      <button onClick={() => setRejectForm(p => ({ ...p, open: false }))}
                        className="px-4 py-2 bg-white border border-red-200 text-red-600 text-sm rounded-lg">
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Actions */}
                {selectedRequest.status === 'pending' && !rejectForm.open && (can('requests.approve') || can('requests.reject')) && (
                  <div className="flex gap-3 pt-2 border-t border-slate-100">
                    {can('requests.approve') && (
                      <button onClick={handleApprove} disabled={isActing}
                        className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                        <CheckCircle className="w-4 h-4" />{isActing ? t('req.processing') : t('req.approve')}
                      </button>
                    )}
                    {can('requests.reject') && (
                      <button onClick={() => setRejectForm(p => ({ ...p, open: true }))} disabled={isActing}
                        className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                        <XCircle className="w-4 h-4" />{t('req.reject')}
                      </button>
                    )}
                  </div>
                )}

                {can('requests.convert') && selectedRequest.status === 'approved' && (
                  <div className="flex gap-3 pt-2 border-t border-slate-100">
                    <div className="flex-1 p-3 bg-emerald-50 rounded-xl text-sm text-emerald-700 font-medium text-center">
                      {t('req.approved_create')}
                    </div>
                    <button onClick={() => setShowConvertModal(true)} disabled={isActing}
                      className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm flex items-center gap-2 disabled:opacity-60">
                      <ShieldCheck className="w-4 h-4" />{t('req.create_loan')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Image zoom modal */}
      {showImageModal && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={() => setShowImageModal(null)}>
          <div className="max-w-2xl w-full">
            <p className="text-white text-center mb-3 text-sm font-medium">{showImageModal.label}</p>
            <img src={showImageModal.src} alt={showImageModal.label} className="w-full rounded-xl shadow-2xl" />
            <p className="text-white/50 text-center mt-3 text-xs">{t('req.tap_to_close')}</p>
          </div>
        </div>
      )}

      {/* Convert to Loan Modal */}
      {showConvertModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" /> {t('req.create_loan')}
              </h2>
              <button onClick={() => setShowConvertModal(false)} className="p-1 hover:bg-slate-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
              <p><strong>{selectedRequest.clientName}</strong> · {t('req.amount_requested')}: <strong>${selectedRequest.loanAmount?.toLocaleString()}</strong></p>
            </div>

            <div className="space-y-3">
              {/* Product */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{t('req.product')} <span className="text-red-500">*</span></label>
                <select value={convertForm.productId} onChange={e => {
                  const p = products.find((x: any) => x.id === e.target.value)
                  setConvertForm(f => ({ ...f, productId: e.target.value, rate: p?.rate || f.rate }))
                }} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">{t('req.select_product_opt')}</option>
                  {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {/* Rate + Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{t('req.rate')} <span className="text-red-500">*</span></label>
                  <input type="number" step="0.01" value={convertForm.rate} onChange={e => setConvertForm(f => ({ ...f, rate: e.target.value }))}
                    placeholder={t('req.rate_ph')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{t('req.rate_type')}</label>
                  <select value={convertForm.rateType} onChange={e => setConvertForm(f => ({ ...f, rateType: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="monthly">{t('req.monthly')}</option>
                    <option value="annual">{t('req.annual')}</option>
                  </select>
                </div>
              </div>

              {/* Term + Unit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{t('req.term')} <span className="text-red-500">*</span></label>
                  <input type="number" value={convertForm.term} onChange={e => setConvertForm(f => ({ ...f, term: e.target.value }))}
                    placeholder={selectedRequest.loanTerm?.toString() || '12'} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{t('req.unit')}</label>
                  <select value={convertForm.termUnit} onChange={e => setConvertForm(f => ({ ...f, termUnit: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="months">{t('req.u_months')}</option>
                    <option value="weeks">{t('req.u_weeks')}</option>
                  </select>
                </div>
              </div>

              {/* Frequency + Amortization */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{t('req.pay_freq')}</label>
                  <select value={convertForm.paymentFrequency} onChange={e => setConvertForm(f => ({ ...f, paymentFrequency: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="monthly">{t('req.freq_monthly')}</option>
                    <option value="biweekly">{t('req.freq_biweekly')}</option>
                    <option value="weekly">{t('req.freq_weekly')}</option>
                    <option value="daily">{t('req.freq_daily')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{t('req.amortization')}</label>
                  <select value={convertForm.amortizationType} onChange={e => setConvertForm(f => ({ ...f, amortizationType: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {AMORTIZATION_TYPES.map(at => (
                      <option key={at.value} value={at.value}>{at.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* First payment date */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{t('req.first_payment')}</label>
                <input type="date" value={convertForm.firstPaymentDate} onChange={e => setConvertForm(f => ({ ...f, firstPaymentDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Bank account */}
              {bankAccounts.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{t('req.disb_account')}</label>
                  <select value={convertForm.disbursementBankAccountId} onChange={e => setConvertForm(f => ({ ...f, disbursementBankAccountId: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">{t('req.unspecified')}</option>
                    {bankAccounts.map((ba: any) => <option key={ba.id} value={ba.id}>{ba.bankName} · {ba.accountNumber}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowConvertModal(false)} disabled={isActing}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 font-medium">
                {t('common.cancel')}
              </button>
              <button onClick={handleConvert} disabled={isActing || !convertForm.productId || !convertForm.rate || !convertForm.term}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                {isActing ? t('req.creating') : t('req.create_loan')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LoanRequestsPage

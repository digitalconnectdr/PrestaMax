import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { PageLoadingState } from '@/components/ui/Loading'
import { ArrowLeft, Users, Link2, TrendingUp, X, CheckCircle2, History, Ban, KeyRound, Copy } from 'lucide-react'
import api, { isAccessDenied, isSubscriptionExpired } from '@/lib/api'
import toast from 'react-hot-toast'
import { usePermission } from '@/hooks/usePermission'
import { useConfirm } from '@/hooks/useConfirm'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useT } from '@/lib/i18n'

const InvestorDetailPage: React.FC = () => {
  const t = useT()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { can } = usePermission()
  const { confirm, ConfirmHost } = useConfirm()

  const [investor, setInvestor] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showAssign, setShowAssign] = useState(false)
  const [availableLoans, setAvailableLoans] = useState<any[]>([])
  const [assigningLoanId, setAssigningLoanId] = useState('')

  const today = new Date().toISOString().slice(0, 10)
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const [from, setFrom] = useState(thirtyAgo)
  const [to, setTo] = useState(today)
  const [report, setReport] = useState<any>(null)
  const [reportLoading, setReportLoading] = useState(false)

  const [payouts, setPayouts] = useState<any[]>([])
  const [showConfirmPayout, setShowConfirmPayout] = useState(false)
  const [bankAccounts, setBankAccounts] = useState<any[]>([])
  const [payoutForm, setPayoutForm] = useState({ bankAccountId: '', paymentMethod: 'bank_transfer', reference: '', notes: '' })
  const [confirming, setConfirming] = useState(false)

  const [portalCreds, setPortalCreds] = useState<{ email: string; tempPassword: string } | null>(null)
  const [grantingAccess, setGrantingAccess] = useState(false)

  const canView    = can('investors.view')
  const canAssign  = can('investors.assign')
  const canPayouts = can('investors.payouts')

  const load = async () => {
    setIsLoading(true)
    try {
      const res = await api.get(`/investors/${id}`)
      setInvestor(res.data)
    } catch (err) {
      if (!isAccessDenied(err) && !isSubscriptionExpired(err)) toast.error(t('invd.load_error'))
      navigate('/investors')
    } finally { setIsLoading(false) }
  }

  const loadReport = async () => {
    setReportLoading(true)
    try {
      const res = await api.get(`/investors/${id}/liquidation-report`, { params: { from, to } })
      setReport(res.data)
    } catch (err: any) { toast.error(err?.response?.data?.error || t('invd.report_error')) }
    finally { setReportLoading(false) }
  }

  const loadPayouts = async () => {
    try {
      const res = await api.get(`/investors/${id}/payouts`)
      setPayouts(Array.isArray(res.data) ? res.data : [])
    } catch (_) { setPayouts([]) }
  }

  useEffect(() => {
    if (canView && id) { load(); loadPayouts() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, canView])

  useEffect(() => {
    if (canView && investor) loadReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investor?.id, canView])

  if (!canView) return <Navigate to="/dashboard" replace />

  const openAssign = async () => {
    setShowAssign(true)
    try {
      const res = await api.get('/loans?status=active,in_mora,disbursed&limit=500')
      const loans = (res.data?.data || []).filter((l: any) => !l.investorId)
      setAvailableLoans(loans)
    } catch (_) { setAvailableLoans([]) }
  }

  const handleAssign = async () => {
    if (!assigningLoanId) return toast.error(t('invd.select_loan'))
    try {
      await api.post(`/investors/${id}/assign-loan`, { loanId: assigningLoanId })
      toast.success(t('invd.loan_assigned'))
      setShowAssign(false); setAssigningLoanId(''); load(); loadReport()
    } catch (err: any) { toast.error(err?.response?.data?.error || t('invd.assign_error')) }
  }

  const handleUnassign = async (loanId: string) => {
    const ok_ = await confirm({ title: t('common.confirm'), message: t('invd.unassign_confirm'), variant: 'warning' })
    if (!ok_) return
    try {
      await api.post(`/investors/${id}/unassign-loan`, { loanId })
      toast.success(t('invd.loan_unassigned')); load(); loadReport()
    } catch (err: any) { toast.error(err?.response?.data?.error || t('invd.unassign_error')) }
  }

  const openConfirmPayout = async () => {
    const net = (report?.totals?.netToInvestor ?? report?.totals?.net_to_investor ?? 0)
    if (!report || net <= 0) return toast.error(t('invd.no_net'))
    setShowConfirmPayout(true)
    try {
      const res = await api.get('/settings/bank-accounts')
      setBankAccounts((res.data || []).filter((b: any) => b.isActive ?? b.isActive))
    } catch (_) { setBankAccounts([]) }
  }

  const handleConfirmPayout = async () => {
    setConfirming(true)
    try {
      await api.post(`/investors/${id}/payouts`, {
        from, to,
        bankAccountId: payoutForm.bankAccountId || null,
        paymentMethod: payoutForm.paymentMethod,
        reference: payoutForm.reference || null,
        notes: payoutForm.notes || null,
      })
      toast.success(t('invd.payout_recorded'))
      setShowConfirmPayout(false)
      setPayoutForm({ bankAccountId: '', paymentMethod: 'bank_transfer', reference: '', notes: '' })
      loadReport(); loadPayouts()
    } catch (err: any) { toast.error(err?.response?.data?.error || t('invd.payout_error')) }
    finally { setConfirming(false) }
  }

  const handleGrantPortalAccess = async () => {
    const action = (investor?.userId || investor?.userId) ? t('invd.grant_reset') : t('invd.grant_create')
    const ok_ = await confirm({ title: t('common.confirm'), message: t('invd.grant_confirm').replace('{action}', action), variant: 'warning' })
    if (!ok_) return
    setGrantingAccess(true)
    try {
      const res = await api.post(`/investors/${id}/grant-portal-access`)
      setPortalCreds({ email: res.data.email, tempPassword: res.data.tempPassword })
      load()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('invd.grant_error'))
    } finally {
      setGrantingAccess(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(t('invd.copied')),
      () => toast.error(t('invd.copy_error'))
    )
  }

  const handleVoidPayout = async (payoutId: string, amount: number) => {
    const ok_ = await confirm({ title: t('common.confirm'), message: t('invd.void_confirm').replace('{amount}', formatCurrency(amount)), variant: 'warning' })
    if (!ok_) return
    try {
      await api.post(`/investors/payouts/${payoutId}/void`)
      toast.success(t('invd.payout_voided')); loadReport(); loadPayouts()
    } catch (err: any) { toast.error(err?.response?.data?.error || t('invd.void_error')) }
  }

  if (isLoading) return <PageLoadingState />
  if (!investor) return null

  const fullName       = investor.fullName        ?? investor.fullName ?? ''
  const modelType      = investor.modelType       ?? investor.modelType
  const fixedRate      = investor.fixedRateMonthly      ?? investor.fixedRateMonthly ?? 0
  const equityPct      = investor.equityPercentInterest ?? investor.equityPercentInterest ?? 0
  const commissionPct  = investor.commissionPercent     ?? investor.commissionPercent ?? 0
  const idNumber       = investor.idNumber              ?? investor.id_number
  const capitalContrib = investor.capitalContributed    ?? investor.capitalContributed ?? 0
  const loansList      = investor.loans || []

  const r = report || {}
  const tot = r.totals || {}
  const paymentsCount = r.paymentsCount   ?? r.paymentsCount ?? 0
  const grossInterest = tot.grossInterest ?? tot.grossInterest ?? 0
  const grossMora     = tot.grossMora     ?? tot.grossMora     ?? 0
  const grossTotal    = tot.grossTotal    ?? tot.grossTotal    ?? 0
  const commPercent   = tot.commissionPercent ?? tot.commissionPercent ?? 0
  const commAmount    = tot.commissionAmount  ?? tot.commissionAmount  ?? 0
  const netToInvestor = tot.netToInvestor     ?? tot.net_to_investor    ?? 0
  const activeLoans   = r.activeLoans || r.active_loans || {}
  const activeCount   = activeLoans.count ?? 0
  const outstanding   = activeLoans.outstandingPrincipal ?? activeLoans.outstanding_principal ?? 0
  const lastPayout    = r.lastPayout || r.last_payout

  return (
    <div className="space-y-6">
      <ConfirmHost />
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/investors')} className="p-2 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <h1 className="page-title flex items-center gap-2"><Users className="w-6 h-6" />{fullName}</h1>
          <p className="text-slate-600 text-sm">
            {modelType === 'fixed_rate' ? t('invd.model_fixed').replace('{n}', String(fixedRate)) : t('invd.model_equity').replace('{n}', String(equityPct))}
            {' · '}{t('invd.commission').replace('{n}', String(commissionPct))}
          </p>
        </div>
      </div>

      <Card>
        <h3 className="section-title mb-3">{t('invd.info_title')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div><span className="text-slate-500">{t('invd.email')}</span> <strong>{investor.email || '—'}</strong></div>
          <div><span className="text-slate-500">{t('invd.phone')}</span> <strong>{investor.phone || '—'}</strong></div>
          <div><span className="text-slate-500">{t('invd.id')}</span> <strong>{idNumber || '—'}</strong></div>
          <div><span className="text-slate-500">{t('invd.capital')}</span> <strong>{formatCurrency(Number(capitalContrib) || 0)}</strong></div>
        </div>
        {investor.notes && <div className="mt-3 p-3 bg-slate-50 rounded-lg text-sm text-slate-700"><strong>{t('invd.notes')}</strong> {investor.notes}</div>}

        {canPayouts && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 text-sm">
                <KeyRound className="w-4 h-4 text-slate-500" />
                <span className="text-slate-600">
                  {(investor.userId || investor.userId)
                    ? <>{t('invd.portal_access')} <strong className="text-emerald-700">{t('invd.access_active')}</strong></>
                    : <>{t('invd.portal_access')} <strong className="text-slate-500">{t('invd.access_none')}</strong></>}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleGrantPortalAccess}
                disabled={grantingAccess || !investor.email}
                title={!investor.email ? t('invd.email_required_title') : ''}
              >
                {grantingAccess
                  ? t('invd.generating')
                  : (investor.userId || investor.userId)
                    ? t('invd.reset_pwd')
                    : t('invd.create_access')}
              </Button>
            </div>
            {!investor.email && (
              <p className="text-xs text-amber-600 mt-2">{t('invd.email_required')}</p>
            )}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="section-title">{t('invd.loans_title').replace('{n}', String(loansList.length))}</h3>
          {canAssign && <Button size="sm" onClick={openAssign} className="flex items-center gap-1"><Link2 className="w-4 h-4" />{t('invd.assign_loan')}</Button>}
        </div>
        {loansList.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3 font-semibold text-slate-700">{t('invd.h_loan_no')}</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-700">{t('invd.h_client')}</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('invd.h_disburse')}</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('invd.h_balance')}</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-700">{t('invd.h_status')}</th>
                  {canAssign && <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('invd.h_action')}</th>}
                </tr>
              </thead>
              <tbody>
                {loansList.map((l: any) => {
                  const ln = l.loanNumber ?? l.loanNumber ?? ''
                  const cn = l.clientName ?? l.clientName ?? ''
                  const da = l.disbursedAmount ?? l.disbursedAmount ?? 0
                  const ba = l.totalBalance ?? l.totalBalance ?? 0
                  return (
                    <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono text-xs text-blue-700">{ln}</td>
                      <td className="py-2 px-3 text-slate-700">{cn}</td>
                      <td className="py-2 px-3 text-right text-slate-700">{formatCurrency(Number(da) || 0, l.currency || 'DOP')}</td>
                      <td className="py-2 px-3 text-right font-semibold text-slate-900">{formatCurrency(Number(ba) || 0, l.currency || 'DOP')}</td>
                      <td className="py-2 px-3"><span className="text-xs text-slate-600">{l.status}</span></td>
                      {canAssign && <td className="py-2 px-3 text-right"><button onClick={() => handleUnassign(l.id)} className="text-xs text-red-600 hover:underline">{t('invd.unassign')}</button></td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-slate-500 text-center py-4">{t('invd.no_loans')}</p>}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-emerald-600" /><h3 className="section-title">{t('invd.report_title')}</h3></div>
          {lastPayout && <p className="text-xs text-slate-500">{t('invd.last_payout').replace('{date}', formatDate(lastPayout.paidAt)).replace('{amount}', formatCurrency(lastPayout.netAmount || 0))}</p>}
        </div>
        <p className="text-xs text-slate-500 mb-3">{t('invd.report_note')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">{t('invd.from')}</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">{t('invd.to')}</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div className="flex items-end"><Button onClick={loadReport} disabled={reportLoading} className="w-full">{reportLoading ? t('invd.calculating') : t('invd.recalculate')}</Button></div>
        </div>

        {report && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-blue-50 rounded-lg p-3 text-center"><p className="text-xs text-slate-500 uppercase">{t('invd.payments_period')}</p><p className="text-xl font-bold text-blue-700">{paymentsCount}</p></div>
              <div className="bg-amber-50 rounded-lg p-3 text-center"><p className="text-xs text-slate-500 uppercase">{t('invd.interest_collected')}</p><p className="text-xl font-bold text-amber-700">{formatCurrency(Number(grossInterest) || 0)}</p></div>
              <div className="bg-red-50 rounded-lg p-3 text-center"><p className="text-xs text-slate-500 uppercase">{t('invd.mora_collected')}</p><p className="text-xl font-bold text-red-700">{formatCurrency(Number(grossMora) || 0)}</p></div>
              <div className="bg-emerald-50 rounded-lg p-3 text-center"><p className="text-xs text-slate-500 uppercase">{t('invd.to_deliver')}</p><p className="text-xl font-bold text-emerald-700">{formatCurrency(Number(netToInvestor) || 0)}</p></div>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-1">
              <div className="flex justify-between"><span>{t('invd.gross_total')}</span><strong>{formatCurrency(Number(grossTotal) || 0)}</strong></div>
              <div className="flex justify-between text-slate-600"><span>{t('invd.admin_commission').replace('{n}', String(commPercent))}</span><span>−{formatCurrency(Number(commAmount) || 0)}</span></div>
              <div className="flex justify-between font-bold text-emerald-700 pt-2 border-t border-slate-200"><span>{t('invd.net_to_investor')}</span><span>{formatCurrency(Number(netToInvestor) || 0)}</span></div>
            </div>
            <p className="text-xs text-slate-500">{t('invd.active_summary').replace('{n}', String(activeCount)).replace('{amount}', formatCurrency(Number(outstanding) || 0))}</p>
            {canPayouts && Number(netToInvestor) > 0 && (
              <div className="pt-2"><Button onClick={openConfirmPayout} className="w-full sm:w-auto flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="w-4 h-4" />{t('invd.confirm_payout').replace('{amount}', formatCurrency(Number(netToInvestor)))}</Button></div>
            )}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-3"><History className="w-5 h-5 text-slate-600" /><h3 className="section-title">{t('invd.history_title').replace('{n}', String(payouts.length))}</h3></div>
        {payouts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3 font-semibold text-slate-700">{t('invd.h_date')}</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-700">{t('invd.h_period')}</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('invd.h_payments')}</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('invd.h_gross')}</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('invd.h_commission')}</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('invd.h_net')}</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-700">{t('invd.h_status')}</th>
                  {canPayouts && <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('invd.h_action')}</th>}
                </tr>
              </thead>
              <tbody>
                {payouts.map((p: any) => {
                  const paidAt = p.paidAt ?? p.paidAt
                  const pFrom  = p.periodFrom ?? p.periodFrom
                  const pTo    = p.periodTo   ?? p.periodTo
                  const pCount = p.paymentsCount ?? p.paymentsCount ?? 0
                  const pGross = p.grossTotal ?? p.grossTotal ?? 0
                  const pComm  = p.commissionAmount ?? p.commissionAmount ?? 0
                  const pNet   = p.netAmount ?? p.netAmount ?? 0
                  const isVoided = p.status === 'voided'
                  return (
                    <tr key={p.id} className={`border-b border-slate-100 hover:bg-slate-50 ${isVoided ? 'opacity-60' : ''}`}>
                      <td className="py-2 px-3 text-slate-700">{formatDate(paidAt)}</td>
                      <td className="py-2 px-3 text-slate-700 text-xs">{formatDate(pFrom)} – {formatDate(pTo)}</td>
                      <td className="py-2 px-3 text-right text-slate-700">{pCount}</td>
                      <td className="py-2 px-3 text-right text-slate-700">{formatCurrency(Number(pGross) || 0)}</td>
                      <td className="py-2 px-3 text-right text-slate-500">−{formatCurrency(Number(pComm) || 0)}</td>
                      <td className="py-2 px-3 text-right font-semibold text-emerald-700">{formatCurrency(Number(pNet) || 0)}</td>
                      <td className="py-2 px-3">{isVoided ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">{t('invd.st_voided')}</span> : <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{t('invd.st_paid')}</span>}</td>
                      {canPayouts && (
                        <td className="py-2 px-3 text-right">
                          {!isVoided && <button onClick={() => handleVoidPayout(p.id, Number(pNet))} className="text-xs text-red-600 hover:underline flex items-center gap-1 justify-end"><Ban className="w-3 h-3" />{t('invd.void')}</button>}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-slate-500 text-center py-4">{t('invd.no_payouts')}</p>}
      </Card>

      {showAssign && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <Card className="w-full max-w-md my-4">
            <div className="flex items-center justify-between mb-4"><h2 className="section-title">{t('invd.assign_title')}</h2><button onClick={() => setShowAssign(false)}><X className="w-5 h-5 text-slate-400" /></button></div>
            {availableLoans.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">{t('invd.no_available')}</p> : (
              <>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('invd.select_to_link')}</label>
                <select value={assigningLoanId} onChange={e => setAssigningLoanId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                  <option value="">{t('invd.select_opt')}</option>
                  {availableLoans.map((l: any) => {
                    const ln = l.loanNumber ?? l.loanNumber ?? ''
                    const cn = l.clientName ?? l.clientName ?? ''
                    const da = l.disbursedAmount ?? l.disbursedAmount ?? 0
                    return <option key={l.id} value={l.id}>{ln} · {cn} · {formatCurrency(Number(da) || 0, l.currency || 'DOP')}</option>
                  })}
                </select>
                <p className="text-xs text-slate-500 mt-2">{t('invd.assign_note')}</p>
              </>
            )}
            <div className="flex gap-2 mt-4"><Button variant="outline" className="flex-1" onClick={() => setShowAssign(false)}>{t('common.cancel')}</Button><Button className="flex-1" onClick={handleAssign} disabled={!assigningLoanId}>{t('invd.assign')}</Button></div>
          </Card>
        </div>
      )}

      {portalCreds && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <Card className="w-full max-w-md my-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title flex items-center gap-2"><KeyRound className="w-5 h-5 text-amber-600" />{t('invd.creds_title')}</h2>
              <button onClick={() => setPortalCreds(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
              <strong>{t('invd.creds_warning')}</strong> {t('invd.creds_warning_text')}
            </div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">{t('invd.creds_email')}</label>
            <div className="flex gap-2 mb-3">
              <input type="text" readOnly value={portalCreds.email} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 font-mono" />
              <button onClick={() => copyToClipboard(portalCreds.email)} className="px-3 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600"><Copy className="w-4 h-4" /></button>
            </div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">{t('invd.creds_temp_pwd')}</label>
            <div className="flex gap-2 mb-3">
              <input type="text" readOnly value={portalCreds.tempPassword} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 font-mono text-amber-700 font-bold" />
              <button onClick={() => copyToClipboard(portalCreds.tempPassword)} className="px-3 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600"><Copy className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-500">{t('invd.creds_login')} <strong>{window.location.origin}/login</strong> {t('invd.creds_login_end')}</p>
            <div className="mt-4">
              <Button className="w-full" onClick={() => setPortalCreds(null)}>{t('invd.understood')}</Button>
            </div>
          </Card>
        </div>
      )}

      {showConfirmPayout && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <Card className="w-full max-w-md my-4">
            <div className="flex items-center justify-between mb-4"><h2 className="section-title">{t('invd.payout_title')}</h2><button onClick={() => setShowConfirmPayout(false)}><X className="w-5 h-5 text-slate-400" /></button></div>
            <div className="bg-emerald-50 rounded-lg p-3 mb-4 text-sm">
              <div className="flex justify-between"><span>{t('invd.p_period')}</span><strong>{formatDate(from)} – {formatDate(to)}</strong></div>
              <div className="flex justify-between"><span>{t('invd.p_payments')}</span><strong>{paymentsCount}</strong></div>
              <div className="flex justify-between"><span>{t('invd.p_gross')}</span><strong>{formatCurrency(Number(grossTotal) || 0)}</strong></div>
              <div className="flex justify-between text-slate-600"><span>{t('invd.p_commission').replace('{n}', String(commPercent))}</span><span>−{formatCurrency(Number(commAmount) || 0)}</span></div>
              <div className="flex justify-between font-bold text-emerald-700 pt-1 border-t border-emerald-200 mt-1"><span>{t('invd.p_net')}</span><span>{formatCurrency(Number(netToInvestor) || 0)}</span></div>
            </div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('invd.bank_account')}</label>
            <select value={payoutForm.bankAccountId} onChange={e => setPayoutForm(f => ({ ...f, bankAccountId: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3">
              <option value="">{t('invd.no_bank')}</option>
              {bankAccounts.map((b: any) => {
                const name = b.bankName ?? b.bankName ?? 'Cuenta'
                const num  = b.accountNumber ?? b.account_number ?? ''
                const bal  = b.currentBalance ?? b.current_balance ?? 0
                return <option key={b.id} value={b.id}>{name} {num ? `· ${num}` : ''} · {t('invd.balance_label')} {formatCurrency(bal)}</option>
              })}
            </select>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('invd.pay_method')}</label>
            <select value={payoutForm.paymentMethod} onChange={e => setPayoutForm(f => ({ ...f, paymentMethod: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3">
              <option value="bank_transfer">{t('invd.m_transfer')}</option>
              <option value="cash">{t('invd.m_cash')}</option>
              <option value="check">{t('invd.m_check')}</option>
              <option value="other">{t('invd.m_other')}</option>
            </select>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('invd.reference')}</label>
            <input type="text" value={payoutForm.reference} onChange={e => setPayoutForm(f => ({ ...f, reference: e.target.value }))} placeholder={t('invd.ref_ph')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3" />
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('invd.notes_opt')}</label>
            <textarea value={payoutForm.notes} onChange={e => setPayoutForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <p className="text-xs text-slate-500 mt-3">{t('invd.payout_note').replace('{n}', String(paymentsCount))} <strong>investor_payout</strong>. {t('invd.payout_note_end')}</p>
            <div className="flex gap-2 mt-4"><Button variant="outline" className="flex-1" onClick={() => setShowConfirmPayout(false)} disabled={confirming}>{t('common.cancel')}</Button><Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={handleConfirmPayout} disabled={confirming}>{confirming ? t('invd.recording') : t('invd.confirm_payment')}</Button></div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default InvestorDetailPage

import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { PageLoadingState } from '@/components/ui/Loading'
import { ArrowLeft, Users, Link2, TrendingUp, X, CheckCircle2, History, Ban, KeyRound, Copy } from 'lucide-react'
import api, { isAccessDenied } from '@/lib/api'
import toast from 'react-hot-toast'
import { usePermission } from '@/hooks/usePermission'
import { useConfirm } from '@/hooks/useConfirm'
import { formatCurrency, formatDate } from '@/lib/utils'

const InvestorDetailPage: React.FC = () => {
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
      if (!isAccessDenied(err)) toast.error('Error al cargar inversionista')
      navigate('/investors')
    } finally { setIsLoading(false) }
  }

  const loadReport = async () => {
    setReportLoading(true)
    try {
      const res = await api.get(`/investors/${id}/liquidation-report`, { params: { from, to } })
      setReport(res.data)
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Error al cargar reporte') }
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
    if (!assigningLoanId) return toast.error('Selecciona un préstamo')
    try {
      await api.post(`/investors/${id}/assign-loan`, { loanId: assigningLoanId })
      toast.success('Préstamo asignado')
      setShowAssign(false); setAssigningLoanId(''); load(); loadReport()
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Error al asignar') }
  }

  const handleUnassign = async (loanId: string) => {
    const ok_ = await confirm({ title: 'Confirmar', message: '¿Desvincular este préstamo del inversionista?', variant: 'warning' })
    if (!ok_) return
    try {
      await api.post(`/investors/${id}/unassign-loan`, { loanId })
      toast.success('Préstamo desvinculado'); load(); loadReport()
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Error al desvincular') }
  }

  const openConfirmPayout = async () => {
    const net = (report?.totals?.netToInvestor ?? report?.totals?.net_to_investor ?? 0)
    if (!report || net <= 0) return toast.error('No hay monto neto a entregar en este periodo')
    setShowConfirmPayout(true)
    try {
      const res = await api.get('/settings/bank-accounts')
      setBankAccounts((res.data || []).filter((b: any) => b.isActive ?? b.is_active))
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
      toast.success('Liquidación registrada')
      setShowConfirmPayout(false)
      setPayoutForm({ bankAccountId: '', paymentMethod: 'bank_transfer', reference: '', notes: '' })
      loadReport(); loadPayouts()
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Error al registrar liquidación') }
    finally { setConfirming(false) }
  }

  const handleGrantPortalAccess = async () => {
    const action = (investor?.userId || investor?.user_id) ? 'resetear la contraseña del' : 'crear el acceso al portal del'
    const ok_ = await confirm({ title: 'Confirmar', message: `¿${action} inversionista? Se generará una nueva contraseña temporal que debes compartir UNA SOLA VEZ.`, variant: 'warning' })
    if (!ok_) return
    setGrantingAccess(true)
    try {
      const res = await api.post(`/investors/${id}/grant-portal-access`)
      setPortalCreds({ email: res.data.email, tempPassword: res.data.tempPassword })
      load()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al generar acceso')
    } finally {
      setGrantingAccess(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success('Copiado al portapapeles'),
      () => toast.error('No se pudo copiar')
    )
  }

  const handleVoidPayout = async (payoutId: string, amount: number) => {
    const ok_ = await confirm({ title: 'Confirmar', message: `¿Anular esta liquidación de ${formatCurrency(amount)}? Se revertirá el egreso y los pagos quedarán pendientes de liquidar nuevamente.`, variant: 'warning' })
    if (!ok_) return
    try {
      await api.post(`/investors/payouts/${payoutId}/void`)
      toast.success('Liquidación anulada'); loadReport(); loadPayouts()
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Error al anular') }
  }

  if (isLoading) return <PageLoadingState />
  if (!investor) return null

  const fullName       = investor.fullName        ?? investor.full_name ?? ''
  const modelType      = investor.modelType       ?? investor.model_type
  const fixedRate      = investor.fixedRateMonthly      ?? investor.fixed_rate_monthly ?? 0
  const equityPct      = investor.equityPercentInterest ?? investor.equity_percent_interest ?? 0
  const commissionPct  = investor.commissionPercent     ?? investor.commission_percent ?? 0
  const idNumber       = investor.idNumber              ?? investor.id_number
  const capitalContrib = investor.capitalContributed    ?? investor.capital_contributed ?? 0
  const loansList      = investor.loans || []

  const r = report || {}
  const tot = r.totals || {}
  const paymentsCount = r.paymentsCount   ?? r.payments_count ?? 0
  const grossInterest = tot.grossInterest ?? tot.gross_interest ?? 0
  const grossMora     = tot.grossMora     ?? tot.gross_mora     ?? 0
  const grossTotal    = tot.grossTotal    ?? tot.gross_total    ?? 0
  const commPercent   = tot.commissionPercent ?? tot.commission_percent ?? 0
  const commAmount    = tot.commissionAmount  ?? tot.commission_amount  ?? 0
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
            {modelType === 'fixed_rate' ? `Tasa Fija · ${fixedRate}% mensual` : `Participación · ${equityPct}% del interés`}
            {' · '}Comisión: {commissionPct}%
          </p>
        </div>
      </div>

      <Card>
        <h3 className="section-title mb-3">Información del Inversionista</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div><span className="text-slate-500">Email:</span> <strong>{investor.email || '—'}</strong></div>
          <div><span className="text-slate-500">Teléfono:</span> <strong>{investor.phone || '—'}</strong></div>
          <div><span className="text-slate-500">Cédula:</span> <strong>{idNumber || '—'}</strong></div>
          <div><span className="text-slate-500">Capital aportado:</span> <strong>{formatCurrency(Number(capitalContrib) || 0)}</strong></div>
        </div>
        {investor.notes && <div className="mt-3 p-3 bg-slate-50 rounded-lg text-sm text-slate-700"><strong>Notas:</strong> {investor.notes}</div>}

        {canPayouts && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 text-sm">
                <KeyRound className="w-4 h-4 text-slate-500" />
                <span className="text-slate-600">
                  {(investor.userId || investor.user_id)
                    ? <>Acceso al portal: <strong className="text-emerald-700">activo</strong></>
                    : <>Acceso al portal: <strong className="text-slate-500">no creado</strong></>}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleGrantPortalAccess}
                disabled={grantingAccess || !investor.email}
                title={!investor.email ? 'El inversionista debe tener email registrado' : ''}
              >
                {grantingAccess
                  ? 'Generando…'
                  : (investor.userId || investor.user_id)
                    ? 'Resetear contraseña'
                    : 'Crear acceso al portal'}
              </Button>
            </div>
            {!investor.email && (
              <p className="text-xs text-amber-600 mt-2">El inversionista debe tener un email registrado para acceder al portal.</p>
            )}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="section-title">Préstamos Asignados ({loansList.length})</h3>
          {canAssign && <Button size="sm" onClick={openAssign} className="flex items-center gap-1"><Link2 className="w-4 h-4" />Asignar préstamo</Button>}
        </div>
        {loansList.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3 font-semibold text-slate-700">N° Préstamo</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-700">Cliente</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">Desembolso</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">Balance</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-700">Estado</th>
                  {canAssign && <th className="text-right py-2 px-3 font-semibold text-slate-700">Acción</th>}
                </tr>
              </thead>
              <tbody>
                {loansList.map((l: any) => {
                  const ln = l.loanNumber ?? l.loan_number ?? ''
                  const cn = l.clientName ?? l.client_name ?? ''
                  const da = l.disbursedAmount ?? l.disbursed_amount ?? 0
                  const ba = l.totalBalance ?? l.total_balance ?? 0
                  return (
                    <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono text-xs text-blue-700">{ln}</td>
                      <td className="py-2 px-3 text-slate-700">{cn}</td>
                      <td className="py-2 px-3 text-right text-slate-700">{formatCurrency(Number(da) || 0, l.currency || 'DOP')}</td>
                      <td className="py-2 px-3 text-right font-semibold text-slate-900">{formatCurrency(Number(ba) || 0, l.currency || 'DOP')}</td>
                      <td className="py-2 px-3"><span className="text-xs text-slate-600">{l.status}</span></td>
                      {canAssign && <td className="py-2 px-3 text-right"><button onClick={() => handleUnassign(l.id)} className="text-xs text-red-600 hover:underline">Desvincular</button></td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-slate-500 text-center py-4">No hay préstamos asignados todavía.</p>}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-emerald-600" /><h3 className="section-title">Reporte de Liquidación · Pendiente por pagar</h3></div>
          {lastPayout && <p className="text-xs text-slate-500">Última liquidación: {formatDate(lastPayout.paid_at)} · {formatCurrency(lastPayout.net_amount || 0)}</p>}
        </div>
        <p className="text-xs text-slate-500 mb-3">Solo se cuentan pagos que aún no han sido incluidos en una liquidación previa, para evitar doble pago.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Desde</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Hasta</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div className="flex items-end"><Button onClick={loadReport} disabled={reportLoading} className="w-full">{reportLoading ? 'Calculando...' : 'Recalcular'}</Button></div>
        </div>

        {report && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-blue-50 rounded-lg p-3 text-center"><p className="text-xs text-slate-500 uppercase">Pagos en periodo</p><p className="text-xl font-bold text-blue-700">{paymentsCount}</p></div>
              <div className="bg-amber-50 rounded-lg p-3 text-center"><p className="text-xs text-slate-500 uppercase">Interés cobrado</p><p className="text-xl font-bold text-amber-700">{formatCurrency(Number(grossInterest) || 0)}</p></div>
              <div className="bg-red-50 rounded-lg p-3 text-center"><p className="text-xs text-slate-500 uppercase">Mora cobrada</p><p className="text-xl font-bold text-red-700">{formatCurrency(Number(grossMora) || 0)}</p></div>
              <div className="bg-emerald-50 rounded-lg p-3 text-center"><p className="text-xs text-slate-500 uppercase">A entregar</p><p className="text-xl font-bold text-emerald-700">{formatCurrency(Number(netToInvestor) || 0)}</p></div>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-1">
              <div className="flex justify-between"><span>Total bruto (interés + mora)</span><strong>{formatCurrency(Number(grossTotal) || 0)}</strong></div>
              <div className="flex justify-between text-slate-600"><span>Comisión por administración ({commPercent}%)</span><span>−{formatCurrency(Number(commAmount) || 0)}</span></div>
              <div className="flex justify-between font-bold text-emerald-700 pt-2 border-t border-slate-200"><span>Monto a entregar al inversionista</span><span>{formatCurrency(Number(netToInvestor) || 0)}</span></div>
            </div>
            <p className="text-xs text-slate-500">{activeCount} préstamo(s) activo(s) · Capital pendiente: {formatCurrency(Number(outstanding) || 0)}</p>
            {canPayouts && Number(netToInvestor) > 0 && (
              <div className="pt-2"><Button onClick={openConfirmPayout} className="w-full sm:w-auto flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="w-4 h-4" />Confirmar y registrar liquidación ({formatCurrency(Number(netToInvestor))})</Button></div>
            )}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-3"><History className="w-5 h-5 text-slate-600" /><h3 className="section-title">Historial de Liquidaciones ({payouts.length})</h3></div>
        {payouts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3 font-semibold text-slate-700">Fecha</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-700">Periodo</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">Pagos</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">Bruto</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">Comisión</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">Neto</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-700">Estado</th>
                  {canPayouts && <th className="text-right py-2 px-3 font-semibold text-slate-700">Acción</th>}
                </tr>
              </thead>
              <tbody>
                {payouts.map((p: any) => {
                  const paidAt = p.paidAt ?? p.paid_at
                  const pFrom  = p.periodFrom ?? p.period_from
                  const pTo    = p.periodTo   ?? p.period_to
                  const pCount = p.paymentsCount ?? p.payments_count ?? 0
                  const pGross = p.grossTotal ?? p.gross_total ?? 0
                  const pComm  = p.commissionAmount ?? p.commission_amount ?? 0
                  const pNet   = p.netAmount ?? p.net_amount ?? 0
                  const isVoided = p.status === 'voided'
                  return (
                    <tr key={p.id} className={`border-b border-slate-100 hover:bg-slate-50 ${isVoided ? 'opacity-60' : ''}`}>
                      <td className="py-2 px-3 text-slate-700">{formatDate(paidAt)}</td>
                      <td className="py-2 px-3 text-slate-700 text-xs">{formatDate(pFrom)} – {formatDate(pTo)}</td>
                      <td className="py-2 px-3 text-right text-slate-700">{pCount}</td>
                      <td className="py-2 px-3 text-right text-slate-700">{formatCurrency(Number(pGross) || 0)}</td>
                      <td className="py-2 px-3 text-right text-slate-500">−{formatCurrency(Number(pComm) || 0)}</td>
                      <td className="py-2 px-3 text-right font-semibold text-emerald-700">{formatCurrency(Number(pNet) || 0)}</td>
                      <td className="py-2 px-3">{isVoided ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Anulado</span> : <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Pagado</span>}</td>
                      {canPayouts && (
                        <td className="py-2 px-3 text-right">
                          {!isVoided && <button onClick={() => handleVoidPayout(p.id, Number(pNet))} className="text-xs text-red-600 hover:underline flex items-center gap-1 justify-end"><Ban className="w-3 h-3" />Anular</button>}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-slate-500 text-center py-4">Aún no hay liquidaciones registradas.</p>}
      </Card>

      {showAssign && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <Card className="w-full max-w-md my-4">
            <div className="flex items-center justify-between mb-4"><h2 className="section-title">Asignar préstamo</h2><button onClick={() => setShowAssign(false)}><X className="w-5 h-5 text-slate-400" /></button></div>
            {availableLoans.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">No hay préstamos disponibles sin inversionista asignado.</p> : (
              <>
                <label className="block text-sm font-medium text-slate-700 mb-2">Selecciona el préstamo a vincular</label>
                <select value={assigningLoanId} onChange={e => setAssigningLoanId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                  <option value="">— Seleccionar —</option>
                  {availableLoans.map((l: any) => {
                    const ln = l.loanNumber ?? l.loan_number ?? ''
                    const cn = l.clientName ?? l.client_name ?? ''
                    const da = l.disbursedAmount ?? l.disbursed_amount ?? 0
                    return <option key={l.id} value={l.id}>{ln} · {cn} · {formatCurrency(Number(da) || 0, l.currency || 'DOP')}</option>
                  })}
                </select>
                <p className="text-xs text-slate-500 mt-2">Solo se muestran préstamos activos sin inversionista actualmente asignado.</p>
              </>
            )}
            <div className="flex gap-2 mt-4"><Button variant="outline" className="flex-1" onClick={() => setShowAssign(false)}>Cancelar</Button><Button className="flex-1" onClick={handleAssign} disabled={!assigningLoanId}>Asignar</Button></div>
          </Card>
        </div>
      )}

      {portalCreds && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <Card className="w-full max-w-md my-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title flex items-center gap-2"><KeyRound className="w-5 h-5 text-amber-600" />Credenciales del portal</h2>
              <button onClick={() => setPortalCreds(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
              <strong>Importante:</strong> Esta contraseña se muestra una sola vez. Cópiala y compártesela al inversionista por un canal seguro.
            </div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Email (usuario)</label>
            <div className="flex gap-2 mb-3">
              <input type="text" readOnly value={portalCreds.email} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 font-mono" />
              <button onClick={() => copyToClipboard(portalCreds.email)} className="px-3 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600"><Copy className="w-4 h-4" /></button>
            </div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Contraseña temporal</label>
            <div className="flex gap-2 mb-3">
              <input type="text" readOnly value={portalCreds.tempPassword} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 font-mono text-amber-700 font-bold" />
              <button onClick={() => copyToClipboard(portalCreds.tempPassword)} className="px-3 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600"><Copy className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-500">El inversionista debe ingresar a <strong>{window.location.origin}/login</strong> con estas credenciales. Lo redirigiremos automáticamente a su portal.</p>
            <div className="mt-4">
              <Button className="w-full" onClick={() => setPortalCreds(null)}>Entendido</Button>
            </div>
          </Card>
        </div>
      )}

      {showConfirmPayout && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <Card className="w-full max-w-md my-4">
            <div className="flex items-center justify-between mb-4"><h2 className="section-title">Registrar liquidación</h2><button onClick={() => setShowConfirmPayout(false)}><X className="w-5 h-5 text-slate-400" /></button></div>
            <div className="bg-emerald-50 rounded-lg p-3 mb-4 text-sm">
              <div className="flex justify-between"><span>Periodo:</span><strong>{formatDate(from)} – {formatDate(to)}</strong></div>
              <div className="flex justify-between"><span>Pagos:</span><strong>{paymentsCount}</strong></div>
              <div className="flex justify-between"><span>Bruto:</span><strong>{formatCurrency(Number(grossTotal) || 0)}</strong></div>
              <div className="flex justify-between text-slate-600"><span>Comisión ({commPercent}%):</span><span>−{formatCurrency(Number(commAmount) || 0)}</span></div>
              <div className="flex justify-between font-bold text-emerald-700 pt-1 border-t border-emerald-200 mt-1"><span>Neto a entregar:</span><span>{formatCurrency(Number(netToInvestor) || 0)}</span></div>
            </div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cuenta bancaria (origen del pago)</label>
            <select value={payoutForm.bankAccountId} onChange={e => setPayoutForm(f => ({ ...f, bankAccountId: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3">
              <option value="">— Sin afectar cuenta bancaria —</option>
              {bankAccounts.map((b: any) => {
                const name = b.bankName ?? b.bank_name ?? 'Cuenta'
                const num  = b.accountNumber ?? b.account_number ?? ''
                const bal  = b.currentBalance ?? b.current_balance ?? 0
                return <option key={b.id} value={b.id}>{name} {num ? `· ${num}` : ''} · Saldo: {formatCurrency(bal)}</option>
              })}
            </select>
            <label className="block text-sm font-medium text-slate-700 mb-1">Método de pago</label>
            <select value={payoutForm.paymentMethod} onChange={e => setPayoutForm(f => ({ ...f, paymentMethod: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3">
              <option value="bank_transfer">Transferencia bancaria</option>
              <option value="cash">Efectivo</option>
              <option value="check">Cheque</option>
              <option value="other">Otro</option>
            </select>
            <label className="block text-sm font-medium text-slate-700 mb-1">Referencia (opcional)</label>
            <input type="text" value={payoutForm.reference} onChange={e => setPayoutForm(f => ({ ...f, reference: e.target.value }))} placeholder="N° transferencia, cheque, etc." className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3" />
            <label className="block text-sm font-medium text-slate-700 mb-1">Notas (opcional)</label>
            <textarea value={payoutForm.notes} onChange={e => setPayoutForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <p className="text-xs text-slate-500 mt-3">Esto registrará la liquidación, marcará los {paymentsCount} pago(s) como ya liquidados, y creará un egreso en Ingresos y Gastos con categoría <strong>investor_payout</strong>. Si seleccionas una cuenta bancaria, su saldo se descontará automáticamente.</p>
            <div className="flex gap-2 mt-4"><Button variant="outline" className="flex-1" onClick={() => setShowConfirmPayout(false)} disabled={confirming}>Cancelar</Button><Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={handleConfirmPayout} disabled={confirming}>{confirming ? 'Registrando...' : 'Confirmar pago'}</Button></div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default InvestorDetailPage

import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { PageLoadingState } from '@/components/ui/Loading'
import { ArrowLeft, Users, Link2, TrendingUp, X } from 'lucide-react'
import api, { isAccessDenied } from '@/lib/api'
import toast from 'react-hot-toast'
import { usePermission } from '@/hooks/usePermission'
import { formatCurrency } from '@/lib/utils'

const InvestorDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { can } = usePermission()

  const [investor, setInvestor] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showAssign, setShowAssign] = useState(false)
  const [availableLoans, setAvailableLoans] = useState<any[]>([])
  const [assigningLoanId, setAssigningLoanId] = useState('')

  // Reporte
  const today = new Date().toISOString().slice(0, 10)
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const [from, setFrom] = useState(thirtyAgo)
  const [to, setTo] = useState(today)
  const [report, setReport] = useState<any>(null)
  const [reportLoading, setReportLoading] = useState(false)

  const canView = can('investors.view')
  const canAssign = can('investors.assign')

  const load = async () => {
    setIsLoading(true)
    try {
      const res = await api.get(`/investors/${id}`)
      setInvestor(res.data)
    } catch (err) {
      if (!isAccessDenied(err)) toast.error('Error al cargar inversionista')
      navigate('/investors')
    } finally {
      setIsLoading(false)
    }
  }

  const loadReport = async () => {
    setReportLoading(true)
    try {
      const res = await api.get(`/investors/${id}/liquidation-report`, { params: { from, to } })
      setReport(res.data)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al cargar reporte')
    } finally {
      setReportLoading(false)
    }
  }

  // IMPORTANTE: los hooks deben declararse SIEMPRE en el mismo orden,
  // por lo que el guard de permiso va DESPUÉS de todos los hooks.
  useEffect(() => {
    if (canView && id) load()
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
      // Cargar préstamos activos del tenant que NO tengan inversionista asignado
      const res = await api.get('/loans?status=active,in_mora,disbursed&limit=500')
      const loans = (res.data?.data || []).filter((l: any) => !l.investorId)
      setAvailableLoans(loans)
    } catch (_) {
      setAvailableLoans([])
    }
  }

  const handleAssign = async () => {
    if (!assigningLoanId) return toast.error('Selecciona un préstamo')
    try {
      await api.post(`/investors/${id}/assign-loan`, { loanId: assigningLoanId })
      toast.success('Préstamo asignado')
      setShowAssign(false)
      setAssigningLoanId('')
      load()
      loadReport()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al asignar')
    }
  }

  const handleUnassign = async (loanId: string) => {
    if (!confirm('¿Desvincular este préstamo del inversionista?')) return
    try {
      await api.post(`/investors/${id}/unassign-loan`, { loanId })
      toast.success('Préstamo desvinculado')
      load()
      loadReport()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al desvincular')
    }
  }

  if (isLoading) return <PageLoadingState />
  if (!investor) return null

  // ===== Helpers para tolerar ambos formatos (camelCase del interceptor + snake_case directo) =====
  const fullName        = investor.fullName        ?? investor.full_name ?? ''
  const modelType       = investor.modelType       ?? investor.model_type
  const fixedRate       = investor.fixedRateMonthly      ?? investor.fixed_rate_monthly ?? 0
  const equityPct       = investor.equityPercentInterest ?? investor.equity_percent_interest ?? 0
  const commissionPct   = investor.commissionPercent     ?? investor.commission_percent ?? 0
  const idNumber        = investor.idNumber              ?? investor.id_number
  const capitalContrib  = investor.capitalContributed    ?? investor.capital_contributed ?? 0
  const loansList       = investor.loans || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/investors')} className="p-2 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Users className="w-6 h-6" />{fullName}
          </h1>
          <p className="text-slate-600 text-sm">
            {modelType === 'fixed_rate'
              ? `Tasa Fija · ${fixedRate}% mensual`
              : `Participación · ${equityPct}% del interés`}
            {' · '}Comisión: {commissionPct}%
          </p>
        </div>
      </div>

      {/* Datos básicos */}
      <Card>
        <h3 className="section-title mb-3">Información del Inversionista</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div><span className="text-slate-500">Email:</span> <strong>{investor.email || '—'}</strong></div>
          <div><span className="text-slate-500">Teléfono:</span> <strong>{investor.phone || '—'}</strong></div>
          <div><span className="text-slate-500">Cédula:</span> <strong>{idNumber || '—'}</strong></div>
          <div><span className="text-slate-500">Capital aportado:</span> <strong>{formatCurrency(Number(capitalContrib) || 0)}</strong></div>
        </div>
        {investor.notes && (
          <div className="mt-3 p-3 bg-slate-50 rounded-lg text-sm text-slate-700">
            <strong>Notas:</strong> {investor.notes}
          </div>
        )}
      </Card>

      {/* Préstamos asignados */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="section-title">Préstamos Asignados ({loansList.length})</h3>
          {canAssign && (
            <Button size="sm" onClick={openAssign} className="flex items-center gap-1">
              <Link2 className="w-4 h-4" />Asignar préstamo
            </Button>
          )}
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
                  const loanNumber = l.loanNumber ?? l.loan_number ?? ''
                  const clientName = l.clientName ?? l.client_name ?? ''
                  const disbursed  = l.disbursedAmount ?? l.disbursed_amount ?? 0
                  const balance    = l.totalBalance ?? l.total_balance ?? 0
                  return (
                    <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono text-xs text-blue-700">{loanNumber}</td>
                      <td className="py-2 px-3 text-slate-700">{clientName}</td>
                      <td className="py-2 px-3 text-right text-slate-700">
                        {formatCurrency(Number(disbursed) || 0, l.currency || 'DOP')}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-slate-900">
                        {formatCurrency(Number(balance) || 0, l.currency || 'DOP')}
                      </td>
                      <td className="py-2 px-3">
                        <span className="text-xs text-slate-600">{l.status}</span>
                      </td>
                      {canAssign && (
                        <td className="py-2 px-3 text-right">
                          <button
                            onClick={() => handleUnassign(l.id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Desvincular
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500 text-center py-4">No hay préstamos asignados todavía.</p>
        )}
      </Card>

      {/* Reporte de Liquidación */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-5 h-5 text-emerald-600" />
          <h3 className="section-title">Reporte de Liquidación</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Desde</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Hasta</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div className="flex items-end">
            <Button onClick={loadReport} disabled={reportLoading} className="w-full">
              {reportLoading ? 'Calculando...' : 'Recalcular'}
            </Button>
          </div>
        </div>

        {report && (() => {
          const paymentsCount = report.paymentsCount ?? report.payments_count ?? 0
          const totals        = report.totals || {}
          const grossInterest = totals.grossInterest    ?? totals.gross_interest    ?? 0
          const grossMora     = totals.grossMora        ?? totals.gross_mora        ?? 0
          const grossTotal    = totals.grossTotal       ?? totals.gross_total       ?? 0
          const commPercent   = totals.commissionPercent ?? totals.commission_percent ?? 0
          const commAmount    = totals.commissionAmount ?? totals.commission_amount ?? 0
          const netToInvestor = totals.netToInvestor    ?? totals.net_to_investor    ?? 0
          const activeLoans   = report.activeLoans || report.active_loans || { count: 0, outstandingPrincipal: 0, outstanding_principal: 0 }
          const activeCount   = activeLoans.count ?? 0
          const outstanding   = activeLoans.outstandingPrincipal ?? activeLoans.outstanding_principal ?? 0
          return (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-500 uppercase">Pagos en periodo</p>
                  <p className="text-xl font-bold text-blue-700">{paymentsCount}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-500 uppercase">Interés cobrado</p>
                  <p className="text-xl font-bold text-amber-700">{formatCurrency(Number(grossInterest) || 0)}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-500 uppercase">Mora cobrada</p>
                  <p className="text-xl font-bold text-red-700">{formatCurrency(Number(grossMora) || 0)}</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-500 uppercase">A entregar</p>
                  <p className="text-xl font-bold text-emerald-700">{formatCurrency(Number(netToInvestor) || 0)}</p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Total bruto (interés + mora)</span>
                  <strong>{formatCurrency(Number(grossTotal) || 0)}</strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Comisión por administración ({commPercent}%)</span>
                  <span>−{formatCurrency(Number(commAmount) || 0)}</span>
                </div>
                <div className="flex justify-between font-bold text-emerald-700 pt-2 border-t border-slate-200">
                  <span>Monto a entregar al inversionista</span>
                  <span>{formatCurrency(Number(netToInvestor) || 0)}</span>
                </div>
              </div>

              <p className="text-xs text-slate-500">
                {activeCount} préstamo(s) activo(s) · Capital pendiente: {formatCurrency(Number(outstanding) || 0)}
              </p>
            </div>
          )
        })()}
      </Card>

      {/* Modal de asignar préstamo */}
      {showAssign && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <Card className="w-full max-w-md my-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">Asignar préstamo</h2>
              <button onClick={() => setShowAssign(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            {availableLoans.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">
                No hay préstamos disponibles sin inversionista asignado.
              </p>
            ) : (
              <>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Selecciona el préstamo a vincular
                </label>
                <select
                  value={assigningLoanId}
                  onChange={e => setAssigningLoanId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="">— Seleccionar —</option>
                  {availableLoans.map((l: any) => {
                    const ln = l.loanNumber ?? l.loan_number ?? ''
                    const cn = l.clientName ?? l.client_name ?? ''
                    const da = l.disbursedAmount ?? l.disbursed_amount ?? 0
                    return (
                      <option key={l.id} value={l.id}>
                        {ln} · {cn} · {formatCurrency(Number(da) || 0, l.currency || 'DOP')}
                      </option>
                    )
                  })}
                </select>
                <p className="text-xs text-slate-500 mt-2">
                  Solo se muestran préstamos activos sin inversionista actualmente asignado.
                </p>
              </>
            )}
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1" onClick={() => setShowAssign(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleAssign} disabled={!assigningLoanId}>Asignar</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default InvestorDetailPage

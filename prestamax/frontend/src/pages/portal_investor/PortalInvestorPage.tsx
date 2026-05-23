import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Briefcase, Wallet, TrendingUp, History, DollarSign } from 'lucide-react'
import api, { isAccessDenied, isSubscriptionExpired } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PageLoadingState } from '@/components/ui/Loading'
import Card from '@/components/ui/Card'
import toast from 'react-hot-toast'

type Tab = 'dashboard' | 'loans' | 'payouts'

const PortalInvestorPage: React.FC = () => {
  const { state, logout } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [me, setMe] = useState<any>(null)
  const [summary, setSummary] = useState<any>(null)
  const [loans, setLoans] = useState<any[]>([])
  const [payouts, setPayouts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const loadAll = async () => {
    setLoading(true)
    try {
      const [meR, sumR, loansR, payR] = await Promise.all([
        api.get('/portal/investor/me'),
        api.get('/portal/investor/summary'),
        api.get('/portal/investor/loans'),
        api.get('/portal/investor/payouts'),
      ])
      setMe(meR.data)
      setSummary(sumR.data)
      setLoans(Array.isArray(loansR.data) ? loansR.data : [])
      setPayouts(Array.isArray(payR.data) ? payR.data : [])
    } catch (err: any) {
      if (!isAccessDenied(err) && !isSubscriptionExpired(err)) toast.error(err?.response?.data?.error || 'Error al cargar el portal')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  const handleLogout = () => { logout(); navigate('/login') }

  if (loading) return <PageLoadingState />
  if (!me) return null

  const fullName = me.fullName || (state.user as any)?.fullName || 'Inversionista'
  const cap   = summary?.capital   || {}
  const life  = summary?.lifetime  || {}
  const rcvd  = summary?.received  || {}

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-[#1e3a5f] text-white shadow">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">
              <span className="text-[#f59e0b]">Presta</span>Max <span className="text-white/70 font-normal text-sm ml-2">· Portal del Inversionista</span>
            </h1>
            <p className="text-xs text-white/70 mt-1">{fullName}{me.email ? ` · ${me.email}` : ''}</p>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <LogOut className="w-4 h-4" />Salir
          </button>
        </div>
        {/* Tabs */}
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {([
            { key: 'dashboard', label: 'Resumen', icon: TrendingUp },
            { key: 'loans',     label: 'Mis Préstamos', icon: Briefcase },
            { key: 'payouts',   label: 'Mis Liquidaciones', icon: History },
          ] as { key: Tab; label: string; icon: any }[]).map(t => {
            const Icon = t.icon
            const active = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${active ? 'border-[#f59e0b] text-[#f59e0b]' : 'border-transparent text-white/70 hover:text-white'}`}
              >
                <Icon className="w-4 h-4" />{t.label}
              </button>
            )
          })}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {tab === 'dashboard' && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600"><Wallet className="w-5 h-5" /></div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase">Capital Colocado</p>
                    <p className="text-2xl font-bold text-slate-800">{formatCurrency(Number(cap.active_balance) || 0)}</p>
                    <p className="text-xs text-slate-500 mt-1">{cap.active_loans || 0} préstamo(s) activo(s)</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600"><TrendingUp className="w-5 h-5" /></div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase">Ganancias Acumuladas</p>
                    <p className="text-2xl font-bold text-emerald-700">{formatCurrency(Number(life.net_earned) || 0)}</p>
                    <p className="text-xs text-slate-500 mt-1">{life.payments_count || 0} pago(s) recibidos</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-purple-50 text-purple-600"><DollarSign className="w-5 h-5" /></div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase">Total Recibido</p>
                    <p className="text-2xl font-bold text-purple-700">{formatCurrency(Number(rcvd.total_payouts_amount) || 0)}</p>
                    <p className="text-xs text-slate-500 mt-1">{rcvd.total_payouts_count || 0} liquidación(es)</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Modelo + Detalles */}
            <Card>
              <h2 className="section-title mb-3">Tu acuerdo</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500">Modelo:</span> <strong className="ml-2">{me.modelType === 'fixed_rate' ? 'Tasa Fija' : 'Participación'}</strong></div>
                {me.modelType === 'fixed_rate'
                  ? <div><span className="text-slate-500">Tasa mensual:</span> <strong className="ml-2">{me.fixedRateMonthly}%</strong></div>
                  : <div><span className="text-slate-500">% del interés:</span> <strong className="ml-2">{me.equityPercentInterest}%</strong></div>
                }
                <div><span className="text-slate-500">Comisión administrador:</span> <strong className="ml-2">{me.commissionPercent}%</strong></div>
                <div><span className="text-slate-500">Capital aportado:</span> <strong className="ml-2">{formatCurrency(Number(me.capitalContributed) || 0)}</strong></div>
              </div>
            </Card>

            {/* Pendiente neto */}
            <Card>
              <h2 className="section-title mb-3">Próxima liquidación</h2>
              <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-1">
                <div className="flex justify-between"><span>Interés cobrado (vida total):</span><strong>{formatCurrency(Number(life.gross_interest) || 0)}</strong></div>
                <div className="flex justify-between"><span>Mora cobrada (vida total):</span><strong>{formatCurrency(Number(life.gross_mora) || 0)}</strong></div>
                <div className="flex justify-between text-slate-600"><span>− Comisión ({me.commissionPercent}%):</span><span>−{formatCurrency(Number(life.commission_amount) || 0)}</span></div>
                <div className="flex justify-between text-slate-600"><span>− Ya recibido:</span><span>−{formatCurrency(Number(rcvd.total_payouts_amount) || 0)}</span></div>
                <div className="flex justify-between font-bold text-emerald-700 pt-2 border-t border-slate-200">
                  <span>Pendiente neto:</span><span>{formatCurrency(Number(rcvd.pending) || 0)}</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2">Esta cifra refleja lo que se te debe en este momento. El administrador te entregará una liquidación en el ciclo acordado.</p>
            </Card>
          </>
        )}

        {tab === 'loans' && (
          <Card>
            <h2 className="section-title mb-3">Préstamos asignados a ti ({loans.length})</h2>
            {loans.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-3 font-semibold text-slate-700">N° Préstamo</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-700">Cliente</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700">Desembolso</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700">Capital pendiente</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700">Mora</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-700">Estado</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-700">Desembolsado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loans.map((l: any) => (
                      <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono text-xs text-blue-700">{l.loan_number}</td>
                        <td className="py-2 px-3 text-slate-700">{l.client_name}</td>
                        <td className="py-2 px-3 text-right text-slate-700">{formatCurrency(Number(l.disbursed_amount) || 0, l.currency || 'DOP')}</td>
                        <td className="py-2 px-3 text-right font-semibold text-slate-900">{formatCurrency(Number(l.principal_balance) || 0, l.currency || 'DOP')}</td>
                        <td className="py-2 px-3 text-right text-red-700">{formatCurrency(Number(l.mora_balance) || 0, l.currency || 'DOP')}</td>
                        <td className="py-2 px-3"><span className="text-xs text-slate-600">{l.status}</span></td>
                        <td className="py-2 px-3 text-xs text-slate-500">{formatDate(l.disbursement_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-slate-500 text-center py-6">No tienes préstamos asignados todavía.</p>}
            <p className="text-xs text-slate-400 mt-3 italic">Por privacidad, solo se muestra el nombre del cliente. Los datos sensibles (cédula, teléfono, dirección) son confidenciales.</p>
          </Card>
        )}

        {tab === 'payouts' && (
          <Card>
            <h2 className="section-title mb-3">Tus liquidaciones recibidas ({payouts.length})</h2>
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
                      <th className="text-right py-2 px-3 font-semibold text-slate-700">Neto recibido</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-700">Método</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-700">Referencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((p: any) => (
                      <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 px-3 text-slate-700">{formatDate(p.paid_at)}</td>
                        <td className="py-2 px-3 text-xs text-slate-600">{formatDate(p.period_from)} – {formatDate(p.period_to)}</td>
                        <td className="py-2 px-3 text-right text-slate-700">{p.payments_count}</td>
                        <td className="py-2 px-3 text-right text-slate-700">{formatCurrency(Number(p.gross_total) || 0)}</td>
                        <td className="py-2 px-3 text-right text-slate-500">−{formatCurrency(Number(p.commission_amount) || 0)}</td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-700">{formatCurrency(Number(p.net_amount) || 0)}</td>
                        <td className="py-2 px-3 text-xs text-slate-600">{p.payment_method || '—'}</td>
                        <td className="py-2 px-3 text-xs text-slate-500">{p.reference || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-slate-500 text-center py-6">Aún no has recibido liquidaciones.</p>}
          </Card>
        )}

        <footer className="text-center text-xs text-slate-400 pt-4 pb-8">
          PrestaMax · Portal del Inversionista
        </footer>
      </main>
    </div>
  )
}

export default PortalInvestorPage

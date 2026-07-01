import React, { useEffect, useState, useContext } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DollarSign, TrendingUp, AlertCircle, Calendar, Users, FileText, Briefcase, Wallet, ArrowDownCircle, CheckCircle2 } from 'lucide-react'
import { TenantContext } from '@/contexts/TenantContext'
import Stat from '@/components/ui/Stat'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { PageLoadingState } from '@/components/ui/Loading'
import { formatCurrency, formatDate } from '@/lib/utils'
import api, { isAccessDenied, isSubscriptionExpired } from '@/lib/api'
import toast from 'react-hot-toast'
import { useT } from '@/lib/i18n'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface DashboardData {
  kpis: {
    totalPortfolio: number
    totalLoans: number
    activePortfolio: number
    activeLoans: number
    overdueLoans: number
    moraBalance: number
    todayPayments: number
    todayCount: number
    totalClients: number
    liquidated: number
    carteraPropia?: number
    carteraTerceros?: number
    pasivoInversionistas?: number
  }
  statusDistribution: { status: string; count: number }[]
  recentPayments: {
    id: string
    amount: number
    paymentDate: string
    clientName: string
    loanNumber: string
  }[]
  topOverdue: {
    id: string
    loanNumber: string
    clientName: string
    totalBalance: number
    daysOverdue: number
  }[]
  dailyCollections: { day: string; total: number; count: number }[]
}

const STATUS_COLORS: Record<string, string> = {
  active: '#10b981',
  approved: '#3b82f6',
  in_mora: '#ef4444',
  overdue: '#f59e0b',
  pending_review: '#8b5cf6',
  liquidated: '#6b7280',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  approved: 'Aprobado',
  in_mora: 'En Mora',
  overdue: 'Vencido',
  pending_review: 'En Revisión',
  under_review: 'En Revisión',
  liquidated: 'Liquidado',
  draft: 'Borrador',
  disbursed: 'Desembolsado',
  voided: 'Anulado',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
  written_off: 'Incobrable',
  restructured: 'Reestructurado',
  paid: 'Pagado',
  current: 'Al día',
}

const DashboardPage: React.FC = () => {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()
  const t = useT()
  const [params, setParams] = useSearchParams()
  const { refreshCurrentTenant } = useContext(TenantContext)
  const [showThanks, setShowThanks] = useState(false)

  // Regreso desde el checkout de Whop (?whop=success): mostrar confirmación y
  // refrescar el tenant (el webhook activa la suscripción en unos segundos).
  useEffect(() => {
    if (params.get('whop') === 'success') {
      setShowThanks(true)
      setTimeout(() => { refreshCurrentTenant?.() }, 3000)
      params.delete('whop'); setParams(params, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get('/reports/dashboard')
        setDashboard(res.data)
      } catch (error: any) {
        if (!isAccessDenied(error) && !isSubscriptionExpired(error)) toast.error(t('dash.load_error'))
        // Empty fallback when API fails
        setDashboard({
          kpis: {
            totalPortfolio: 0,
            totalLoans: 0,
            activePortfolio: 0,
            activeLoans: 0,
            overdueLoans: 0,
            moraBalance: 0,
            todayPayments: 0,
            todayCount: 0,
            totalClients: 0,
            liquidated: 0,
          },
          statusDistribution: [],
          recentPayments: [],
          topOverdue: [],
          dailyCollections: [],
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  if (isLoading || !dashboard) {
    return <PageLoadingState />
  }

  const { kpis, statusDistribution, recentPayments, topOverdue, dailyCollections } = dashboard

  const pieData = statusDistribution.map((s) => ({
    name: t('status.' + s.status, STATUS_LABELS[s.status] || s.status),
    value: s.count,
    fill: STATUS_COLORS[s.status] || '#6b7280',
  }))

  const barData = dailyCollections.slice(-7).map((d) => ({
    day: d.day.slice(5), // MM-DD
    total: d.total,
  }))

  return (
    <div className="space-y-6">
      {/* Popup de confirmación de pago (regreso desde Whop) */}
      {showThanks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowThanks(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-9 h-9 text-emerald-600" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-900">¡Gracias, suscripción activada!</h3>
            <p className="mt-2 text-sm text-slate-600">
              Tu pago se procesó correctamente. La activación puede tardar unos segundos en reflejarse.
            </p>
            <button
              onClick={() => setShowThanks(false)}
              className="mt-5 w-full py-2.5 bg-[#1e3a5f] text-white rounded-lg font-medium hover:bg-[#152a45] transition"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Page Title */}
      <div>
        <h1 className="page-title">{t('nav.dashboard')}</h1>
        <p className="text-slate-600 text-sm mt-1">{t('dash.subtitle')}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          icon={DollarSign}
          title={t('dash.kpi.total_portfolio')}
          value={formatCurrency(kpis.totalPortfolio)}
          color="blue"
          footer={t('dash.foot.loans').replace('{n}', String(kpis.totalLoans))}
        />
        <Stat
          icon={TrendingUp}
          title={t('dash.kpi.active_portfolio')}
          value={formatCurrency(kpis.activePortfolio)}
          color="green"
          footer={t('dash.foot.active_loans').replace('{n}', String(kpis.activeLoans))}
        />
        <Stat
          icon={AlertCircle}
          title={t('dash.kpi.mora_pending')}
          value={formatCurrency(kpis.moraBalance)}
          color="red"
          footer={t('dash.foot.overdue').replace('{n}', String(kpis.overdueLoans))}
        />
        <Stat
          icon={Calendar}
          title={t('dash.kpi.today_collections')}
          value={formatCurrency(kpis.todayPayments)}
          color="amber"
          footer={t('dash.foot.today_count').replace('{n}', String(kpis.todayCount))}
        />
      </div>

      {/* Second row KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat
          icon={Users}
          title={t('dash.kpi.total_clients')}
          value={kpis.totalClients.toString()}
          color="blue"
          footer={t('dash.foot.clients_registered')}
        />
        <Stat
          icon={FileText}
          title={t('dash.kpi.active_loans')}
          value={kpis.activeLoans.toString()}
          color="green"
          footer={t('dash.foot.of_total_loans').replace('{n}', String(kpis.totalLoans))}
        />
        <Stat
          icon={AlertCircle}
          title={t('dash.kpi.liquidated')}
          value={kpis.liquidated.toString()}
          color="amber"
          footer={t('dash.foot.loans_completed')}
        />
      </div>

      {/* Inversionistas: solo se muestra si hay cartera de terceros o pasivo */}
      {((kpis.carteraTerceros ?? 0) > 0 || (kpis.pasivoInversionistas ?? 0) > 0) && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Briefcase className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-700">{t('nav.investors')}</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Stat
              icon={Wallet}
              title={t('dash.inv.own')}
              value={formatCurrency(kpis.carteraPropia ?? 0)}
              color="blue"
              footer={t('dash.inv.own_foot')}
            />
            <Stat
              icon={Briefcase}
              title={t('dash.inv.third')}
              value={formatCurrency(kpis.carteraTerceros ?? 0)}
              color="purple"
              footer={t('dash.inv.third_foot')}
            />
            <Stat
              icon={ArrowDownCircle}
              title={t('dash.inv.liability')}
              value={formatCurrency(kpis.pasivoInversionistas ?? 0)}
              color="red"
              footer={t('dash.inv.liability_foot')}
            />
          </div>
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribución por estado */}
        <Card>
          <h3 className="section-title mb-4">{t('dash.chart.by_status')}</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="45%"
                  labelLine={false}
                  label={false}
                  outerRadius={80}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any, name: any) => [t('dash.chart.loans_unit').replace('{n}', String(value)), name]} />
                <Legend verticalAlign="bottom" height={60} iconSize={10} wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} formatter={(value: string, entry: any) => `${value}: ${entry.payload?.value || 0}`} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 text-sm py-4">{t('dash.chart.no_data')}</p>
          )}
        </Card>

        {/* Recaudación reciente */}
        <Card>
          <h3 className="section-title mb-4">{t('dash.chart.collections_7d')}</h3>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value as number)} />
                <Legend />
                <Bar dataKey="total" fill="#1e3a5f" name={t('dash.chart.collected')} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 text-sm py-4 text-center">{t('dash.chart.no_collections')}</p>
          )}
        </Card>
      </div>

      {/* Tables Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top préstamos en mora */}
        <Card>
          <h3 className="section-title mb-4">{t('dash.tbl.top_overdue')}</h3>
          {topOverdue.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-2 font-semibold text-slate-700">{t('col.client')}</th>
                    <th className="text-left py-2 px-2 font-semibold text-slate-700">{t('col.balance')}</th>
                    <th className="text-left py-2 px-2 font-semibold text-slate-700">{t('col.days')}</th>
                  </tr>
                </thead>
                <tbody>
                  {topOverdue.slice(0, 5).map((loan) => (
                    <tr
                      key={loan.id}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                      onClick={() => navigate(`/loans/${loan.id}`)}
                    >
                      <td className="py-3 px-2 font-medium text-slate-900">{loan.clientName}</td>
                      <td className="py-3 px-2 font-semibold text-red-600">{formatCurrency(loan.totalBalance)}</td>
                      <td className="py-3 px-2">
                        <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-medium">
                          {loan.daysOverdue}d
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-500 text-sm py-4 text-center">{t('dash.tbl.no_overdue')}</p>
          )}
        </Card>

        {/* Cobros recientes */}
        <Card>
          <h3 className="section-title mb-4">{t('dash.tbl.recent')}</h3>
          {recentPayments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-2 font-semibold text-slate-700">{t('col.client')}</th>
                    <th className="text-left py-2 px-2 font-semibold text-slate-700">{t('col.amount')}</th>
                    <th className="text-left py-2 px-2 font-semibold text-slate-700">{t('col.date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.slice(0, 5).map((payment) => (
                    <tr key={payment.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-2 font-medium text-slate-900">{payment.clientName}</td>
                      <td className="py-3 px-2 font-semibold text-green-600">{formatCurrency(payment.amount)}</td>
                      <td className="py-3 px-2 text-slate-500">{formatDate(payment.paymentDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-500 text-sm py-4 text-center">{t('dash.tbl.no_recent')}</p>
          )}
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="section-title">{t('dash.quick.title')}</h3>
            <p className="text-slate-600 text-sm">{t('dash.quick.subtitle')}</p>
          </div>
          <div className="flex gap-3 flex-wrap justify-center">
            <Button size="md" onClick={() => navigate('/clients')}>
              {t('dash.quick.new_client')}
            </Button>
            <Button size="md" variant="secondary" onClick={() => navigate('/loans')}>
              {t('dash.quick.new_loan')}
            </Button>
            <Button size="md" variant="outline" onClick={() => navigate('/payments')}>
              {t('dash.quick.register_payment')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default DashboardPage

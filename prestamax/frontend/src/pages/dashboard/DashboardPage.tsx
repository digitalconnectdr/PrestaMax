import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DollarSign, TrendingUp, AlertCircle, Calendar, Users, FileText } from 'lucide-react'
import Stat from '@/components/ui/Stat'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { PageLoadingState } from '@/components/ui/Loading'
import { formatCurrency, formatDate } from '@/lib/utils'
import api, { isAccessDenied } from '@/lib/api'
import toast from 'react-hot-toast'
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
  liquidated: 'Liquidado',
  draft: 'Borrador',
  disbursed: 'Desembolsado',
}

const DashboardPage: React.FC = () => {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get('/reports/dashboard')
        setDashboard(res.data)
      } catch (error: any) {
        if (!isAccessDenied(error)) toast.error('Error al cargar el dashboard')
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
    name: STATUS_LABELS[s.status] || s.status,
    value: s.count,
    fill: STATUS_COLORS[s.status] || '#6b7280',
  }))

  const barData = dailyCollections.slice(-7).map((d) => ({
    day: d.day.slice(5), // MM-DD
    total: d.total,
  }))

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="text-slate-600 text-sm mt-1">Resumen general de tu cartera de préstamos</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          icon={DollarSign}
          title="Cartera Total"
          value={formatCurrency(kpis.totalPortfolio)}
          color="blue"
          footer={`${kpis.totalLoans} préstamos`}
        />
        <Stat
          icon={TrendingUp}
          title="Cartera Activa"
          value={formatCurrency(kpis.activePortfolio)}
          color="green"
          footer={`${kpis.activeLoans} préstamos activos`}
        />
        <Stat
          icon={AlertCircle}
          title="Mora Pendiente"
          value={formatCurrency(kpis.moraBalance)}
          color="red"
          footer={`${kpis.overdueLoans} en mora/vencidos`}
        />
        <Stat
          icon={Calendar}
          title="Cobros del Día"
          value={formatCurrency(kpis.todayPayments)}
          color="amber"
          footer={`${kpis.todayCount} cobros realizados`}
        />
      </div>

      {/* Second row KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat
          icon={Users}
          title="Total Clientes"
          value={kpis.totalClients.toString()}
          color="blue"
          footer="Clientes registrados"
        />
        <Stat
          icon={FileText}
          title="Préstamos Activos"
          value={kpis.activeLoans.toString()}
          color="green"
          footer={`de ${kpis.totalLoans} préstamos totales`}
        />
        <Stat
          icon={AlertCircle}
          title="Liquidados"
          value={kpis.liquidated.toString()}
          color="amber"
          footer="Préstamos completados"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribución por estado */}
        <Card>
          <h3 className="section-title mb-4">Préstamos por Estado</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={90}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 text-sm py-4">Sin datos disponibles</p>
          )}
        </Card>

        {/* Recaudación reciente */}
        <Card>
          <h3 className="section-title mb-4">Recaudación Últimos 7 Días</h3>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value as number)} />
                <Legend />
                <Bar dataKey="total" fill="#1e3a5f" name="Recaudado" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 text-sm py-4 text-center">Sin cobros registrados en los últimos días</p>
          )}
        </Card>
      </div>

      {/* Tables Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top préstamos en mora */}
        <Card>
          <h3 className="section-title mb-4">Préstamos en Mora (Top)</h3>
          {topOverdue.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-2 font-semibold text-slate-700">Cliente</th>
                    <th className="text-left py-2 px-2 font-semibold text-slate-700">Saldo</th>
                    <th className="text-left py-2 px-2 font-semibold text-slate-700">Días</th>
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
            <p className="text-slate-500 text-sm py-4 text-center">Sin préstamos en mora 🎉</p>
          )}
        </Card>

        {/* Cobros recientes */}
        <Card>
          <h3 className="section-title mb-4">Cobros Recientes</h3>
          {recentPayments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-2 font-semibold text-slate-700">Cliente</th>
                    <th className="text-left py-2 px-2 font-semibold text-slate-700">Monto</th>
                    <th className="text-left py-2 px-2 font-semibold text-slate-700">Fecha</th>
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
            <p className="text-slate-500 text-sm py-4 text-center">Sin cobros recientes</p>
          )}
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="section-title">Acciones Rápidas</h3>
            <p className="text-slate-600 text-sm">Realiza las operaciones más comunes</p>
          </div>
          <div className="flex gap-3 flex-wrap justify-center">
            <Button size="md" onClick={() => navigate('/clients')}>
              Nuevo Cliente
            </Button>
            <Button size="md" variant="secondary" onClick={() => navigate('/loans')}>
              Nuevo Préstamo
            </Button>
            <Button size="md" variant="outline" onClick={() => navigate('/payments')}>
              Registrar Pago
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default DashboardPage

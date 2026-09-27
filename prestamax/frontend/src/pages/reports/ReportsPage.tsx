import React, { useState, useEffect } from 'react'
import { usePermission } from '@/hooks/usePermission'
import Card from '@/components/ui/Card'
import Stat from '@/components/ui/Stat'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { PageLoadingState } from '@/components/ui/Loading'
import EmptyState from '@/components/ui/EmptyState'
import { BarChart3, TrendingUp, AlertCircle, DollarSign, TrendingDown, Users, CheckCircle, Landmark, ArrowUpCircle, ArrowDownCircle, FileDown, FileText, Globe, Download, Info, AlertTriangle } from 'lucide-react'
import { formatCurrency, getCurrencySymbol } from '@/lib/utils'
import { downloadCSV, printToPDF, fmtCurrencyRaw, fmtDateRaw } from '@/lib/exportUtils'
import api, { isAccessDenied, isSubscriptionExpired } from '@/lib/api'
import toast from 'react-hot-toast'
import { useT } from '@/lib/i18n'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

interface KPI {
  totalPortfolio: number
  activePortfolio: number
  moraBalance: number
  totalLoans: number
  activeLoans: number
  overdueLoans: number
  totalClients: number
  todayPayments: number
}

interface PortfolioByCurrency {
  currency: string
  loan_count: number
  active_balance: number
  mora_balance: number
  portfolio_balance: number
  avg_rate: number
}

interface ReportData {
  kpis: KPI
  statusDistribution: Array<{ status: string; count: number }>
  topOverdue: Array<{ id: string; loanNumber: string; clientName: string; totalBalance: number; daysOverdue: number }>
  dailyCollections: Array<{ day: string; total: number; count: number }>
  portfolioByCurrency?: PortfolioByCurrency[]
}

interface AdvancedData {
  monthlyCollections: Array<{ month: string; totalCollected: number; paymentCount: number; capitalCollected: number; interestCollected: number; moraCollected: number }>
  monthlyLoans: Array<{ month: string; newLoans: number; amountDisbursed: number }>
  monthlyClients: Array<{ month: string; newClients: number }>
  comparison: {
    thisMonth: { collections: number; paymentCount: number; loansCount: number; loansDisbursed: number; newClients: number }
    lastMonth: { collections: number; paymentCount: number; loansCount: number; loansDisbursed: number; newClients: number }
  }
  ytd: { collected: number; disbursed: number; newClients: number }
  moraRate: number
  alerts: Array<{ type: string; message: string; severity: string }>
  collectorPerf: Array<{ collectorName: string; paymentCount: number; totalCollected: number }>
}

interface BankAccountReport {
  byAccount: Array<{ bankAccountId: string; bankName: string; accountNumber: string; accountType: string; accountHolder: string; currency: string; currentBalance: number; loanedBalance: number; totalReceived: number; capitalReceived: number; interestReceived: number; moraReceived: number; paymentCount: number }>
  cashPayments: { totalReceived: number; capitalReceived: number; interestReceived: number; moraReceived: number; paymentCount: number }
  byMethod: Array<{ paymentMethod: string; total: number; count: number }>
  period: { from: string; to: string }
}

interface AccountTransaction {
  id: string; paymentNumber: string; paymentDate: string; amount: number
  appliedCapital: number; appliedInterest: number; appliedMora: number
  paymentMethod: string; reference: string | null; type: string; isVoided: boolean
  loanNumber: string; clientName: string
}

interface IncomeExpenseReport {
  summary: { totalIncome: number; totalExpenses: number; netProfit: number }
  byCategory: Array<{ type: string; category: string; total: number; count: number }>
  monthly: Array<{ month: string; type: string; total: number; count: number }>
  recent: Array<{ id: string; type: string; category: string; description: string; amount: number; transactionDate: string }>
  period: { from: string; to: string }
}

const STATUS_COLORS: Record<string, string> = {
  active: '#3b82f6', in_mora: '#ef4444', pending_review: '#f59e0b',
  under_review: '#f59e0b', approved: '#10b981', liquidated: '#8b5cf6',
  draft: '#94a3b8', voided: '#64748b', rejected: '#ef4444',
  cancelled: '#94a3b8', written_off: '#7f1d1d', restructured: '#a855f7',
  paid: '#10b981', current: '#3b82f6', disbursed: '#10b981',
  pending_manager_approval: '#d97706',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo', approved: 'Aprobado', in_mora: 'En Mora',
  overdue: 'Vencido', pending_review: 'En Revisión', under_review: 'En Revisión',
  liquidated: 'Liquidado', draft: 'Borrador', disbursed: 'Desembolsado',
  voided: 'Anulado', rejected: 'Rechazado', cancelled: 'Cancelado',
  written_off: 'Incobrable', restructured: 'Reestructurado',
  paid: 'Pagado', current: 'Al día', pending_manager_approval: 'Pend. Aprob. Gerencial',
}

const MOM_COLOR = (val: number) => val >= 0 ? '#10b981' : '#ef4444'

const pct = (current: number, prev: number) => {
  if (prev === 0) return current > 0 ? 100 : 0
  return ((current - prev) / prev) * 100
}

const PctBadge: React.FC<{ val: number }> = ({ val }) => {
  const t = useT()
  return (
    <span className={`text-xs font-medium ${val >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
      {val >= 0 ? '▲' : '▼'} {Math.abs(val).toFixed(1)}% {t('rpt.vs_prev_month')}
    </span>
  )
}

const DIGEST_FREQ_LABEL = { daily: 'diario', weekly: 'semanal', monthly: 'mensual' }

const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo', bank_transfer: 'Transferencia', check: 'Cheque',
  card: 'Tarjeta', mobile_payment: 'Pago Móvil', other: 'Otro'
}

const CATEGORY_LABEL: Record<string, string> = {
  nomina: 'Nómina', alquiler: 'Alquiler', servicios: 'Servicios', marketing: 'Marketing',
  operaciones: 'Operaciones', impuestos: 'Impuestos', suministros: 'Suministros',
  delivery: 'Delivery / Transporte', otros: 'Otros',
  cobros: 'Cobros', prestamos: 'Préstamos', intereses: 'Intereses',
}

const ReportsPage: React.FC = () => {
  const t = useT()
  const { can } = usePermission()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [data, setData] = useState<ReportData | null>(null)
  const [advanced, setAdvanced] = useState<AdvancedData | null>(null)
  const [bankData, setBankData] = useState<BankAccountReport | null>(null)
  const [incomeData, setIncomeData] = useState<IncomeExpenseReport | null>(null)
  const [commissionsData, setCommissionsData] = useState<any[]>([])
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [newDigestFreq, setNewDigestFreq] = useState('weekly')
  const [isSavingDigest, setIsSavingDigest] = useState(false)
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [branchFilter, setBranchFilter] = useState('')
  // Bank account transaction drill-down
  const [txModal, setTxModal] = useState<{ accountId: string; accountName: string } | null>(null)
  const [txData, setTxData] = useState<{ transactions: AccountTransaction[]; account: any } | null>(null)
  const [txLoading, setTxLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0,10)
  })
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0,10))

  // Advanced analytics filters
  const [advancedFrom, setAdvancedFrom] = useState(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 1); d.setDate(1); return d.toISOString().slice(0,10)
  })
  const [advancedTo, setAdvancedTo] = useState(() => new Date().toISOString().slice(0,10))
  const [advancedSeries, setAdvancedSeries] = useState<'all' | 'capital' | 'interest' | 'mora' | 'total'>('all')

  useEffect(() => {
    // Validar que las fechas sean YYYY-MM-DD completas antes de fetch.
    // Esto evita el bug donde el date picker nativo dispara onChange
    // con valores parciales mientras el usuario navega meses.
    const isValidDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d || '')
    const datesValid = (activeTab === 'advanced')
      ? (isValidDate(advancedFrom) && isValidDate(advancedTo))
      : (isValidDate(fromDate) && isValidDate(toDate))
    if (!datesValid) return

    const load = async () => {
      setIsLoading(true)
      try {
        const params = `from=${fromDate}&to=${toDate}`
        if (activeTab === 'dashboard') {
          const res = await api.get(`/reports/dashboard?from_date=${fromDate}&to_date=${toDate}`)
          setData(res.data)
        } else if (activeTab === 'advanced') {
          const res = await api.get(`/reports/advanced?from=${advancedFrom}&to=${advancedTo}`)
          setAdvanced(res.data)
        } else if (activeTab === 'bank_accounts') {
          const res = await api.get(`/reports/bank-accounts?${params}`)
          setBankData(res.data)
        } else if (activeTab === 'income_expenses') {
          const res = await api.get(`/reports/income-expenses?${params}`)
          setIncomeData(res.data)
        } else if (activeTab === 'commissions') {
          const branchQs = branchFilter ? `&branch_id=${branchFilter}` : ''
          const res = await api.get(`/reports/commissions?${params}${branchQs}`)
          setCommissionsData(Array.isArray(res.data) ? res.data : [])
        }
      } catch (err) {
        if (isAccessDenied(err) || isSubscriptionExpired(err)) return
        toast.error('Error al cargar reportes')
      } finally {
        setIsLoading(false)
      }
    }
    // Debounce 600ms: si el usuario sigue cambiando la fecha (navegando meses
    // en el date picker), el fetch anterior se cancela. Asi el calendario
    // nativo no se cierra prematuramente por re-render.
    const handler = setTimeout(load, 600)
    return () => clearTimeout(handler)
  }, [activeTab, fromDate, toDate, advancedFrom, advancedTo, branchFilter])

  // Sucursales para el filtro del reporte de comisiones — opcional: si el
  // usuario no tiene permiso de settings.branches simplemente no se muestra.
  useEffect(() => {
    api.get('/settings/branches').then(res => setBranches(Array.isArray(res.data) ? res.data : [])).catch(() => {})
  }, [])

  const loadSubscriptions = () => {
    api.get('/reports/subscriptions').then(res => setSubscriptions(Array.isArray(res.data) ? res.data : [])).catch(() => {})
  }
  useEffect(() => { loadSubscriptions() }, [])

  const handleAddDigest = async () => {
    setIsSavingDigest(true)
    try {
      await api.post('/reports/subscriptions', { frequency: newDigestFreq })
      toast.success('Resumen programado activado')
      loadSubscriptions()
    } catch (err: any) { toast.error(err?.response?.data?.error || 'No se pudo activar el resumen') }
    finally { setIsSavingDigest(false) }
  }
  const handleRemoveDigest = async (id: string) => {
    try {
      await api.delete(`/reports/subscriptions/${id}`)
      setSubscriptions(prev => prev.filter(s => s.id !== id))
    } catch { toast.error('No se pudo desactivar') }
  }

  const TABS = [
    { id: 'dashboard', label: 'Dashboard', show: can('reports.dashboard') },
    { id: 'advanced', label: 'Análisis Avanzado', show: can('reports.advanced') },
    { id: 'bank_accounts', label: 'Cuentas Bancarias', show: can('reports.portfolio') },
    { id: 'income_expenses', label: 'Ingresos y Gastos', show: can('reports.income') },
    { id: 'commissions', label: 'Comisiones', show: can('reports.collections') },
    { id: 'datacredito', label: '📋 DataCrédito', show: can('reports.datacredito') },
  ].filter(t => t.show !== false).filter(t => t.show)

  // ── DataCrédito state ──────────────────────────────────────────────────────
  const [dcLoading, setDcLoading] = useState(false)

  // ── Export helpers ──────────────────────────────────────────────────────────
  const ExportBar: React.FC<{ onCSV: () => void; onPDF: () => void; label?: string }> = ({ onCSV, onPDF, label }) => (
    <div className="flex items-center justify-between mb-4">
      {label && <p className="text-xs text-slate-500">{label}</p>}
      <div className="flex gap-2 ml-auto">
        <Button variant="outline" size="sm" onClick={onCSV} className="flex items-center gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50">
          <FileDown className="w-4 h-4" /> CSV
        </Button>
        <Button variant="outline" size="sm" onClick={onPDF} className="flex items-center gap-1.5 text-blue-700 border-blue-300 hover:bg-blue-50">
          <FileText className="w-4 h-4" /> PDF
        </Button>
      </div>
    </div>
  )

  // Dashboard exports
  const periodRange = () => t('rpt.period_range').replace('{from}', fromDate).replace('{to}', toDate)
  const exportDashboardOverdueCSV = () => {
    if (!data?.topOverdue.length) { toast.error(t('rpt.export_no_data')); return }
    downloadCSV(`reporte_vencidos_${fromDate}_${toDate}`, [
      { key: 'loanNumber', label: t('col.loan') },
      { key: 'clientName', label: t('col.client') },
      { key: 'totalBalanceFmt', label: t('col.balance') + ' Total (DOP)' },
      { key: 'daysOverdue', label: t('rpt.days_overdue') },
    ], data.topOverdue.map(r => ({ ...r, totalBalanceFmt: fmtCurrencyRaw(r.totalBalance) })))
    toast.success(t('rpt.export_csv_downloaded'))
  }
  const exportDashboardOverduePDF = () => {
    if (!data?.topOverdue.length) { toast.error(t('rpt.export_no_data')); return }
    printToPDF({
      title: t('rpt.most_overdue'),
      subtitle: periodRange(),
      headers: [
        { key: 'loanNumber', label: t('col.loan') },
        { key: 'clientName', label: t('col.client') },
        { key: 'totalBalanceFmt', label: t('col.balance'), align: 'right' },
        { key: 'daysOverdue', label: t('rpt.days_overdue'), align: 'center' },
      ],
      rows: data.topOverdue.map(r => ({ ...r, totalBalanceFmt: fmtCurrencyRaw(r.totalBalance) })),
      summary: [
        { label: t('rpt.overdue_loans_value'), value: String(data.topOverdue.length) },
        { label: t('rpt.total_balance_value'), value: fmtCurrencyRaw(data.topOverdue.reduce((s, r) => s + r.totalBalance, 0)) },
      ],
    })
  }

  const exportDailyCollectionsCSV = () => {
    if (!data?.dailyCollections.length) { toast.error(t('rpt.export_no_data')); return }
    downloadCSV(`cobros_diarios_${fromDate}_${toDate}`, [
      { key: 'day', label: t('rpt.col_date') },
      { key: 'totalFmt', label: t('rpt.col_total_collected') + ' (DOP)' },
      { key: 'count', label: t('rpt.col_payments') },
    ], data.dailyCollections.map(r => ({ ...r, totalFmt: fmtCurrencyRaw(r.total) })))
    toast.success(t('rpt.export_csv_downloaded'))
  }
  const exportDailyCollectionsPDF = () => {
    if (!data?.dailyCollections.length) { toast.error(t('rpt.export_no_data')); return }
    printToPDF({
      title: t('rpt.daily_collections_title'),
      subtitle: periodRange(),
      headers: [
        { key: 'day', label: t('rpt.col_date') },
        { key: 'totalFmt', label: t('rpt.col_total_collected'), align: 'right' },
        { key: 'count', label: t('rpt.col_payments'), align: 'center' },
      ],
      rows: data.dailyCollections.map(r => ({ ...r, totalFmt: fmtCurrencyRaw(r.total) })),
      summary: [
        { label: t('rpt.total_collected_value'), value: fmtCurrencyRaw(data.dailyCollections.reduce((s, r) => s + r.total, 0)) },
        { label: t('rpt.total_payments_value'), value: String(data.dailyCollections.reduce((s, r) => s + r.count, 0)) },
      ],
    })
  }

  // Advanced exports
  const exportMonthlyCollectionsCSV = () => {
    if (!advanced?.monthlyCollections.length) { toast.error(t('rpt.export_no_data')); return }
    downloadCSV('cobranza_mensual', [
      { key: 'month', label: t('rpt.col_month') },
      { key: 'totalFmt', label: t('rpt.col_total_collected') },
      { key: 'capitalFmt', label: t('rpt.series_capital') },
      { key: 'interestFmt', label: t('rpt.series_interest') },
      { key: 'moraFmt', label: t('rpt.series_mora') },
      { key: 'paymentCount', label: t('rpt.col_transactions') },
    ], advanced.monthlyCollections.map(r => ({
      ...r, totalFmt: fmtCurrencyRaw(r.totalCollected),
      capitalFmt: fmtCurrencyRaw(r.capitalCollected), interestFmt: fmtCurrencyRaw(r.interestCollected), moraFmt: fmtCurrencyRaw(r.moraCollected),
    })))
    toast.success(t('rpt.export_csv_downloaded'))
  }
  const exportMonthlyCollectionsPDF = () => {
    if (!advanced?.monthlyCollections.length) { toast.error(t('rpt.export_no_data')); return }
    printToPDF({
      title: t('rpt.monthly_collections_12m'),
      headers: [
        { key: 'month', label: t('rpt.col_month') },
        { key: 'totalFmt', label: t('rpt.series_total'), align: 'right' },
        { key: 'capitalFmt', label: t('rpt.series_capital'), align: 'right' },
        { key: 'interestFmt', label: t('rpt.series_interest'), align: 'right' },
        { key: 'moraFmt', label: t('rpt.series_mora'), align: 'right' },
        { key: 'paymentCount', label: t('rpt.col_payments'), align: 'center' },
      ],
      rows: advanced.monthlyCollections.map(r => ({
        ...r, totalFmt: fmtCurrencyRaw(r.totalCollected),
        capitalFmt: fmtCurrencyRaw(r.capitalCollected), interestFmt: fmtCurrencyRaw(r.interestCollected), moraFmt: fmtCurrencyRaw(r.moraCollected),
      })),
      summary: [
        { label: t('rpt.total_12m_value'), value: fmtCurrencyRaw(advanced.monthlyCollections.reduce((s, r) => s + r.totalCollected, 0)) },
      ],
    })
  }

  const exportCollectorPerfCSV = () => {
    if (!advanced?.collectorPerf.length) { toast.error(t('rpt.export_no_data')); return }
    downloadCSV('rendimiento_cobradores', [
      { key: 'collectorName', label: t('rpt.col_collector') },
      { key: 'paymentCount', label: t('rpt.col_payments') },
      { key: 'totalFmt', label: t('rpt.col_total_collected') },
    ], advanced.collectorPerf.map(r => ({ ...r, totalFmt: fmtCurrencyRaw(r.totalCollected), collectorName: r.collectorName || t('rpt.unassigned') })))
    toast.success(t('rpt.export_csv_downloaded'))
  }
  const exportCollectorPerfPDF = () => {
    if (!advanced?.collectorPerf.length) { toast.error(t('rpt.export_no_data')); return }
    printToPDF({
      title: t('rpt.collector_perf'),
      subtitle: t('rpt.last_30_days'),
      headers: [
        { key: 'collectorName', label: t('rpt.col_collector') },
        { key: 'paymentCount', label: t('rpt.col_payments'), align: 'center' },
        { key: 'totalFmt', label: t('rpt.col_total_collected'), align: 'right' },
      ],
      rows: advanced.collectorPerf.map(r => ({ ...r, totalFmt: fmtCurrencyRaw(r.totalCollected), collectorName: r.collectorName || t('rpt.unassigned') })),
      summary: [
        { label: t('rpt.total_collectors_value'), value: String(advanced.collectorPerf.length) },
        { label: t('rpt.total_collected_value'), value: fmtCurrencyRaw(advanced.collectorPerf.reduce((s, r) => s + r.totalCollected, 0)) },
      ],
    })
  }

  // Bank accounts exports
  const exportBankAccountsCSV = () => {
    if (!bankData?.byAccount.length) { toast.error(t('rpt.export_no_data')); return }
    const rows = [
      ...bankData.byAccount.map(a => ({
        cuenta: `${a.bankName} ${a.accountNumber || ''}`.trim(),
        totalFmt: fmtCurrencyRaw(a.totalReceived), capitalFmt: fmtCurrencyRaw(a.capitalReceived),
        interestFmt: fmtCurrencyRaw(a.interestReceived), moraFmt: fmtCurrencyRaw(a.moraReceived),
        count: a.paymentCount,
      })),
      { cuenta: t('rpt.cash_row_label'), totalFmt: fmtCurrencyRaw(bankData.cashPayments?.totalReceived || 0), capitalFmt: fmtCurrencyRaw(bankData.cashPayments?.capitalReceived || 0), interestFmt: fmtCurrencyRaw(bankData.cashPayments?.interestReceived || 0), moraFmt: fmtCurrencyRaw(bankData.cashPayments?.moraReceived || 0), count: bankData.cashPayments?.paymentCount || 0 },
    ]
    downloadCSV(`cuentas_bancarias_${fromDate}_${toDate}`, [
      { key: 'cuenta', label: t('rpt.col_bank_account') }, { key: 'totalFmt', label: t('rpt.col_total_received') },
      { key: 'capitalFmt', label: t('rpt.series_capital') }, { key: 'interestFmt', label: t('rpt.series_interest') },
      { key: 'moraFmt', label: t('rpt.series_mora') }, { key: 'count', label: t('rpt.col_transactions') },
    ], rows)
    toast.success(t('rpt.export_csv_downloaded'))
  }
  const exportBankAccountsPDF = () => {
    if (!bankData) { toast.error(t('rpt.export_no_data')); return }
    const rows = [
      ...bankData.byAccount.map(a => ({
        cuenta: `${a.bankName} ${a.accountNumber || ''}`.trim(),
        totalFmt: fmtCurrencyRaw(a.totalReceived), capitalFmt: fmtCurrencyRaw(a.capitalReceived),
        interestFmt: fmtCurrencyRaw(a.interestReceived), moraFmt: fmtCurrencyRaw(a.moraReceived), count: a.paymentCount,
      })),
      { cuenta: t('rpt.cash_row_label'), totalFmt: fmtCurrencyRaw(bankData.cashPayments?.totalReceived || 0), capitalFmt: fmtCurrencyRaw(bankData.cashPayments?.capitalReceived || 0), interestFmt: fmtCurrencyRaw(bankData.cashPayments?.interestReceived || 0), moraFmt: fmtCurrencyRaw(bankData.cashPayments?.moraReceived || 0), count: bankData.cashPayments?.paymentCount || 0 },
    ]
    printToPDF({
      title: t('rpt.bank_report_title'),
      subtitle: periodRange(),
      headers: [
        { key: 'cuenta', label: t('rpt.col_bank_account') }, { key: 'totalFmt', label: t('rpt.series_total'), align: 'right' },
        { key: 'capitalFmt', label: t('rpt.series_capital'), align: 'right' }, { key: 'interestFmt', label: t('rpt.series_interest'), align: 'right' },
        { key: 'moraFmt', label: t('rpt.series_mora'), align: 'right' }, { key: 'count', label: t('rpt.col_payments'), align: 'center' },
      ],
      rows,
      summary: [
        { label: t('rpt.total_received_banks'), value: fmtCurrencyRaw(bankData.byAccount.reduce((s, a) => s + a.totalReceived, 0)) },
        { label: t('rpt.total_cash_value'), value: fmtCurrencyRaw(bankData.cashPayments?.totalReceived || 0) },
      ],
    })
  }

  // Open transaction drill-down modal for a bank account
  const openTxModal = async (accountId: string, accountName: string) => {
    setTxModal({ accountId, accountName })
    setTxLoading(true)
    setTxData(null)
    try {
      const res = await api.get(`/reports/bank-accounts/${accountId}/transactions?from=${fromDate}&to=${toDate}&limit=100`)
      setTxData(res.data)
    } catch (err: any) {
      if (isAccessDenied(err) || isSubscriptionExpired(err)) return
      toast.error(t('rpt.tx_load_error'))
    } finally {
      setTxLoading(false)
    }
  }

  const exportTxModalCSV = () => {
    if (!txData?.transactions?.length || !txModal) { toast.error(t('rpt.export_no_tx')); return }
    const rows = txData.transactions.map((tx: AccountTransaction) => ({
      paymentNumber: tx.paymentNumber,
      paymentDate:   new Date(tx.paymentDate).toLocaleDateString('es-DO'),
      clientName:    tx.clientName,
      loanNumber:    tx.loanNumber,
      capitalFmt:    fmtCurrencyRaw(tx.appliedCapital || 0),
      interestFmt:   fmtCurrencyRaw(tx.appliedInterest || 0),
      moraFmt:       fmtCurrencyRaw(tx.appliedMora || 0),
      totalFmt:      fmtCurrencyRaw(tx.amount),
      status:        tx.isVoided ? t('rpt.status_voided') : t('rpt.status_ok'),
    }))
    const safe = txModal.accountName.replace(/[^a-zA-Z0-9]+/g, '_')
    downloadCSV(`transacciones_${safe}_${fromDate}_${toDate}`, [
      { key: 'paymentNumber', label: t('rpt.col_payment_num') },
      { key: 'paymentDate',   label: t('rpt.col_date') },
      { key: 'clientName',    label: t('col.client') },
      { key: 'loanNumber',    label: t('col.loan') },
      { key: 'capitalFmt',    label: t('rpt.series_capital') },
      { key: 'interestFmt',   label: t('rpt.series_interest') },
      { key: 'moraFmt',       label: t('rpt.series_mora') },
      { key: 'totalFmt',      label: t('rpt.series_total') },
      { key: 'status',        label: t('col.status') },
    ], rows)
    toast.success(t('rpt.export_csv_downloaded'))
  }

  const exportTxModalPDF = () => {
    if (!txData?.transactions?.length || !txModal) { toast.error(t('rpt.export_no_tx')); return }
    const rows = txData.transactions.map((tx: AccountTransaction) => ({
      paymentNumber: tx.paymentNumber,
      paymentDate:   new Date(tx.paymentDate).toLocaleDateString('es-DO'),
      clientName:    `${tx.clientName} · ${tx.loanNumber}`,
      capitalFmt:    fmtCurrencyRaw(tx.appliedCapital || 0),
      interestFmt:   fmtCurrencyRaw(tx.appliedInterest || 0),
      moraFmt:       fmtCurrencyRaw(tx.appliedMora || 0),
      totalFmt:      fmtCurrencyRaw(tx.amount),
      status:        tx.isVoided ? t('rpt.status_voided') : t('rpt.status_ok'),
    }))
    const totalSum = txData.transactions.reduce((s: number, t: AccountTransaction) => s + (t.isVoided ? 0 : t.amount), 0)
    printToPDF({
      title: t('rpt.tx_title').replace('{name}', txModal.accountName),
      subtitle: periodRange(),
      headers: [
        { key: 'paymentNumber', label: t('rpt.col_payment_num') },
        { key: 'paymentDate',   label: t('rpt.col_date') },
        { key: 'clientName',    label: t('rpt.col_client_loan') },
        { key: 'capitalFmt',    label: t('rpt.series_capital'),  align: 'right' },
        { key: 'interestFmt',   label: t('rpt.series_interest'),  align: 'right' },
        { key: 'moraFmt',       label: t('rpt.series_mora'),     align: 'right' },
        { key: 'totalFmt',      label: t('rpt.series_total'),    align: 'right' },
        { key: 'status',        label: t('col.status'),   align: 'center' },
      ],
      rows,
      summary: [
        { label: t('rpt.total_tx_value'), value: String(txData.transactions.length) },
        { label: t('rpt.total_received_novoid'), value: fmtCurrencyRaw(totalSum) },
      ],
    })
  }

  // Income/Expense exports
  const exportIncomeTxCSV = () => {
    if (!incomeData?.recent.length) { toast.error(t('rpt.export_no_data')); return }
    downloadCSV(`ingresos_gastos_${fromDate}_${toDate}`, [
      { key: 'dateFmt', label: t('rpt.col_date') }, { key: 'typeLabel', label: t('rpt.col_type') },
      { key: 'categoryLabel', label: t('rpt.col_category') }, { key: 'description', label: t('rpt.col_description') },
      { key: 'amountFmt', label: t('rpt.col_amount') },
    ], incomeData.recent.map(tx => ({
      dateFmt: fmtDateRaw(tx.transactionDate), typeLabel: tx.type === 'income' ? t('rpt.type_income') : t('rpt.type_expense'),
      categoryLabel: t('inc.cat_' + tx.category, CATEGORY_LABEL[tx.category] || tx.category), description: tx.description || '',
      amountFmt: fmtCurrencyRaw(tx.amount),
    })))
    toast.success(t('rpt.export_csv_downloaded'))
  }
  const exportIncomeTxPDF = () => {
    if (!incomeData?.recent.length) { toast.error(t('rpt.export_no_data')); return }
    printToPDF({
      title: t('rpt.tab_income_expenses'),
      subtitle: periodRange(),
      headers: [
        { key: 'dateFmt', label: t('rpt.col_date') }, { key: 'typeLabel', label: t('rpt.col_type') },
        { key: 'categoryLabel', label: t('rpt.col_category') }, { key: 'description', label: t('rpt.col_description') },
        { key: 'amountFmt', label: t('rpt.col_amount'), align: 'right' },
      ],
      rows: incomeData.recent.map(tx => ({
        dateFmt: fmtDateRaw(tx.transactionDate), typeLabel: tx.type === 'income' ? t('rpt.type_income') : t('rpt.type_expense'),
        categoryLabel: t('inc.cat_' + tx.category, CATEGORY_LABEL[tx.category] || tx.category), description: tx.description || '',
        amountFmt: fmtCurrencyRaw(tx.amount),
      })),
      summary: [
        { label: t('rpt.total_income_value'), value: fmtCurrencyRaw(incomeData.summary.totalIncome) },
        { label: t('rpt.total_expenses_value'), value: fmtCurrencyRaw(incomeData.summary.totalExpenses) },
        { label: t('rpt.net_profit_value'), value: fmtCurrencyRaw(incomeData.summary.netProfit) },
      ],
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t('rpt.title')}</h1>
        <p className="text-slate-600 text-sm mt-1">{t('rpt.subtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {TABS.filter(tab => tab.show !== false).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${activeTab === tab.id ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              {t(`rpt.tab_${tab.id}`, tab.label)}
            </button>
          ))}
        </div>
      </div>

      {isLoading && !data && !advanced && !bankData && !incomeData ? <PageLoadingState /> : TABS.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title={t('rpt.no_access_title')}
          description={t('rpt.no_access_desc')}
        />
      ) : (
        <>
          {/* ── DASHBOARD ── */}
          {activeTab === 'dashboard' && data && (
            <div className="space-y-6">
              <Card className="mb-4">
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">{t('common.from')}</label>
                    <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">{t('common.to')}</label>
                    <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </Card>

              <Card className="bg-slate-50 border-slate-200">
                <h3 className="section-title mb-1">{t('rpt.digest_title')}</h3>
                <p className="text-xs text-slate-500 mb-3">{t('rpt.digest_desc')}</p>
                {subscriptions.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {subscriptions.map(s => (
                      <div key={s.id} className="flex items-center justify-between text-sm bg-white border border-slate-200 rounded-lg px-3 py-2">
                        <span>{t('rpt.digest_prefix')} <strong>{t('rpt.freq_' + s.frequency, (DIGEST_FREQ_LABEL as Record<string, string>)[s.frequency] || s.frequency)}</strong> {t('rpt.digest_to')} {s.recipients}</span>
                        <button onClick={() => handleRemoveDigest(s.id)} className="text-xs text-red-500 hover:underline">{t('rpt.deactivate')}</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 items-end">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">{t('rpt.frequency')}</label>
                    <select value={newDigestFreq} onChange={e => setNewDigestFreq(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="daily">{t('rpt.freq_daily')}</option>
                      <option value="weekly">{t('rpt.freq_weekly')}</option>
                      <option value="monthly">{t('rpt.freq_monthly')}</option>
                    </select>
                  </div>
                  <Button size="sm" onClick={handleAddDigest} disabled={isSavingDigest}>{isSavingDigest ? t('rpt.saving') : t('rpt.activate_digest')}</Button>
                </div>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Stat icon={DollarSign} title={t('rpt.stat_total_portfolio')} value={formatCurrency(data.kpis.totalPortfolio)} color="blue" />
                <Stat icon={TrendingUp} title={t('rpt.stat_active_portfolio')} value={formatCurrency(data.kpis.activePortfolio)} color="green" />
                <Stat icon={AlertCircle} title={t('rpt.stat_mora_portfolio')} value={formatCurrency(data.kpis.moraBalance)} color="red" />
                <Stat icon={BarChart3} title={t('rpt.stat_today_payments')} value={formatCurrency(data.kpis.todayPayments)} color="amber" />
              </div>

              {/* Multi-currency breakdown — only shown when there's more than one currency */}
              {data.portfolioByCurrency && data.portfolioByCurrency.length > 1 && (
                <Card>
                  <h3 className="section-title mb-4 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-600" /> {t('rpt.portfolio_by_currency')}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {data.portfolioByCurrency.map(pc => (
                      <div key={pc.currency} className={`rounded-xl border-2 p-4 ${pc.currency === 'DOP' ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-slate-800">{getCurrencySymbol(pc.currency)}</span>
                            <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${pc.currency === 'DOP' ? 'bg-blue-200 text-blue-800' : 'bg-slate-200 text-slate-700'}`}>
                              {pc.currency}
                            </span>
                          </div>
                          <span className="text-xs text-slate-500">{t('rpt.loan_count').replace('{n}', String(pc.loan_count))}</span>
                        </div>
                        <div className="space-y-1.5 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-500">{t('rpt.stat_active_portfolio')}</span>
                            <span className="font-semibold text-slate-800">{formatCurrency(pc.portfolio_balance, pc.currency)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">{t('status.in_mora')}</span>
                            <span className={`font-semibold ${pc.mora_balance > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                              {pc.mora_balance > 0 ? formatCurrency(pc.mora_balance, pc.currency) : '—'}
                            </span>
                          </div>
                          {pc.avg_rate && pc.avg_rate !== 1 && (
                            <div className="flex justify-between pt-1.5 border-t border-slate-200 mt-1">
                              <span className="text-slate-400 text-xs">{t('rpt.exchange_rate_avg')}</span>
                              <span className="text-slate-500 text-xs font-medium">1 {pc.currency} = {formatCurrency(pc.avg_rate, 'DOP')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <ExportBar onCSV={exportDailyCollectionsCSV} onPDF={exportDailyCollectionsPDF} label={t('rpt.collections_30d')} />
                  <h3 className="section-title mb-4">{t('rpt.collections_30d')}</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={data.dailyCollections}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={v => formatCurrency(v as number)} />
                      <Bar dataKey="total" fill="#1e3a5f" radius={[2,2,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                <Card>
                  <h3 className="section-title mb-4">{t('rpt.status_distribution')}</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={data.statusDistribution.map(i => ({ name: t('status.' + i.status, STATUS_LABELS[i.status] || i.status), value: i.count }))}
                        cx="50%" cy="45%" outerRadius={80} dataKey="value"
                        label={false} labelLine={false}>
                        {data.statusDistribution.map((entry, i) => (
                          <Cell key={i} fill={STATUS_COLORS[entry.status] || '#8884d8'} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any, name: any) => [t('rpt.loan_count').replace('{n}', String(value)), name]} />
                      <Legend verticalAlign="bottom" height={60} iconSize={10} wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} formatter={(value: string, entry: any) => `${value}: ${entry.payload?.value || 0}`} />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              </div>

              {data.topOverdue.length > 0 && (
                <Card>
                  <ExportBar onCSV={exportDashboardOverdueCSV} onPDF={exportDashboardOverduePDF} label={t('rpt.most_overdue')} />
                  <h3 className="section-title mb-4">{t('rpt.most_overdue')}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('col.loan')}</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('col.client')}</th>
                        <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('col.balance')}</th>
                        <th className="text-center py-3 px-4 font-semibold text-slate-700">{t('rpt.days_overdue')}</th>
                      </tr></thead>
                      <tbody>{data.topOverdue.map(loan => (
                        <tr key={loan.id} className="border-b border-slate-100 hover:bg-red-50">
                          <td className="py-3 px-4 font-medium text-blue-700">{loan.loanNumber}</td>
                          <td className="py-3 px-4">{loan.clientName}</td>
                          <td className="py-3 px-4 text-right font-semibold text-red-600">{formatCurrency(loan.totalBalance)}</td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-red-200 text-red-700">{loan.daysOverdue}d</span>
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </Card>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <h3 className="section-title mb-3">{t('rpt.portfolio_card_title')}</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">{t('rpt.total_loans')}</span><span className="font-semibold">{data.kpis.totalLoans}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">{t('rpt.active')}</span><span className="font-semibold text-green-600">{data.kpis.activeLoans}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">{t('status.in_mora')}</span><span className="font-semibold text-red-600">{data.kpis.overdueLoans}</span></div>
                  </div>
                </Card>
                <Card>
                  <h3 className="section-title mb-3">{t('rpt.clients_card_title')}</h3>
                  <p className="text-3xl font-bold text-blue-700">{data.kpis.totalClients}</p>
                  <p className="text-xs text-slate-500 mt-1">{t('rpt.active_clients_suffix')}</p>
                </Card>
                <Card>
                  <h3 className="section-title mb-3">{t('rpt.mora_card_title')}</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">{t('rpt.total_mora')}</span><span className="font-semibold text-red-600">{formatCurrency(data.kpis.moraBalance)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">{t('rpt.stat_total_portfolio')}</span><span className="font-semibold">{formatCurrency(data.kpis.totalPortfolio)}</span></div>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* ── ADVANCED ANALYTICS ── */}
          {activeTab === 'advanced' && advanced && (
            <div className="space-y-6">
              {/* Date range + series filters */}
              <Card>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{t('common.from')}</label>
                    <input type="date" value={advancedFrom} onChange={e => setAdvancedFrom(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{t('common.to')}</label>
                    <input type="date" value={advancedTo} onChange={e => setAdvancedTo(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{t('rpt.chart_series_label')}</label>
                    <div className="flex gap-1 flex-wrap">
                      {[
                        { value: 'all', label: t('rpt.series_all') },
                        { value: 'total', label: t('rpt.series_total') },
                        { value: 'capital', label: t('rpt.series_capital') },
                        { value: 'interest', label: t('rpt.series_interest') },
                        { value: 'mora', label: t('rpt.series_mora') },
                      ].map(s => (
                        <button key={s.value} onClick={() => setAdvancedSeries(s.value as any)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${advancedSeries === s.value ? 'bg-[#1e3a5f] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Alerts */}
              {advanced.alerts.length > 0 && (
                <div className="space-y-2">
                  {advanced.alerts.map((alert, i) => (
                    <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${alert.severity === 'critical' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                      <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${alert.severity === 'critical' ? 'text-red-600' : 'text-amber-600'}`}/>
                      <p className={`text-sm font-medium ${alert.severity === 'critical' ? 'text-red-800' : 'text-amber-800'}`}>{alert.message}</p>
                    </div>
                  ))}
                </div>
              )}
              {advanced.alerts.length === 0 && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-emerald-600"/>
                  <p className="text-sm font-medium text-emerald-800">{t('rpt.no_alerts')}</p>
                </div>
              )}

              {/* MoM Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <p className="text-xs text-slate-500 uppercase font-medium mb-2">{t('rpt.collections_this_month')}</p>
                  <p className="text-2xl font-bold text-slate-800">{formatCurrency(advanced.comparison.thisMonth.collections)}</p>
                  <div className="mt-1"><PctBadge val={pct(advanced.comparison.thisMonth.collections, advanced.comparison.lastMonth.collections)} /></div>
                  <p className="text-xs text-slate-400 mt-1">{t('rpt.prev_month')}: {formatCurrency(advanced.comparison.lastMonth.collections)}</p>
                </Card>
                <Card>
                  <p className="text-xs text-slate-500 uppercase font-medium mb-2">{t('rpt.new_loans_this_month')}</p>
                  <p className="text-2xl font-bold text-slate-800">{advanced.comparison.thisMonth.loansCount}</p>
                  <div className="mt-1"><PctBadge val={pct(advanced.comparison.thisMonth.loansCount, advanced.comparison.lastMonth.loansCount)} /></div>
                  <p className="text-xs text-slate-400 mt-1">{t('rpt.disbursed_label')}: {formatCurrency(advanced.comparison.thisMonth.loansDisbursed)}</p>
                </Card>
                <Card>
                  <p className="text-xs text-slate-500 uppercase font-medium mb-2">{t('rpt.new_clients_this_month')}</p>
                  <p className="text-2xl font-bold text-slate-800">{advanced.comparison.thisMonth.newClients}</p>
                  <div className="mt-1"><PctBadge val={pct(advanced.comparison.thisMonth.newClients, advanced.comparison.lastMonth.newClients)} /></div>
                  <p className="text-xs text-slate-400 mt-1">{t('rpt.prev_month')}: {advanced.comparison.lastMonth.newClients}</p>
                </Card>
              </div>

              {/* YTD */}
              <Card>
                <h3 className="section-title mb-4">{t('rpt.ytd_title')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
                  <div className="text-center sm:text-left sm:border-r border-slate-200 sm:pr-4">
                    <p className="text-xs text-slate-500 uppercase font-medium">{t('rpt.ytd_collections')}</p>
                    <p className="text-lg sm:text-xl font-bold text-emerald-700 mt-1 break-words">{formatCurrency(advanced.ytd.collected)}</p>
                  </div>
                  <div className="text-center sm:text-left sm:border-r border-slate-200 sm:pr-4">
                    <p className="text-xs text-slate-500 uppercase font-medium">{t('rpt.ytd_disbursed')}</p>
                    <p className="text-lg sm:text-xl font-bold text-blue-700 mt-1 break-words">{formatCurrency(advanced.ytd.disbursed)}</p>
                  </div>
                  <div className="text-center sm:text-left">
                    <p className="text-xs text-slate-500 uppercase font-medium">{t('rpt.ytd_new_clients')}</p>
                    <p className="text-lg sm:text-xl font-bold text-slate-700 mt-1">{advanced.ytd.newClients}</p>
                  </div>
                </div>
              </Card>

              {/* Monthly Collections Chart */}
              {advanced.monthlyCollections.length > 0 && (
                <Card>
                  <h3 className="section-title mb-2">{t('rpt.monthly_collections')}</h3>
                  <p className="text-xs text-slate-400 mb-4">{advancedFrom} — {advancedTo}</p>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={advanced.monthlyCollections}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Legend />
                      {(advancedSeries === 'all' || advancedSeries === 'capital') && (
                        <Bar dataKey="capitalCollected" name={t('rpt.series_capital')} stackId={advancedSeries === 'all' ? 'a' : undefined} fill="#1e3a5f" />
                      )}
                      {(advancedSeries === 'all' || advancedSeries === 'interest') && (
                        <Bar dataKey="interestCollected" name={t('rpt.series_interest')} stackId={advancedSeries === 'all' ? 'a' : undefined} fill="#3b82f6" />
                      )}
                      {(advancedSeries === 'all' || advancedSeries === 'mora') && (
                        <Bar dataKey="moraCollected" name={t('rpt.series_mora')} stackId={advancedSeries === 'all' ? 'a' : undefined} fill="#ef4444" />
                      )}
                      {advancedSeries === 'total' && (
                        <Bar dataKey="totalCollected" name={t('rpt.col_total_collected')} fill="#10b981" />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Monthly Breakdown Table */}
              {advanced.monthlyCollections.length > 0 && (
                <Card>
                  <ExportBar onCSV={exportMonthlyCollectionsCSV} onPDF={exportMonthlyCollectionsPDF} label={t('rpt.monthly_detail')} />
                  <h3 className="section-title mb-4">{t('rpt.monthly_detail')}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('rpt.col_month')}</th>
                        <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('rpt.col_total_collected')}</th>
                        <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('rpt.series_capital')}</th>
                        <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('rpt.series_interest')}</th>
                        <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('rpt.series_mora')}</th>
                        <th className="text-center py-3 px-4 font-semibold text-slate-700">{t('rpt.col_transactions')}</th>
                      </tr></thead>
                      <tbody>{[...advanced.monthlyCollections].reverse().map((row, i) => (
                        <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-3 px-4 font-medium">{row.month}</td>
                          <td className="py-3 px-4 text-right font-semibold text-emerald-700">{formatCurrency(row.totalCollected)}</td>
                          <td className="py-3 px-4 text-right text-slate-600">{formatCurrency(row.capitalCollected)}</td>
                          <td className="py-3 px-4 text-right text-slate-600">{formatCurrency(row.interestCollected)}</td>
                          <td className="py-3 px-4 text-right text-red-600">{formatCurrency(row.moraCollected)}</td>
                          <td className="py-3 px-4 text-center">{row.paymentCount}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* Collector Performance */}
              {advanced.collectorPerf.length > 0 && (
                <Card>
                  <ExportBar onCSV={exportCollectorPerfCSV} onPDF={exportCollectorPerfPDF} label={t('rpt.collector_perf')} />
                  <h3 className="section-title mb-4">{t('rpt.collector_perf_30d')}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('rpt.col_collector')}</th>
                        <th className="text-center py-3 px-4 font-semibold text-slate-700">{t('rpt.col_payments')}</th>
                        <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('rpt.col_total_collected')}</th>
                      </tr></thead>
                      <tbody>{advanced.collectorPerf.map((c, i) => (
                        <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-3 px-4 font-medium">{c.collectorName || t('rpt.unassigned')}</td>
                          <td className="py-3 px-4 text-center">{c.paymentCount}</td>
                          <td className="py-3 px-4 text-right font-semibold text-emerald-700">{formatCurrency(c.totalCollected)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* Mora Rate Gauge */}
              <Card>
                <h3 className="section-title mb-4">{t('rpt.mora_rate')}</h3>
                <div className="flex items-center gap-4">
                  <div className="flex-1 bg-slate-100 rounded-full h-4 relative overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${advanced.moraRate > 20 ? 'bg-red-500' : advanced.moraRate > 10 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(advanced.moraRate, 100)}%` }} />
                  </div>
                  <span className={`text-2xl font-bold ${advanced.moraRate > 20 ? 'text-red-600' : advanced.moraRate > 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {advanced.moraRate.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between mt-2 text-xs text-slate-500">
                  <span className="text-emerald-600">{t('rpt.mora_healthy')}</span>
                  <span className="text-amber-600">{t('rpt.mora_warning')}</span>
                  <span className="text-red-600">{t('rpt.mora_critical')}</span>
                </div>
              </Card>
            </div>
          )}

          {/* ── BANK ACCOUNTS ── */}
          {activeTab === 'bank_accounts' && (
            <div className="space-y-6">
              <Card className="mb-4">
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">{t('common.from')}</label>
                    <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">{t('common.to')}</label>
                    <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </Card>
              {bankData ? (
                <>
                  {/* Summary cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Landmark className="w-5 h-5 text-blue-600"/>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">{t('rpt.total_by_accounts')}</p>
                          <p className="text-lg font-bold text-slate-800">{formatCurrency(bankData.byAccount.reduce((s,a)=>s+a.totalReceived,0))}</p>
                        </div>
                      </div>
                    </Card>
                    <Card>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                          <DollarSign className="w-5 h-5 text-green-600"/>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">{t('rpt.collected_cash')}</p>
                          <p className="text-lg font-bold text-slate-800">{formatCurrency(bankData.cashPayments?.totalReceived || 0)}</p>
                        </div>
                      </div>
                    </Card>
                    <Card>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                          <BarChart3 className="w-5 h-5 text-purple-600"/>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">{t('rpt.grand_total')}</p>
                          <p className="text-lg font-bold text-slate-800">{formatCurrency(bankData.byAccount.reduce((s,a)=>s+a.totalReceived,0) + (bankData.cashPayments?.totalReceived || 0))}</p>
                        </div>
                      </div>
                    </Card>
                  </div>

                  {/* Per account breakdown */}
                  {bankData.byAccount.length > 0 && (
                    <Card>
                      <ExportBar onCSV={exportBankAccountsCSV} onPDF={exportBankAccountsPDF} label={t('rpt.breakdown_by_account')} />
                      <h3 className="section-title mb-4">{t('rpt.breakdown_by_account')}</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b border-slate-200">
                            <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('rpt.col_bank_account')}</th>
                            <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('rpt.col_available_balance')}</th>
                            <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('rpt.col_total_received')}</th>
                            <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('rpt.series_capital')}</th>
                            <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('rpt.series_interest')}</th>
                            <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('rpt.series_mora')}</th>
                            <th className="text-center py-3 px-4 font-semibold text-slate-700">{t('rpt.col_transactions')}</th>
                          </tr></thead>
                          <tbody>
                            {bankData.byAccount.map(acc => (
                              <tr key={acc.bankAccountId} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-2">
                                    <Landmark className="w-4 h-4 text-blue-500"/>
                                    <div>
                                      <p className="font-medium text-slate-800">{acc.bankName}</p>
                                      {acc.accountNumber && <p className="text-xs text-slate-500 font-mono">{acc.accountNumber}</p>}
                                      {acc.accountHolder && <p className="text-xs text-slate-400">{acc.accountHolder}</p>}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <span className={`font-semibold ${(acc.currentBalance || 0) >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                                    {formatCurrency(acc.currentBalance || 0)}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right font-semibold text-emerald-700">{formatCurrency(acc.totalReceived)}</td>
                                <td className="py-3 px-4 text-right text-slate-600">{formatCurrency(acc.capitalReceived)}</td>
                                <td className="py-3 px-4 text-right text-blue-600">{formatCurrency(acc.interestReceived)}</td>
                                <td className="py-3 px-4 text-right text-red-600">{formatCurrency(acc.moraReceived)}</td>
                                <td className="py-3 px-4 text-center">
                                  <button
                                    onClick={() => openTxModal(acc.bankAccountId, acc.bankName)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                                    title={t('rpt.view_tx_history')}
                                  >
                                    {acc.paymentCount} →
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {/* Cash row */}
                            <tr className="border-b border-slate-200 bg-slate-50">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <DollarSign className="w-4 h-4 text-green-500"/>
                                  <div>
                                    <p className="font-medium text-slate-800">{t('rpt.cash_row_label')}</p>
                                    <p className="text-xs text-slate-400">{t('rpt.cash_no_account')}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right text-slate-400 text-xs">—</td>
                              <td className="py-3 px-4 text-right font-semibold text-emerald-700">{formatCurrency(bankData.cashPayments?.totalReceived || 0)}</td>
                              <td className="py-3 px-4 text-right text-slate-600">{formatCurrency(bankData.cashPayments?.capitalReceived || 0)}</td>
                              <td className="py-3 px-4 text-right text-blue-600">{formatCurrency(bankData.cashPayments?.interestReceived || 0)}</td>
                              <td className="py-3 px-4 text-right text-red-600">{formatCurrency(bankData.cashPayments?.moraReceived || 0)}</td>
                              <td className="py-3 px-4 text-center">
                                {(bankData.cashPayments?.paymentCount || 0) > 0 ? (
                                  <button
                                    onClick={() => openTxModal('cash', t('rpt.cash_row_label'))}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                                    title={t('rpt.view_cash_history')}
                                  >
                                    {bankData.cashPayments?.paymentCount || 0} →
                                  </button>
                                ) : (
                                  <span className="text-slate-500 text-xs">0</span>
                                )}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}

                  {/* Payment method breakdown */}
                  {bankData.byMethod.length > 0 && (
                    <Card>
                      <h3 className="section-title mb-4">{t('rpt.by_payment_method')}</h3>
                      <div className="space-y-3">
                        {bankData.byMethod.map((m, i) => {
                          const maxVal = Math.max(...bankData.byMethod.map(x => x.total), 1)
                          return (
                            <div key={i}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-slate-700">{t('method.' + m.paymentMethod, METHOD_LABEL[m.paymentMethod] || m.paymentMethod)}</span>
                                <span className="font-semibold text-slate-800">{formatCurrency(m.total)} <span className="text-slate-400 font-normal">({m.count} {t('rpt.payments_suffix')})</span></span>
                              </div>
                              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(m.total/maxVal)*100}%` }}/>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </Card>
                  )}
                </>
              ) : <p className="text-slate-500 text-sm">{t('rpt.no_data_period')}</p>}
            </div>
          )}

          {/* ── INCOME & EXPENSES ── */}
          {/* ── DATACREDITO ── */}
          {activeTab === 'datacredito' && (
            <DataCreditoTab dcLoading={dcLoading} setDcLoading={setDcLoading} />
          )}

          {activeTab === 'commissions' && (
            <div className="space-y-6">
              <Card className="mb-4">
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">{t('common.from')}</label>
                    <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">{t('common.to')}</label>
                    <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  {branches.length > 0 && (
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">{t('rpt.branch')}</label>
                      <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">{t('rpt.all_branches')}</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </Card>
              <Card className="p-0 overflow-hidden">
                <div className="p-4 pb-0">
                  <h3 className="section-title">{t('rpt.commission_by_collector')}</h3>
                  <p className="text-xs text-slate-500 mt-0.5 mb-3">
                    {t('rpt.commission_calc_note')}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead><tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('rpt.col_collector')}</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('rpt.col_collected')}</th>
                      <th className="text-center py-3 px-4 font-semibold text-slate-700">{t('rpt.col_payments')}</th>
                      <th className="text-center py-3 px-4 font-semibold text-slate-700">{t('rpt.col_commission_pct')}</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('rpt.col_commission')}</th>
                    </tr></thead>
                    <tbody>
                      {commissionsData.length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-8 text-slate-400 text-sm">{t('rpt.no_commission_payments')}</td></tr>
                      ) : commissionsData.map((row: any) => (
                        <tr key={row.collectorId || 'sin-cobrador'} className="border-b border-slate-100">
                          <td className="py-3 px-4 font-medium">{row.collectorName || t('rpt.no_name')}</td>
                          <td className="py-3 px-4 text-right">{formatCurrency(row.totalCollected)}</td>
                          <td className="py-3 px-4 text-center">{row.paymentCount}</td>
                          <td className="py-3 px-4 text-center">{row.commissionPercent || 0}%</td>
                          <td className="py-3 px-4 text-right font-semibold text-emerald-700">{formatCurrency(row.commissionAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'income_expenses' && (
            <div className="space-y-6">
              <Card className="mb-4">
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">{t('common.from')}</label>
                    <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">{t('common.to')}</label>
                    <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </Card>
              {incomeData ? (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                          <ArrowUpCircle className="w-5 h-5 text-green-600"/>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 uppercase font-medium">{t('rpt.total_income')}</p>
                          <p className="text-xl font-bold text-green-700">{formatCurrency(incomeData.summary.totalIncome)}</p>
                        </div>
                      </div>
                    </Card>
                    <Card>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                          <ArrowDownCircle className="w-5 h-5 text-red-600"/>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 uppercase font-medium">{t('rpt.total_expenses')}</p>
                          <p className="text-xl font-bold text-red-700">{formatCurrency(incomeData.summary.totalExpenses)}</p>
                        </div>
                      </div>
                    </Card>
                    <Card>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${incomeData.summary.netProfit >= 0 ? 'bg-emerald-100' : 'bg-red-50'}`}>
                          <TrendingUp className={`w-5 h-5 ${incomeData.summary.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}/>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 uppercase font-medium">{t('rpt.net_profit')}</p>
                          <p className={`text-xl font-bold ${incomeData.summary.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(incomeData.summary.netProfit)}</p>
                        </div>
                      </div>
                    </Card>
                  </div>

                  {/* By category */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                      <h3 className="section-title mb-4 text-green-700">{t('rpt.income_by_category')}</h3>
                      <div className="space-y-2">
                        {incomeData.byCategory.filter(c => c.type === 'income').length === 0 && (
                          <p className="text-sm text-slate-400">{t('rpt.no_income_period')}</p>
                        )}
                        {incomeData.byCategory.filter(c => c.type === 'income').map((cat, i) => (
                          <div key={i} className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
                            <span className="text-sm text-slate-700">{t('inc.cat_' + cat.category, CATEGORY_LABEL[cat.category] || cat.category)}</span>
                            <div className="text-right">
                              <span className="text-sm font-semibold text-green-700">{formatCurrency(cat.total)}</span>
                              <span className="text-xs text-slate-400 ml-2">({cat.count})</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                    <Card>
                      <h3 className="section-title mb-4 text-red-700">{t('rpt.expenses_by_category')}</h3>
                      <div className="space-y-2">
                        {incomeData.byCategory.filter(c => c.type === 'expense').length === 0 && (
                          <p className="text-sm text-slate-400">{t('rpt.no_expenses_period')}</p>
                        )}
                        {incomeData.byCategory.filter(c => c.type === 'expense').map((cat, i) => (
                          <div key={i} className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
                            <span className="text-sm text-slate-700">{t('inc.cat_' + cat.category, CATEGORY_LABEL[cat.category] || cat.category)}</span>
                            <div className="text-right">
                              <span className="text-sm font-semibold text-red-700">{formatCurrency(cat.total)}</span>
                              <span className="text-xs text-slate-400 ml-2">({cat.count})</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>

                  {/* Monthly chart */}
                  {incomeData.monthly.length > 0 && (
                    <Card>
                      <h3 className="section-title mb-4">{t('rpt.monthly_evolution')}</h3>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={(() => {
                          const months: Record<string, any> = {}
                          incomeData.monthly.forEach(r => {
                            if (!months[r.month]) months[r.month] = { month: r.month, income: 0, expense: 0 }
                            if (r.type === 'income') months[r.month].income = r.total
                            else months[r.month].expense = r.total
                          })
                          return Object.values(months).sort((a,b) => a.month.localeCompare(b.month))
                        })()}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip formatter={v => formatCurrency(v as number)} />
                          <Legend />
                          <Bar dataKey="income" name={t('rpt.income_series')} fill="#10b981" radius={[2,2,0,0]} />
                          <Bar dataKey="expense" name={t('rpt.expense_series')} fill="#ef4444" radius={[2,2,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </Card>
                  )}

                  {/* Recent transactions */}
                  {incomeData.recent.length > 0 && (
                    <Card>
                      <ExportBar onCSV={exportIncomeTxCSV} onPDF={exportIncomeTxPDF} label={t('rpt.recent_transactions')} />
                      <h3 className="section-title mb-4">{t('rpt.recent_transactions')}</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b border-slate-200">
                            <th className="text-left py-2 px-4 font-semibold text-slate-700">{t('rpt.col_date')}</th>
                            <th className="text-left py-2 px-4 font-semibold text-slate-700">{t('rpt.col_type')}</th>
                            <th className="text-left py-2 px-4 font-semibold text-slate-700">{t('rpt.col_category')}</th>
                            <th className="text-left py-2 px-4 font-semibold text-slate-700">{t('rpt.col_description')}</th>
                            <th className="text-right py-2 px-4 font-semibold text-slate-700">{t('rpt.col_amount')}</th>
                          </tr></thead>
                          <tbody>
                            {incomeData.recent.map((tx: any, i: number) => (
                              <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="py-2 px-4 text-xs text-slate-500 whitespace-nowrap">{tx.transactionDate ? new Date(tx.transactionDate).toLocaleDateString('es-DO') : '—'}</td>
                                <td className="py-2 px-4">
                                  {tx.type === 'income'
                                    ? <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">{t('rpt.type_income')}</span>
                                    : <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-600">{t('rpt.type_expense')}</span>
                                  }
                                </td>
                                <td className="py-2 px-4 text-xs text-slate-600">{t('inc.cat_' + tx.category, CATEGORY_LABEL[tx.category] || tx.category)}</td>
                                <td className="py-2 px-4 text-sm text-slate-700 max-w-xs truncate">{tx.description || '—'}</td>
                                <td className={`py-2 px-4 text-right font-semibold text-sm ${tx.type === 'income' ? 'text-emerald-700' : 'text-red-600'}`}>
                                  {tx.type === 'expense' ? '-' : ''}{formatCurrency(tx.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center h-32 text-slate-400">
                  <p className="text-sm">{t('rpt.select_range_wait')}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Bank Account Transaction Drill-down Modal ── */}
      {txModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Landmark className="w-5 h-5 text-blue-500" />
                  {txModal.accountName}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t('rpt.tx_modal_period').replace('{from}', fromDate).replace('{to}', toDate)}
                </p>
              </div>
              <button
                onClick={() => { setTxModal(null); setTxData(null) }}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-500"
              >
                ✕
              </button>
            </div>

            {txData && (
              <div className="px-6 py-3 border-b border-slate-100 bg-slate-50 flex-shrink-0">
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="text-slate-500 text-xs">{t('rpt.col_available_balance')}</span>
                    <p className="font-bold text-blue-700">{formatCurrency(txData.account?.currentBalance || 0)}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">{t('rpt.loaned_label')}</span>
                    <p className="font-bold text-orange-600">{formatCurrency(txData.account?.loanedBalance || 0)}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">{t('rpt.tx_in_period')}</span>
                    <p className="font-bold text-slate-700">{txData.transactions.length}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-y-auto flex-1 px-6 py-4">
              {txLoading ? (
                <div className="flex items-center justify-center h-32 text-slate-400">
                  <p className="text-sm">{t('rpt.loading_transactions')}</p>
                </div>
              ) : txData?.transactions.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-slate-400">
                  <p className="text-sm">{t('rpt.no_tx_period')}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-3 font-semibold text-slate-700 text-xs">{t('rpt.col_payment_num')}</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-700 text-xs">{t('rpt.col_date')}</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-700 text-xs">{t('rpt.col_client_loan')}</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700 text-xs">{t('rpt.series_capital')}</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700 text-xs">{t('rpt.series_interest')}</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700 text-xs">{t('rpt.series_mora')}</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700 text-xs">{t('rpt.series_total')}</th>
                      <th className="text-center py-2 px-3 font-semibold text-slate-700 text-xs">{t('col.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(txData?.transactions || []).map((tx: AccountTransaction) => (
                      <tr key={tx.id} className={`border-b border-slate-100 hover:bg-slate-50 ${tx.isVoided ? 'opacity-50' : ''}`}>
                        <td className="py-2 px-3 font-mono text-xs text-blue-700">{tx.paymentNumber}</td>
                        <td className="py-2 px-3 text-xs text-slate-500 whitespace-nowrap">
                          {new Date(tx.paymentDate).toLocaleDateString('es-DO')}
                        </td>
                        <td className="py-2 px-3">
                          <p className="font-medium text-slate-800 text-xs">{tx.clientName}</p>
                          <p className="text-xs text-slate-400 font-mono">{tx.loanNumber}</p>
                        </td>
                        <td className="py-2 px-3 text-right text-xs text-slate-700">{formatCurrency(tx.appliedCapital || 0)}</td>
                        <td className="py-2 px-3 text-right text-xs text-blue-600">{formatCurrency(tx.appliedInterest || 0)}</td>
                        <td className="py-2 px-3 text-right text-xs text-red-500">{formatCurrency(tx.appliedMora || 0)}</td>
                        <td className="py-2 px-3 text-right text-xs font-semibold text-emerald-700">{formatCurrency(tx.amount)}</td>
                        <td className="py-2 px-3 text-center">
                          {tx.isVoided
                            ? <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-slate-200 text-slate-500">{t('rpt.status_voided')}</span>
                            : <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700">{t('rpt.status_ok')}</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-200 flex-shrink-0 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {txData && txData.transactions.length > 0 && (
                  <>
                    <button
                      onClick={exportTxModalCSV}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-lg text-xs font-medium transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5"/>{t('export.csv')}
                    </button>
                    <button
                      onClick={exportTxModalPDF}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-blue-300 text-blue-700 hover:bg-blue-50 rounded-lg text-xs font-medium transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5"/>{t('export.pdf')}
                    </button>
                  </>
                )}
              </div>
              <button
                onClick={() => { setTxModal(null); setTxData(null) }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── DataCrédito Tab Component ────────────────────────────────────────────────
const DataCreditoTab: React.FC<{ dcLoading: boolean; setDcLoading: (v: boolean) => void }> = ({ dcLoading, setDcLoading }) => {
  const t = useT()
  const [reportDate, setReportDate] = React.useState(() => new Date().toISOString().slice(0, 7)) // YYYY-MM
  const [preview, setPreview]       = React.useState<any[]>([])
  const [totalRows, setTotalRows]   = React.useState<number | null>(null)
  const [generated, setGenerated]   = React.useState(false)

  const DC_COLUMNS = [
    'TIPO DE ENTIDAD','NOMBRE DEL CLIENTE','APELLIDOS','CEDULA O RNC',
    'SEXO','ESTADO CIVIL','OCUPACION','CODIGO DE CLIENTE','FECHA DE NACIMIENTO',
    'NACIONALIDAD','DIRECCION','SECTOR','CALLE/NUMERO','MUNICIPIO','CIUDAD',
    'PROVINCIA','PAIS','DIR_REFERENCIA','TELEFONO1','TELEFONO2',
    'EMPRESA DONDE TRABAJA','CARGO','DIRECCION_LABORAL','SECTOR_LABORAL',
    'CALLE_NUMERO_LABORAL','MUNICIPIO_LABORAL','CIUDAD_LABORAL','PROVINCIA_LABORAL',
    'PAIS_LABORAL','DIR_REF_LABORAL','SALARIO MENSUAL','MONEDA SALARIO',
    'RELACIÓN TIPO','FECHA APERTURA','FECHA VENCIMIENTO','FECHA ULTIMO PAGO',
    'NUMERO CUENTA','ESTATUS','TIPO DE PRESTAMO','MONEDA',
    'CREDITO APROBADO','MONTO ADEUDADO','PAGO MANDATORIO O CUOTA',
    'MONTO ULTIMO PAGO','TOTAL DE ATRASO','TASA DE INTERES','FORMA DE PAGO',
    'CANTIDAD DE CUOTAS',
    'ATRASO 1 A 30 DIAS','ATRASO 31 A 60 DIAS','ATRASO 61 A 90 DIAS',
    'ATRASO 91 A 120 DIAS','ATRASO 121 A 150 DIAS','ATRASO 151 A 180 DIAS',
    'ATRASO 181 DIAS O MAS','LEGAL','CASTIGADO',
  ]

  const MISSING_FIELDS = [
    { field: 'SECTOR / CALLE-NUMERO / MUNICIPIO', note: t('rpt.dc_missing_note_address') },
    { field: 'DATOS LABORALES (dirección, ciudad, provincia)', note: t('rpt.dc_missing_note_work') },
    { field: 'TIPO DE ENTIDAD', note: t('rpt.dc_missing_note_entity') },
  ]

  const handleGenerate = async () => {
    setDcLoading(true)
    try {
      const res = await api.get('/reports/datacredito')
      const { rows, totalRows: total } = res.data
      setPreview(rows.slice(0, 5))
      setTotalRows(total)
      setGenerated(true)
      toast.success(t('rpt.dc_generated_toast').replace('{n}', String(total)))

      // Auto-download Excel via SheetJS (loaded from CDN)
      await downloadDataCreditoExcel(rows, reportDate)
    } catch(e: any) {
      toast.error(e?.response?.data?.error || t('rpt.dc_generate_error'))
    } finally {
      setDcLoading(false)
    }
  }

  const downloadDataCreditoExcel = async (rows: any[], period: string) => {
    // Dynamically load SheetJS from CDN
    if (!(window as any).XLSX) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script')
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
        s.onload = () => resolve()
        s.onerror = () => reject(new Error(t('rpt.dc_sheetjs_error')))
        document.head.appendChild(s)
      })
    }
    const XLSX = (window as any).XLSX
    // Build worksheet data: header row + data rows
    const wsData = [DC_COLUMNS, ...rows.map(r => DC_COLUMNS.map(col => r[col] ?? ''))]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    // Column widths
    ws['!cols'] = DC_COLUMNS.map((col, i) => ({
      wch: i < 4 ? 20 : i < 20 ? 15 : 12
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'DataCredito')
    XLSX.writeFile(wb, `DataCredito_CredyTek_${period}.xlsx`)
    toast.success(t('rpt.dc_excel_downloaded'))
  }

  return (
    <div className="space-y-6">
      {/* Header card */}
      <Card>
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <FileText className="w-6 h-6 text-blue-700" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-900">{t('rpt.dc_title')}</h2>
            <p className="text-sm text-slate-500 mt-1">
              {t('rpt.dc_desc')}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t('rpt.dc_period')}</label>
            <input
              type="month"
              value={reportDate}
              onChange={e => setReportDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button
            onClick={handleGenerate}
            isLoading={dcLoading}
            className="flex items-center gap-2 bg-[#1e3a5f] hover:bg-[#152a45] text-white"
          >
            <Download className="w-4 h-4" />
            {dcLoading ? t('rpt.dc_generating') : t('rpt.dc_generate_button')}
          </Button>
        </div>
      </Card>

      {/* Field mapping info */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-4 h-4 text-blue-600" />
          <h3 className="font-semibold text-slate-800">{t('rpt.dc_mapping_title')}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="pb-2 pr-4 font-semibold text-slate-700 whitespace-nowrap">{t('rpt.dc_col_datacredito')}</th>
                <th className="pb-2 pr-4 font-semibold text-slate-700">{t('rpt.dc_col_origin')}</th>
                <th className="pb-2 font-semibold text-slate-700">{t('rpt.dc_col_status')}</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {[
                { dc: 'NOMBRE / APELLIDOS', pm: t('rpt.dc_map_name'), ok: true },
                { dc: 'CEDULA O RNC', pm: t('rpt.dc_map_id'), ok: true },
                { dc: 'SEXO', pm: t('rpt.dc_map_gender'), ok: true },
                { dc: 'ESTADO CIVIL', pm: t('rpt.dc_map_marital'), ok: true },
                { dc: 'OCUPACIÓN', pm: t('rpt.dc_map_occupation'), ok: true },
                { dc: 'CÓDIGO DE CLIENTE', pm: t('rpt.dc_map_client_code'), ok: true },
                { dc: 'FECHA DE NACIMIENTO', pm: t('rpt.dc_map_dob'), ok: true },
                { dc: 'TELÉFONOS 1 y 2', pm: t('rpt.dc_map_phones'), ok: true },
                { dc: 'CIUDAD / PROVINCIA', pm: t('rpt.dc_map_city_province'), ok: true },
                { dc: 'SECTOR / MUNICIPIO / CALLE', pm: t('rpt.dc_map_address'), ok: false },
                { dc: 'EMPRESA / SALARIO MENSUAL', pm: t('rpt.dc_map_employer'), ok: true },
                { dc: 'FECHA APERTURA / VENCIMIENTO', pm: t('rpt.dc_map_dates'), ok: true },
                { dc: 'NÚMERO CUENTA', pm: t('rpt.dc_map_account_num'), ok: true },
                { dc: 'ESTATUS', pm: t('rpt.dc_map_status'), ok: true },
                { dc: 'TIPO DE PRÉSTAMO', pm: t('rpt.dc_map_loan_type'), ok: true },
                { dc: 'MONEDA', pm: t('rpt.dc_map_currency'), ok: true },
                { dc: 'MONTO ADEUDADO / ATRASO', pm: t('rpt.dc_map_debt'), ok: true },
                { dc: 'BUCKETS ATRASO (7 rangos)', pm: t('rpt.dc_map_buckets'), ok: true },
                { dc: 'TIPO DE ENTIDAD', pm: t('rpt.dc_map_entity_type'), ok: true },
              ].map(row => (
                <tr key={row.dc} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 pr-4 font-medium text-slate-800 whitespace-nowrap">{row.dc}</td>
                  <td className="py-2 pr-4 text-slate-600">{row.pm}</td>
                  <td className="py-2">
                    {row.ok
                      ? <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 text-xs font-medium">✓ {t('rpt.dc_available')}</span>
                      : <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 text-xs font-medium">⚠ {t('rpt.dc_partial')}</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Campos parciales / sugerencias */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h3 className="font-semibold text-slate-800">{t('rpt.dc_missing_title')}</h3>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          {t('rpt.dc_missing_desc')}
        </p>
        <ul className="space-y-2 text-sm">
          {MISSING_FIELDS.map(f => (
            <li key={f.field} className="flex items-start gap-2">
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
              <div>
                <span className="font-medium text-slate-800">{f.field}:</span>{' '}
                <span className="text-slate-600">{f.note}</span>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* Preview after generation */}
      {generated && preview.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800">
              {t('rpt.dc_preview_title').replace('{n}', String(totalRows))}
            </h3>
            <span className="text-xs text-slate-400">{t('rpt.dc_preview_downloaded')}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['NOMBRE DEL CLIENTE','CEDULA O RNC','NUMERO CUENTA','ESTATUS','TIPO DE PRESTAMO','MONEDA','CREDITO APROBADO','MONTO ADEUDADO','TOTAL DE ATRASO','ATRASO 1 A 30 DIAS','ATRASO 31 A 60 DIAS','ATRASO 181 DIAS O MAS'].map(h => (
                    <th key={h} className="py-2 px-3 text-left font-semibold text-slate-700">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-1.5 px-3 font-medium">{row['NOMBRE DEL CLIENTE']} {row['APELLIDOS']}</td>
                    <td className="py-1.5 px-3">{row['CEDULA O RNC']}</td>
                    <td className="py-1.5 px-3 font-mono text-blue-700">{row['NUMERO CUENTA']}</td>
                    <td className="py-1.5 px-3">
                      <span className={`px-1.5 py-0.5 rounded font-bold ${row['ESTATUS']==='V'?'bg-green-100 text-green-700':row['ESTATUS']==='C'?'bg-slate-100 text-slate-600':'bg-red-100 text-red-700'}`}>
                        {row['ESTATUS']}
                      </span>
                    </td>
                    <td className="py-1.5 px-3">{row['TIPO DE PRESTAMO']}</td>
                    <td className="py-1.5 px-3">{row['MONEDA']}</td>
                    <td className="py-1.5 px-3 text-right">{Number(row['CREDITO APROBADO']).toLocaleString('es-DO',{minimumFractionDigits:2})}</td>
                    <td className="py-1.5 px-3 text-right">{Number(row['MONTO ADEUDADO']).toLocaleString('es-DO',{minimumFractionDigits:2})}</td>
                    <td className={`py-1.5 px-3 text-right font-semibold ${Number(row['TOTAL DE ATRASO'])>0?'text-red-600':''}`}>
                      {Number(row['TOTAL DE ATRASO']).toLocaleString('es-DO',{minimumFractionDigits:2})}
                    </td>
                    <td className="py-1.5 px-3 text-right">{Number(row['ATRASO 1 A 30 DIAS']).toLocaleString('es-DO',{minimumFractionDigits:2})}</td>
                    <td className="py-1.5 px-3 text-right">{Number(row['ATRASO 31 A 60 DIAS']).toLocaleString('es-DO',{minimumFractionDigits:2})}</td>
                    <td className="py-1.5 px-3 text-right">{Number(row['ATRASO 181 DIAS O MAS']).toLocaleString('es-DO',{minimumFractionDigits:2})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

export default ReportsPage

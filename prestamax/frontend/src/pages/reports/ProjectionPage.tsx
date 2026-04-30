import React, { useState, useCallback } from 'react'
import { usePermission } from '@/hooks/usePermission'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import {
  TrendingUp, Calendar, AlertCircle, CheckCircle2, Users,
  Download, RefreshCw, DollarSign, Clock, Filter, Search,
  ChevronDown, ChevronUp, Info
} from 'lucide-react'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import { formatCurrency, formatDate, getLoanStatusConfig } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProjectionSummary {
  totalCapital: number
  totalInterest: number
  totalMora: number
  totalProrroga: number
  totalProjected: number
  clientsOnTime: number
  clientsOverdue: number
  totalLoans: number
  totalInstallments: number
}

interface ProjectionItem {
  loanId: string
  loanNumber: string
  clientName: string
  clientPhone: string | null
  currency: string
  status: string
  isOverdue: boolean
  daysLate: number
  installmentsInRange: number
  capital: number
  interest: number
  mora: number
  prorroga: number
  total: number
  dueDates: string[]
  moraType: 'fixed' | 'daily'
  moraRate: number
  note?: string
}

interface ProjectionResponse {
  summary: ProjectionSummary
  items: ProjectionItem[]
  period: { from: string; to: string }
}

// ── Helper ────────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10)
const firstOfMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
const lastOfMonth = () => {
  const d = new Date()
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return last.toISOString().slice(0, 10)
}

function exportCSV(items: ProjectionItem[], period: { from: string; to: string }) {
  const headers = ['Cliente','Préstamo','Estado','Días Atraso','Cuotas','Capital','Interés','Mora','Prorroga','Total','Tipo Mora','Tasa Mora']
  const rows = items.map(i => [
    `"${i.clientName}"`,
    `"${i.loanNumber}"`,
    i.status,
    i.daysLate,
    i.installmentsInRange,
    i.capital.toFixed(2),
    i.interest.toFixed(2),
    i.mora.toFixed(2),
    i.prorroga.toFixed(2),
    i.total.toFixed(2),
    i.moraType === 'fixed' ? 'Fijo' : 'Diario',
    i.moraRate,
  ])
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `proyeccion-cobros-${period.from}-${period.to}.csv`
  link.click()
  URL.revokeObjectURL(url)
  toast.success(`${items.length} registros exportados`)
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
const KpiCard: React.FC<{
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  color: string
  bg: string
}> = ({ label, value, sub, icon, color, bg }) => (
  <Card className="p-4">
    <div className="flex items-start justify-between">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ml-3 ${bg}`}>
        {icon}
      </div>
    </div>
  </Card>
)

// ── Main Page ─────────────────────────────────────────────────────────────────
const ProjectionPage: React.FC = () => {
  const { can } = usePermission()

  // Date mode: 'single' or 'range'
  const [dateMode, setDateMode]     = useState<'single' | 'range'>('range')
  const [singleDate, setSingleDate] = useState(today())
  const [fromDate, setFromDate]     = useState(firstOfMonth())
  const [toDate, setToDate]         = useState(lastOfMonth())

  const [data, setData]           = useState<ProjectionResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)

  // Table state
  const [search, setSearch]             = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'ontime' | 'overdue'>('all')
  const [expandedId, setExpandedId]     = useState<string | null>(null)
  const [sortField, setSortField]       = useState<'clientName' | 'total' | 'daysLate' | 'mora'>('total')
  const [sortDir, setSortDir]           = useState<'asc' | 'desc'>('desc')

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchProjection = useCallback(async () => {
    setIsLoading(true)
    try {
      const params: Record<string, string> = {}
      if (dateMode === 'single') {
        params.date = singleDate
      } else {
        params.from = fromDate
        params.to   = toDate
      }
      const res = await api.get('/reports/projection', { params })
      setData(res.data)
      setHasLoaded(true)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al cargar la proyección')
    } finally {
      setIsLoading(false)
    }
  }, [dateMode, singleDate, fromDate, toDate])

  // ── Derived / filtered items ──────────────────────────────────────────────
  const filteredItems = (data?.items || [])
    .filter(i => {
      if (filterStatus === 'ontime'  && i.isOverdue) return false
      if (filterStatus === 'overdue' && !i.isOverdue) return false
      if (search && !i.clientName.toLowerCase().includes(search.toLowerCase()) &&
          !i.loanNumber.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
    .sort((a, b) => {
      let av = 0, bv = 0
      if (sortField === 'clientName') return sortDir === 'asc'
        ? a.clientName.localeCompare(b.clientName)
        : b.clientName.localeCompare(a.clientName)
      if (sortField === 'total')    { av = a.total;    bv = b.total }
      if (sortField === 'mora')     { av = a.mora;     bv = b.mora }
      if (sortField === 'daysLate') { av = a.daysLate; bv = b.daysLate }
      return sortDir === 'asc' ? av - bv : bv - av
    })

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const SortIcon = ({ field }: { field: typeof sortField }) =>
    sortField !== field ? null :
    sortDir === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-0.5"/> : <ChevronDown className="w-3 h-3 inline ml-0.5"/>

  // ── No permission ──────────────────────────────────────────────────────────
  if (!can('reports.projection')) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <AlertCircle className="w-12 h-12 mb-3 opacity-40"/>
        <p className="font-medium text-slate-600">Sin acceso</p>
        <p className="text-sm mt-1">No tienes permiso para ver la proyección de cobros.</p>
      </div>
    )
  }

  const s = data?.summary

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-600"/>
            Proyección de Cobros
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Estima los ingresos a cobrar según las cuotas vencidas o próximas a vencer
          </p>
        </div>
        {data && (
          <Button
            variant="outline"
            onClick={() => exportCSV(data.items, data.period)}
            className="flex items-center gap-1.5"
          >
            <Download className="w-4 h-4"/>Exportar CSV
          </Button>
        )}
      </div>

      {/* ── Date selector ──────────────────────────────────────────────────── */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Mode toggle */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Modo</label>
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setDateMode('single')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${dateMode === 'single' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Fecha puntual
              </button>
              <button
                onClick={() => setDateMode('range')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${dateMode === 'range' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Rango de fechas
              </button>
            </div>
          </div>

          {/* Date inputs */}
          {dateMode === 'single' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5 flex items-center gap-1">
                <Calendar className="w-3 h-3"/>Fecha
              </label>
              <input
                type="date"
                value={singleDate}
                onChange={e => setSingleDate(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Desde</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={e => setFromDate(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Hasta</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={e => setToDate(e.target.value)}
                  min={fromDate}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          {/* Quick presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400 font-medium">Accesos rápidos:</span>
            {[
              { label: 'Hoy',          action: () => { setDateMode('single'); setSingleDate(today()) } },
              { label: 'Esta semana',  action: () => {
                const d = new Date(); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                const mon = new Date(d.setDate(diff)); const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
                setDateMode('range'); setFromDate(mon.toISOString().slice(0,10)); setToDate(sun.toISOString().slice(0,10));
              }},
              { label: 'Este mes',     action: () => { setDateMode('range'); setFromDate(firstOfMonth()); setToDate(lastOfMonth()) } },
              { label: 'Próx. 7 días', action: () => {
                const f = today(); const t = new Date(); t.setDate(t.getDate()+6);
                setDateMode('range'); setFromDate(f); setToDate(t.toISOString().slice(0,10));
              }},
              { label: 'Vencidos',     action: () => {
                setDateMode('range');
                const y = new Date(); y.setFullYear(y.getFullYear()-2);
                setFromDate(y.toISOString().slice(0,10)); setToDate(today());
              }},
            ].map(p => (
              <button
                key={p.label}
                onClick={p.action}
                className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-600 font-medium transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          <Button onClick={fetchProjection} disabled={isLoading} className="flex items-center gap-1.5 ml-auto">
            {isLoading
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Calculando...</>
              : <><RefreshCw className="w-4 h-4"/>Calcular proyección</>
            }
          </Button>
        </div>
      </Card>

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {!hasLoaded && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <TrendingUp className="w-14 h-14 mb-4 opacity-20"/>
          <p className="font-medium text-slate-500">Selecciona un período y presiona "Calcular proyección"</p>
          <p className="text-sm mt-1">Verás el detalle de cuotas, mora, capital e intereses a cobrar</p>
        </div>
      )}

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin mb-4"/>
          <p className="text-sm">Calculando proyección...</p>
        </div>
      )}

      {hasLoaded && !isLoading && s && (
        <>
          {/* Period label */}
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Calendar className="w-4 h-4"/>
            <span>
              Período: <strong className="text-slate-700">
                {data!.period.from === data!.period.to
                  ? formatDate(data!.period.from)
                  : `${formatDate(data!.period.from)} — ${formatDate(data!.period.to)}`}
              </strong>
            </span>
          </div>

          {/* ── KPI Cards ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Total a Cobrar"
              value={formatCurrency(s.totalProjected)}
              sub={`${s.totalLoans} préstamo(s) · ${s.totalInstallments} cuota(s)`}
              icon={<DollarSign className="w-5 h-5 text-blue-600"/>}
              color="text-blue-700"
              bg="bg-blue-50"
            />
            <KpiCard
              label="Capital"
              value={formatCurrency(s.totalCapital)}
              sub="Saldo de capital en cuotas"
              icon={<TrendingUp className="w-5 h-5 text-teal-600"/>}
              color="text-teal-700"
              bg="bg-teal-50"
            />
            <KpiCard
              label="Intereses"
              value={formatCurrency(s.totalInterest)}
              sub="Intereses en cuotas del período"
              icon={<TrendingUp className="w-5 h-5 text-indigo-600"/>}
              color="text-indigo-700"
              bg="bg-indigo-50"
            />
            <KpiCard
              label="Mora + Prórroga"
              value={formatCurrency(s.totalMora + s.totalProrroga)}
              sub={`Mora: ${formatCurrency(s.totalMora)} · Prórroga: ${formatCurrency(s.totalProrroga)}`}
              icon={<AlertCircle className="w-5 h-5 text-red-500"/>}
              color="text-red-600"
              bg="bg-red-50"
            />
          </div>

          {/* Client status cards */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4 border-l-4 border-l-emerald-400">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600"/>
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-700">{s.clientsOnTime}</p>
                  <p className="text-xs text-slate-500 font-medium">Clientes al día</p>
                </div>
              </div>
            </Card>
            <Card className="p-4 border-l-4 border-l-red-400">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                  <Clock className="w-5 h-5 text-red-500"/>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">{s.clientsOverdue}</p>
                  <p className="text-xs text-slate-500 font-medium">Clientes con atraso</p>
                </div>
              </div>
            </Card>
          </div>

          {/* ── Table ────────────────────────────────────────────────────────── */}
          {data!.items.length === 0 ? (
            <Card className="p-12 text-center">
              <TrendingUp className="w-10 h-10 text-slate-300 mx-auto mb-3"/>
              <p className="font-medium text-slate-500">Sin datos en este período</p>
              <p className="text-sm text-slate-400 mt-1">No hay cuotas vencidas ni próximas a vencer en las fechas seleccionadas.</p>
            </Card>
          ) : (
            <Card className="p-0 overflow-hidden">
              {/* Table toolbar */}
              <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"/>
                  <input
                    type="text"
                    placeholder="Buscar cliente o préstamo..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-slate-400"/>
                  {([
                    { val: 'all',     label: `Todos (${data!.items.length})` },
                    { val: 'ontime',  label: `Al día (${s.clientsOnTime})` },
                    { val: 'overdue', label: `Con atraso (${s.clientsOverdue})` },
                  ] as const).map(f => (
                    <button
                      key={f.val}
                      onClick={() => setFilterStatus(f.val)}
                      className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${filterStatus === f.val ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-slate-400 ml-auto">{filteredItems.length} resultado(s)</span>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-800" onClick={() => toggleSort('clientName')}>
                        Cliente / Préstamo <SortIcon field="clientName"/>
                      </th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase">Estado</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-800" onClick={() => toggleSort('daysLate')}>
                        Días atraso <SortIcon field="daysLate"/>
                      </th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase">Capital</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase">Interés</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-800" onClick={() => toggleSort('mora')}>
                        Mora <SortIcon field="mora"/>
                      </th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase">Prórroga</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-800" onClick={() => toggleSort('total')}>
                        Total <SortIcon field="total"/>
                      </th>
                      <th className="w-8"/>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredItems.map(item => {
                      const isExpanded = expandedId === item.loanId
                      const statusCfg  = getLoanStatusConfig(item.status as any)
                      return (
                        <React.Fragment key={item.loanId}>
                          <tr className={`hover:bg-slate-50 transition-colors ${item.isOverdue ? 'bg-red-50/30' : ''}`}>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-800">{item.clientName}</p>
                              <p className="text-xs text-slate-400">#{item.loanNumber}
                                {item.clientPhone && <span className="ml-2 text-slate-300">· {item.clientPhone}</span>}
                              </p>
                              {item.note && (
                                <p className="text-[10px] text-amber-600 flex items-center gap-0.5 mt-0.5">
                                  <Info className="w-2.5 h-2.5"/>{item.note}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color}`}>
                                {statusCfg.label}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-center">
                              {item.daysLate > 0 ? (
                                <span className={`font-bold text-sm ${item.daysLate > 30 ? 'text-red-600' : item.daysLate > 7 ? 'text-orange-500' : 'text-amber-500'}`}>
                                  {item.daysLate}d
                                </span>
                              ) : (
                                <span className="text-emerald-500 text-sm font-bold">—</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right text-slate-700 font-mono text-xs">
                              {item.capital > 0 ? formatCurrency(item.capital, item.currency) : '—'}
                            </td>
                            <td className="px-3 py-3 text-right text-slate-700 font-mono text-xs">
                              {item.interest > 0 ? formatCurrency(item.interest, item.currency) : '—'}
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-xs">
                              {item.mora > 0
                                ? <span className="text-red-600 font-semibold">{formatCurrency(item.mora, item.currency)}</span>
                                : <span className="text-slate-300">—</span>
                              }
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-xs">
                              {item.prorroga > 0
                                ? <span className="text-purple-600 font-semibold">{formatCurrency(item.prorroga, item.currency)}</span>
                                : <span className="text-slate-300">—</span>
                              }
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="font-bold text-slate-900 text-sm">{formatCurrency(item.total, item.currency)}</span>
                            </td>
                            <td className="px-2 py-3">
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : item.loanId)}
                                className="p-1 rounded hover:bg-slate-200 text-slate-400"
                              >
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5"/> : <ChevronDown className="w-3.5 h-3.5"/>}
                              </button>
                            </td>
                          </tr>

                          {/* Expanded detail row */}
                          {isExpanded && (
                            <tr className="bg-slate-50/80">
                              <td colSpan={9} className="px-6 py-3">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                  <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Cuotas en período</p>
                                    <p className="text-slate-700 font-semibold">{item.installmentsInRange} cuota(s)</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Fechas de vencimiento</p>
                                    {item.dueDates.length > 0
                                      ? item.dueDates.map(d => (
                                          <p key={d} className="text-slate-700">{formatDate(d)}</p>
                                        ))
                                      : <p className="text-slate-400 italic">Sin cuotas en este período</p>
                                    }
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Tipo de mora</p>
                                    <p className="text-slate-700">
                                      {item.moraType === 'fixed'
                                        ? `Cargo fijo: ${formatCurrency(item.moraRate, item.currency)} por cuota vencida`
                                        : `Tasa diaria: ${(item.moraRate * 100).toFixed(3)}%`
                                      }
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Desglose total</p>
                                    <table className="w-full text-[11px]">
                                      <tbody>
                                        <tr><td className="text-slate-500 pr-2">Capital:</td><td className="text-right font-mono">{formatCurrency(item.capital, item.currency)}</td></tr>
                                        <tr><td className="text-slate-500 pr-2">Interés:</td><td className="text-right font-mono">{formatCurrency(item.interest, item.currency)}</td></tr>
                                        <tr><td className="text-red-500 pr-2">Mora:</td><td className="text-right font-mono text-red-600">{formatCurrency(item.mora, item.currency)}</td></tr>
                                        <tr><td className="text-purple-500 pr-2">Prórroga:</td><td className="text-right font-mono text-purple-600">{formatCurrency(item.prorroga, item.currency)}</td></tr>
                                        <tr className="border-t border-slate-200 font-bold">
                                          <td className="text-slate-700 pr-2 pt-1">Total:</td>
                                          <td className="text-right font-mono pt-1">{formatCurrency(item.total, item.currency)}</td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>

                  {/* Totals footer */}
                  {filteredItems.length > 0 && (
                    <tfoot className="bg-slate-100 border-t-2 border-slate-200">
                      <tr>
                        <td className="px-4 py-3 font-bold text-slate-700 text-sm" colSpan={3}>
                          Totales ({filteredItems.length} préstamos)
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-sm font-mono text-slate-700">
                          {formatCurrency(filteredItems.reduce((s, i) => s + i.capital, 0))}
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-sm font-mono text-slate-700">
                          {formatCurrency(filteredItems.reduce((s, i) => s + i.interest, 0))}
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-sm font-mono text-red-600">
                          {formatCurrency(filteredItems.reduce((s, i) => s + i.mora, 0))}
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-sm font-mono text-purple-600">
                          {formatCurrency(filteredItems.reduce((s, i) => s + i.prorroga, 0))}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-base text-blue-700">
                          {formatCurrency(filteredItems.reduce((s, i) => s + i.total, 0))}
                        </td>
                        <td/>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

export default ProjectionPage

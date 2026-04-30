import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePermission } from '@/hooks/usePermission'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { PageLoadingState } from '@/components/ui/Loading'
import EmptyState from '@/components/ui/EmptyState'
import LoanStatusBadge from '@/components/shared/LoanStatusBadge'
import { DollarSign, Plus, Eye, AlertCircle, Upload, Download, X, CheckCircle, XCircle, FileSpreadsheet, Globe } from 'lucide-react'
import { formatCurrency, formatDate, getCurrencySymbol } from '@/lib/utils'
import api, { isAccessDenied } from '@/lib/api'
import toast from 'react-hot-toast'

// ── CSV Import Modal ──────────────────────────────────────────────
const CSV_TEMPLATE_HEADERS = [
  'client_name','client_phone','client_email','client_id_number','client_address',
  'loan_amount','interest_rate','rate_type','loan_type','term_months',
  'payment_frequency','amortization_type','start_date','amount_paid','outstanding_balance',
  'purpose','notes','loan_number','currency','exchange_rate_to_dop'
]
const CSV_TEMPLATE_EXAMPLE = [
  'Juan Pérez García','809-555-0001','juan@email.com','001-0000001-1','Calle Principal #12 Santiago',
  '50000','5','monthly','personal','12',
  'monthly','fixed_installment','2024-01-15','10000','',
  'Capital de trabajo','Migrado desde sistema anterior','PRE-2024-00001','DOP','1'
]
const CSV_TEMPLATE_EXAMPLE2 = [
  'María López Santos','809-444-0002','maria@email.com','001-0000002-2','Los Jardines #5 SDQ',
  '1500','3','monthly','commercial','6',
  'monthly','flat_interest','2024-03-01','0','',
  'Negocio propio','Préstamo en dólares','PRE-2024-00002','USD','58.50'
]
const CSV_FIELD_HELP = [
  { field: 'client_name',         req: true,  desc: 'Nombre completo del cliente (requerido)' },
  { field: 'client_phone',        req: false, desc: 'Teléfono — se usa para identificar cliente existente' },
  { field: 'client_email',        req: false, desc: 'Correo electrónico del cliente' },
  { field: 'client_id_number',    req: false, desc: 'Cédula o pasaporte — se usa para vincular cliente existente' },
  { field: 'client_address',      req: false, desc: 'Dirección del cliente' },
  { field: 'loan_amount',         req: true,  desc: 'Monto original del préstamo en la moneda indicada (ej: 50000 para DOP ó 1500 para USD)' },
  { field: 'interest_rate',       req: true,  desc: 'Tasa de interés en % (ej: 5 = 5%)' },
  { field: 'rate_type',           req: false, desc: 'monthly | daily | annual  (default: monthly)' },
  { field: 'loan_type',           req: false, desc: 'personal | commercial | san | guarantee  (default: personal)' },
  { field: 'term_months',         req: true,  desc: 'Plazo en meses (ej: 12)' },
  { field: 'payment_frequency',   req: false, desc: 'monthly | weekly | biweekly | daily  (default: monthly)' },
  { field: 'amortization_type',   req: false, desc: 'fixed_installment | flat_interest | interest_only  (default: fixed_installment)' },
  { field: 'start_date',          req: true,  desc: 'Fecha de desembolso formato YYYY-MM-DD (ej: 2024-01-15)' },
  { field: 'amount_paid',         req: false, desc: 'Total ya pagado en la misma moneda del préstamo — marca cuotas como pagas automáticamente' },
  { field: 'outstanding_balance', req: false, desc: 'Saldo principal pendiente actual en la moneda del préstamo (deja vacío para calcularlo)' },
  { field: 'purpose',             req: false, desc: 'Propósito del préstamo (ej: Negocio propio)' },
  { field: 'notes',               req: false, desc: 'Notas adicionales internas' },
  { field: 'loan_number',         req: false, desc: 'Número original del préstamo (se genera automáticamente si se omite)' },
  { field: 'currency',            req: false, desc: 'Moneda del préstamo: DOP | USD | EUR | HTG | CAD | GBP  (default: DOP)' },
  { field: 'exchange_rate_to_dop',req: false, desc: 'Tasa de cambio respecto al peso dominicano en la fecha de desembolso (ej: 58.50). Solo requerido si currency ≠ DOP' },
]

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = '' }
    else { cur += ch }
  }
  result.push(cur.trim())
  return result
}

function parseCSV(text: string): Record<string, string>[] {
  // Remove BOM if present
  const clean = text.replace(/^\uFEFF/, '').trim()
  const lines = clean.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/"/g, '').trim())
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line).map(v => v.replace(/"/g, '').trim())
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = values[i] || '' })
    return obj
  })
}

interface ImportResult { row: number; status: 'created' | 'error'; loanNumber?: string; clientName?: string; error?: string }

const LoanImportModal: React.FC<{ onClose: () => void; onImported: () => void }> = ({ onClose, onImported }) => {
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload')
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [results, setResults] = useState<ImportResult[]>([])
  const [summary, setSummary] = useState<{ total: number; created: number; errors: number } | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const downloadTemplate = () => {
    const csvContent = [
      CSV_TEMPLATE_HEADERS.join(','),
      CSV_TEMPLATE_EXAMPLE.join(','),
      CSV_TEMPLATE_EXAMPLE2.join(','),
    ].join('\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'prestamax_plantilla_importacion.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target?.result as string)
      if (!parsed.length) { toast.error('El CSV está vacío o tiene formato incorrecto'); return }
      setRows(parsed)
      setStep('preview')
    }
    reader.readAsText(file)
  }

  const handleImport = async () => {
    setIsImporting(true)
    try {
      const res = await api.post('/loans/bulk-import', { loans: rows })
      setResults(res.data.results || [])
      setSummary(res.data.summary)
      setStep('result')
      if ((res.data.summary?.created || 0) > 0) onImported()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al importar')
    } finally { setIsImporting(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Importar Préstamos desde CSV</h3>
              <p className="text-xs text-slate-400">Migra préstamos existentes de otro sistema a PrestaMax</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="p-5">
          {/* Step: Upload */}
          {step === 'upload' && (
            <div className="space-y-5">
              {/* Step 1: Download template */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="font-semibold text-blue-800 mb-1">Paso 1 — Descarga la plantilla</p>
                <p className="text-sm text-blue-600 mb-3">Usa nuestra plantilla CSV con el formato correcto. Puedes editarla en Excel, Google Sheets o cualquier hoja de cálculo.</p>
                <button onClick={downloadTemplate} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium">
                  <Download className="w-4 h-4" />Descargar plantilla.csv
                </button>
              </div>

              {/* Field reference */}
              <div>
                <button onClick={() => setShowHelp(h => !h)} className="text-sm text-blue-600 hover:underline mb-2 block">
                  {showHelp ? '▼' : '▶'} Ver descripción de columnas
                </button>
                {showHelp && (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50"><tr>
                        <th className="text-left p-2 font-semibold text-slate-600">Columna</th>
                        <th className="text-left p-2 font-semibold text-slate-600">Req.</th>
                        <th className="text-left p-2 font-semibold text-slate-600">Descripción</th>
                      </tr></thead>
                      <tbody>{CSV_FIELD_HELP.map(f => (
                        <tr key={f.field} className="border-t border-slate-100">
                          <td className="p-2 font-mono text-blue-700">{f.field}</td>
                          <td className="p-2">{f.req ? <span className="text-red-500 font-bold">Sí</span> : <span className="text-slate-400">No</span>}</td>
                          <td className="p-2 text-slate-600">{f.desc}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Step 2: Upload */}
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
                <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="font-semibold text-slate-700 mb-1">Paso 2 — Sube tu archivo CSV</p>
                <p className="text-sm text-slate-400 mb-4">Acepta archivos .csv con los datos de tus préstamos actuales</p>
                <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1e3a5f] hover:bg-[#2a4d7a] text-white text-sm rounded-xl font-medium cursor-pointer">
                  <Upload className="w-4 h-4" />Seleccionar archivo CSV
                  <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
                </label>
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-700">
                <strong>Importante:</strong> Si el cliente ya existe en el sistema (mismo teléfono o cédula), se vinculará el préstamo a ese cliente. De lo contrario, se creará un cliente nuevo.
              </div>
            </div>
          )}

          {/* Step: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-800">Vista previa — {rows.length} registro{rows.length !== 1 ? 's' : ''} encontrado{rows.length !== 1 ? 's' : ''}</p>
                <button onClick={() => setStep('upload')} className="text-sm text-blue-600 hover:underline">← Cargar otro archivo</button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-80">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0"><tr>
                    <th className="p-2 text-left text-slate-600 font-semibold">#</th>
                    <th className="p-2 text-left text-slate-600 font-semibold">Cliente</th>
                    <th className="p-2 text-left text-slate-600 font-semibold">Moneda</th>
                    <th className="p-2 text-left text-slate-600 font-semibold">Monto</th>
                    <th className="p-2 text-left text-slate-600 font-semibold">Tasa</th>
                    <th className="p-2 text-left text-slate-600 font-semibold">Plazo</th>
                    <th className="p-2 text-left text-slate-600 font-semibold">Inicio</th>
                    <th className="p-2 text-left text-slate-600 font-semibold">Ya pagado</th>
                  </tr></thead>
                  <tbody>{rows.map((row, i) => {
                    const cur = (row.currency || 'DOP').toUpperCase()
                    const sym = cur === 'DOP' ? 'RD$' : cur === 'USD' ? 'US$' : cur === 'EUR' ? '€' : `${cur} `
                    return (
                    <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="p-2 text-slate-400">{i+1}</td>
                      <td className="p-2 font-medium text-slate-800">{row.client_name || <span className="text-red-500">—</span>}</td>
                      <td className="p-2">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${cur === 'DOP' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{cur}</span>
                        {cur !== 'DOP' && row.exchange_rate_to_dop && <span className="text-slate-400 ml-1 text-xs">@{row.exchange_rate_to_dop}</span>}
                      </td>
                      <td className="p-2 text-slate-700">{row.loan_amount ? `${sym}${parseFloat(row.loan_amount).toLocaleString()}` : '—'}</td>
                      <td className="p-2 text-slate-700">{row.interest_rate ? `${row.interest_rate}%` : '—'}</td>
                      <td className="p-2 text-slate-700">{row.term_months ? `${row.term_months}m` : '—'}</td>
                      <td className="p-2 text-slate-700">{row.start_date || '—'}</td>
                      <td className="p-2 text-slate-700">{row.amount_paid ? `${sym}${parseFloat(row.amount_paid).toLocaleString()}` : '—'}</td>
                    </tr>
                    )
                  })}</tbody>
                </table>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleImport} disabled={isImporting}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                  {isImporting ? <><span className="animate-spin">⏳</span>Importando...</> : <><Upload className="w-4 h-4" />Importar {rows.length} préstamo{rows.length !== 1 ? 's' : ''}</>}
                </button>
                <button onClick={onClose} className="px-5 py-3 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">Cancelar</button>
              </div>
            </div>
          )}

          {/* Step: Result */}
          {step === 'result' && summary && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-4 bg-slate-50 rounded-xl">
                  <p className="text-2xl font-bold text-slate-700">{summary.total}</p>
                  <p className="text-xs text-slate-400 mt-1">Total procesados</p>
                </div>
                <div className="text-center p-4 bg-emerald-50 rounded-xl">
                  <p className="text-2xl font-bold text-emerald-700">{summary.created}</p>
                  <p className="text-xs text-emerald-500 mt-1">Importados ✓</p>
                </div>
                <div className={`text-center p-4 rounded-xl ${summary.errors > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                  <p className={`text-2xl font-bold ${summary.errors > 0 ? 'text-red-700' : 'text-slate-400'}`}>{summary.errors}</p>
                  <p className={`text-xs mt-1 ${summary.errors > 0 ? 'text-red-500' : 'text-slate-400'}`}>Con errores</p>
                </div>
              </div>
              {/* Details */}
              <div className="overflow-y-auto max-h-64 space-y-1.5">
                {results.map((r, i) => (
                  <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg text-sm ${r.status === 'created' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    {r.status === 'created' ? <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" /> : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                    <span className="flex-1">
                      <span className="font-medium">{r.clientName || `Fila ${r.row}`}</span>
                      {r.loanNumber && <span className="text-slate-400 ml-2">({r.loanNumber})</span>}
                      {r.error && <span className="text-red-600 ml-2">— {r.error}</span>}
                    </span>
                  </div>
                ))}
              </div>
              <button onClick={onClose} className="w-full py-3 bg-[#1e3a5f] hover:bg-[#2a4d7a] text-white rounded-xl font-semibold">
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface LoanRow {
  id: string
  loanNumber: string
  clientName: string
  clientPhone: string
  approvedAmount: number
  disbursedAmount: number
  requestedAmount: number
  rate: number
  rateType: string
  term: number
  termUnit: string
  status: string
  disbursementDate: string | null
  maturityDate: string | null
  totalBalance: number
  moraBalance: number
  daysOverdue: number
  productName: string
  currency?: string
  exchangeRateToDop?: number
}

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'active', label: 'Activo' },
  { value: 'in_mora', label: 'En Mora' },
  { value: 'approved', label: 'Aprobado' },
  { value: 'liquidated', label: 'Liquidado' },
  { value: 'written_off', label: 'Incobrable' },
  { value: 'voided', label: 'Anulado' },
  { value: 'rejected', label: 'Rechazado' },
  { value: 'draft', label: 'Borrador' },
]

type SortKey = 'loanNumber' | 'clientName' | 'disbursedAmount' | 'totalBalance' | 'rate' | 'term' | 'status' | 'daysOverdue'

const LoansPage: React.FC = () => {
  const navigate = useNavigate()
  const { can } = usePermission()
  const [loans, setLoans] = useState<LoanRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('loanNumber')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showImport, setShowImport] = useState(false)

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const SortIcon: React.FC<{ col: SortKey }> = ({ col }) => (
    <span className="ml-1 inline-block opacity-50">
      {sortKey === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  )

  useEffect(() => {
    const fetchLoans = async () => {
      try {
        const params = new URLSearchParams()
        if (statusFilter) params.append('status', statusFilter)
        const res = await api.get(`/loans?${params.toString()}`)
        setLoans(res.data.data || [])
      } catch (err) {
        if (!isAccessDenied(err)) toast.error('Error al cargar préstamos')
      } finally {
        setIsLoading(false)
      }
    }
    fetchLoans()
  }, [statusFilter])

  if (isLoading) return <PageLoadingState />

  const filtered = loans
    .filter((loan) =>
      loan.loanNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (loan.clientName || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      const aVal = a[sortKey] ?? ''
      const bVal = b[sortKey] ?? ''
      const cmp = typeof aVal === 'number' && typeof bVal === 'number'
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal), 'es')
      return sortDir === 'asc' ? cmp : -cmp
    })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="page-title">Préstamos</h1>
          <p className="text-slate-600 text-sm mt-1">Gestiona tu cartera de préstamos</p>
        </div>
        <div className="flex gap-2">
          {can('loans.import') && (
            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors">
              <Upload className="w-4 h-4" />
              Importar CSV
            </button>
          )}
          {can('loans.create') && (
            <Button onClick={() => navigate('/loans/new')} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Nuevo Préstamo
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            type="text"
            placeholder="Buscar por número o cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </Card>

      {/* Loans Table */}
      {filtered.length > 0 ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  {([
                    { key: 'loanNumber', label: 'Préstamo', align: 'left' },
                    { key: 'clientName', label: 'Cliente', align: 'left' },
                    { key: 'disbursedAmount', label: 'Monto', align: 'right' },
                    { key: 'rate', label: 'Tasa', align: 'left' },
                    { key: 'term', label: 'Plazo', align: 'left' },
                    { key: 'totalBalance', label: 'Saldo', align: 'right' },
                    { key: 'status', label: 'Estado', align: 'center' },
                  ] as { key: SortKey; label: string; align: string }[]).map(col => (
                    <th key={col.key}
                      className={`text-${col.align} py-3 px-4 font-semibold text-slate-700 cursor-pointer hover:bg-slate-50 select-none`}
                      onClick={() => handleSort(col.key)}>
                      {col.label}<SortIcon col={col.key}/>
                    </th>
                  ))}
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((loan) => (
                  <tr
                    key={loan.id}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => navigate(`/loans/${loan.id}`)}
                  >
                    <td className="py-3 px-4 font-mono font-medium text-blue-700">
                      {loan.loanNumber}
                      {loan.daysOverdue > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 text-red-500 font-sans text-xs">
                          <AlertCircle className="w-3 h-3" />
                          {loan.daysOverdue}d
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900">{loan.clientName}</p>
                      <p className="text-slate-500 text-xs">{loan.productName}</p>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold">
                      {formatCurrency(loan.disbursedAmount || loan.approvedAmount || loan.requestedAmount, loan.currency || 'DOP')}
                      {loan.currency && loan.currency !== 'DOP' && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-100 rounded px-1 py-0.5">
                          <Globe className="w-2.5 h-2.5" />{loan.currency}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {loan.rate}% {loan.rateType === 'monthly' ? 'mens.' : 'anual'}
                    </td>
                    <td className="py-3 px-4">
                      {loan.term} {loan.termUnit === 'months' ? 'meses' : 'sem.'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={loan.moraBalance > 0 ? 'text-red-600 font-semibold' : 'font-medium'}>
                        {formatCurrency(loan.totalBalance, loan.currency || 'DOP')}
                      </span>
                      {loan.moraBalance > 0 && (
                        <p className="text-xs text-red-500">mora: {formatCurrency(loan.moraBalance, loan.currency || 'DOP')}</p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <LoanStatusBadge status={loan.status as any} />
                    </td>
                    <td className="py-3 px-4 text-center" onClick={(e) => { e.stopPropagation(); navigate(`/loans/${loan.id}`) }}>
                      <button className="p-1 hover:bg-blue-100 rounded transition-colors text-blue-600">
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-200 text-sm text-slate-500">
            Mostrando {filtered.length} de {loans.length} préstamos
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={DollarSign}
          title="Sin préstamos"
          description={searchTerm || statusFilter ? 'No hay préstamos que coincidan con tu búsqueda' : 'Comienza creando tu primer préstamo'}
          action={{ label: 'Nuevo Préstamo', onClick: () => navigate('/loans/new') }}
        />
      )}

      {/* Import Modal */}
      {showImport && (
        <LoanImportModal
          onClose={() => setShowImport(false)}
          onImported={() => {
            setIsLoading(true)
            api.get('/loans').then(res => setLoans(res.data.data || [])).finally(() => setIsLoading(false))
          }}
        />
      )}
    </div>
  )
}

export default LoansPage

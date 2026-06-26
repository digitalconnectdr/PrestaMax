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
import api, { isAccessDenied, isSubscriptionExpired } from '@/lib/api'
import toast from 'react-hot-toast'
import { useT } from '@/lib/i18n'

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
// descKey -> clave i18n (imp.f.*). El nombre de columna (field) es el header
// literal del CSV y NO se traduce.
const CSV_FIELD_HELP = [
  { field: 'client_name',         req: true,  descKey: 'imp.f.client_name' },
  { field: 'client_phone',        req: false, descKey: 'imp.f.client_phone' },
  { field: 'client_email',        req: false, descKey: 'imp.f.client_email' },
  { field: 'client_id_number',    req: false, descKey: 'imp.f.client_id_number' },
  { field: 'client_address',      req: false, descKey: 'imp.f.client_address' },
  { field: 'loan_amount',         req: true,  descKey: 'imp.f.loan_amount' },
  { field: 'interest_rate',       req: true,  descKey: 'imp.f.interest_rate' },
  { field: 'rate_type',           req: false, descKey: 'imp.f.rate_type' },
  { field: 'loan_type',           req: false, descKey: 'imp.f.loan_type' },
  { field: 'term_months',         req: true,  descKey: 'imp.f.term_months' },
  { field: 'payment_frequency',   req: false, descKey: 'imp.f.payment_frequency' },
  { field: 'amortization_type',   req: false, descKey: 'imp.f.amortization_type' },
  { field: 'start_date',          req: true,  descKey: 'imp.f.start_date' },
  { field: 'amount_paid',         req: false, descKey: 'imp.f.amount_paid' },
  { field: 'outstanding_balance', req: false, descKey: 'imp.f.outstanding_balance' },
  { field: 'purpose',             req: false, descKey: 'imp.f.purpose' },
  { field: 'notes',               req: false, descKey: 'imp.f.notes' },
  { field: 'loan_number',         req: false, descKey: 'imp.f.loan_number' },
  { field: 'currency',            req: false, descKey: 'imp.f.currency' },
  { field: 'exchange_rate_to_dop',req: false, descKey: 'imp.f.exchange_rate' },
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
  const t = useT()
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
    const a = document.createElement('a'); a.href = url; a.download = 'credytek_plantilla_importacion.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target?.result as string)
      if (!parsed.length) { toast.error(t('imp.empty_csv')); return }
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
      toast.error(err?.response?.data?.error || t('imp.import_error'))
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
              <h3 className="font-bold text-slate-900">{t('imp.title')}</h3>
              <p className="text-xs text-slate-400">{t('imp.subtitle')}</p>
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
                <p className="font-semibold text-blue-800 mb-1">{t('imp.step1_title')}</p>
                <p className="text-sm text-blue-600 mb-3">{t('imp.step1_desc')}</p>
                <button onClick={downloadTemplate} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium">
                  <Download className="w-4 h-4" />{t('imp.download_template')}
                </button>
              </div>

              {/* Field reference */}
              <div>
                <button onClick={() => setShowHelp(h => !h)} className="text-sm text-blue-600 hover:underline mb-2 block">
                  {showHelp ? '▼' : '▶'} {t('imp.see_columns')}
                </button>
                {showHelp && (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50"><tr>
                        <th className="text-left p-2 font-semibold text-slate-600">{t('imp.col_column')}</th>
                        <th className="text-left p-2 font-semibold text-slate-600">{t('imp.col_req')}</th>
                        <th className="text-left p-2 font-semibold text-slate-600">{t('imp.col_desc')}</th>
                      </tr></thead>
                      <tbody>{CSV_FIELD_HELP.map(f => (
                        <tr key={f.field} className="border-t border-slate-100">
                          <td className="p-2 font-mono text-blue-700">{f.field}</td>
                          <td className="p-2">{f.req ? <span className="text-red-500 font-bold">{t('imp.yes')}</span> : <span className="text-slate-400">{t('imp.no')}</span>}</td>
                          <td className="p-2 text-slate-600">{t(f.descKey)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Step 2: Upload */}
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
                <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="font-semibold text-slate-700 mb-1">{t('imp.step2_title')}</p>
                <p className="text-sm text-slate-400 mb-4">{t('imp.step2_desc')}</p>
                <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1e3a5f] hover:bg-[#2a4d7a] text-white text-sm rounded-xl font-medium cursor-pointer">
                  <Upload className="w-4 h-4" />{t('imp.select_file')}
                  <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
                </label>
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-700">
                <strong>{t('imp.important')}</strong> {t('imp.important_desc')}
              </div>
            </div>
          )}

          {/* Step: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-800">{t('imp.preview_n').replace('{n}', String(rows.length))}</p>
                <button onClick={() => setStep('upload')} className="text-sm text-blue-600 hover:underline">{t('imp.load_another')}</button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-80">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0"><tr>
                    <th className="p-2 text-left text-slate-600 font-semibold">#</th>
                    <th className="p-2 text-left text-slate-600 font-semibold">{t('col.client')}</th>
                    <th className="p-2 text-left text-slate-600 font-semibold">{t('col.currency')}</th>
                    <th className="p-2 text-left text-slate-600 font-semibold">{t('col.amount')}</th>
                    <th className="p-2 text-left text-slate-600 font-semibold">{t('col.rate')}</th>
                    <th className="p-2 text-left text-slate-600 font-semibold">{t('col.term')}</th>
                    <th className="p-2 text-left text-slate-600 font-semibold">{t('imp.start')}</th>
                    <th className="p-2 text-left text-slate-600 font-semibold">{t('imp.paid')}</th>
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
                  {isImporting ? <><span className="animate-spin">⏳</span>{t('imp.importing')}</> : <><Upload className="w-4 h-4" />{t('imp.import_n').replace('{n}', String(rows.length))}</>}
                </button>
                <button onClick={onClose} className="px-5 py-3 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">{t('common.cancel')}</button>
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
                  <p className="text-xs text-slate-400 mt-1">{t('imp.total_processed')}</p>
                </div>
                <div className="text-center p-4 bg-emerald-50 rounded-xl">
                  <p className="text-2xl font-bold text-emerald-700">{summary.created}</p>
                  <p className="text-xs text-emerald-500 mt-1">{t('imp.imported_ok')}</p>
                </div>
                <div className={`text-center p-4 rounded-xl ${summary.errors > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                  <p className={`text-2xl font-bold ${summary.errors > 0 ? 'text-red-700' : 'text-slate-400'}`}>{summary.errors}</p>
                  <p className={`text-xs mt-1 ${summary.errors > 0 ? 'text-red-500' : 'text-slate-400'}`}>{t('imp.with_errors')}</p>
                </div>
              </div>
              {/* Details */}
              <div className="overflow-y-auto max-h-64 space-y-1.5">
                {results.map((r, i) => (
                  <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg text-sm ${r.status === 'created' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    {r.status === 'created' ? <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" /> : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                    <span className="flex-1">
                      <span className="font-medium">{r.clientName || t('imp.row').replace('{n}', String(r.row))}</span>
                      {r.loanNumber && <span className="text-slate-400 ml-2">({r.loanNumber})</span>}
                      {r.error && <span className="text-red-600 ml-2">— {r.error}</span>}
                    </span>
                  </div>
                ))}
              </div>
              <button onClick={onClose} className="w-full py-3 bg-[#1e3a5f] hover:bg-[#2a4d7a] text-white rounded-xl font-semibold">
                {t('common.close')}
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
  { value: '', key: 'common.all' },
  { value: 'active', key: 'status.active' },
  { value: 'in_mora', key: 'status.in_mora' },
  { value: 'approved', key: 'status.approved' },
  { value: 'liquidated', key: 'status.liquidated' },
  { value: 'written_off', key: 'status.written_off' },
  { value: 'voided', key: 'status.voided' },
  { value: 'rejected', key: 'status.rejected' },
  { value: 'draft', key: 'status.draft' },
]

type SortKey = 'loanNumber' | 'clientName' | 'disbursedAmount' | 'totalBalance' | 'rate' | 'term' | 'status' | 'daysOverdue'

const LoansPage: React.FC = () => {
  const navigate = useNavigate()
  const { can } = usePermission()
  const t = useT()
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
        if (!isAccessDenied(err) && !isSubscriptionExpired(err)) toast.error(t('loan.load_error'))
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
          <h1 className="page-title">{t('nav.loans')}</h1>
          <p className="text-slate-600 text-sm mt-1">{t('loan.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          {can('loans.import') && (
            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors">
              <Upload className="w-4 h-4" />
              {t('loan.import_csv')}
            </button>
          )}
          {can('loans.create') && (
            <Button onClick={() => navigate('/loans/new')} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              {t('dash.quick.new_loan')}
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            type="text"
            placeholder={t('loan.search_ph')}
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
              <option key={opt.value} value={opt.value}>{t(opt.key)}</option>
            ))}
          </select>
        </div>
      </Card>

      {/* Loans Table */}
      {filtered.length > 0 ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-slate-200">
                  {([
                    { key: 'loanNumber', label: t('col.loan'), align: 'left' },
                    { key: 'clientName', label: t('col.client'), align: 'left' },
                    { key: 'disbursedAmount', label: t('col.amount'), align: 'right' },
                    { key: 'rate', label: t('col.rate'), align: 'left' },
                    { key: 'term', label: t('col.term'), align: 'left' },
                    { key: 'totalBalance', label: t('col.balance'), align: 'right' },
                    { key: 'status', label: t('col.status'), align: 'center' },
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
                      {loan.rate}% {loan.rateType === 'monthly' ? t('loan.rate_monthly') : t('loan.rate_annual')}
                    </td>
                    <td className="py-3 px-4">
                      {loan.term} {
                        loan.termUnit === 'months'   ? t('loan.unit.months') :
                        loan.termUnit === 'biweekly' ? t('loan.unit.biweekly') :
                        loan.termUnit === 'weeks'    ? t('loan.unit.weeks') :
                        loan.termUnit === 'days'     ? t('loan.unit.days') :
                        loan.termUnit === 'years'    ? t('loan.unit.years') :
                        loan.termUnit
                      }
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={loan.moraBalance > 0 ? 'text-red-600 font-semibold' : 'font-medium'}>
                        {formatCurrency(loan.totalBalance, loan.currency || 'DOP')}
                      </span>
                      {loan.moraBalance > 0 && (
                        <p className="text-xs text-red-500">{t('loan.mora_label')}: {formatCurrency(loan.moraBalance, loan.currency || 'DOP')}</p>
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
            {t('loan.showing').replace('{n}', String(filtered.length)).replace('{m}', String(loans.length))}
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={DollarSign}
          title={t('loan.empty_title')}
          description={searchTerm || statusFilter ? t('loan.empty_filtered') : t('loan.empty_start')}
          action={{ label: t('dash.quick.new_loan'), onClick: () => navigate('/loans/new') }}
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

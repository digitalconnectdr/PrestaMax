import React, { useState, useEffect } from 'react'
import { usePermission } from '@/hooks/usePermission'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { PageLoadingState } from '@/components/ui/Loading'
import EmptyState from '@/components/ui/EmptyState'
import { ReceiptText, Printer, FileDown, FileText } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { downloadCSV, printToPDF, fmtCurrencyRaw, fmtDateRaw } from '@/lib/exportUtils'
import api, { isAccessDenied } from '@/lib/api'
import toast from 'react-hot-toast'

interface Receipt {
  id: string
  receiptNumber: string
  issuedAt: string
  clientName: string
  loanNumber: string
  amount: number
  isReprinted: boolean
  isVoided: boolean
  issuedByName: string
  registeredByName: string
  paymentMethod: string
  paymentDate: string
}

type SortKey = 'receiptNumber' | 'issuedAt' | 'clientName' | 'loanNumber' | 'amount' | 'paymentMethod' | 'registeredByName'

const PaymentMethodLabel: Record<string, string> = { cash: 'Efectivo', transfer: 'Transferencia', check: 'Cheque' }

const ReceiptsPage: React.FC = () => {
  const { can } = usePermission()
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [reprintingId, setReprintingId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('issuedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const SortIcon: React.FC<{ col: SortKey }> = ({ col }) => (
    <span className="ml-1 inline-block opacity-50">
      {sortKey === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  )

  const fetchReceipts = async () => {
    try {
      const res = await api.get('/receipts?limit=200')
      setReceipts(res.data.data || [])
    } catch (err) {
      if (!isAccessDenied(err)) toast.error('Error al cargar recibos')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchReceipts() }, [])

  const handleReprint = async (receipt: Receipt) => {
    if (!confirm(`¿Reimprimir recibo ${receipt.receiptNumber}?`)) return
    try {
      setReprintingId(receipt.id)
      await api.post(`/receipts/${receipt.id}/reprint`, {})
      toast.success(`Recibo ${receipt.receiptNumber} marcado como reimpreso`)
      fetchReceipts()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al reimprimir')
    } finally {
      setReprintingId(null)
    }
  }

  if (isLoading) return <PageLoadingState />

  const filtered = receipts
    .filter(r =>
      (r.receiptNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.clientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.loanNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      const aVal = a[sortKey] ?? ''
      const bVal = b[sortKey] ?? ''
      const cmp = typeof aVal === 'number' && typeof bVal === 'number'
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal), 'es')
      return sortDir === 'asc' ? cmp : -cmp
    })

  const totalAmount = filtered.reduce((s, r) => s + r.amount, 0)

  // ── Export helpers ──────────────────────────────────────────────────────────
  const EXPORT_HEADERS = [
    { key: 'receiptNumber',    label: 'Número Recibo' },
    { key: 'issuedAtFmt',      label: 'Fecha Emisión' },
    { key: 'clientName',       label: 'Cliente' },
    { key: 'loanNumber',       label: 'Préstamo' },
    { key: 'amountFmt',        label: 'Monto (DOP)' },
    { key: 'paymentMethodLabel',label: 'Método de Pago' },
    { key: 'registeredByName', label: 'Registrado por' },
    { key: 'statusLabel',      label: 'Estado' },
  ]
  const exportRows = filtered.map(r => ({
    receiptNumber:      r.receiptNumber,
    issuedAtFmt:        fmtDateRaw(r.issuedAt || r.paymentDate),
    clientName:         r.clientName,
    loanNumber:         r.loanNumber,
    amountFmt:          fmtCurrencyRaw(r.amount),
    paymentMethodLabel: PaymentMethodLabel[r.paymentMethod] || r.paymentMethod || '',
    registeredByName:   r.registeredByName || r.issuedByName || '',
    statusLabel:        r.isVoided ? 'Anulado' : r.isReprinted ? 'Reimpreso' : 'Original',
  }))
  const exportFilename = `recibos_${new Date().toISOString().slice(0,10)}`

  const handleExportCSV = () => {
    if (!filtered.length) { toast.error('No hay datos para exportar'); return }
    downloadCSV(exportFilename, EXPORT_HEADERS, exportRows)
    toast.success('CSV descargado')
  }

  const handleExportPDF = () => {
    if (!filtered.length) { toast.error('No hay datos para exportar'); return }
    printToPDF({
      title: 'Recibos Emitidos',
      subtitle: `${filtered.length} recibo(s) · Total: ${fmtCurrencyRaw(totalAmount)}`,
      headers: [
        { key: 'receiptNumber',    label: 'Número',   align: 'left' },
        { key: 'issuedAtFmt',      label: 'Fecha',    align: 'left' },
        { key: 'clientName',       label: 'Cliente',  align: 'left' },
        { key: 'loanNumber',       label: 'Préstamo', align: 'left' },
        { key: 'amountFmt',        label: 'Monto',    align: 'right' },
        { key: 'paymentMethodLabel',label: 'Método',  align: 'left' },
        { key: 'registeredByName', label: 'Por',      align: 'left' },
        { key: 'statusLabel',      label: 'Estado',   align: 'center' },
      ],
      rows: exportRows,
      summary: [
        { label: 'Total recibos', value: String(filtered.length) },
        { label: 'Monto total',   value: fmtCurrencyRaw(totalAmount) },
      ],
    })
  }

  const COLS: { key: SortKey; label: string; align: string }[] = [
    { key: 'receiptNumber', label: 'Número', align: 'left' },
    { key: 'issuedAt', label: 'Fecha', align: 'left' },
    { key: 'clientName', label: 'Cliente', align: 'left' },
    { key: 'loanNumber', label: 'Préstamo', align: 'left' },
    { key: 'amount', label: 'Monto', align: 'right' },
    { key: 'paymentMethod', label: 'Método', align: 'left' },
    { key: 'registeredByName', label: 'Registrado por', align: 'left' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Recibos</h1>
          <p className="text-slate-600 text-sm mt-1">Histórico de recibos emitidos · Total: <strong>{formatCurrency(totalAmount)}</strong> ({filtered.length} recibos)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="flex items-center gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50">
            <FileDown className="w-4 h-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="flex items-center gap-1.5 text-blue-700 border-blue-300 hover:bg-blue-50">
            <FileText className="w-4 h-4" /> PDF
          </Button>
        </div>
      </div>

      <Card>
        <Input type="text" placeholder="Buscar por número de recibo, cliente o préstamo..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </Card>

      {filtered.length > 0 ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  {COLS.map(col => (
                    <th key={col.key}
                      className={`text-${col.align} py-3 px-4 font-semibold text-slate-700 cursor-pointer hover:bg-slate-50 select-none whitespace-nowrap`}
                      onClick={() => handleSort(col.key)}>
                      {col.label}<SortIcon col={col.key}/>
                    </th>
                  ))}
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Estado</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Reimprimir</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(receipt => (
                  <tr key={receipt.id} className={`border-b border-slate-100 hover:bg-slate-50 ${receipt.isVoided ? 'opacity-60' : ''}`}>
                    <td className="py-3 px-4 font-mono text-xs font-medium text-blue-700">{receipt.receiptNumber}</td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{formatDate(receipt.issuedAt || receipt.paymentDate)}</td>
                    <td className="py-3 px-4 font-medium">{receipt.clientName}</td>
                    <td className="py-3 px-4 font-mono text-xs">{receipt.loanNumber}</td>
                    <td className={`py-3 px-4 text-right font-semibold ${receipt.isVoided ? 'line-through text-slate-400' : 'text-green-700'}`}>{formatCurrency(receipt.amount)}</td>
                    <td className="py-3 px-4 text-xs">{PaymentMethodLabel[receipt.paymentMethod] || receipt.paymentMethod || '—'}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{receipt.registeredByName || receipt.issuedByName || '—'}</td>
                    <td className="py-3 px-4 text-center">
                      {receipt.isVoided ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">Anulado</span>
                      ) : receipt.isReprinted ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Reimpreso</span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Original</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {can('receipts.reprint') && !receipt.isVoided && (
                        <button
                          onClick={() => handleReprint(receipt)}
                          disabled={reprintingId === receipt.id}
                          className="p-1.5 hover:bg-blue-50 rounded text-blue-600 transition-colors disabled:opacity-50"
                          title="Reimprimir recibo">
                          <Printer className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState icon={ReceiptText} title="Sin recibos" description={searchTerm ? 'No coincide con tu búsqueda' : 'Los recibos emitidos aparecerán aquí'} />
      )}
    </div>
  )
}

export default ReceiptsPage

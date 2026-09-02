import React, { useState, useEffect } from 'react'
import { usePermission } from '@/hooks/usePermission'
import { useConfirm } from '@/hooks/useConfirm'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { PageLoadingState } from '@/components/ui/Loading'
import EmptyState from '@/components/ui/EmptyState'
import { ReceiptText, Printer, FileDown, FileText } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { downloadCSV, printToPDF, fmtCurrencyRaw, fmtDateRaw } from '@/lib/exportUtils'
import api, { isAccessDenied, isSubscriptionExpired } from '@/lib/api'
import toast from 'react-hot-toast'
import { useT, t as tg } from '@/lib/i18n'

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

const paymentMethodLabel = (m: string): string => tg('method.' + m, m)

const ReceiptsPage: React.FC = () => {
  const t = useT()
  const { can } = usePermission()
  const { confirm, ConfirmHost } = useConfirm()
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
      if (!isAccessDenied(err) && !isSubscriptionExpired(err)) toast.error(t('rec.load_error'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchReceipts() }, [])

  const handleReprint = async (receipt: Receipt) => {
    const ok_ = await confirm({ title: t('common.confirm'), message: t('rec.reprint_confirm_msg').replace('{n}', receipt.receiptNumber), variant: 'warning' })
    if (!ok_) return
    try {
      setReprintingId(receipt.id)
      await api.post(`/receipts/${receipt.id}/reprint`, {})
      toast.success(t('rec.reprint_success').replace('{n}', receipt.receiptNumber))
      fetchReceipts()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('rec.reprint_error'))
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
    { key: 'receiptNumber',    label: t('rec.h_number') },
    { key: 'issuedAtFmt',      label: t('rec.h_date') },
    { key: 'clientName',       label: t('rec.h_client') },
    { key: 'loanNumber',       label: t('rec.h_loan') },
    { key: 'amountFmt',        label: t('rec.h_amount_dop') },
    { key: 'paymentMethodLabel',label: t('rec.h_method') },
    { key: 'registeredByName', label: t('rec.h_registered_by') },
    { key: 'statusLabel',      label: t('col.status') },
  ]
  const exportRows = filtered.map(r => ({
    receiptNumber:      r.receiptNumber,
    issuedAtFmt:        fmtDateRaw(r.issuedAt || r.paymentDate),
    clientName:         r.clientName,
    loanNumber:         r.loanNumber,
    amountFmt:          fmtCurrencyRaw(r.amount),
    paymentMethodLabel: r.paymentMethod ? paymentMethodLabel(r.paymentMethod) : '',
    registeredByName:   r.registeredByName || r.issuedByName || '',
    statusLabel:        r.isVoided ? t('rec.status_voided') : r.isReprinted ? t('rec.status_reprinted') : t('rec.status_original'),
  }))
  const exportFilename = `recibos_${new Date().toISOString().slice(0,10)}`

  const handleExportCSV = () => {
    if (!filtered.length) { toast.error(t('rec.no_data_export')); return }
    downloadCSV(exportFilename, EXPORT_HEADERS, exportRows)
    toast.success(t('rec.csv_downloaded'))
  }

  const handleExportPDF = () => {
    if (!filtered.length) { toast.error(t('rec.no_data_export')); return }
    printToPDF({
      title: t('rec.pdf_title'),
      subtitle: t('rec.pdf_subtitle').replace('{n}', String(filtered.length)).replace('{m}', fmtCurrencyRaw(totalAmount)),
      headers: [
        { key: 'receiptNumber',    label: t('rec.ph_number'), align: 'left' },
        { key: 'issuedAtFmt',      label: t('rec.ph_date'),   align: 'left' },
        { key: 'clientName',       label: t('rec.ph_client'), align: 'left' },
        { key: 'loanNumber',       label: t('rec.ph_loan'),   align: 'left' },
        { key: 'amountFmt',        label: t('rec.ph_amount'), align: 'right' },
        { key: 'paymentMethodLabel',label: t('rec.ph_method'),align: 'left' },
        { key: 'registeredByName', label: t('rec.ph_by'),     align: 'left' },
        { key: 'statusLabel',      label: t('col.status'),    align: 'center' },
      ],
      rows: exportRows,
      summary: [
        { label: t('rec.sum_total_receipts'), value: String(filtered.length) },
        { label: t('rec.sum_total_amount'),   value: fmtCurrencyRaw(totalAmount) },
      ],
    })
  }

  const COLS: { key: SortKey; label: string; align: string }[] = [
    { key: 'receiptNumber', label: t('rec.ph_number'), align: 'left' },
    { key: 'issuedAt', label: t('rec.ph_date'), align: 'left' },
    { key: 'clientName', label: t('rec.ph_client'), align: 'left' },
    { key: 'loanNumber', label: t('rec.ph_loan'), align: 'left' },
    { key: 'amount', label: t('rec.ph_amount'), align: 'right' },
    { key: 'paymentMethod', label: t('rec.ph_method'), align: 'left' },
    { key: 'registeredByName', label: t('rec.h_registered_by'), align: 'left' },
  ]

  return (
    <div className="space-y-6">
      <ConfirmHost />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">{t('rec.title')}</h1>
          <p className="text-slate-600 text-sm mt-1">{t('rec.subtitle_prefix')} <strong>{formatCurrency(totalAmount)}</strong> {t('rec.subtitle_suffix').replace('{n}', String(filtered.length))}</p>
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
        <Input type="text" placeholder={t('rec.search_ph')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
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
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">{t('col.status')}</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">{t('rec.col_reprint')}</th>
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
                    <td className="py-3 px-4 text-xs">{receipt.paymentMethod ? paymentMethodLabel(receipt.paymentMethod) : '—'}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{receipt.registeredByName || receipt.issuedByName || '—'}</td>
                    <td className="py-3 px-4 text-center">
                      {receipt.isVoided ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">{t('rec.status_voided')}</span>
                      ) : receipt.isReprinted ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">{t('rec.status_reprinted')}</span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">{t('rec.status_original')}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {can('receipts.reprint') && !receipt.isVoided && (
                        <button
                          onClick={() => handleReprint(receipt)}
                          disabled={reprintingId === receipt.id}
                          className="p-1.5 hover:bg-blue-50 rounded text-blue-600 transition-colors disabled:opacity-50"
                          title={t('rec.reprint_tooltip')}>
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
        <EmptyState icon={ReceiptText} title={t('rec.empty_title')} description={searchTerm ? t('rec.empty_no_match') : t('rec.empty_hint')} />
      )}
    </div>
  )
}

export default ReceiptsPage

// AccountingExportPage — exportar contabilidad mensual a CSV
import React, { useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { FileSpreadsheet, Calendar, Download, BookOpen, Banknote, TrendingUp } from 'lucide-react'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import { useT, getLocale } from '@/lib/i18n'

const firstOfMonth = (): string => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
const lastOfMonth = (): string => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}

const AccountingExportPage: React.FC = () => {
  const t = useT()
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(lastOfMonth())
  const [downloading, setDownloading] = useState<string | null>(null)

  const download = async (endpoint: string, filename: string, key: string) => {
    setDownloading(key)
    try {
      // FIX (Jun 2026): enviar el idioma activo para que el backend traduzca
      // encabezados y etiquetas del CSV (libro diario, mayor, resumen).
      const res = await api.get(`/accounting/${endpoint}?from=${from}&to=${to}&lang=${getLocale()}`, { responseType: 'blob' })
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}_${from}_${to}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      toast.success(t('acct.downloaded'))
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('acct.download_error'))
    } finally {
      setDownloading(null)
    }
  }

  const reports = [
    { key: 'journal', icon: <BookOpen className="w-5 h-5" />, title: t('acct.journal.title'), description: t('acct.journal.desc'), filename: 'libro-diario', endpoint: 'journal' },
    { key: 'by-account', icon: <Banknote className="w-5 h-5" />, title: t('acct.by_account.title'), description: t('acct.by_account.desc'), filename: 'mayor-por-cuenta', endpoint: 'by-account' },
    { key: 'summary', icon: <TrendingUp className="w-5 h-5" />, title: t('acct.summary.title'), description: t('acct.summary.desc'), filename: 'resumen-financiero', endpoint: 'summary' },
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-[#1e3a5f]" />
          {t('nav.accounting')}
        </h1>
        <p className="text-slate-600 text-sm mt-1">
          {t('acct.subtitle')}
        </p>
      </div>

      <Card>
        <h2 className="section-title mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          {t('acct.period')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t('common.from')}</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t('common.to')}</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => { setFrom(firstOfMonth()); setTo(lastOfMonth()) }}
            className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-700">
            {t('acct.current_month')}
          </button>
          <button onClick={() => {
            const d = new Date(); d.setMonth(d.getMonth() - 1)
            setFrom(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10))
            setTo(new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10))
          }}
            className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-700">
            {t('acct.prev_month')}
          </button>
          <button onClick={() => {
            const y = new Date().getFullYear()
            setFrom(`${y}-01-01`); setTo(`${y}-12-31`)
          }}
            className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-700">
            {t('acct.current_year')}
          </button>
        </div>
      </Card>

      <div className="space-y-3">
        {reports.map((r) => (
          <Card key={r.key} className="p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-[#1e3a5f]/10 flex items-center justify-center text-[#1e3a5f] flex-shrink-0">
                  {r.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900">{r.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{r.description}</p>
                </div>
              </div>
              <Button onClick={() => download(r.endpoint, r.filename, r.key)} isLoading={downloading === r.key} size="sm">
                <Download className="w-3.5 h-3.5 mr-1.5" />
                {t('acct.download_csv')}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="bg-blue-50 border-blue-200 p-4">
        <p className="text-sm text-blue-900 leading-relaxed">
          💡 <strong>Tip:</strong> {t('acct.tip')}
        </p>
      </Card>
    </div>
  )
}

export default AccountingExportPage

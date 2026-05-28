// AccountingExportPage — exportar contabilidad mensual a CSV
import React, { useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { FileSpreadsheet, Calendar, Download, BookOpen, Banknote, TrendingUp } from 'lucide-react'
import api from '@/lib/api'
import toast from 'react-hot-toast'

const firstOfMonth = (): string => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
const lastOfMonth = (): string => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}

const AccountingExportPage: React.FC = () => {
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(lastOfMonth())
  const [downloading, setDownloading] = useState<string | null>(null)

  const download = async (endpoint: string, filename: string, key: string) => {
    setDownloading(key)
    try {
      const res = await api.get(`/accounting/${endpoint}?from=${from}&to=${to}`, { responseType: 'blob' })
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}_${from}_${to}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      toast.success('Archivo descargado')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'No se pudo descargar')
    } finally {
      setDownloading(null)
    }
  }

  const reports = [
    { key: 'journal', icon: <BookOpen className="w-5 h-5" />, title: 'Libro Diario', description: 'Todos los movimientos del período: desembolsos, pagos recibidos, ingresos extra y gastos. Cada línea con fecha, concepto, cliente, debe/haber y cuenta bancaria.', filename: 'libro-diario', endpoint: 'journal' },
    { key: 'by-account', icon: <Banknote className="w-5 h-5" />, title: 'Mayor por Cuenta Bancaria', description: 'Resumen por cada cuenta bancaria: entradas totales (pagos + ingresos), salidas (desembolsos + gastos), neto y cantidad de movimientos.', filename: 'mayor-por-cuenta', endpoint: 'by-account' },
    { key: 'summary', icon: <TrendingUp className="w-5 h-5" />, title: 'Resumen Financiero (P&L)', description: 'Estado de resultados del período: ingresos por interés y mora, gastos por categoría, utilidad neta y margen. Incluye capital desembolsado y recuperado.', filename: 'resumen-financiero', endpoint: 'summary' },
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-[#1e3a5f]" />
          Exportar Contabilidad
        </h1>
        <p className="text-slate-600 text-sm mt-1">
          Descarga reportes en formato CSV para tu contador o para tus registros.
          Compatible con Excel, Google Sheets y cualquier hoja de cálculo.
        </p>
      </div>

      <Card>
        <h2 className="section-title mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Período
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Desde</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Hasta</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => { setFrom(firstOfMonth()); setTo(lastOfMonth()) }}
            className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-700">
            Mes actual
          </button>
          <button onClick={() => {
            const d = new Date(); d.setMonth(d.getMonth() - 1)
            setFrom(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10))
            setTo(new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10))
          }}
            className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-700">
            Mes anterior
          </button>
          <button onClick={() => {
            const y = new Date().getFullYear()
            setFrom(`${y}-01-01`); setTo(`${y}-12-31`)
          }}
            className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-700">
            Año actual
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
                Descargar CSV
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="bg-blue-50 border-blue-200 p-4">
        <p className="text-sm text-blue-900 leading-relaxed">
          💡 <strong>Tip:</strong> Los archivos CSV incluyen un BOM UTF-8 para que Excel detecte
          correctamente los acentos. Si tu contador prefiere otro formato (XLSX nativo, JSON),
          escríbenos.
        </p>
      </Card>
    </div>
  )
}

export default AccountingExportPage

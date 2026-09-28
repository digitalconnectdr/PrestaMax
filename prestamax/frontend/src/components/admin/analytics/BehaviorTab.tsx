// BehaviorTab — vista "Comportamiento": profundidad de scroll y visibilidad
// de las secciones del landing, más clics de CTA por ubicación.
import React, { useEffect, useState } from 'react'
import { RefreshCw, MousePointerClick } from 'lucide-react'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import Card from '@/components/ui/Card'
import DateRangeFilter, { DateRangeValue, rangeToQuery } from './DateRangeFilter'

interface ScrollRow { depth: number; count: number; pctOfSessions: number }
interface SectionRow { section: string; visitors: number; pctOfSessions: number; ctaClicks: number }
interface CtaRow { location: string; count: number }
interface BehaviorData {
  totalSessions: number
  scrollDepths: ScrollRow[]
  sections: SectionRow[]
  ctaByLocation: CtaRow[]
}

const SECTION_LABELS: Record<string, string> = {
  hero: 'Hero', 'problem-result': 'Problema → Resultado', 'how-it-works': 'Cómo funciona',
  capabilities: 'Capacidades', differentiator: 'Diferenciador', migration: 'Migración',
  security: 'Seguridad', pricing: 'Precios', faq: 'FAQ', 'cta-final': 'CTA final',
  // Nombres de V1 (baseline) — se conservan para leer datos históricos previos a Fase 2.
  benefits: 'Beneficios (V1)', features: 'Funcionalidades (V1)',
}
const CTA_LABELS: Record<string, string> = {
  hero: 'Hero', benefits: 'Beneficios', features: 'Funcionalidades', pricing: 'Precios',
  final: 'CTA final', nav: 'Menú (escritorio)', nav_mobile: 'Menú (móvil)', footer: 'Footer', unknown: 'Desconocido',
}

const BehaviorTab: React.FC = () => {
  const [range, setRange] = useState<DateRangeValue>({ preset: '30d' })
  const [data, setData] = useState<BehaviorData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const load = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams(rangeToQuery(range))
      const res = await api.get(`/admin/analytics/behavior?${params.toString()}`)
      setData(res.data)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error cargando comportamiento')
    } finally {
      setIsLoading(false)
    }
  }
  useEffect(() => { load() }, [range.preset, range.from, range.to])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangeFilter value={range} onChange={setRange} />
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      {isLoading && !data ? (
        <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : !data ? null : (
        <>
          <Card className="p-4">
            <h3 className="font-semibold text-slate-800 mb-1">Profundidad de scroll</h3>
            <p className="text-xs text-slate-500 mb-4">% de sesiones del landing ({data.totalSessions}) que alcanzaron cada nivel.</p>
            <div className="space-y-2.5">
              {data.scrollDepths.map(row => (
                <div key={row.depth} className="flex items-center gap-3">
                  <div className="w-16 flex-shrink-0 text-sm font-medium text-slate-700">{row.depth}%</div>
                  <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full flex items-center justify-end pr-2" style={{ width: `${Math.max(2, row.pctOfSessions)}%` }}>
                      {row.pctOfSessions >= 12 && <span className="text-[10px] font-bold text-white">{row.pctOfSessions}%</span>}
                    </div>
                  </div>
                  {row.pctOfSessions < 12 && <span className="text-xs text-slate-500 w-14 text-right">{row.pctOfSessions}%</span>}
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="font-semibold text-slate-800 mb-1">Secciones del landing</h3>
            <p className="text-xs text-slate-500 mb-4">Visitantes que llegaron a ver cada sección, y CTAs asociados.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="pb-2 font-semibold text-slate-700">Sección</th>
                    <th className="pb-2 font-semibold text-slate-700 text-right">Visitantes</th>
                    <th className="pb-2 font-semibold text-slate-700 text-right">% de sesiones</th>
                    <th className="pb-2 font-semibold text-slate-700 text-right">CTA clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sections.map(row => (
                    <tr key={row.section} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 font-medium text-slate-800">{SECTION_LABELS[row.section] || row.section}</td>
                      <td className="py-2 text-right">{row.visitors}</td>
                      <td className="py-2 text-right text-slate-500">{row.pctOfSessions}%</td>
                      <td className="py-2 text-right font-semibold text-emerald-700">{row.ctaClicks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-1.5"><MousePointerClick className="w-4 h-4" /> Clics de CTA por ubicación</h3>
            <div className="space-y-1.5">
              {data.ctaByLocation.length === 0 && <p className="text-sm text-slate-400">Sin clics registrados en este rango.</p>}
              {data.ctaByLocation.map(row => (
                <div key={row.location} className="flex items-center justify-between text-sm py-1 border-b border-slate-100 last:border-0">
                  <span className="text-slate-700">{CTA_LABELS[row.location] || row.location}</span>
                  <span className="font-semibold text-slate-800">{row.count}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

export default BehaviorTab

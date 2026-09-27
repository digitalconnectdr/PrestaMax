// AnalyticsSummaryTab — vista "Resumen" dentro de Admin → Geografía. Visitas,
// visitantes únicos, sesiones, dispositivo, fuentes principales y conversión
// a trial, todo respetando el filtro temporal compartido.
import React, { useEffect, useState } from 'react'
import { Users, Fingerprint, Layers, Globe2, RefreshCw, TrendingUp, Smartphone, Link2 } from 'lucide-react'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import Card from '@/components/ui/Card'
import DateRangeFilter, { DateRangeValue, rangeToQuery } from './DateRangeFilter'

interface SummaryData {
  totalVisits: number
  totalVisitsClean: number
  uniqueVisitors: number
  sessions: number
  visitsToday: number
  visitsLast7Days: number
  visitsLast30Days: number
  byCountry: { country: string; count: number }[]
  byDevice: { device: string; count: number }[]
  bySource: { source: string; count: number }[]
  topReferrers: { referrer: string; count: number }[]
  trialsStarted: number
  conversionRateToTrial: number
}

const COUNTRY_NAMES: Record<string, string> = {
  DO: 'Rep. Dominicana', US: 'Estados Unidos', CO: 'Colombia', MX: 'México', PA: 'Panamá',
  CR: 'Costa Rica', GT: 'Guatemala', HN: 'Honduras', SV: 'El Salvador', NI: 'Nicaragua',
  VE: 'Venezuela', EC: 'Ecuador', PE: 'Perú', CL: 'Chile', AR: 'Argentina', BR: 'Brasil',
  ES: 'España', PR: 'Puerto Rico', PY: 'Paraguay', BO: 'Bolivia', UY: 'Uruguay', CU: 'Cuba',
}
const countryLabel = (code: string) => COUNTRY_NAMES[code] || code

const SOURCE_LABELS: Record<string, string> = {
  organic: 'Orgánico (buscadores)', direct: 'Directo', referral: 'Referencia', social: 'Redes sociales', paid: 'Pago', unknown: 'Desconocido',
}
const DEVICE_LABELS: Record<string, string> = { mobile: 'Móvil', tablet: 'Tablet', desktop: 'Escritorio', unknown: 'Desconocido' }

const AnalyticsSummaryTab: React.FC = () => {
  const [range, setRange] = useState<DateRangeValue>({ preset: '30d' })
  const [data, setData] = useState<SummaryData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const load = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams(rangeToQuery(range))
      const res = await api.get(`/admin/analytics/summary?${params.toString()}`)
      setData(res.data)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error cargando el resumen')
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4 flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg"><Users className="w-5 h-5 text-blue-700" /></div>
              <div>
                <div className="text-2xl font-bold text-slate-800">{data.totalVisitsClean}</div>
                <div className="text-xs text-slate-500">Visitas {data.totalVisits !== data.totalVisitsClean && <span title="Incluye trafico automatizado detectado (bots/crawlers)">({data.totalVisits} sin filtrar)</span>}</div>
              </div>
            </Card>
            <Card className="p-4 flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg"><Fingerprint className="w-5 h-5 text-emerald-700" /></div>
              <div><div className="text-2xl font-bold text-slate-800">{data.uniqueVisitors}</div><div className="text-xs text-slate-500">Visitantes únicos</div></div>
            </Card>
            <Card className="p-4 flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg"><Layers className="w-5 h-5 text-indigo-700" /></div>
              <div><div className="text-2xl font-bold text-slate-800">{data.sessions}</div><div className="text-xs text-slate-500">Sesiones</div></div>
            </Card>
            <Card className="p-4 flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg"><TrendingUp className="w-5 h-5 text-amber-700" /></div>
              <div><div className="text-2xl font-bold text-slate-800">{data.conversionRateToTrial}%</div><div className="text-xs text-slate-500">{data.trialsStarted} trial{data.trialsStarted === 1 ? '' : 's'} iniciado{data.trialsStarted === 1 ? '' : 's'}</div></div>
            </Card>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Card className="p-3 text-center">
              <div className="text-lg font-bold text-slate-800">{data.visitsToday}</div>
              <div className="text-xs text-slate-500">Hoy</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-lg font-bold text-slate-800">{data.visitsLast7Days}</div>
              <div className="text-xs text-slate-500">Últimos 7 días</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-lg font-bold text-slate-800">{data.visitsLast30Days}</div>
              <div className="text-xs text-slate-500">Últimos 30 días</div>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4">
              <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-1.5"><Globe2 className="w-4 h-4" /> Países</h3>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {data.byCountry.length === 0 && <p className="text-sm text-slate-400">Sin datos aún.</p>}
                {data.byCountry.map(r => (
                  <div key={r.country} className="flex items-center justify-between text-sm py-1 border-b border-slate-100 last:border-0">
                    <span className="text-slate-700">{countryLabel(r.country)}</span>
                    <span className="font-semibold text-slate-800">{r.count}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-1.5"><Smartphone className="w-4 h-4" /> Dispositivo</h3>
              <div className="space-y-1.5">
                {data.byDevice.map(r => (
                  <div key={r.device} className="flex items-center justify-between text-sm py-1 border-b border-slate-100 last:border-0">
                    <span className="text-slate-700">{DEVICE_LABELS[r.device] || r.device}</span>
                    <span className="font-semibold text-slate-800">{r.count}</span>
                  </div>
                ))}
              </div>
              <h3 className="font-semibold text-slate-800 mb-3 mt-5 flex items-center gap-1.5"><Link2 className="w-4 h-4" /> Fuente</h3>
              <div className="space-y-1.5">
                {data.bySource.map(r => (
                  <div key={r.source} className="flex items-center justify-between text-sm py-1 border-b border-slate-100 last:border-0">
                    <span className="text-slate-700">{SOURCE_LABELS[r.source] || r.source}</span>
                    <span className="font-semibold text-slate-800">{r.count}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold text-slate-800 mb-3">Principales referrers</h3>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {data.topReferrers.length === 0 && <p className="text-sm text-slate-400">Sin datos aún (mayormente tráfico directo).</p>}
                {data.topReferrers.map(r => (
                  <div key={r.referrer} className="flex items-center justify-between text-sm py-1 border-b border-slate-100 last:border-0 gap-2">
                    <span className="text-slate-700 truncate" title={r.referrer}>{r.referrer.replace(/^https?:\/\//, '').slice(0, 40)}</span>
                    <span className="font-semibold text-slate-800 flex-shrink-0">{r.count}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

export default AnalyticsSummaryTab

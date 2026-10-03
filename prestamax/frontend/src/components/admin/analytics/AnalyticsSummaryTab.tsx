// AnalyticsSummaryTab — vista "Resumen" dentro de Admin → Geografía. Visitas,
// visitantes únicos, sesiones, dispositivo, fuentes principales y conversión
// a trial, todo respetando el filtro temporal compartido.
import React, { useEffect, useState } from 'react'
import { Users, Fingerprint, Layers, Globe2, RefreshCw, TrendingUp, Smartphone, Link2 } from 'lucide-react'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import Card from '@/components/ui/Card'
import { DateRangeValue, rangeToQuery } from './DateRangeFilter'

interface Composition { raw: number; human: number; bots: number; internal: number; legacy: number }
interface SummaryData {
  composition: Composition
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
  legacyByCountry: { country: string; count: number }[]
  botUserAgents: { userAgent: string; count: number }[] // user_agent -> userAgent (interceptor de axios)
  trialsStarted: number
  trialsFromLanding: number
  landingSessions: number
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

// El filtro de fechas es compartido por todas las vistas (lo posee GeographyPanel).
const AnalyticsSummaryTab: React.FC<{ range: DateRangeValue }> = ({ range }) => {
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
        <p className="text-xs text-slate-500">Todas las cifras de esta vista son <b>tráfico humano</b> en el rango seleccionado, salvo donde se indique.</p>
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
                <div className="text-xs text-slate-500">Visitas humanas <span title="Sin filtrar = todo lo registrado en el rango, incluidos bots, navegadores internos y registros históricos sin clasificar">({data.totalVisits} sin filtrar)</span></div>
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
              <div>
                <div className="text-2xl font-bold text-slate-800">{data.conversionRateToTrial}%</div>
                <div className="text-xs text-slate-500" title="Sesiones que hicieron el recorrido Landing → … → Trial activado, entre las sesiones con vista del landing. Nunca supera 100%.">
                  Landing → trial ({data.trialsFromLanding} de {data.landingSessions}) · {data.trialsStarted} trial{data.trialsStarted === 1 ? '' : 's'} en total
                </div>
              </div>
            </Card>
          </div>

          {/* Composición: bots + internos + históricas + humanas = sin filtrar */}
          <Card className="p-4">
            <h3 className="font-semibold text-slate-800 mb-1">Composición del tráfico registrado</h3>
            <p className="text-xs text-slate-500 mb-3">Qué hay detrás de las {data.composition.raw} visitas sin filtrar del rango. Los registros no se borran: solo se separan.</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
              {[
                { label: 'Humanas', value: data.composition.human, tip: 'Con identificador de visitante, no bot y no navegador interno.', cls: 'text-emerald-700' },
                { label: 'Bots / crawlers', value: data.composition.bots, tip: 'User-Agent de buscador, previsualizador, IA, monitor o navegador automatizado.', cls: 'text-red-600' },
                { label: 'Internas', value: data.composition.internal, tip: 'Navegadores de administradores de la plataforma (se detectan al abrir este panel).', cls: 'text-slate-600' },
                { label: 'Históricas sin clasificar', value: data.composition.legacy, tip: 'Anteriores a la instrumentación: sin visitante, dispositivo ni fuente. No se puede afirmar si eran humanas o bots.', cls: 'text-amber-600' },
                { label: 'Sin filtrar', value: data.composition.raw, tip: 'Total registrado en el rango.', cls: 'text-slate-800' },
              ].map(x => (
                <div key={x.label} className="rounded-lg bg-slate-50 p-3" title={x.tip}>
                  <div className={`text-xl font-bold ${x.cls}`}>{x.value}</div>
                  <div className="text-[11px] text-slate-500">{x.label}</div>
                </div>
              ))}
            </div>
            {(data.composition.legacy > 0 || data.composition.bots > 0) && (
              <div className="grid md:grid-cols-2 gap-4 mt-4 text-xs text-slate-600">
                {data.composition.legacy > 0 && (
                  <div>
                    <div className="font-medium text-slate-700 mb-1">Históricas sin clasificar — por país</div>
                    {data.legacyByCountry.map(r => <div key={r.country} className="flex justify-between"><span>{countryLabel(r.country)}</span><span className="font-semibold">{r.count}</span></div>)}
                  </div>
                )}
                {data.composition.bots > 0 && (
                  <div>
                    <div className="font-medium text-slate-700 mb-1">Bots detectados — principales User-Agent</div>
                    {data.botUserAgents.map(r => <div key={r.userAgent} className="flex justify-between gap-2"><span className="truncate" title={r.userAgent}>{r.userAgent}</span><span className="font-semibold">{r.count}</span></div>)}
                  </div>
                )}
              </div>
            )}
          </Card>

          <div>
            <p className="text-xs text-slate-500 mb-2">Ventanas fijas de tráfico humano — <b>no dependen</b> del filtro de fechas:</p>
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

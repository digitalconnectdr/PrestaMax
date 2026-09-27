// ConversionFunnelTab — vista "Conversión": Landing → Pricing → CTA → Signup
// iniciado → Signup completado → Trial activado, con segmentación opcional
// por país/dispositivo/fuente/UTM cuando hay datos disponibles.
import React, { useEffect, useState } from 'react'
import { RefreshCw, TrendingDown, ArrowDown } from 'lucide-react'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import Card from '@/components/ui/Card'
import DateRangeFilter, { DateRangeValue, rangeToQuery } from './DateRangeFilter'

interface FunnelStep { key: string; event: string; count: number; pctOfPrevious: number; pctOfTotal: number; dropOff: number }
interface FunnelData {
  steps: FunnelStep[]
  overallConversion: number
  availableCountries: string[]
  availableDevices: string[]
  availableSources: string[]
}

const STEP_LABELS: Record<string, string> = {
  landing: 'Landing', pricing: 'Pricing', cta: 'CTA prueba gratuita',
  signup_started: 'Signup iniciado', signup_completed: 'Signup completado', trial_activated: 'Trial activado',
}
const SOURCE_LABELS: Record<string, string> = {
  organic: 'Orgánico', direct: 'Directo', referral: 'Referencia', social: 'Redes sociales', paid: 'Pago', unknown: 'Desconocido',
}

const ConversionFunnelTab: React.FC = () => {
  const [range, setRange] = useState<DateRangeValue>({ preset: '30d' })
  const [country, setCountry] = useState('')
  const [device, setDevice] = useState('')
  const [source, setSource] = useState('')
  const [data, setData] = useState<FunnelData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const load = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams(rangeToQuery(range))
      if (country) params.set('country', country)
      if (device) params.set('device', device)
      if (source) params.set('source', source)
      const res = await api.get(`/admin/analytics/funnel?${params.toString()}`)
      setData(res.data)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error cargando el funnel')
    } finally {
      setIsLoading(false)
    }
  }
  useEffect(() => { load() }, [range.preset, range.from, range.to, country, device, source])

  const maxCount = Math.max(1, ...(data?.steps.map(s => s.count) || [1]))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangeFilter value={range} onChange={setRange} />
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      {data && (data.availableCountries.length > 0 || data.availableDevices.length > 0 || data.availableSources.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {data.availableCountries.length > 0 && (
            <select value={country} onChange={e => setCountry(e.target.value)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todos los países</option>
              {data.availableCountries.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {data.availableDevices.length > 0 && (
            <select value={device} onChange={e => setDevice(e.target.value)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todos los dispositivos</option>
              {data.availableDevices.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          {data.availableSources.length > 0 && (
            <select value={source} onChange={e => setSource(e.target.value)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todas las fuentes</option>
              {data.availableSources.map(s => <option key={s} value={s}>{SOURCE_LABELS[s] || s}</option>)}
            </select>
          )}
          {(country || device || source) && (
            <button onClick={() => { setCountry(''); setDevice(''); setSource('') }} className="text-xs text-slate-400 hover:text-slate-700 underline">
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {isLoading && !data ? (
        <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : !data ? null : (
        <>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Funnel de adquisición</h3>
              <span className="text-sm font-bold text-emerald-700">{data.overallConversion}% conversión global</span>
            </div>
            <div className="space-y-1">
              {data.steps.map((step, i) => (
                <div key={step.key}>
                  <div className="flex items-center gap-3">
                    <div className="w-40 flex-shrink-0 text-sm text-slate-700 font-medium">{STEP_LABELS[step.key] || step.key}</div>
                    <div className="flex-1 h-8 bg-slate-100 rounded-lg overflow-hidden relative">
                      <div
                        className="h-full bg-gradient-to-r from-[#1e3a5f] to-[#2c5a8f] rounded-lg flex items-center justify-end pr-2 transition-all"
                        style={{ width: `${Math.max(4, (step.count / maxCount) * 100)}%` }}
                      >
                        <span className="text-xs font-bold text-white">{step.count}</span>
                      </div>
                    </div>
                    <div className="w-16 flex-shrink-0 text-right text-xs text-slate-500">{step.pctOfTotal}%</div>
                  </div>
                  {i < data.steps.length - 1 && (
                    <div className="flex items-center gap-2 pl-40 py-1 text-xs text-slate-400">
                      <ArrowDown className="w-3 h-3" />
                      <span className={step.pctOfPrevious < 30 ? 'text-red-500 font-medium' : ''}>
                        {data.steps[i + 1].pctOfPrevious}% pasa al siguiente paso
                        {data.steps[i + 1].dropOff > 0 && (
                          <span className="text-slate-400"> · {data.steps[i + 1].dropOff} abandonan aquí</span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {data.steps.every(s => s.count === 0) && (
            <Card className="p-4 flex items-center gap-3 bg-amber-50 border-amber-200">
              <TrendingDown className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-800">Aún no hay eventos del funnel en este rango de fechas (o con estos filtros). Los datos aparecerán a medida que haya tráfico real después de este despliegue.</p>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

export default ConversionFunnelTab

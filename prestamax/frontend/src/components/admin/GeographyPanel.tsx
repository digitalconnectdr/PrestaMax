// GeographyPanel — mapas de "de dónde vienen" los visitantes del landing y las
// empresas registradas, agrupados por ciudad (geolocalización por IP en el
// backend). Sirve para decidir dónde enfocar publicidad.
// Render dentro del tab "Geografía" de PlatformAdminPage.

import React, { useEffect, useState } from 'react'
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps'
import { MapPin, Users, Globe2, RefreshCw, CalendarDays, TrendingUp, DollarSign, Building2 } from 'lucide-react'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
// Empaquetado localmente (no via CDN externo): la CSP de producción solo permite
// conexiones a dominios propios/whitelisted, así que un fetch a un CDN quedaría
// bloqueado silenciosamente y el mapa se vería en blanco.
import worldCountriesUrl from 'world-atlas/countries-110m.json?url'

interface CityRow { country: string; city: string | null; lat: number | null; lng: number | null; count: number }
interface CountryRow { country: string; count: number }
interface RevenueRow { country: string; tenantCount: number; activeCount: number; monthlyRevenue: number }
interface GeographyData {
  visitorsByCity: CityRow[]
  visitorsByCountry: CountryRow[]
  tenantsByCity: CityRow[]
  tenantsByCountry: CountryRow[]
  totalVisits: number
  totalTenantsWithGeo: number
  totalTenants: number
  visitsToday: number
  visitsLast7Days: number
  visitsLast30Days: number
  revenueByCountry: RevenueRow[]
}

// Nombres legibles para los codigos ISO-2 mas comunes entre los clientes de CredyTek.
const COUNTRY_NAMES: Record<string, string> = {
  DO: 'Rep. Dominicana', US: 'Estados Unidos', CO: 'Colombia', MX: 'México', PA: 'Panamá',
  CR: 'Costa Rica', GT: 'Guatemala', HN: 'Honduras', SV: 'El Salvador', NI: 'Nicaragua',
  VE: 'Venezuela', EC: 'Ecuador', PE: 'Perú', CL: 'Chile', AR: 'Argentina', BR: 'Brasil',
  ES: 'España', PR: 'Puerto Rico', PY: 'Paraguay', BO: 'Bolivia', UY: 'Uruguay', CU: 'Cuba',
}
const countryLabel = (code: string) => COUNTRY_NAMES[code] || code

type Dataset = 'visitors' | 'tenants'

const GeographyPanel: React.FC = () => {
  const [data, setData] = useState<GeographyData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [dataset, setDataset] = useState<Dataset>('visitors')
  const [hovered, setHovered] = useState<CityRow | null>(null)

  const load = async () => {
    setIsLoading(true)
    try {
      const res = await api.get('/admin/geography')
      setData(res.data)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error cargando datos de geografía')
    } finally {
      setIsLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  if (isLoading && !data) {
    return <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-slate-400" /></div>
  }
  if (!data) return null

  const byCity = dataset === 'visitors' ? data.visitorsByCity : data.tenantsByCity
  const byCountry = dataset === 'visitors' ? data.visitorsByCountry : data.tenantsByCountry
  const cities = byCity.filter(c => c.lat != null && c.lng != null)
  const maxCount = Math.max(1, ...cities.map(c => c.count))
  const color = dataset === 'visitors' ? '#3b82f6' : '#f59e0b'
  const radiusFor = (count: number) => 4 + (Math.sqrt(count / maxCount) * 14)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Geografía</h2>
          <p className="text-sm text-slate-500">De dónde vienen tus visitantes y tus empresas registradas — útil para enfocar publicidad.</p>
        </div>
        <Button onClick={load} size="sm" variant="outline" className="flex items-center gap-1">
          <RefreshCw className="w-4 h-4" /> Actualizar
        </Button>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {(['visitors', 'tenants'] as Dataset[]).map(d => (
          <button key={d} onClick={() => setDataset(d)}
            className={`pb-2 px-3 text-sm font-medium border-b-2 transition-colors ${dataset === d ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {d === 'visitors' ? 'Visitantes del landing' : 'Empresas registradas'}
          </button>
        ))}
      </div>

      {dataset === 'visitors' ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg"><Users className="w-5 h-5 text-blue-700" /></div>
            <div><div className="text-2xl font-bold text-slate-800">{data.totalVisits}</div><div className="text-xs text-slate-500">Visitas totales</div></div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg"><CalendarDays className="w-5 h-5 text-emerald-700" /></div>
            <div><div className="text-2xl font-bold text-slate-800">{data.visitsToday}</div><div className="text-xs text-slate-500">Visitas hoy</div></div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg"><TrendingUp className="w-5 h-5 text-indigo-700" /></div>
            <div><div className="text-2xl font-bold text-slate-800">{data.visitsLast7Days}</div><div className="text-xs text-slate-500">Últimos 7 días</div></div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg"><MapPin className="w-5 h-5 text-slate-700" /></div>
            <div><div className="text-2xl font-bold text-slate-800">{byCountry.length}</div><div className="text-xs text-slate-500">Países distintos</div></div>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg"><Globe2 className="w-5 h-5 text-amber-700" /></div>
            <div><div className="text-2xl font-bold text-slate-800">{data.totalTenantsWithGeo}<span className="text-sm text-slate-400 font-normal"> / {data.totalTenants}</span></div><div className="text-xs text-slate-500">Con ubicación detectada</div></div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg"><Building2 className="w-5 h-5 text-green-700" /></div>
            <div><div className="text-2xl font-bold text-slate-800">{data.revenueByCountry.reduce((s, r) => s + r.activeCount, 0)}</div><div className="text-xs text-slate-500">Suscripciones activas</div></div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg"><DollarSign className="w-5 h-5 text-emerald-700" /></div>
            <div><div className="text-2xl font-bold text-slate-800">${data.revenueByCountry.reduce((s, r) => s + (r.monthlyRevenue || 0), 0).toFixed(0)}</div><div className="text-xs text-slate-500">Ingreso mensual estimado</div></div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg"><MapPin className="w-5 h-5 text-slate-700" /></div>
            <div><div className="text-2xl font-bold text-slate-800">{byCountry.length}</div><div className="text-xs text-slate-500">Países distintos</div></div>
          </Card>
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="relative bg-slate-50">
          <ComposableMap projectionConfig={{ scale: 140 }} width={800} height={420} style={{ width: '100%', height: 'auto' }}>
            <Geographies geography={worldCountriesUrl}>
              {({ geographies }) =>
                geographies.map(geo => (
                  <Geography key={geo.rsmKey} geography={geo} fill="#e2e8f0" stroke="#cbd5e1" strokeWidth={0.5} style={{ default: { outline: 'none' }, hover: { outline: 'none', fill: '#cbd5e1' }, pressed: { outline: 'none' } }} />
                ))
              }
            </Geographies>
            {cities.map((c, i) => (
              <Marker key={i} coordinates={[c.lng as number, c.lat as number]}
                onMouseEnter={() => setHovered(c)} onMouseLeave={() => setHovered(null)}>
                <circle r={radiusFor(c.count)} fill={color} fillOpacity={0.55} stroke={color} strokeWidth={1} />
              </Marker>
            ))}
          </ComposableMap>
          {hovered && (
            <div className="absolute top-3 left-3 bg-white shadow-lg rounded-lg px-3 py-2 text-sm border border-slate-200">
              <div className="font-semibold text-slate-800">{hovered.city || countryLabel(hovered.country)}</div>
              <div className="text-slate-500 text-xs">{countryLabel(hovered.country)} · {hovered.count} {dataset === 'visitors' ? 'visitas' : 'empresas'}</div>
            </div>
          )}
          {cities.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
              Aún no hay suficientes datos de ubicación para mostrar en el mapa.
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-semibold text-slate-800 mb-3">Ranking por país</h3>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {byCountry.length === 0 && <p className="text-sm text-slate-400">Sin datos aún.</p>}
            {byCountry.map(r => (
              <div key={r.country} className="flex items-center justify-between text-sm py-1 border-b border-slate-100 last:border-0">
                <span className="text-slate-700">{countryLabel(r.country)}</span>
                <span className="font-semibold text-slate-800">{r.count}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="font-semibold text-slate-800 mb-3">Ranking por ciudad</h3>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {byCity.length === 0 && <p className="text-sm text-slate-400">Sin datos aún.</p>}
            {byCity.sort((a, b) => b.count - a.count).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-slate-100 last:border-0">
                <span className="text-slate-700">{r.city || '(desconocida)'} <span className="text-slate-400">— {countryLabel(r.country)}</span></span>
                <span className="font-semibold text-slate-800">{r.count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {dataset === 'tenants' && (
        <Card className="p-4">
          <h3 className="font-semibold text-slate-800 mb-1">Ingreso mensual estimado por país</h3>
          <p className="text-xs text-slate-500 mb-3">Solo suscripciones activas — el mejor indicador de dónde invertir en publicidad, no solo el volumen de registros.</p>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {data.revenueByCountry.length === 0 && <p className="text-sm text-slate-400">Sin datos aún.</p>}
            {data.revenueByCountry.map(r => (
              <div key={r.country} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-100 last:border-0">
                <span className="text-slate-700">
                  {countryLabel(r.country)}
                  <span className="text-slate-400"> · {r.activeCount} activa{r.activeCount === 1 ? '' : 's'} de {r.tenantCount}</span>
                </span>
                <span className="font-semibold text-emerald-700">${(r.monthlyRevenue || 0).toFixed(0)}/mes</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

export default GeographyPanel

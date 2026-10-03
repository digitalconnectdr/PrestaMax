// ConversionFunnelTab — vista "Conversión": Landing → Pricing → CTA → Signup
// iniciado → Signup completado → Trial activado → Activado → Checkout iniciado
// → Suscripción iniciada (Fase 3 extiende el funnel de adquisición hasta
// suscripción real), con segmentación opcional por país/dispositivo/fuente/
// UTM/plan/período de facturación cuando hay datos disponibles.
import React, { useEffect, useState } from 'react'
import { RefreshCw, TrendingDown, ArrowDown } from 'lucide-react'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import Card from '@/components/ui/Card'
import { DateRangeValue, rangeToQuery } from './DateRangeFilter'

interface FunnelStep { key: string; event: string; count: number; pctOfPrevious: number; pctOfTotal: number; dropOff: number }
interface GlobalCount { event: string; sessions: number; visitors: number }
interface FunnelData {
  steps: FunnelStep[]
  pricingSteps: FunnelStep[]
  pricingOverallConversion: number
  globals: GlobalCount[]
  // OJO: el interceptor de axios convierte snake_case -> camelCase en TODA respuesta
  // (landing_cta -> landingCta, duplicate_email -> duplicateEmail). Las claves de abajo son las ya convertidas.
  signupSources: { landingCta: number; seo: number; direct: number; referral: number; otherUnknown: number }
  signupForm: { started: number; submitted: number; completed: number; errors: Record<string, number> }
  registrations: { tenantsCreated: number; signupCompletedSessions: number }
  overallConversion: number
  availableCountries: string[]
  availableDevices: string[]
  availableSources: string[]
  availablePlans: string[]
  availableBillingPeriods: string[]
}

const STEP_LABELS: Record<string, string> = {
  landing: 'Landing', pricing: 'Vista de Precios', cta: 'CTA prueba gratuita', cta_pricing: 'CTA de Precios',
  signup_started: 'Signup iniciado', signup_completed: 'Signup completado', trial_activated: 'Trial activado',
  activated: 'Activado', checkout_started: 'Checkout iniciado', subscription_started: 'Suscripción iniciada',
}

/** Barras de un funnel secuencial (cada paso <= 100% del anterior). */
const FunnelBars: React.FC<{ steps: FunnelStep[] }> = ({ steps }) => {
  const max = Math.max(1, ...steps.map(s => s.count))
  return (
    <div className="space-y-1">
      {steps.map((step, i) => (
        <div key={step.key}>
          <div className="flex items-center gap-3">
            <div className="w-40 flex-shrink-0 text-sm text-slate-700 font-medium">{STEP_LABELS[step.key] || step.key}</div>
            <div className="flex-1 h-8 bg-slate-100 rounded-lg overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-[#1e3a5f] to-[#2c5a8f] rounded-lg flex items-center justify-end pr-2 transition-all"
                style={{ width: `${Math.max(4, (step.count / max) * 100)}%` }}
              >
                <span className="text-xs font-bold text-white">{step.count}</span>
              </div>
            </div>
            <div className="w-16 flex-shrink-0 text-right text-xs text-slate-500">{step.pctOfTotal}%</div>
          </div>
          {i < steps.length - 1 && (
            <div className="flex items-center gap-2 pl-40 py-1 text-xs text-slate-400">
              <ArrowDown className="w-3 h-3" />
              <span className={step.pctOfPrevious < 30 ? 'text-red-500 font-medium' : ''}>
                {steps[i + 1].pctOfPrevious}% pasa al siguiente paso
                {steps[i + 1].dropOff > 0 && (
                  <span className="text-slate-400"> · {steps[i + 1].dropOff} abandonan aquí</span>
                )}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
const BILLING_PERIOD_LABELS: Record<string, string> = { monthly: 'Mensual', annual: 'Anual' }
const SOURCE_LABELS: Record<string, string> = {
  organic: 'Orgánico', direct: 'Directo', referral: 'Referencia', social: 'Redes sociales', paid: 'Pago', unknown: 'Desconocido',
}

const SIGNUP_SOURCE_LABELS: Record<string, string> = {
  landingCta: 'CTA del landing', seo: 'SEO / recursos', direct: 'Directo', referral: 'Referencia / redes', otherUnknown: 'Otro / desconocido',
}
const SIGNUP_ERROR_LABELS: Record<string, string> = {
  validation: 'Validación', duplicateEmail: 'Correo ya registrado', network: 'Red / tiempo agotado', server: 'Servidor', unknown: 'Otro',
}
const GLOBAL_EVENT_LABELS: Record<string, string> = {
  landing_view: 'Vista del landing', pricing_view: 'Vista de precios', trial_cta_click: 'Clic en CTA de prueba',
  signup_started: 'Signup iniciado', signup_completed: 'Signup completado', trial_activated: 'Trial activado',
  activation_completed: 'Activado', checkout_started: 'Checkout iniciado', subscription_started: 'Suscripción iniciada',
}

// El filtro de fechas es compartido por todas las vistas (lo posee GeographyPanel).
const ConversionFunnelTab: React.FC<{ range: DateRangeValue }> = ({ range }) => {
  const [country, setCountry] = useState('')
  const [device, setDevice] = useState('')
  const [source, setSource] = useState('')
  const [plan, setPlan] = useState('')
  const [billingPeriod, setBillingPeriod] = useState('')
  const [data, setData] = useState<FunnelData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const load = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams(rangeToQuery(range))
      if (country) params.set('country', country)
      if (device) params.set('device', device)
      if (source) params.set('source', source)
      if (plan) params.set('plan', plan)
      if (billingPeriod) params.set('billing_period', billingPeriod)
      const res = await api.get(`/admin/analytics/funnel?${params.toString()}`)
      setData(res.data)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error cargando el funnel')
    } finally {
      setIsLoading(false)
    }
  }
  useEffect(() => { load() }, [range.preset, range.from, range.to, country, device, source, plan, billingPeriod])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Funnel <b>secuencial</b>: cada paso cuenta solo a quien completó el anterior, en orden. Adquisición por sesión; activación, checkout y suscripción por visitante. Tráfico humano.</p>
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      {data && (data.availableCountries.length > 0 || data.availableDevices.length > 0 || data.availableSources.length > 0 || data.availablePlans.length > 0 || data.availableBillingPeriods.length > 0) && (
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
          {data.availablePlans.length > 0 && (
            <select value={plan} onChange={e => setPlan(e.target.value)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todos los planes</option>
              {data.availablePlans.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {data.availableBillingPeriods.length > 0 && (
            <select value={billingPeriod} onChange={e => setBillingPeriod(e.target.value)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Mensual y anual</option>
              {data.availableBillingPeriods.map(p => <option key={p} value={p}>{BILLING_PERIOD_LABELS[p] || p}</option>)}
            </select>
          )}
          {(country || device || source || plan || billingPeriod) && (
            <button onClick={() => { setCountry(''); setDevice(''); setSource(''); setPlan(''); setBillingPeriod('') }} className="text-xs text-slate-400 hover:text-slate-700 underline">
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
              <h3 className="font-semibold text-slate-800">Funnel principal de adquisición</h3>
              <span className="text-sm font-bold text-emerald-700">{data.overallConversion}% conversión global</span>
            </div>
            <FunnelBars steps={data.steps} />
          </Card>

          {/* Diagnóstico separado: solo el camino que pasa por la sección de Precios y termina en SU CTA.
              No es el funnel principal: quien convierte desde el Hero, el footer o una página SEO no aparece aquí. */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-slate-800">Diagnóstico: camino por Precios</h3>
              <span className="text-sm font-bold text-slate-600">{data.pricingOverallConversion}% llegan a signup completado</span>
            </div>
            <p className="text-xs text-slate-500 mb-4">Landing → vista de Precios → clic en el CTA de Precios → signup iniciado → completado. Mide qué tan bien convierte la sección de precios, no la conversión total.</p>
            <FunnelBars steps={data.pricingSteps} />
          </Card>

          {/* Totales globales: NO exigen el paso anterior. Un acceso directo a /register cuenta aquí como signup, pero no en el funnel secuencial. */}
          <Card className="p-4">
            <h3 className="font-semibold text-slate-800 mb-1">Eventos globales (no secuenciales)</h3>
            <p className="text-xs text-slate-500 mb-3">Cuántas sesiones/visitantes distintos dispararon cada evento, sin importar si pasaron por el paso anterior. Por eso pueden ser mayores que el funnel secuencial.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-slate-500 border-b border-slate-200"><th className="text-left py-1.5 font-medium">Evento</th><th className="text-right py-1.5 font-medium">Sesiones</th><th className="text-right py-1.5 font-medium">Visitantes</th><th className="text-right py-1.5 font-medium">En el funnel secuencial</th></tr></thead>
                <tbody>
                  {data.globals.map(g => {
                    // pricing_view no es un paso del funnel principal (solo del diagnóstico de Precios).
                    const mainStep = data.steps.find(s => s.event === g.event)
                    return (
                      <tr key={g.event} className="border-b border-slate-100 last:border-0">
                        <td className="py-1.5 text-slate-700">{GLOBAL_EVENT_LABELS[g.event] || g.event}</td>
                        <td className="py-1.5 text-right font-semibold text-slate-800">{g.sessions}</td>
                        <td className="py-1.5 text-right text-slate-600">{g.visitors}</td>
                        <td className="py-1.5 text-right text-slate-600">{mainStep ? mainStep.count : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-4">
              <h3 className="font-semibold text-slate-800 mb-1">Origen de los signups iniciados</h3>
              <p className="text-xs text-slate-500 mb-3">Por sesión. "CTA del landing" = hubo un clic en CTA antes del signup. Los accesos directos a /register no se atribuyen al landing.</p>
              <div className="space-y-1.5">
                {(Object.keys(SIGNUP_SOURCE_LABELS) as (keyof typeof data.signupSources)[]).map(k => (
                  <div key={k} className="flex items-center justify-between text-sm py-1 border-b border-slate-100 last:border-0">
                    <span className="text-slate-700">{SIGNUP_SOURCE_LABELS[k]}</span>
                    <span className="font-semibold text-slate-800">{data.signupSources[k]}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold text-slate-800 mb-1">Formulario de registro</h3>
              <p className="text-xs text-slate-500 mb-3">Dónde se abandona: llegaron → enviaron → completaron (sesiones distintas).</p>
              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                <div className="rounded-lg bg-slate-50 p-2"><div className="text-lg font-bold text-slate-800">{data.signupForm.started}</div><div className="text-[11px] text-slate-500">Llegaron</div></div>
                <div className="rounded-lg bg-slate-50 p-2"><div className="text-lg font-bold text-slate-800">{data.signupForm.submitted}</div><div className="text-[11px] text-slate-500">Enviaron</div></div>
                <div className="rounded-lg bg-slate-50 p-2"><div className="text-lg font-bold text-emerald-700">{data.signupForm.completed}</div><div className="text-[11px] text-slate-500">Completaron</div></div>
              </div>
              <div className="text-xs text-slate-500 mb-1">Errores al registrar (categoría técnica, sin datos del usuario):</div>
              <div className="space-y-1">
                {Object.entries(data.signupForm.errors).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs text-slate-600"><span>{SIGNUP_ERROR_LABELS[k] || k}</span><span className="font-semibold">{v}</span></div>
                ))}
              </div>
            </Card>
          </div>

          {data.registrations.tenantsCreated > data.registrations.signupCompletedSessions && (
            <Card className="p-4 flex items-start gap-3 bg-amber-50 border-amber-200">
              <TrendingDown className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                Hay <b>{data.registrations.tenantsCreated}</b> empresa{data.registrations.tenantsCreated === 1 ? '' : 's'} creada{data.registrations.tenantsCreated === 1 ? '' : 's'} en la base de datos en este rango (incluye cuentas de prueba/internas y altas manuales) frente a <b>{data.registrations.signupCompletedSessions}</b> signup{data.registrations.signupCompletedSessions === 1 ? '' : 's'} completado{data.registrations.signupCompletedSessions === 1 ? '' : 's'} medido{data.registrations.signupCompletedSessions === 1 ? '' : 's'}. La diferencia son registros sin evento de analítica (anteriores al tracking, altas manuales o tráfico excluido).
              </p>
            </Card>
          )}

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

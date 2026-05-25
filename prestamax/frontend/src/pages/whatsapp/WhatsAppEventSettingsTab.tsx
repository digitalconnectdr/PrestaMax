// WhatsAppEventSettingsTab — switches por evento para activar/desactivar
// la generacion automatica de drafts transaccionales.
//
// 5 eventos configurables:
//   - loan_created      → al desembolsar un prestamo
//   - payment_received  → al registrar un pago
//   - overdue_1/7/15    → cuotas vencidas (los cron jobs vendran en Fase B)
//
// Default: todos OFF. El usuario los activa explicitamente.

import React, { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Info, CheckCircle2, Circle } from 'lucide-react'
import api, { isAccessDenied, isSubscriptionExpired } from '@/lib/api'
import toast from 'react-hot-toast'

interface EventSetting {
  event: string
  label: string
  enabled: boolean
  template_id: string | null
}

interface Template {
  id: string
  name: string
  event: string
}

const EVENT_DESCRIPTIONS: Record<string, string> = {
  loan_created:     'Se genera un draft de bienvenida cuando desembolsas un préstamo. Incluye monto, número de cuotas y fecha de primer pago.',
  payment_received: 'Se genera un draft de confirmación cuando registras un pago. Incluye monto pagado, balance restante y próxima cuota.',
  overdue_1:        'Cuando una cuota tiene 1 día de atraso. Requiere cron diario (Fase B).',
  overdue_7:        'Cuando una cuota tiene 7 días de atraso. Requiere cron diario (Fase B).',
  overdue_15:       'Cuando una cuota tiene 15 días de atraso. Requiere cron diario (Fase B).',
}

const PHASE_B_EVENTS = ['overdue_1', 'overdue_7', 'overdue_15']

const WhatsAppEventSettingsTab: React.FC = () => {
  const [settings, setSettings] = useState<EventSetting[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [savingEvent, setSavingEvent] = useState<string | null>(null)

  useEffect(() => {
    const fetch = async () => {
      try {
        const [sRes, tRes] = await Promise.all([
          api.get('/whatsapp/event-settings'),
          api.get('/whatsapp/templates'),
        ])
        setSettings(sRes.data || [])
        setTemplates(tRes.data || [])
      } catch (err) {
        if (!isAccessDenied(err) && !isSubscriptionExpired(err)) {
          toast.error('No se pudo cargar configuración')
        }
      } finally {
        setIsLoading(false)
      }
    }
    fetch()
  }, [])

  const updateEvent = async (event: string, changes: Partial<EventSetting>) => {
    setSavingEvent(event)
    const current = settings.find(s => s.event === event)
    const next = { ...current, ...changes }
    try {
      await api.put('/whatsapp/event-settings', {
        event,
        enabled: next.enabled,
        template_id: next.template_id,
      })
      setSettings(prev => prev.map(s => s.event === event ? { ...s, ...changes } : s))
      toast.success('Configuración guardada')
    } catch {
      toast.error('No se pudo guardar')
    } finally {
      setSavingEvent(null)
    }
  }

  if (isLoading) {
    return <Card><div className="text-center py-12 text-slate-400">Cargando...</div></Card>
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-700">Eventos transaccionales automáticos</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Activa los eventos que quieres que generen mensajes automáticos. Los mensajes
          quedan en la <strong>Bandeja</strong> listos para revisar y enviar.
        </p>
      </div>

      <Card className="bg-blue-50 border-blue-200">
        <div className="flex gap-2 items-start text-sm text-blue-900">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            Los mensajes se generan como <strong>borradores</strong>; tú decides cuándo abrir WhatsApp y enviarlos.
            Si un cliente no tiene WhatsApp o teléfono registrado, no se genera draft para él.
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        {settings.map(s => {
          const eventTemplates = templates.filter(t => t.event === s.event)
          const isPhaseB = PHASE_B_EVENTS.includes(s.event)
          return (
            <Card key={s.event} className={`p-4 ${isPhaseB ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold text-slate-800">{s.label}</h4>
                    {isPhaseB && (
                      <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                        Próximamente
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{EVENT_DESCRIPTIONS[s.event]}</p>

                  {/* Template selector */}
                  {s.enabled && !isPhaseB && (
                    <div className="mt-3">
                      <label className="text-xs font-medium text-slate-600 mb-1 block">
                        Plantilla a usar
                      </label>
                      <select
                        value={s.template_id || ''}
                        onChange={(e) => updateEvent(s.event, { template_id: e.target.value || null })}
                        disabled={savingEvent === s.event}
                        className="w-full sm:w-72 px-3 py-1.5 text-sm border border-slate-300 rounded-md bg-white"
                      >
                        <option value="">— Usar plantilla por defecto del sistema —</option>
                        {eventTemplates.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      {eventTemplates.length === 0 && (
                        <p className="text-xs text-slate-400 mt-1">
                          No tienes plantillas custom para este evento. Crea una en la pestaña <strong>Plantillas</strong>.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Switch on/off */}
                <button
                  onClick={() => !isPhaseB && updateEvent(s.event, { enabled: !s.enabled })}
                  disabled={isPhaseB || savingEvent === s.event}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition ${
                    s.enabled
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                  } ${isPhaseB ? 'cursor-not-allowed' : ''}`}
                >
                  {s.enabled ? (
                    <><CheckCircle2 className="w-4 h-4" /> Activo</>
                  ) : (
                    <><Circle className="w-4 h-4" /> Inactivo</>
                  )}
                </button>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

export default WhatsAppEventSettingsTab

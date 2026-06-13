// WhatsAppEventSettingsTab — switches por evento para activar/desactivar
// la generacion automatica de drafts transaccionales.
//
// 6 eventos configurables (TODOS activos en produccion):
//   - loan_created      → al desembolsar un prestamo (hook sincrono)
//   - payment_received  → al registrar un pago (hook sincrono)
//   - pre_due_3         → 3 dias antes de vencer una cuota (cron diario 8am)
//   - overdue_1/7/15    → cuotas vencidas (cron diario 8am)
//
// Default: todos OFF. El usuario los activa explicitamente.

import React, { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Info, CheckCircle2, Circle } from 'lucide-react'
import api, { isAccessDenied, isSubscriptionExpired } from '@/lib/api'
import toast from 'react-hot-toast'
import { useT } from '@/lib/i18n'

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

// event → i18n keys for description and label; resolved via t() at use sites
const EVENT_DESC_KEYS: Record<string, string> = {
  loan_created:     'wa.desc.loan_created',
  pre_due_3:        'wa.desc.pre_due_3',
  payment_received: 'wa.desc.payment_received',
  overdue_1:        'wa.desc.overdue_1',
  overdue_7:        'wa.desc.overdue_7',
  overdue_15:       'wa.desc.overdue_15',
}

const EVENT_LABEL_KEYS: Record<string, string> = {
  loan_created:     'wa.ev.loan_created',
  pre_due_3:        'wa.ev.pre_due_3',
  payment_received: 'wa.ev.payment_received',
  overdue_1:        'wa.ev.overdue_1',
  overdue_7:        'wa.ev.overdue_7',
  overdue_15:       'wa.ev.overdue_15',
}

const PHASE_B_EVENTS: string[] = []  // Vacio: ya implementamos el cron diario en Fase B

const WhatsAppEventSettingsTab: React.FC = () => {
  const t = useT()
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
          toast.error(t('wa.set_load_error'))
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
      toast.success(t('wa.set_saved'))
    } catch {
      toast.error(t('wa.set_save_error'))
    } finally {
      setSavingEvent(null)
    }
  }

  if (isLoading) {
    return <Card><div className="text-center py-12 text-slate-400">{t('wa.loading')}</div></Card>
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-700">{t('wa.set_title')}</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          {t('wa.set_desc')} <strong>{t('wa.tab_outbox')}</strong> {t('wa.set_desc_end')}
        </p>
      </div>

      <Card className="bg-blue-50 border-blue-200">
        <div className="flex gap-2 items-start text-sm text-blue-900">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            {t('wa.set_info')} <strong>{t('wa.set_info_drafts')}</strong>{t('wa.set_info_end')}
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        {settings.map(s => {
          const eventTemplates = templates.filter(x => x.event === s.event)
          const isPhaseB = PHASE_B_EVENTS.includes(s.event)
          const label = EVENT_LABEL_KEYS[s.event] ? t(EVENT_LABEL_KEYS[s.event]) : s.label
          const desc = EVENT_DESC_KEYS[s.event] ? t(EVENT_DESC_KEYS[s.event]) : ''
          return (
            <Card key={s.event} className={`p-4 ${isPhaseB ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold text-slate-800">{label}</h4>
                    {isPhaseB && (
                      <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                        {t('wa.coming_soon')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{desc}</p>

                  {/* Template selector */}
                  {s.enabled && !isPhaseB && (
                    <div className="mt-3">
                      <label className="text-xs font-medium text-slate-600 mb-1 block">
                        {t('wa.template_to_use')}
                      </label>
                      <select
                        value={s.template_id || ''}
                        onChange={(e) => updateEvent(s.event, { template_id: e.target.value || null })}
                        disabled={savingEvent === s.event}
                        className="w-full sm:w-72 px-3 py-1.5 text-sm border border-slate-300 rounded-md bg-white"
                      >
                        <option value="">{t('wa.default_template')}</option>
                        {eventTemplates.map(x => (
                          <option key={x.id} value={x.id}>{x.name}</option>
                        ))}
                      </select>
                      {eventTemplates.length === 0 && (
                        <p className="text-xs text-slate-400 mt-1">
                          {t('wa.no_custom_template')} <strong>{t('wa.tab_templates')}</strong>.
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
                    <><CheckCircle2 className="w-4 h-4" /> {t('wa.active')}</>
                  ) : (
                    <><Circle className="w-4 h-4" /> {t('wa.inactive')}</>
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

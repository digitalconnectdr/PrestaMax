// InquiriesPanel — gestion de leads capturados desde la landing publica.
// Render dentro del tab "Solicitudes" de PlatformAdminPage.
//
// Funcionalidades:
//   - Lista de leads con filtros por status
//   - Boton "Abrir WhatsApp" (wa.me con mensaje pre-llenado)
//   - Cambiar status: new → contacted → converted/rejected
//   - Notas internas por lead
//   - Badge contadores por status

import React, { useEffect, useState } from 'react'
import { MessageCircle, Mail, Phone, Globe, Calendar, RefreshCw, Trash2, CheckCircle2, Circle, UserCheck, X } from 'lucide-react'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import { formatDate } from '@/lib/utils'

interface Inquiry {
  id: string
  full_name: string
  business_name: string | null
  whatsapp: string
  email: string
  country: string
  plan_interest: string | null
  portfolio_size: string | null
  source: string | null
  message: string | null
  status: 'new' | 'contacted' | 'converted' | 'rejected'
  contacted_at: string | null
  notes: string | null
  converted_to_tenant_id: string | null
  created_at: string
}

interface Stats {
  new: number
  contacted: number
  converted: number
  rejected: number
  total: number
}

const PLAN_LABELS: Record<string, string> = {
  trial:        'Trial (14d gratis)',
  starter:      'Starter ($29.99)',
  basico:       'Básico ($59.99)',
  profesional:  'Profesional ($119.99)',
  enterprise:   'Enterprise ($249.99)',
  unsure:       'Quiere asesoramiento',
}

const SIZE_LABELS: Record<string, string> = {
  '<50': '<50 préstamos',
  '50-200': '50-200',
  '200-500': '200-500',
  '500+': '500+',
  'unsure': 'No sabe',
}

const SOURCE_LABELS: Record<string, string> = {
  google: 'Google', facebook: 'Facebook', instagram: 'Instagram',
  whatsapp: 'WhatsApp', referral: 'Referido', youtube: 'YouTube', other: 'Otro',
}

const COUNTRY_FLAGS: Record<string, string> = {
  DO:'🇩🇴', MX:'🇲🇽', CO:'🇨🇴', PE:'🇵🇪', CL:'🇨🇱', AR:'🇦🇷', VE:'🇻🇪',
  EC:'🇪🇨', BO:'🇧🇴', PY:'🇵🇾', UY:'🇺🇾', CR:'🇨🇷', PA:'🇵🇦', GT:'🇬🇹',
  SV:'🇸🇻', HN:'🇭🇳', NI:'🇳🇮', HT:'🇭🇹', US:'🇺🇸', ES:'🇪🇸', OTHER:'🌍',
}

const STATUS_BADGE: Record<string, string> = {
  new:       'bg-blue-100 text-blue-700 border-blue-200',
  contacted: 'bg-amber-100 text-amber-700 border-amber-200',
  converted: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected:  'bg-slate-100 text-slate-600 border-slate-200',
}

const STATUS_LABELS: Record<string, string> = {
  new:       'Nuevo',
  contacted: 'Contactado',
  converted: 'Convertido',
  rejected:  'Rechazado',
}

const buildWaLink = (whatsapp: string, name: string, plan: string | null): string => {
  const digits = (whatsapp || '').replace(/\D/g, '')
  const firstName = (name || '').split(' ')[0]
  const planTxt = plan && plan !== 'unsure'
    ? `el plan ${PLAN_LABELS[plan] || plan}`
    : 'PrestaMax'
  const body = `Hola ${firstName}, soy Juan de PrestaMax. Vi tu solicitud sobre ${planTxt}. ¿Tienes 10 minutos para conversar?`
  return `https://wa.me/${digits}?text=${encodeURIComponent(body)}`
}

const InquiriesPanel: React.FC = () => {
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [stats, setStats]         = useState<Stats | null>(null)
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState<string>('all')
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [savingId, setSavingId]   = useState<string | null>(null)

  const load = async () => {
    try {
      setLoading(true)
      const [list, st] = await Promise.all([
        api.get('/admin/inquiries' + (filter === 'all' ? '' : `?status=${filter}`)),
        api.get('/admin/inquiries/stats'),
      ])
      setInquiries(list.data || [])
      setStats(st.data || null)
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Error cargando leads')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filter])

  const updateStatus = async (id: string, status: string) => {
    try {
      setSavingId(id)
      await api.patch(`/admin/inquiries/${id}`, { status })
      toast.success(`Marcado como ${STATUS_LABELS[status] || status}`)
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'No se pudo actualizar')
    } finally { setSavingId(null) }
  }

  const saveNotes = async (id: string, notes: string) => {
    try {
      setSavingId(id)
      await api.patch(`/admin/inquiries/${id}`, { notes })
      toast.success('Nota guardada')
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'No se pudo guardar')
    } finally { setSavingId(null) }
  }

  const deleteInquiry = async (id: string) => {
    if (!window.confirm('¿Eliminar este lead? Esta acción no se puede deshacer.')) return
    try {
      await api.delete(`/admin/inquiries/${id}`)
      toast.success('Lead eliminado')
      setInquiries(prev => prev.filter(i => i.id !== id))
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'No se pudo eliminar')
    }
  }

  const openWhatsApp = (inq: Inquiry) => {
    window.open(buildWaLink(inq.whatsapp, inq.full_name, inq.plan_interest), '_blank', 'noopener,noreferrer')
    // Auto-marcar como contactado si era nuevo
    if (inq.status === 'new') {
      updateStatus(inq.id, 'contacted')
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h3 className="section-title">Solicitudes de Plan</h3>
          <p className="text-sm text-slate-500 mt-1">
            Leads desde la landing pública. Contáctalos por WhatsApp y márcales el estado.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refrescar
        </button>
      </div>

      {/* Stats / Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {(['all','new','contacted','converted','rejected'] as const).map(s => {
          const count = s === 'all' ? (stats?.total || 0) : (stats?.[s] || 0)
          const label = s === 'all' ? 'Todos' : STATUS_LABELS[s]
          const active = filter === s
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition ${
                active
                  ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="text-xs opacity-75">{label}</div>
              <div className="text-lg font-bold">{count}</div>
            </button>
          )
        })}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Cargando...</div>
      ) : inquiries.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 rounded-xl border border-dashed border-slate-200">
          <MessageCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="font-medium text-slate-600">Sin solicitudes</p>
          <p className="text-sm text-slate-400 mt-1">
            {filter === 'all' ? 'Cuando alguien envíe el form de la landing aparecerá aquí.' : 'No hay leads en este estado.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {inquiries.map(inq => {
            const isExp = expanded === inq.id
            const flag = COUNTRY_FLAGS[inq.country] || '🌍'
            const planLbl = PLAN_LABELS[inq.plan_interest || ''] || inq.plan_interest || '—'

            return (
              <div key={inq.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-slate-900">{inq.full_name}</h4>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGE[inq.status]}`}>
                          {STATUS_LABELS[inq.status]}
                        </span>
                        <span className="text-xs text-slate-500">{flag} {inq.country}</span>
                      </div>
                      {inq.business_name && (
                        <p className="text-sm text-slate-600 mt-0.5">🏢 {inq.business_name}</p>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {inq.whatsapp}</span>
                        <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {inq.email}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(inq.created_at)}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{planLbl}</span>
                        {inq.portfolio_size && (
                          <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{SIZE_LABELS[inq.portfolio_size] || inq.portfolio_size}</span>
                        )}
                        {inq.source && (
                          <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">📍 {SOURCE_LABELS[inq.source] || inq.source}</span>
                        )}
                      </div>
                    </div>

                    {/* Acciones rapidas */}
                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={() => openWhatsApp(inq)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700"
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                      </button>
                      <button
                        onClick={() => setExpanded(isExp ? null : inq.id)}
                        className="text-xs text-slate-500 hover:text-slate-700"
                      >
                        {isExp ? 'Ocultar' : 'Detalles'}
                      </button>
                    </div>
                  </div>

                  {/* Mensaje del prospecto */}
                  {inq.message && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-slate-700">
                      <span className="text-xs font-semibold text-blue-700 block mb-1">Mensaje del prospecto:</span>
                      <p className="whitespace-pre-wrap">{inq.message}</p>
                    </div>
                  )}
                </div>

                {/* Expanded section */}
                {isExp && (
                  <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-3">
                    {/* Cambiar status */}
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1.5">Estado del lead</label>
                      <div className="flex flex-wrap gap-2">
                        {(['new','contacted','converted','rejected'] as const).map(s => (
                          <button
                            key={s}
                            onClick={() => updateStatus(inq.id, s)}
                            disabled={inq.status === s || savingId === inq.id}
                            className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                              inq.status === s
                                ? 'bg-[#1e3a5f] text-white border-[#1e3a5f] cursor-default'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                            } disabled:opacity-60`}
                          >
                            {STATUS_LABELS[s]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Notas */}
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1.5">Notas internas</label>
                      <NotesEditor
                        initial={inq.notes || ''}
                        onSave={(n) => saveNotes(inq.id, n)}
                        saving={savingId === inq.id}
                      />
                    </div>

                    {/* Eliminar */}
                    <div className="flex justify-end pt-2 border-t border-slate-200">
                      <button
                        onClick={() => deleteInquiry(inq.id)}
                        className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> Eliminar lead
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Sub-componente: editor de notas con auto-save al perder foco
const NotesEditor: React.FC<{ initial: string; onSave: (n: string) => void; saving: boolean }> = ({ initial, onSave, saving }) => {
  const [val, setVal] = useState(initial)
  const [dirty, setDirty] = useState(false)
  return (
    <div>
      <textarea
        value={val}
        onChange={(e) => { setVal(e.target.value); setDirty(true) }}
        rows={2}
        placeholder="Conversación, próximos pasos, etc."
        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 resize-none"
      />
      {dirty && (
        <button
          onClick={() => { onSave(val); setDirty(false) }}
          disabled={saving}
          className="mt-2 px-3 py-1 text-xs bg-[#1e3a5f] text-white rounded hover:bg-[#152a45] disabled:opacity-60"
        >
          {saving ? 'Guardando...' : 'Guardar nota'}
        </button>
      )}
    </div>
  )
}

export default InquiriesPanel

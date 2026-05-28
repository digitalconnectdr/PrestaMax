// WhatsAppOutboxTab — Bandeja de envios (drafts generados automaticamente
// por eventos del sistema: prestamo creado, pago recibido, etc.)
//
// El usuario revisa cada draft, edita si quiere, y clica "Enviar por WhatsApp"
// que abre wa.me con el mensaje pre-cargado en su dispositivo. Tras enviar
// se marca como 'sent' en el sistema.

import React, { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Send, Trash2, MessageCircle, Phone, User, RefreshCw, Inbox } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import api, { isAccessDenied, isSubscriptionExpired } from '@/lib/api'
import toast from 'react-hot-toast'
import { useConfirm } from '@/hooks/useConfirm'

interface Draft {
  id: string
  clientPhone: string
  clientName: string | null
  clientFirstName: string | null
  body: string
  event: string
  loanId: string | null
  loanNumber: string | null
  createdAt: string
}

const EVENT_LABELS: Record<string, string> = {
  loan_created:     'Préstamo creado',
  payment_received: 'Pago recibido',
  pre_due_3:        'Por vencer (3 días)',
  overdue_1:        'Mora 1 día',
  overdue_7:        'Mora 7 días',
  overdue_15:       'Mora 15 días',
}

const EVENT_COLORS: Record<string, string> = {
  loan_created:     'bg-blue-50 text-blue-700 border-blue-200',
  payment_received: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pre_due_3:        'bg-purple-50 text-purple-700 border-purple-200',
  overdue_1:        'bg-amber-50 text-amber-700 border-amber-200',
  overdue_7:        'bg-orange-50 text-orange-700 border-orange-200',
  overdue_15:       'bg-red-50 text-red-700 border-red-200',
}

const WhatsAppOutboxTab: React.FC = () => {
  const { confirm, ConfirmHost } = useConfirm()
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editedBody, setEditedBody] = useState('')

  const fetchDrafts = async () => {
    try {
      const res = await api.get('/whatsapp/outbox?status=draft')
      setDrafts(res.data || [])
    } catch (err) {
      if (!isAccessDenied(err) && !isSubscriptionExpired(err)) {
        toast.error('No se pudieron cargar los drafts')
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchDrafts() }, [])

  const buildWaLink = (phone: string, body: string): string => {
    const clean = (phone || '').replace(/\D/g, '')
    return `https://wa.me/${clean}?text=${encodeURIComponent(body)}`
  }

  const handleSend = async (draft: Draft) => {
    const bodyToSend = editingId === draft.id ? editedBody : draft.body
    if (!draft.clientPhone) {
      toast.error('Este cliente no tiene teléfono de WhatsApp registrado')
      return
    }
    // Abrir WhatsApp con el mensaje pre-cargado
    window.open(buildWaLink(draft.clientPhone, bodyToSend), '_blank', 'noopener,noreferrer')
    // Marcar como enviado tras un pequeno delay (le da tiempo al user a abrir WA)
    setTimeout(async () => {
      try {
        await api.post(`/whatsapp/outbox/${draft.id}/mark-sent`)
        toast.success('Marcado como enviado')
        setEditingId(null)
        setDrafts(prev => prev.filter(d => d.id !== draft.id))
      } catch {
        toast.error('No se pudo marcar como enviado')
      }
    }, 500)
  }

  const handleDiscard = async (draft: Draft) => {
    const ok = await confirm({
      title: 'Descartar draft',
      message: '¿Eliminar este mensaje sin enviarlo? Esta acción no se puede deshacer.',
      confirmText: 'Descartar',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await api.delete(`/whatsapp/outbox/${draft.id}`)
      toast.success('Draft descartado')
      setDrafts(prev => prev.filter(d => d.id !== draft.id))
    } catch {
      toast.error('No se pudo descartar')
    }
  }

  const handleSendAll = async () => {
    if (drafts.length === 0) return
    const ok = await confirm({
      title: `Enviar ${drafts.length} mensajes`,
      message: `Se abrirán ${drafts.length} pestañas de WhatsApp en secuencia. Tu navegador puede pedirte autorización para abrir pop-ups. ¿Continuar?`,
      confirmText: `Abrir ${drafts.length} chats`,
    })
    if (!ok) return
    drafts.forEach((d, i) => {
      setTimeout(() => {
        if (!d.clientPhone) return
        window.open(buildWaLink(d.clientPhone, d.body), '_blank', 'noopener,noreferrer')
        api.post(`/whatsapp/outbox/${d.id}/mark-sent`).catch(() => {})
      }, i * 400)
    })
    setTimeout(fetchDrafts, drafts.length * 400 + 800)
  }

  if (isLoading) {
    return (
      <Card>
        <div className="text-center py-12 text-slate-400">Cargando...</div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <ConfirmHost />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Bandeja de envíos automáticos</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Mensajes generados por eventos del sistema. Revisa, edita si quieres, y envía.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchDrafts}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refrescar
          </Button>
          {drafts.length > 0 && (
            <Button size="sm" onClick={handleSendAll}>
              <Send className="w-3.5 h-3.5 mr-1" /> Enviar todos ({drafts.length})
            </Button>
          )}
        </div>
      </div>

      {drafts.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Inbox className="w-12 h-12 mb-3 opacity-50" />
            <p className="font-medium">Bandeja vacía</p>
            <p className="text-sm mt-1 max-w-md text-center">
              Cuando ocurra un evento (préstamo creado, pago recibido), aparecerá aquí un mensaje
              listo para enviar. Activa los eventos en la pestaña <strong>Configuración</strong>.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {drafts.map(draft => (
            <Card key={draft.id} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${EVENT_COLORS[draft.event] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                    {EVENT_LABELS[draft.event] || draft.event}
                  </span>
                  <span className="text-sm font-medium text-slate-800 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    {draft.clientName || 'Sin nombre'}
                  </span>
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {draft.clientPhone || 'sin teléfono'}
                  </span>
                  {draft.loanNumber && (
                    <span className="text-xs text-slate-500">· Préstamo {draft.loanNumber}</span>
                  )}
                </div>
                <span className="text-xs text-slate-400">{formatDate(draft.createdAt)}</span>
              </div>

              <div className="mt-3">
                {editingId === draft.id ? (
                  <textarea
                    value={editedBody}
                    onChange={(e) => setEditedBody(e.target.value)}
                    rows={5}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2 font-mono"
                  />
                ) : (
                  <div className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg border border-slate-200">
                    {draft.body}
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center gap-2 justify-end flex-wrap">
                {editingId === draft.id ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => { setEditingId(null); setEditedBody('') }}>
                      Cancelar edición
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => { setEditingId(draft.id); setEditedBody(draft.body) }}>
                    Editar
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => handleDiscard(draft)}>
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Descartar
                </Button>
                <Button size="sm" onClick={() => handleSend(draft)} disabled={!draft.clientPhone}>
                  <MessageCircle className="w-3.5 h-3.5 mr-1" /> Enviar por WhatsApp
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default WhatsAppOutboxTab

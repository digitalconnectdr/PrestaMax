import React, { useState, useEffect } from 'react'
import { usePermission } from '@/hooks/usePermission'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { PageLoadingState } from '@/components/ui/Loading'
import { MessageCircle, Send, Clock, CheckCheck, AlertCircle, Phone, Edit2, Trash2, Plus, X, Info } from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/utils'
import api, { isAccessDenied } from '@/lib/api'
import toast from 'react-hot-toast'

interface WhatsAppMessage {
  id: string
  clientPhone: string
  body: string
  event: string
  status: string
  sentAt: string
  createdAt: string
}

interface WhatsAppTemplate {
  id: string
  name: string
  event: string
  body: string
  isActive: boolean
}

interface Client {
  id: string
  fullName: string
  firstName: string
  lastName: string
  phonePersonal: string
  whatsapp: string
}

const EVENT_LABELS: Record<string, string> = {
  payment_reminder: 'Recordatorio de Pago',
  payment_received: 'Pago Recibido',
  loan_approved: 'Préstamo Aprobado',
  loan_disbursed: 'Préstamo Desembolsado',
  overdue_notice: 'Aviso de Mora',
  manual: 'Mensaje Manual',
}

const STATUS_COLORS: Record<string, string> = {
  sent: 'text-green-600',
  failed: 'text-red-600',
  pending: 'text-amber-600',
}

const WhatsAppPage: React.FC = () => {
  const { can } = usePermission()
  const [messages, setMessages] = useState<WhatsAppMessage[]>([])
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'messages' | 'send' | 'templates'>('messages')
  const [searchTerm, setSearchTerm] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [tenantData, setTenantData] = useState<any>({})

  const [sendForm, setSendForm] = useState({
    clientId: '',
    phone: '',
    body: '',
    event: 'manual',
  })
  const [selectedClientData, setSelectedClientData] = useState<any>(null)
  const [clientLoans, setClientLoans] = useState<any[]>([])

  // Template editing state
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null)
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [templateForm, setTemplateForm] = useState({ name: '', event: 'payment_reminder', body: '' })
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [msgRes, tmplRes, clientsRes, settingsRes] = await Promise.all([
          api.get('/whatsapp'),
          api.get('/whatsapp/templates'),
          api.get('/clients?limit=200'),
          api.get('/settings'),
        ])
        setMessages(msgRes.data || [])
        setTemplates(tmplRes.data || [])
        setClients(clientsRes.data.data || [])
        setTenantData(settingsRes.data?.tenant || settingsRes.data || {})
      } catch (err) {
        if (!isAccessDenied(err)) toast.error('Error al cargar mensajes de WhatsApp')
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [])

  // Replace template placeholders with real client/loan/company data
  const interpolateTemplate = (body: string, client: any, loans: any[]): string => {
    const activeLoan = loans.find((l) => l.status === 'active' || l.status === 'in_mora' || l.status === 'overdue') || loans[0]
    const now = new Date()
    // Next pending installment date
    const nextPaymentDate = activeLoan?.nextDueDate
      ? new Date(activeLoan.nextDueDate).toLocaleDateString('es-DO')
      : (activeLoan?.maturityDate ? new Date(activeLoan.maturityDate).toLocaleDateString('es-DO') : now.toLocaleDateString('es-DO'))

    const replacements: Record<string, string> = {
      // Client
      '{{client_name}}':    client ? (client.fullName || `${client.firstName || ''} ${client.lastName || ''}`.trim()) : 'Cliente',
      '{{client_id}}':      client?.idNumber || client?.cedula || '',
      '{{client_address}}': client?.address || '',
      '{{client_city}}':    client?.city || '',
      '{{client_email}}':   client?.email || '',
      '{{client_phone}}':   client?.phonePersonal || client?.whatsapp || client?.phone || '',
      // Company — pulled from tenant settings loaded at page init
      '{{company_name}}':    tenantData?.name || '',
      '{{company_address}}': tenantData?.address || '',
      '{{company_phone}}':   tenantData?.phone || '',
      '{{company_email}}':   tenantData?.email || '',
      // Loan
      '{{loan_number}}':       activeLoan?.loanNumber || 'N/A',
      '{{amount}}':            activeLoan ? formatCurrency(activeLoan.disbursedAmount || activeLoan.requestedAmount || activeLoan.totalBalance) : 'RD$0.00',
      '{{balance}}':           activeLoan ? formatCurrency(activeLoan.totalBalance || 0) : 'RD$0.00',
      '{{capital}}':           activeLoan ? formatCurrency(activeLoan.principalBalance || 0) : 'RD$0.00',
      '{{interest}}':          activeLoan ? formatCurrency(activeLoan.interestBalance || 0) : 'RD$0.00',
      '{{mora}}':              activeLoan ? formatCurrency(activeLoan.moraBalance || 0) : 'RD$0.00',
      '{{mora_amount}}':       activeLoan ? formatCurrency(activeLoan.moraBalance || 0) : 'RD$0.00',
      '{{total}}':             activeLoan ? formatCurrency(activeLoan.totalBalance || 0) : 'RD$0.00',
      '{{days}}':              activeLoan ? String(activeLoan.daysOverdue || 0) : '0',
      '{{due_date}}':          activeLoan?.maturityDate ? new Date(activeLoan.maturityDate).toLocaleDateString('es-DO') : now.toLocaleDateString('es-DO'),
      '{{next_payment_date}}': nextPaymentDate,
      '{{date}}':              now.toLocaleDateString('es-DO'),
    }
    let result = body
    for (const [key, val] of Object.entries(replacements)) {
      result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), val)
    }
    return result
  }

  const handleClientSelect = async (clientId: string) => {
    const client = clients.find((c) => c.id === clientId)
    if (!client) return
    setSendForm((f) => ({
      ...f,
      clientId,
      phone: (client as any).whatsapp || (client as any).phonePersonal || '',
    }))
    setSelectedClientData(client)
    // Fetch client loans for interpolation
    try {
      const res = await api.get(`/loans?client_id=${clientId}&limit=10`)
      const loans = res.data.data || []
      setClientLoans(loans)
      // Re-interpolate current body if there's content
      setSendForm((f) => ({
        ...f,
        body: f.body ? interpolateTemplate(f.body, client, loans) : f.body,
      }))
    } catch (e) {
      setClientLoans([])
    }
  }

  const handleTemplateSelect = (templateId: string) => {
    const tmpl = templates.find((t) => t.id === templateId)
    if (!tmpl) return
    // Replace placeholders with actual data
    const interpolated = interpolateTemplate(tmpl.body, selectedClientData, clientLoans)
    setSendForm((f) => ({ ...f, body: interpolated, event: tmpl.event }))
  }

  const handleSend = async () => {
    if (!sendForm.phone || !sendForm.body) {
      toast.error('Ingresa el teléfono y el mensaje')
      return
    }
    try {
      setIsSending(true)
      const res = await api.post('/whatsapp/send', {
        clientPhone: sendForm.phone,
        body: sendForm.body,
        event: sendForm.event,
      })
      toast.success('Mensaje registrado')
      setMessages((prev) => [res.data, ...prev])
      setSendForm({ clientId: '', phone: '', body: '', event: 'manual' })
      setActiveTab('messages')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al enviar mensaje')
    } finally {
      setIsSending(false)
    }
  }

  const handleSaveTemplate = async () => {
    if (!templateForm.name || !templateForm.body) return toast.error('Nombre y mensaje son requeridos')
    setIsSavingTemplate(true)
    try {
      if (editingTemplate) {
        const res = await api.put(`/whatsapp/templates/${editingTemplate.id}`, templateForm)
        setTemplates(prev => prev.map(t => t.id === editingTemplate.id ? res.data : t))
        toast.success('Plantilla actualizada')
      } else {
        const res = await api.post('/whatsapp/templates', templateForm)
        setTemplates(prev => [...prev, res.data])
        toast.success('Plantilla creada')
      }
      setShowTemplateForm(false)
      setEditingTemplate(null)
      setTemplateForm({ name: '', event: 'payment_reminder', body: '' })
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al guardar plantilla')
    } finally {
      setIsSavingTemplate(false)
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('¿Eliminar esta plantilla?')) return
    try {
      await api.delete(`/whatsapp/templates/${id}`)
      setTemplates(prev => prev.filter(t => t.id !== id))
      toast.success('Plantilla eliminada')
    } catch (err: any) {
      toast.error('Error al eliminar plantilla')
    }
  }

  const startEditTemplate = (tmpl: WhatsAppTemplate) => {
    setEditingTemplate(tmpl)
    setTemplateForm({ name: tmpl.name, event: tmpl.event, body: tmpl.body })
    setShowTemplateForm(true)
  }

  const insertVariable = (variable: string) => {
    setTemplateForm(prev => ({ ...prev, body: prev.body + variable }))
  }

  const filteredMessages = messages.filter((m) =>
    (m.clientPhone || '').includes(searchTerm) ||
    (m.body || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    EVENT_LABELS[m.event]?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (isLoading) return <PageLoadingState />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">WhatsApp</h1>
          <p className="text-slate-600 text-sm mt-1">Mensajes y comunicaciones con clientes</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-full">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs font-medium text-green-700">Integración activa</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="text-center p-4">
          <p className="text-xs text-slate-500 uppercase font-medium">Total Mensajes</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{messages.length}</p>
        </Card>
        <Card className="text-center p-4 bg-green-50">
          <p className="text-xs text-slate-500 uppercase font-medium">Enviados</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{messages.filter((m) => m.status === 'sent').length}</p>
        </Card>
        <Card className="text-center p-4">
          <p className="text-xs text-slate-500 uppercase font-medium">Plantillas</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{templates.length}</p>
        </Card>
        <Card className="text-center p-4 bg-blue-50">
          <p className="text-xs text-slate-500 uppercase font-medium">Automatizados</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{messages.filter((m) => m.event !== 'manual').length}</p>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {([
          { id: 'messages', label: 'Historial', show: true },
          { id: 'send', label: 'Enviar Mensaje', show: can('whatsapp.send') },
          { id: 'templates', label: 'Plantillas', show: can('whatsapp.templates') },
        ] as const).filter(t => t.show).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-white border border-b-white border-slate-200 text-blue-700'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Messages History Tab */}
      {activeTab === 'messages' && (
        <div className="space-y-4">
          <Card>
            <Input
              type="text"
              placeholder="Buscar por teléfono, mensaje o tipo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </Card>

          {filteredMessages.length > 0 ? (
            <Card>
              <div className="divide-y divide-slate-100">
                {filteredMessages.map((msg) => (
                  <div key={msg.id} className="py-4 px-2 flex items-start gap-4">
                    <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <MessageCircle className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="flex items-center gap-1 text-sm font-medium text-slate-700">
                          <Phone className="w-3 h-3" />
                          {msg.clientPhone}
                        </span>
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                          {EVENT_LABELS[msg.event] || msg.event}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 truncate">{msg.body}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`text-xs flex items-center gap-1 ${STATUS_COLORS[msg.status] || 'text-slate-500'}`}>
                          {msg.status === 'sent' ? <CheckCheck className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          {msg.status === 'sent' ? 'Enviado' : msg.status === 'failed' ? 'Fallido' : 'Pendiente'}
                        </span>
                        <span className="text-xs text-slate-400">{formatDate(msg.sentAt || msg.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <MessageCircle className="w-12 h-12 mb-3 opacity-50" />
              <p className="font-medium">Sin mensajes registrados</p>
              <p className="text-sm mt-1">Los mensajes enviados a clientes aparecerán aquí</p>
              {can('whatsapp.send') && (
                <button
                  onClick={() => setActiveTab('send')}
                  className="mt-4 text-sm text-blue-600 hover:underline"
                >
                  Enviar primer mensaje →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Send Message Tab */}
      {activeTab === 'send' && can('whatsapp.send') && (
        <Card>
          <h2 className="section-title mb-4">Enviar Mensaje Manual</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Cliente (opcional)</label>
              <select
                value={sendForm.clientId}
                onChange={(e) => handleClientSelect(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Selecciona un cliente para autocompletar --</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName || `${c.firstName} ${c.lastName}`} – {c.phonePersonal}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Número de WhatsApp *</label>
              <div className="flex gap-2">
                <span className="flex items-center px-3 py-2 bg-slate-50 border border-slate-300 rounded-l-lg text-sm text-slate-500 border-r-0">
                  +1
                </span>
                <input
                  type="tel"
                  value={sendForm.phone}
                  onChange={(e) => setSendForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="809-555-0000"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 border-l-0"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Plantilla (opcional)</label>
              <select
                onChange={(e) => handleTemplateSelect(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Selecciona una plantilla --</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Evento</label>
              <select
                value={sendForm.event}
                onChange={(e) => setSendForm((f) => ({ ...f, event: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(EVENT_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mensaje *</label>
              <textarea
                value={sendForm.body}
                onChange={(e) => setSendForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="Escribe tu mensaje aquí..."
                rows={5}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-400 mt-1">{sendForm.body.length} caracteres</p>
            </div>

            {sendForm.phone && sendForm.body && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-xs font-medium text-green-800 mb-1">Vista previa del enlace:</p>
                <a
                  href={`https://wa.me/${sendForm.phone.replace(/\D/g, '')}?text=${encodeURIComponent(sendForm.body)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-green-700 hover:underline break-all"
                >
                  Abrir en WhatsApp Web →
                </a>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setSendForm({ clientId: '', phone: '', body: '', event: 'manual' })}>
                Limpiar
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 flex items-center justify-center gap-2"
                onClick={handleSend}
                disabled={isSending || !sendForm.phone || !sendForm.body}
              >
                <Send className="w-4 h-4" />
                {isSending ? 'Registrando...' : 'Registrar Envío'}
              </Button>
            </div>
            <p className="text-xs text-slate-400 text-center">
              El mensaje se registra en el sistema. Usa el enlace de vista previa para abrir WhatsApp Web.
            </p>
          </div>
        </Card>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && can('whatsapp.templates') && (
        <div className="space-y-4">
          {/* Header + New button */}
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-slate-800">Plantillas de Mensajes</h3>
              <p className="text-xs text-slate-500 mt-0.5">Crea y edita plantillas reutilizables con variables dinámicas</p>
            </div>
            <Button size="sm" className="flex items-center gap-2"
              onClick={() => { setEditingTemplate(null); setTemplateForm({ name: '', event: 'payment_reminder', body: '' }); setShowTemplateForm(true) }}>
              <Plus className="w-4 h-4"/>Nueva Plantilla
            </Button>
          </div>

          {/* Template form (create/edit) */}
          {showTemplateForm && (
            <Card className="bg-slate-50 border-blue-200">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-semibold text-slate-800">{editingTemplate ? `Editando: ${editingTemplate.name}` : 'Nueva Plantilla'}</h4>
                <button onClick={() => { setShowTemplateForm(false); setEditingTemplate(null) }} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4"/></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
                  <input value={templateForm.name} onChange={e => setTemplateForm(p=>({...p,name:e.target.value}))}
                    placeholder="Ej: Recordatorio de pago mensual"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Evento</label>
                  <select value={templateForm.event} onChange={e => setTemplateForm(p=>({...p,event:e.target.value}))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {Object.entries(EVENT_LABELS).map(([val,label]) => <option key={val} value={val}>{label}</option>)}
                  </select>
                </div>
              </div>

              {/* Variables reference panel */}
              <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-1.5 mb-2">
                  <Info className="w-3.5 h-3.5 text-blue-600"/>
                  <span className="text-xs font-semibold text-blue-700">Variables disponibles — clic para insertar:</span>
                </div>
                {[
                  { label: 'Deudor', vars: ['{{client_name}}','{{client_id}}','{{client_address}}','{{client_city}}','{{client_email}}','{{client_phone}}'] },
                  { label: 'Empresa', vars: ['{{company_name}}','{{company_address}}','{{company_phone}}','{{company_email}}'] },
                  { label: 'Préstamo', vars: ['{{loan_number}}','{{amount}}','{{balance}}','{{capital}}','{{interest}}','{{mora}}','{{mora_amount}}','{{total}}','{{days}}','{{due_date}}','{{next_payment_date}}','{{date}}'] },
                ].map(group => (
                  <div key={group.label} className="mb-1.5">
                    <p className="text-xs text-blue-500 font-medium mb-1">{group.label}</p>
                    <div className="flex flex-wrap gap-1">
                      {group.vars.map(v => (
                        <button key={v} onClick={() => insertVariable(v)}
                          className="text-xs bg-white border border-blue-300 text-blue-700 px-2 py-0.5 rounded hover:bg-blue-100 font-mono transition-colors">
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mb-3">
                <label className="block text-sm font-medium text-slate-700 mb-1">Mensaje * <span className="text-slate-400 font-normal">({templateForm.body.length} chars)</span></label>
                <textarea value={templateForm.body}
                  onChange={e => setTemplateForm(p=>({...p,body:e.target.value}))}
                  rows={8}
                  placeholder={`Hola {{client_name}},\n\nTe recordamos que tu pago del préstamo #{{loan_number}} de {{amount}} está pendiente.\n\nFecha de vencimiento: {{due_date}}\n\nGracias.`}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>

              {/* Preview */}
              {templateForm.body && (
                <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs font-medium text-green-800 mb-1">Vista previa (con datos de ejemplo):</p>
                  <p className="text-sm text-green-900 whitespace-pre-wrap">
                    {templateForm.body
                      .replace(/\{\{client_name\}\}/g, 'Juan Pérez')
                      .replace(/\{\{client_id\}\}/g, '001-1234567-8')
                      .replace(/\{\{client_address\}\}/g, 'Calle Principal #12')
                      .replace(/\{\{client_city\}\}/g, 'Santo Domingo')
                      .replace(/\{\{client_email\}\}/g, 'juan@email.com')
                      .replace(/\{\{client_phone\}\}/g, '809-555-0101')
                      .replace(/\{\{company_name\}\}/g, tenantData?.name || 'Mi Empresa')
                      .replace(/\{\{company_address\}\}/g, tenantData?.address || 'Av. Principal 45')
                      .replace(/\{\{company_phone\}\}/g, tenantData?.phone || '809-555-0000')
                      .replace(/\{\{company_email\}\}/g, tenantData?.email || 'info@empresa.com')
                      .replace(/\{\{loan_number\}\}/g, 'P-001-0001')
                      .replace(/\{\{amount\}\}/g, 'RD$15,000.00')
                      .replace(/\{\{balance\}\}/g, 'RD$12,500.00')
                      .replace(/\{\{mora_amount\}\}/g, 'RD$250.00')
                      .replace(/\{\{days\}\}/g, '5')
                      .replace(/\{\{capital\}\}/g, 'RD$10,000.00')
                      .replace(/\{\{interest\}\}/g, 'RD$2,500.00')
                      .replace(/\{\{mora\}\}/g, 'RD$250.00')
                      .replace(/\{\{total\}\}/g, 'RD$12,750.00')
                      .replace(/\{\{due_date\}\}/g, '15/05/2026')
                      .replace(/\{\{next_payment_date\}\}/g, '13/05/2026')
                      .replace(/\{\{date\}\}/g, new Date().toLocaleDateString('es-DO'))
                    }
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveTemplate} isLoading={isSavingTemplate} disabled={isSavingTemplate}>
                  {editingTemplate ? 'Actualizar Plantilla' : 'Crear Plantilla'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowTemplateForm(false); setEditingTemplate(null) }}>Cancelar</Button>
              </div>
            </Card>
          )}

          {/* Template list */}
          {templates.length > 0 ? (
            <div className="space-y-3">
              {templates.map((tmpl) => (
                <Card key={tmpl.id}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-slate-900">{tmpl.name}</p>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        {EVENT_LABELS[tmpl.event] || tmpl.event}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setSendForm(f => ({ ...f, body: tmpl.body, event: tmpl.event })); setActiveTab('send') }}
                        className="px-2 py-1 text-xs border border-slate-300 rounded text-slate-600 hover:bg-slate-50 transition-colors">
                        Usar
                      </button>
                      {can('whatsapp.templates') && (
                        <button onClick={() => startEditTemplate(tmpl)}
                          className="p-1.5 hover:bg-blue-50 rounded text-blue-600 transition-colors" title="Editar">
                          <Edit2 className="w-4 h-4"/>
                        </button>
                      )}
                      {can('whatsapp.templates') && (
                        <button onClick={() => handleDeleteTemplate(tmpl.id)}
                          className="p-1.5 hover:bg-red-50 rounded text-red-500 transition-colors" title="Eliminar">
                          <Trash2 className="w-4 h-4"/>
                        </button>
                      )}
                    </div>
                  </div>
                  <pre className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap font-sans border border-slate-100">
                    {tmpl.body}
                  </pre>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {['{{client_name}}','{{loan_number}}','{{amount}}','{{balance}}','{{mora_amount}}','{{days}}','{{due_date}}','{{date}}']
                      .filter(v => tmpl.body.includes(v))
                      .map(v => (
                        <span key={v} className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">{v}</span>
                      ))}
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <AlertCircle className="w-12 h-12 mb-3 opacity-50" />
              <p className="font-medium">Sin plantillas configuradas</p>
              <p className="text-sm mt-1">Crea tu primera plantilla de mensaje</p>
              <button onClick={() => { setEditingTemplate(null); setTemplateForm({ name: '', event: 'payment_reminder', body: '' }); setShowTemplateForm(true) }}
                className="mt-4 text-sm text-blue-600 hover:underline">
                + Crear primera plantilla →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default WhatsAppPage

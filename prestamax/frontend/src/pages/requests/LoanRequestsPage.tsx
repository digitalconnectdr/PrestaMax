import React, { useState, useEffect } from 'react'
import { usePermission } from '@/hooks/usePermission'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { PageLoadingState } from '@/components/ui/Loading'
import {
  ClipboardList, CheckCircle, XCircle, Clock, Eye, X,
  User, Phone, Mail, MapPin, FileText, DollarSign, Calendar,
  RefreshCw, Copy, Link2, AlertCircle, ShieldCheck, RotateCcw
} from 'lucide-react'
import api, { isAccessDenied } from '@/lib/api'
import toast from 'react-hot-toast'
import { formatDate } from '@/lib/utils'

interface LoanRequest {
  id: string
  tenantId: string
  clientName: string
  clientEmail: string | null
  clientPhone: string
  clientAddress: string | null
  idNumber: string | null
  dateOfBirth: string | null
  gender: string | null
  maritalStatus: string | null
  nationality: string | null
  whatsapp: string | null
  city: string | null
  province: string | null
  phoneWork: string | null
  phoneFamily: string | null
  familyContactName: string | null
  familyRelationship: string | null
  occupation: string | null
  employer: string | null
  monthlyIncome: number | null
  economicActivity: string | null
  loanAmount: number | null
  loanPurpose: string | null
  loanTerm: number | null
  idFrontImage: string | null
  idBackImage: string | null
  status: 'pending' | 'approved' | 'rejected' | 'converted'
  rejectionReason: string | null
  notes: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
}

const STATUS_CONFIG = {
  pending:   { label: 'Pendiente',  color: 'bg-amber-100 text-amber-700 border-amber-200',   icon: Clock },
  approved:  { label: 'Aprobada',   color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle },
  rejected:  { label: 'Rechazada', color: 'bg-red-100 text-red-700 border-red-200',          icon: XCircle },
  converted: { label: 'Convertida', color: 'bg-blue-100 text-blue-700 border-blue-200',      icon: ShieldCheck },
}

const LoanRequestsPage: React.FC = () => {
  const { can } = usePermission()
  const [requests, setRequests] = useState<LoanRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [selectedRequest, setSelectedRequest] = useState<LoanRequest | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [rejectForm, setRejectForm] = useState({ open: false, reason: '', notes: '' })
  const [isActing, setIsActing] = useState(false)
  const [publicLink, setPublicLink] = useState<string>('')
  const [showLinkPanel, setShowLinkPanel] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [showImageModal, setShowImageModal] = useState<{ src: string; label: string } | null>(null)
  const [showConvertModal, setShowConvertModal] = useState(false)
  const [products, setProducts] = useState<any[]>([])
  const [bankAccounts, setBankAccounts] = useState<any[]>([])
  const [convertForm, setConvertForm] = useState({
    productId: '', rate: '', rateType: 'monthly', term: '', termUnit: 'months',
    paymentFrequency: 'monthly', amortizationType: 'fixed_installment',
    firstPaymentDate: '', disbursementBankAccountId: '',
  })

  const loadRequests = async () => {
    setIsLoading(true)
    try {
      const res = await api.get('/loan-requests', { params: { status: filterStatus } })
      setRequests(res.data || [])
    } catch(err) { if (!isAccessDenied(err)) toast.error('Error cargando solicitudes') }
    finally { setIsLoading(false) }
  }

  const loadPublicLink = async () => {
    try {
      const res = await api.get('/loan-requests/settings/public-link')
      const base = window.location.origin
      setPublicLink(`${base}/apply/${res.data.publicToken}`)
    } catch {}
  }

  useEffect(() => { loadRequests(); loadPublicLink() }, [filterStatus])

  useEffect(() => {
    api.get('/products').then(r => setProducts(Array.isArray(r.data) ? r.data : [])).catch(() => {})
    api.get('/settings/bank-accounts').then(r => setBankAccounts(Array.isArray(r.data) ? r.data : [])).catch(() => {})
  }, [])

  const openDetail = async (req: LoanRequest) => {
    setIsLoadingDetail(true)
    setSelectedRequest(req)
    try {
      const res = await api.get(`/loan-requests/${req.id}`)
      setSelectedRequest(res.data)
    } catch(err) { if (!isAccessDenied(err)) toast.error('Error cargando detalle') }
    finally { setIsLoadingDetail(false) }
  }

  const handleApprove = async () => {
    if (!selectedRequest) return
    setIsActing(true)
    try {
      await api.put(`/loan-requests/${selectedRequest.id}/approve`, {})
      toast.success('Solicitud aprobada')
      setSelectedRequest(null)
      loadRequests()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al aprobar')
    } finally { setIsActing(false) }
  }

  const handleReject = async () => {
    if (!selectedRequest || !rejectForm.reason) return toast.error('El motivo es obligatorio')
    setIsActing(true)
    try {
      await api.put(`/loan-requests/${selectedRequest.id}/reject`, {
        rejectionReason: rejectForm.reason,
        notes: rejectForm.notes || undefined,
      })
      toast.success('Solicitud rechazada')
      setSelectedRequest(null)
      setRejectForm({ open: false, reason: '', notes: '' })
      loadRequests()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al rechazar')
    } finally { setIsActing(false) }
  }

  const handleConvert = async () => {
    if (!selectedRequest) return
    if (!convertForm.productId) return toast.error('Selecciona un producto')
    if (!convertForm.term) return toast.error('Ingresa el plazo')
    if (!convertForm.rate) return toast.error('Ingresa la tasa de interés')
    const firstDate = convertForm.firstPaymentDate || (() => {
      const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().split('T')[0]
    })()
    setIsActing(true)
    try {
      const res = await api.put(`/loan-requests/${selectedRequest.id}/convert`, {
        productId: convertForm.productId,
        rate: parseFloat(convertForm.rate),
        rateType: convertForm.rateType,
        term: parseInt(convertForm.term),
        termUnit: convertForm.termUnit,
        paymentFrequency: convertForm.paymentFrequency,
        amortizationType: convertForm.amortizationType,
        firstPaymentDate: firstDate,
        disbursementBankAccountId: convertForm.disbursementBankAccountId || undefined,
      })
      toast.success(`Préstamo ${res.data.loanNumber} creado exitosamente`)
      setSelectedRequest(null)
      setShowConvertModal(false)
      setConvertForm({ productId: '', rate: '', rateType: 'monthly', term: '', termUnit: 'months', paymentFrequency: 'monthly', amortizationType: 'fixed_installment', firstPaymentDate: '', disbursementBankAccountId: '' })
      loadRequests()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al convertir solicitud')
    } finally { setIsActing(false) }
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicLink)
    toast.success('Link copiado al portapapeles')
  }

  const handleRegenerateToken = async () => {
    if (!confirm('¿Regenerar el link? El link anterior dejará de funcionar.')) return
    setIsRegenerating(true)
    try {
      await api.post('/loan-requests/settings/regenerate-token', {})
      await loadPublicLink()
      toast.success('Link regenerado')
    } catch { toast.error('Error') }
    finally { setIsRegenerating(false) }
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-blue-600" />
            Solicitudes de Préstamo
            {pendingCount > 0 && (
              <span className="ml-2 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pendingCount} nueva{pendingCount !== 1 ? 's' : ''}</span>
            )}
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Solicitudes enviadas por clientes desde el portal público</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowLinkPanel(!showLinkPanel)} className="flex items-center gap-1.5">
            <Link2 className="w-4 h-4" />Link del Portal
          </Button>
          <Button size="sm" variant="outline" onClick={loadRequests} className="flex items-center gap-1">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Public Link Panel */}
      {showLinkPanel && (
        <Card className="bg-blue-50 border-blue-200">
          <div className="flex items-start gap-3">
            <Link2 className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-blue-900 mb-1">Link del portal público de solicitudes</p>
              <p className="text-xs text-blue-600 mb-3">Comparte este link con tus clientes para que puedan enviar solicitudes de préstamo desde cualquier dispositivo.</p>
              <div className="flex gap-2 flex-wrap">
                <div className="flex-1 min-w-0 bg-white border border-blue-200 rounded-lg px-3 py-2 font-mono text-xs text-blue-800 truncate">
                  {publicLink || 'Cargando...'}
                </div>
                <Button size="sm" onClick={handleCopyLink} className="flex items-center gap-1 flex-shrink-0">
                  <Copy className="w-3.5 h-3.5" />Copiar
                </Button>
                <Button size="sm" variant="outline" onClick={handleRegenerateToken} disabled={isRegenerating}
                  className="flex items-center gap-1 flex-shrink-0 border-amber-300 text-amber-700 hover:bg-amber-50">
                  <RotateCcw className="w-3.5 h-3.5" />{isRegenerating ? 'Regenerando...' : 'Nuevo link'}
                </Button>
              </div>
              <p className="text-xs text-blue-500 mt-2">⚠️ Si generas un nuevo link, el anterior dejará de funcionar.</p>
            </div>
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { value: 'all', label: 'Todas' },
          { value: 'pending', label: '⏳ Pendientes' },
          { value: 'approved', label: '✅ Aprobadas' },
          { value: 'rejected', label: '❌ Rechazadas' },
          { value: 'converted', label: '🔄 Convertidas' },
        ].map(f => (
          <button key={f.value} onClick={() => setFilterStatus(f.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filterStatus === f.value ? 'bg-[#1e3a5f] text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? <PageLoadingState /> : requests.length > 0 ? (
        <div className="space-y-3">
          {requests.map(req => {
            const statusConf = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending
            const StatusIcon = statusConf.icon
            return (
              <Card key={req.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => openDetail(req)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-slate-900">{req.clientName}</span>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${statusConf.color}`}>
                        <StatusIcon className="w-3 h-3" />{statusConf.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                      <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{req.clientPhone}</span>
                      {req.clientEmail && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{req.clientEmail}</span>}
                      {req.loanAmount && <span className="flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" />${req.loanAmount.toLocaleString()}</span>}
                      {req.loanPurpose && <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" />{req.loanPurpose}</span>}
                    </div>
                    {req.status === 'rejected' && req.rejectionReason && (
                      <p className="text-xs text-red-600 mt-1">Motivo: {req.rejectionReason}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-slate-400">{req.createdAt?.slice(0,10)}</p>
                    <button className="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" />Ver detalle
                    </button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        <EmptyState icon={ClipboardList} title="Sin solicitudes"
          description={filterStatus === 'all' ? 'Aún no hay solicitudes. Comparte el link del portal con tus clientes.' : `No hay solicitudes con estado "${filterStatus}".`} />
      )}

      {/* ── Detail Modal ── */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">{selectedRequest.clientName}</h3>
                <p className="text-xs text-slate-400 mt-0.5">Solicitud #{selectedRequest.id.slice(0,8).toUpperCase()}</p>
              </div>
              <div className="flex items-center gap-2">
                {(() => { const sc = STATUS_CONFIG[selectedRequest.status]; const Icon = sc.icon; return (
                  <span className={`inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full border font-medium ${sc.color}`}>
                    <Icon className="w-3 h-3" />{sc.label}
                  </span>
                )})()}
                <button onClick={() => { setSelectedRequest(null); setRejectForm({ open: false, reason: '', notes: '' }) }}
                  className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
            </div>

            {isLoadingDetail ? (
              <div className="p-8 text-center text-slate-400">Cargando...</div>
            ) : (
              <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
                {/* Loan info summary */}
                {(selectedRequest.loanAmount || selectedRequest.loanTerm || selectedRequest.loanPurpose) && (
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-2">Información del Préstamo</p>
                    <div className="grid grid-cols-3 gap-3">
                      {selectedRequest.loanAmount && (
                        <div><p className="text-xs text-blue-400">Monto</p><p className="font-bold text-blue-700">${selectedRequest.loanAmount.toLocaleString()}</p></div>
                      )}
                      {selectedRequest.loanTerm && (
                        <div><p className="text-xs text-blue-400">Plazo</p><p className="font-medium text-blue-700">{selectedRequest.loanTerm} meses</p></div>
                      )}
                      {selectedRequest.loanPurpose && (
                        <div><p className="text-xs text-blue-400">Propósito</p><p className="font-medium text-blue-700">{selectedRequest.loanPurpose}</p></div>
                      )}
                    </div>
                  </div>
                )}

                {/* Client personal data */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Datos Personales</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      { label: 'Cédula', value: selectedRequest.idNumber },
                      { label: 'Fecha nacimiento', value: selectedRequest.dateOfBirth },
                      { label: 'Género', value: selectedRequest.gender === 'male' ? 'Masculino' : selectedRequest.gender === 'female' ? 'Femenino' : selectedRequest.gender },
                      { label: 'Estado civil', value: { single:'Soltero/a', married:'Casado/a', divorced:'Divorciado/a', widowed:'Viudo/a', cohabiting:'Unión libre' }[selectedRequest.maritalStatus || ''] || selectedRequest.maritalStatus },
                      { label: 'Nacionalidad', value: selectedRequest.nationality },
                    ].filter(f => f.value).map(f => (
                      <div key={f.label} className="p-2.5 bg-slate-50 rounded-lg">
                        <p className="text-xs text-slate-400">{f.label}</p>
                        <p className="font-medium text-slate-800">{f.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Contact */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Contacto</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      { label: 'Teléfono personal', value: selectedRequest.clientPhone },
                      { label: 'WhatsApp', value: selectedRequest.whatsapp },
                      { label: 'Correo', value: selectedRequest.clientEmail },
                      { label: 'Teléfono laboral', value: selectedRequest.phoneWork },
                    ].filter(f => f.value).map(f => (
                      <div key={f.label} className="p-2.5 bg-slate-50 rounded-lg">
                        <p className="text-xs text-slate-400">{f.label}</p>
                        <p className="font-medium text-slate-800 truncate">{f.value}</p>
                      </div>
                    ))}
                    {(selectedRequest.clientAddress || selectedRequest.city || selectedRequest.province) && (
                      <div className="col-span-2 p-2.5 bg-slate-50 rounded-lg">
                        <p className="text-xs text-slate-400">Dirección</p>
                        <p className="font-medium text-slate-800">
                          {[selectedRequest.clientAddress, selectedRequest.city, selectedRequest.province].filter(Boolean).join(', ')}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Work info */}
                {(selectedRequest.occupation || selectedRequest.employer || selectedRequest.monthlyIncome || selectedRequest.economicActivity) && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Información Laboral</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {[
                        { label: 'Ocupación', value: selectedRequest.occupation },
                        { label: 'Empresa', value: selectedRequest.employer },
                        { label: 'Ingresos mensuales', value: selectedRequest.monthlyIncome ? `RD$ ${selectedRequest.monthlyIncome.toLocaleString()}` : null },
                        { label: 'Actividad económica', value: selectedRequest.economicActivity },
                      ].filter(f => f.value).map(f => (
                        <div key={f.label} className="p-2.5 bg-slate-50 rounded-lg">
                          <p className="text-xs text-slate-400">{f.label}</p>
                          <p className="font-medium text-slate-800">{f.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Family reference */}
                {(selectedRequest.familyContactName || selectedRequest.phoneFamily) && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Referencia Familiar</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {[
                        { label: 'Familiar / Contacto', value: selectedRequest.familyContactName },
                        { label: 'Parentesco', value: selectedRequest.familyRelationship },
                        { label: 'Teléfono familiar', value: selectedRequest.phoneFamily },
                      ].filter(f => f.value).map(f => (
                        <div key={f.label} className="p-2.5 bg-slate-50 rounded-lg">
                          <p className="text-xs text-slate-400">{f.label}</p>
                          <p className="font-medium text-slate-800">{f.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ID Images */}
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2">Fotos de Cédula</p>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedRequest.idFrontImage ? (
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Parte frontal</p>
                        <img src={selectedRequest.idFrontImage} alt="Cédula frente" onClick={() => setShowImageModal({ src: selectedRequest.idFrontImage!, label: 'Cédula — Parte frontal' })}
                          className="w-full h-36 object-cover rounded-xl border border-slate-200 cursor-zoom-in hover:opacity-90 transition-opacity" />
                      </div>
                    ) : <div className="bg-slate-100 rounded-xl h-36 flex items-center justify-center text-slate-300 text-xs">Sin imagen</div>}
                    {selectedRequest.idBackImage ? (
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Parte trasera</p>
                        <img src={selectedRequest.idBackImage} alt="Cédula reverso" onClick={() => setShowImageModal({ src: selectedRequest.idBackImage!, label: 'Cédula — Parte trasera' })}
                          className="w-full h-36 object-cover rounded-xl border border-slate-200 cursor-zoom-in hover:opacity-90 transition-opacity" />
                      </div>
                    ) : <div className="bg-slate-100 rounded-xl h-36 flex items-center justify-center text-slate-300 text-xs">Sin imagen</div>}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Haz clic en una imagen para ampliarla</p>
                </div>

                {/* Rejection reason (if rejected) */}
                {selectedRequest.status === 'rejected' && selectedRequest.rejectionReason && (
                  <div className="flex gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-700">Motivo de rechazo</p>
                      <p className="text-sm text-red-600">{selectedRequest.rejectionReason}</p>
                      {selectedRequest.notes && <p className="text-xs text-red-400 mt-1">{selectedRequest.notes}</p>}
                    </div>
                  </div>
                )}

                {/* Reject form inline */}
                {rejectForm.open && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-semibold text-red-800">Motivo del rechazo</p>
                    <select value={rejectForm.reason} onChange={e => setRejectForm(p => ({ ...p, reason: e.target.value }))}
                      className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400">
                      <option value="">Selecciona un motivo...</option>
                      <option value="Documentación incompleta">Documentación incompleta</option>
                      <option value="No cumple requisitos de ingresos">No cumple requisitos de ingresos</option>
                      <option value="Historial de crédito negativo">Historial de crédito negativo</option>
                      <option value="Información no verificable">Información no verificable</option>
                      <option value="Monto solicitado excede límite">Monto solicitado excede límite</option>
                      <option value="Cliente ya tiene deuda activa">Cliente ya tiene deuda activa</option>
                      <option value="Otro">Otro</option>
                    </select>
                    <textarea value={rejectForm.notes} onChange={e => setRejectForm(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Notas adicionales (opcional)"
                      className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400" rows={2} />
                    <div className="flex gap-2">
                      <button onClick={handleReject} disabled={isActing || !rejectForm.reason}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg font-medium disabled:opacity-50">
                        {isActing ? 'Procesando...' : 'Confirmar rechazo'}
                      </button>
                      <button onClick={() => setRejectForm(p => ({ ...p, open: false }))}
                        className="px-4 py-2 bg-white border border-red-200 text-red-600 text-sm rounded-lg">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* Actions */}
                {selectedRequest.status === 'pending' && !rejectForm.open && (can('requests.approve') || can('requests.reject')) && (
                  <div className="flex gap-3 pt-2 border-t border-slate-100">
                    {can('requests.approve') && (
                      <button onClick={handleApprove} disabled={isActing}
                        className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                        <CheckCircle className="w-4 h-4" />{isActing ? 'Procesando...' : 'Aprobar'}
                      </button>
                    )}
                    {can('requests.reject') && (
                      <button onClick={() => setRejectForm(p => ({ ...p, open: true }))} disabled={isActing}
                        className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                        <XCircle className="w-4 h-4" />Rechazar
                      </button>
                    )}
                  </div>
                )}

                {can('requests.convert') && selectedRequest.status === 'approved' && (
                  <div className="flex gap-3 pt-2 border-t border-slate-100">
                    <div className="flex-1 p-3 bg-emerald-50 rounded-xl text-sm text-emerald-700 font-medium text-center">
                      ✅ Aprobada. Completa los datos del préstamo para crearlo en el sistema.
                    </div>
                    <button onClick={() => setShowConvertModal(true)} disabled={isActing}
                      className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm flex items-center gap-2 disabled:opacity-60">
                      <ShieldCheck className="w-4 h-4" />Crear Préstamo
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Image zoom modal */}
      {showImageModal && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={() => setShowImageModal(null)}>
          <div className="max-w-2xl w-full">
            <p className="text-white text-center mb-3 text-sm font-medium">{showImageModal.label}</p>
            <img src={showImageModal.src} alt={showImageModal.label} className="w-full rounded-xl shadow-2xl" />
            <p className="text-white/50 text-center mt-3 text-xs">Toca en cualquier lugar para cerrar</p>
          </div>
        </div>
      )}

      {/* Convert to Loan Modal */}
      {showConvertModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" /> Crear Préstamo
              </h2>
              <button onClick={() => setShowConvertModal(false)} className="p-1 hover:bg-slate-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
              <p><strong>{selectedRequest.clientName}</strong> · Monto solicitado: <strong>${selectedRequest.loanAmount?.toLocaleString()}</strong></p>
            </div>

            <div className="space-y-3">
              {/* Product */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Producto <span className="text-red-500">*</span></label>
                <select value={convertForm.productId} onChange={e => {
                  const p = products.find((x: any) => x.id === e.target.value)
                  setConvertForm(f => ({ ...f, productId: e.target.value, rate: p?.rate || f.rate }))
                }} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Selecciona producto —</option>
                  {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {/* Rate + Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Tasa % <span className="text-red-500">*</span></label>
                  <input type="number" step="0.01" value={convertForm.rate} onChange={e => setConvertForm(f => ({ ...f, rate: e.target.value }))}
                    placeholder="Ej. 3" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Tipo Tasa</label>
                  <select value={convertForm.rateType} onChange={e => setConvertForm(f => ({ ...f, rateType: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="monthly">Mensual</option>
                    <option value="annual">Anual</option>
                  </select>
                </div>
              </div>

              {/* Term + Unit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Plazo <span className="text-red-500">*</span></label>
                  <input type="number" value={convertForm.term} onChange={e => setConvertForm(f => ({ ...f, term: e.target.value }))}
                    placeholder={selectedRequest.loanTerm?.toString() || '12'} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Unidad</label>
                  <select value={convertForm.termUnit} onChange={e => setConvertForm(f => ({ ...f, termUnit: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="months">Meses</option>
                    <option value="weeks">Semanas</option>
                  </select>
                </div>
              </div>

              {/* Frequency + Amortization */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Frecuencia de Pago</label>
                  <select value={convertForm.paymentFrequency} onChange={e => setConvertForm(f => ({ ...f, paymentFrequency: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="monthly">Mensual</option>
                    <option value="biweekly">Quincenal</option>
                    <option value="weekly">Semanal</option>
                    <option value="daily">Diaria</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Amortización</label>
                  <select value={convertForm.amortizationType} onChange={e => setConvertForm(f => ({ ...f, amortizationType: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="fixed_installment">Cuota Nivelada</option>
                    <option value="flat_interest">Interés Plano</option>
                    <option value="interest_only">Solo Intereses (Réditos)</option>
                  </select>
                </div>
              </div>

              {/* First payment date */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Fecha Primer Pago</label>
                <input type="date" value={convertForm.firstPaymentDate} onChange={e => setConvertForm(f => ({ ...f, firstPaymentDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Bank account */}
              {bankAccounts.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Cuenta de Desembolso</label>
                  <select value={convertForm.disbursementBankAccountId} onChange={e => setConvertForm(f => ({ ...f, disbursementBankAccountId: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— Sin especificar —</option>
                    {bankAccounts.map((ba: any) => <option key={ba.id} value={ba.id}>{ba.bankName} · {ba.accountNumber}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowConvertModal(false)} disabled={isActing}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 font-medium">
                Cancelar
              </button>
              <button onClick={handleConvert} disabled={isActing || !convertForm.productId || !convertForm.rate || !convertForm.term}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                {isActing ? 'Creando...' : 'Crear Préstamo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LoanRequestsPage

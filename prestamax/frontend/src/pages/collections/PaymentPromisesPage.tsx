import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { PageLoadingState } from '@/components/ui/Loading'
import EmptyState from '@/components/ui/EmptyState'
import { ClipboardList, Plus, X, CheckCircle, Clock, AlertCircle, MapPin, Eye } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import api, { isAccessDenied } from '@/lib/api'
import toast from 'react-hot-toast'

interface Promise {
  id: string
  loanNumber: string
  clientName: string
  loanId: string
  promisedDate: string
  promisedAmount: number
  status: string
  notes: string | null
  requiresVisit: number
  visitedAt: string | null
  visitNotes: string | null
  createdAt: string
}

interface ActiveLoan {
  id: string
  loanNumber: string
  clientName: string
  totalBalance: number
}

const STATUS_INFO: Record<string, { label: string; cls: string; icon: React.FC<any> }> = {
  pending: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700', icon: Clock },
  fulfilled: { label: 'Cumplida', cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  broken: { label: 'Incumplida', cls: 'bg-red-100 text-red-700', icon: AlertCircle },
}

const PaymentPromisesPage: React.FC = () => {
  const navigate = useNavigate()
  const [promises, setPromises] = useState<Promise[]>([])
  const [activeLoans, setActiveLoans] = useState<ActiveLoan[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [visitFilter, setVisitFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showVisitModal, setShowVisitModal] = useState<Promise | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [promiseForm, setPromiseForm] = useState({ loanId: '', promisedDate: '', promisedAmount: '', notes: '', requiresVisit: false })
  const [visitForm, setVisitForm] = useState({ visitNotes: '', status: 'pending' })

  const fetchPromises = async () => {
    try {
      const res = await api.get('/collections/promises')
      setPromises(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      if (!isAccessDenied(err)) toast.error('Error al cargar promesas de pago')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPromises()
    api.get('/loans?status=active&limit=200').then(res => setActiveLoans(res.data.data || [])).catch(() => {})
  }, [])

  const handleCreatePromise = async () => {
    if (!promiseForm.loanId || !promiseForm.promisedDate || !promiseForm.promisedAmount) {
      toast.error('Completa todos los campos requeridos')
      return
    }
    try {
      setIsSubmitting(true)
      await api.post('/collections/promises', {
        loanId: promiseForm.loanId,
        promisedDate: promiseForm.promisedDate,
        promisedAmount: parseFloat(promiseForm.promisedAmount),
        notes: promiseForm.notes || null,
        requiresVisit: promiseForm.requiresVisit,
      })
      toast.success('Promesa de pago registrada')
      setShowModal(false)
      setPromiseForm({ loanId: '', promisedDate: '', promisedAmount: '', notes: '', requiresVisit: false })
      fetchPromises()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al registrar promesa')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRegisterVisit = async () => {
    if (!showVisitModal) return
    try {
      setIsSubmitting(true)
      await api.put(`/collections/promises/${showVisitModal.id}`, {
        visitNotes: visitForm.visitNotes,
        visitedAt: new Date().toISOString(),
        status: visitForm.status,
      })
      toast.success('Visita registrada')
      setShowVisitModal(null)
      setVisitForm({ visitNotes: '', status: 'pending' })
      fetchPromises()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al registrar visita')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await api.put(`/collections/promises/${id}`, { status })
      toast.success('Estado actualizado')
      fetchPromises()
    } catch (err: any) {
      toast.error('Error al actualizar estado')
    }
  }

  if (isLoading) return <PageLoadingState />

  const filtered = promises.filter(p => {
    const matchSearch = (p.clientName || '').toLowerCase().includes(searchTerm.toLowerCase()) || (p.loanNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
    const matchStatus = !statusFilter || p.status === statusFilter
    const matchVisit = !visitFilter || (visitFilter === 'yes' ? p.requiresVisit : !p.requiresVisit)
    return matchSearch && matchStatus && matchVisit
  })

  const pendingCount = promises.filter(p => p.status === 'pending').length
  const fulfilledCount = promises.filter(p => p.status === 'fulfilled').length
  const brokenCount = promises.filter(p => p.status === 'broken').length
  const visitRequired = promises.filter(p => p.requiresVisit && p.status === 'pending').length
  const totalPending = promises.filter(p => p.status === 'pending').reduce((s, p) => s + p.promisedAmount, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="page-title">Promesas de Pago</h1>
          <p className="text-slate-600 text-sm mt-1">Seguimiento de compromisos y visitas</p>
        </div>
        <Button onClick={() => setShowModal(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />Nueva Promesa
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="text-center p-4 bg-amber-50 border-amber-200">
          <p className="text-xs text-slate-500 uppercase font-medium">Pendientes</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{pendingCount}</p>
        </Card>
        <Card className="text-center p-4 bg-emerald-50 border-emerald-200">
          <p className="text-xs text-slate-500 uppercase font-medium">Cumplidas</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{fulfilledCount}</p>
        </Card>
        <Card className="text-center p-4 bg-red-50 border-red-200">
          <p className="text-xs text-slate-500 uppercase font-medium">Incumplidas</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{brokenCount}</p>
        </Card>
        <Card className="text-center p-4 bg-purple-50 border-purple-200">
          <p className="text-xs text-slate-500 uppercase font-medium">Visitas Pendientes</p>
          <p className="text-2xl font-bold text-purple-700 mt-1">{visitRequired}</p>
        </Card>
        <Card className="text-center p-4">
          <p className="text-xs text-slate-500 uppercase font-medium">Monto Prometido</p>
          <p className="text-lg font-bold text-blue-700 mt-1">{formatCurrency(totalPending)}</p>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input type="text" placeholder="Buscar por cliente o préstamo..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todos los estados</option>
            <option value="pending">Pendientes</option>
            <option value="fulfilled">Cumplidas</option>
            <option value="broken">Incumplidas</option>
          </select>
          <select value={visitFilter} onChange={e => setVisitFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todas</option>
            <option value="yes">Requieren visita</option>
            <option value="no">Sin visita requerida</option>
          </select>
        </div>
      </Card>

      {/* Table */}
      {filtered.length > 0 ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Cliente</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Préstamo</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Fecha Prometida</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Monto</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Visita</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Estado</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Notas</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(promise => {
                  const info = STATUS_INFO[promise.status] || STATUS_INFO.pending
                  const Icon = info.icon
                  const isOverdue = promise.status === 'pending' && new Date(promise.promisedDate) < new Date()
                  return (
                    <tr key={promise.id} className={`border-b border-slate-100 hover:bg-slate-50 ${isOverdue ? 'bg-red-50/40' : ''}`}>
                      <td className="py-3 px-4">
                        <button onClick={() => navigate(`/loans/${promise.loanId}`)} className="font-medium text-blue-700 hover:underline text-left">
                          {promise.clientName}
                        </button>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">{promise.loanNumber}</td>
                      <td className="py-3 px-4">
                        <span className={isOverdue ? 'text-red-600 font-medium' : ''}>{formatDate(promise.promisedDate)}</span>
                        {isOverdue && <span className="ml-1 text-xs text-red-500">(vencida)</span>}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold">{formatCurrency(promise.promisedAmount)}</td>
                      <td className="py-3 px-4 text-center">
                        {promise.requiresVisit ? (
                          promise.visitedAt ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle className="w-3.5 h-3.5"/>Visitado</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-purple-700 font-medium"><MapPin className="w-3.5 h-3.5"/>Pendiente</span>
                          )
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${info.cls}`}>
                          <Icon className="w-3 h-3"/>{info.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-xs max-w-xs truncate">{promise.notes || '—'}</td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {promise.requiresVisit && !promise.visitedAt && (
                            <button onClick={()=>{setShowVisitModal(promise);setVisitForm({visitNotes:'',status:'pending'})}} className="p-1 hover:bg-purple-100 rounded text-purple-600" title="Registrar visita">
                              <MapPin className="w-4 h-4"/>
                            </button>
                          )}
                          {promise.status === 'pending' && (
                            <>
                              <button onClick={()=>handleUpdateStatus(promise.id,'fulfilled')} className="p-1 hover:bg-emerald-100 rounded text-emerald-600" title="Marcar cumplida">
                                <CheckCircle className="w-4 h-4"/>
                              </button>
                              <button onClick={()=>handleUpdateStatus(promise.id,'broken')} className="p-1 hover:bg-red-100 rounded text-red-500" title="Marcar incumplida">
                                <AlertCircle className="w-4 h-4"/>
                              </button>
                            </>
                          )}
                          {promise.visitedAt && (
                            <span className="text-xs text-slate-400 italic" title={promise.visitNotes||''}>{formatDate(promise.visitedAt)}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState icon={ClipboardList} title="Sin promesas de pago" description={searchTerm || statusFilter ? 'No coincide con los filtros' : 'Registra compromisos de pago de tus clientes'} action={{label:'Nueva Promesa',onClick:()=>setShowModal(true)}} />
      )}

      {/* Create Promise Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="section-title">Nueva Promesa de Pago</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Préstamo *</label>
                <select value={promiseForm.loanId} onChange={e => {
                  const loan = activeLoans.find(l => l.id === e.target.value)
                  setPromiseForm(f => ({ ...f, loanId: e.target.value, promisedAmount: loan ? String(loan.totalBalance) : f.promisedAmount }))
                }} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">-- Selecciona el préstamo --</option>
                  {activeLoans.map(l => <option key={l.id} value={l.id}>{l.loanNumber} – {l.clientName} ({formatCurrency(l.totalBalance)})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de la Promesa *</label>
                <input type="date" value={promiseForm.promisedDate} min={new Date().toISOString().split('T')[0]}
                  onChange={e => setPromiseForm(f => ({ ...f, promisedDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Monto Prometido *</label>
                <input type="number" step="0.01" value={promiseForm.promisedAmount}
                  onChange={e => setPromiseForm(f => ({ ...f, promisedAmount: e.target.value }))}
                  placeholder="0.00" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas (opcional)</label>
                <textarea value={promiseForm.notes} onChange={e => setPromiseForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="requires-visit" checked={promiseForm.requiresVisit} onChange={e => setPromiseForm(f => ({ ...f, requiresVisit: e.target.checked }))} className="rounded text-blue-600" />
                <label htmlFor="requires-visit" className="text-sm font-medium text-slate-700 flex items-center gap-1"><MapPin className="w-4 h-4 text-purple-600"/>Requiere visita del cobrador</label>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)} disabled={isSubmitting}>Cancelar</Button>
              <Button className="flex-1" onClick={handleCreatePromise} disabled={isSubmitting || !promiseForm.loanId || !promiseForm.promisedDate || !promiseForm.promisedAmount}>
                {isSubmitting ? 'Guardando...' : 'Registrar Promesa'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Visit Modal */}
      {showVisitModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title flex items-center gap-2"><MapPin className="w-5 h-5 text-purple-600"/>Registrar Visita</h2>
              <button onClick={() => setShowVisitModal(null)} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-600 mb-4">Cliente: <strong>{showVisitModal.clientName}</strong> · {showVisitModal.loanNumber}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Resultado de la visita</label>
                <select value={visitForm.status} onChange={e => setVisitForm(f => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="pending">Pendiente de pago</option>
                  <option value="fulfilled">Pagó (cumplida)</option>
                  <option value="broken">No pagó (incumplida)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas de la visita</label>
                <textarea value={visitForm.visitNotes} onChange={e => setVisitForm(f => ({ ...f, visitNotes: e.target.value }))} rows={3} placeholder="¿Qué ocurrió en la visita?" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setShowVisitModal(null)} disabled={isSubmitting}>Cancelar</Button>
              <Button className="flex-1 bg-purple-600 hover:bg-purple-700" onClick={handleRegisterVisit} disabled={isSubmitting}>
                {isSubmitting ? 'Registrando...' : 'Registrar Visita'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default PaymentPromisesPage

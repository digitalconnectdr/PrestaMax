import React, { useState, useEffect } from 'react'
import { usePermission } from '@/hooks/usePermission'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { PageLoadingState } from '@/components/ui/Loading'
import EmptyState from '@/components/ui/EmptyState'
import { Phone, MessageCircle, DollarSign, AlertCircle, ChevronDown, ChevronUp, FileText, X, RefreshCw, Calendar, CheckCircle, Clock, Users, StickyNote, ClipboardList, Briefcase } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import api, { isAccessDenied } from '@/lib/api'
import toast from 'react-hot-toast'
import CollectionTasksTab from './CollectionTasksTab'

interface CollectionLoan {
  id: string
  loanNumber: string
  clientName: string
  phonePersonal: string | null
  whatsapp: string | null
  address: string | null
  totalBalance: number
  moraBalance: number
  collectionStatus: 'overdue' | 'upcoming' | 'current'
  daysOverdueReal: number
  daysUntilDue: number
  nextDueDate: string | null
  nextInstallmentAmount: number
  status: string
  nextInstallments: any[]
}

interface BankAccount {
  id: string
  bankName: string
  accountNumber: string
  currency: string
}

type FilterType = 'all' | 'overdue' | 'upcoming' | 'current'

const UPCOMING_DAYS_OPTIONS = [
  { value: 1, label: 'Mañana' },
  { value: 3, label: '3 días' },
  { value: 7, label: '7 días' },
  { value: 15, label: '15 días' },
  { value: 30, label: '30 días' },
]

const CollectionsPage: React.FC = () => {
  const { can } = usePermission()
  const [mainTab, setMainTab] = useState<'portfolio' | 'agenda'>('portfolio')
  const [loans, setLoans] = useState<CollectionLoan[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [scope, setScope] = useState<'all' | 'assigned'>('assigned')
  const [filter, setFilter] = useState<FilterType>('all')
  const [upcomingDays, setUpcomingDays] = useState(7)
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Modals
  const [showPromiseModal, setShowPromiseModal] = useState<CollectionLoan | null>(null)
  const [promiseForm, setPromiseForm] = useState({ promisedDate: '', amount: '', notes: '' })
  const [isSavingPromise, setIsSavingPromise] = useState(false)
  const [showNoteModal, setShowNoteModal] = useState<CollectionLoan | null>(null)
  const [noteText, setNoteText] = useState('')
  const [noteType, setNoteType] = useState('call')
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [loanNotes, setLoanNotes] = useState<Record<string, any[]>>({})
  const [showPayModal, setShowPayModal] = useState<CollectionLoan | null>(null)
  const [payForm, setPayForm] = useState({ amount: '', paymentMethod: 'cash', bankAccountId: '', reference: '' })
  const [isSavingPay, setIsSavingPay] = useState(false)

  const fetchLoans = async (f: FilterType = filter, days: number = upcomingDays) => {
    setIsLoading(true)
    try {
      const [loansRes, bankRes] = await Promise.all([
        api.get(`/collections/loans?filter=${f}&days=${days}`),
        api.get('/settings/bank-accounts').catch(() => ({ data: [] })),
      ])
      const data = loansRes.data
      setLoans(Array.isArray(data) ? data : (data.loans || []))
      setScope(data.scope || 'all')
      setBankAccounts(Array.isArray(bankRes.data) ? bankRes.data : [])
    } catch (err) {
      if (!isAccessDenied(err)) toast.error('Error al cargar cartera de cobranza')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchLoans() }, [])

  const handleFilterChange = (f: FilterType) => {
    setFilter(f)
    fetchLoans(f, upcomingDays)
  }

  const handleDaysChange = (days: number) => {
    setUpcomingDays(days)
    fetchLoans(filter, days)
  }

  const handleRefresh = () => fetchLoans(filter, upcomingDays)

  const fetchNotes = async (loanId: string) => {
    try {
      const res = await api.get(`/collections/notes/${loanId}`)
      setLoanNotes(prev => ({ ...prev, [loanId]: Array.isArray(res.data) ? res.data : [] }))
    } catch { /* silencioso */ }
  }

  const handleToggleExpand = (loanId: string) => {
    const next = expandedId === loanId ? null : loanId
    setExpandedId(next)
    if (next) fetchNotes(next)
  }

  const handleSaveNote = async () => {
    if (!noteText.trim() || !showNoteModal) return
    try {
      setIsSavingNote(true)
      await api.post('/collections/notes', { loanId: showNoteModal.id, type: noteType, note: noteText })
      toast.success('Nota registrada')
      // Refrescar notas si la tarjeta está expandida
      if (expandedId === showNoteModal.id) fetchNotes(showNoteModal.id)
      setShowNoteModal(null); setNoteText('')
    } catch { toast.error('Error al registrar nota') }
    finally { setIsSavingNote(false) }
  }

  const handleQuickPay = async () => {
    if (!showPayModal || !payForm.amount) return toast.error('Ingresa el monto')
    if (payForm.paymentMethod !== 'cash' && !payForm.bankAccountId) return toast.error('Selecciona la cuenta bancaria')
    try {
      setIsSavingPay(true)
      await api.post('/payments', {
        loanId: showPayModal.id,
        amount: parseFloat(payForm.amount),
        paymentMethod: payForm.paymentMethod,
        bankAccountId: payForm.bankAccountId || null,
        reference: payForm.reference || null,
        paymentDate: new Date().toISOString(),
      })
      toast.success('Pago registrado')
      setShowPayModal(null)
      setPayForm({ amount: '', paymentMethod: 'cash', bankAccountId: '', reference: '' })
      fetchLoans()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al registrar pago')
    } finally { setIsSavingPay(false) }
  }

  const handleSavePromise = async () => {
    if (!showPromiseModal || !promiseForm.promisedDate || !promiseForm.amount) {
      return toast.error('Fecha y monto son requeridos')
    }
    try {
      setIsSavingPromise(true)
      await api.post('/collections/promises', {
        loanId: showPromiseModal.id,
        promisedDate: promiseForm.promisedDate,
        promisedAmount: parseFloat(promiseForm.amount),
        notes: promiseForm.notes || null,
      })
      toast.success('Promesa de pago registrada')
      setShowPromiseModal(null)
      setPromiseForm({ promisedDate: '', amount: '', notes: '' })
      fetchLoans()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al registrar promesa')
    } finally { setIsSavingPromise(false) }
  }

  // Counts for filter pills
  const counts = {
    all: loans.length,
    overdue:  loans.filter(l => l.collectionStatus === 'overdue').length,
    upcoming: loans.filter(l => l.collectionStatus === 'upcoming').length,
    current:  loans.filter(l => l.collectionStatus === 'current').length,
  }

  const filtered = loans.filter(l => {
    if (!searchTerm) return true
    const q = searchTerm.toLowerCase()
    return (l.clientName || '').toLowerCase().includes(q) || (l.loanNumber || '').includes(q)
  })

  const getCardStyle = (status: string) => {
    if (status === 'overdue')  return 'border-l-4 border-l-red-400 bg-red-50/30'
    if (status === 'upcoming') return 'border-l-4 border-l-amber-400 bg-amber-50/30'
    return 'border-l-4 border-l-emerald-400 bg-emerald-50/10'
  }

  const getStatusBadge = (loan: CollectionLoan) => {
    if (loan.collectionStatus === 'overdue') {
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-semibold">
          <AlertCircle className="w-3 h-3"/>
          {loan.daysOverdueReal > 0 ? `${loan.daysOverdueReal} días en mora` : 'En mora'}
        </span>
      )
    }
    if (loan.collectionStatus === 'upcoming') {
      const d = loan.daysUntilDue
      const label = d <= 0 ? 'Vence hoy' : d === 1 ? 'Vence mañana' : `Vence en ${d} días`
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold">
          <Clock className="w-3 h-3"/>{label}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-semibold">
        <CheckCircle className="w-3 h-3"/>Al día
      </span>
    )
  }

  if (isLoading && mainTab === 'portfolio') return <PageLoadingState />

  const FILTERS: { id: FilterType; label: string; color: string; activeColor: string }[] = [
    { id: 'all',      label: 'Todos',             color: 'bg-slate-100 text-slate-600 hover:bg-slate-200',   activeColor: 'bg-[#1e3a5f] text-white' },
    { id: 'overdue',  label: 'En Mora',            color: 'bg-red-50 text-red-600 hover:bg-red-100',          activeColor: 'bg-red-600 text-white' },
    { id: 'upcoming', label: 'Próximos a Vencer',  color: 'bg-amber-50 text-amber-600 hover:bg-amber-100',    activeColor: 'bg-amber-500 text-white' },
    { id: 'current',  label: 'Al Día',             color: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100', activeColor: 'bg-emerald-600 text-white' },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Cobranzas</h1>
          <p className="text-slate-500 text-sm mt-0.5 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5"/>
            {scope === 'all' ? 'Vista completa del tenant' : 'Tu cartera asignada'}
          </p>
        </div>
        {mainTab === 'portfolio' && (
          <Button variant="outline" size="sm" onClick={handleRefresh} className="flex items-center gap-1">
            <RefreshCw className="w-4 h-4"/>Actualizar
          </Button>
        )}
      </div>

      {/* Main tabs: Cartera / Agenda */}
      <div className="border-b border-slate-200">
        <div className="flex gap-0">
          <button
            onClick={() => setMainTab('portfolio')}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              mainTab === 'portfolio'
                ? 'border-[#1e3a5f] text-[#1e3a5f]'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            Cartera de Cobranza
          </button>
          {(can('collections.tasks') || can('collections.tasks.manage')) && (
            <button
              onClick={() => setMainTab('agenda')}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                mainTab === 'agenda'
                  ? 'border-[#1e3a5f] text-[#1e3a5f]'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              Agenda de Cobranza
            </button>
          )}
        </div>
      </div>

      {/* Agenda tab */}
      {mainTab === 'agenda' && <CollectionTasksTab />}

      {/* Portfolio tab content below */}
      {mainTab !== 'portfolio' ? null : (<>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 text-center">
          <p className="text-xs text-slate-500 uppercase font-medium">Total</p>
          <p className="text-2xl font-bold text-slate-900 mt-0.5">{counts.all}</p>
        </Card>
        <Card className="p-3 text-center bg-red-50">
          <p className="text-xs text-slate-500 uppercase font-medium">En Mora</p>
          <p className="text-2xl font-bold text-red-600 mt-0.5">{counts.overdue}</p>
        </Card>
        <Card className="p-3 text-center bg-amber-50">
          <p className="text-xs text-slate-500 uppercase font-medium">Próx. Vencer</p>
          <p className="text-2xl font-bold text-amber-600 mt-0.5">{counts.upcoming}</p>
        </Card>
        <Card className="p-3 text-center bg-emerald-50">
          <p className="text-xs text-slate-500 uppercase font-medium">Al Día</p>
          <p className="text-2xl font-bold text-emerald-600 mt-0.5">{counts.current}</p>
        </Card>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => handleFilterChange(f.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${filter === f.id ? f.activeColor : f.color}`}>
            {f.label}
            {counts[f.id] > 0 && (
              <span className={`text-xs rounded-full px-1.5 ${filter === f.id ? 'bg-white/20 text-white' : 'bg-white/70 text-slate-700'}`}>
                {counts[f.id]}
              </span>
            )}
          </button>
        ))}

        {/* Upcoming days selector — only shown when filter=upcoming */}
        {filter === 'upcoming' && (
          <div className="flex items-center gap-1 ml-2 border-l border-slate-200 pl-3">
            <span className="text-xs text-slate-500 font-medium">Ventana:</span>
            {UPCOMING_DAYS_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => handleDaysChange(opt.value)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${upcomingDays === opt.value ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search */}
      <input type="text" placeholder="Buscar por nombre o número de préstamo..."
        value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>

      {/* Loan list */}
      {filtered.length === 0 ? (
        <EmptyState icon={CheckCircle}
          title={searchTerm ? 'Sin resultados' : filter === 'overdue' ? 'Sin clientes en mora' : filter === 'upcoming' ? 'Sin vencimientos próximos' : filter === 'current' ? 'Sin clientes al día' : 'Sin préstamos activos'}
          description={searchTerm ? 'Ningún préstamo coincide con la búsqueda.' : 'No hay préstamos en esta categoría.'} />
      ) : (
        <div className="space-y-3">
          {filtered.map(loan => (
            <Card key={loan.id} className={getCardStyle(loan.collectionStatus)}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800">{loan.clientName}</span>
                    <span className="text-xs font-mono text-slate-400">{loan.loanNumber}</span>
                    {getStatusBadge(loan)}
                  </div>
                  <div className="flex flex-wrap gap-4 mt-1.5 text-sm">
                    <span className="text-slate-500">Saldo: <strong className="text-slate-800">{formatCurrency(loan.totalBalance)}</strong></span>
                    {(loan.moraBalance || 0) > 0 && (
                      <span className="text-red-600 font-semibold">Mora: {formatCurrency(loan.moraBalance)}</span>
                    )}
                    {loan.nextDueDate && (
                      <span className="text-slate-500">
                        Próx. cuota: <strong className="text-slate-700">
                          {new Date(loan.nextDueDate).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' })}
                          {loan.nextInstallmentAmount > 0 && ` — ${formatCurrency(loan.nextInstallmentAmount)}`}
                        </strong>
                      </span>
                    )}
                  </div>
                  {loan.address && (
                    <p className="text-xs text-slate-400 mt-0.5 truncate max-w-sm">{loan.address}</p>
                  )}
                  {/* Expanded panel: cuotas + notas */}
                  {expandedId === loan.id && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-4">
                      {/* Próximas cuotas */}
                      {loan.nextInstallments?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Próximas Cuotas</p>
                          <div className="space-y-1">
                            {loan.nextInstallments.map((inst: any, i: number) => (
                              <div key={inst.id || i} className={`flex justify-between text-sm py-1 px-2 rounded ${inst.status === 'overdue' ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600'}`}>
                                <span>{new Date(inst.deferredDueDate || inst.dueDate || inst.due_date).toLocaleDateString('es-DO')}</span>
                                <span className="font-medium">{formatCurrency(inst.totalAmount || inst.total_amount || inst.amount || 0)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Historial de notas */}
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase mb-2 flex items-center gap-1">
                          <StickyNote className="w-3 h-3"/>Historial de Gestiones
                        </p>
                        {(loanNotes[loan.id] || []).length === 0 ? (
                          <p className="text-xs text-slate-400 italic px-2">Sin notas registradas</p>
                        ) : (
                          <div className="space-y-2">
                            {(loanNotes[loan.id] || []).map((n: any) => {
                              const typeLabels: Record<string, string> = { call: '📞 Llamada', visit: '🚶 Visita', whatsapp: '💬 WhatsApp', other: '📝 Otro' }
                              return (
                                <div key={n.id} className="bg-slate-50 rounded-lg px-3 py-2 text-xs">
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className="font-semibold text-slate-600">{typeLabels[n.type] || n.type}</span>
                                    <span className="text-slate-400">{new Date(n.createdAt || n.created_at).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                  <p className="text-slate-700">{n.note}</p>
                                  {n.userName && <p className="text-slate-400 mt-0.5">por {n.userName}</p>}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
                  {loan.phonePersonal && (
                    <a href={`tel:${loan.phonePersonal}`} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" title="Llamar">
                      <Phone className="w-4 h-4"/>
                    </a>
                  )}
                  {(loan.whatsapp || loan.phonePersonal) && (
                    <a href={`https://wa.me/${(loan.whatsapp || loan.phonePersonal || '').replace(/\D/g,'')}`}
                      target="_blank" rel="noreferrer"
                      className="p-2 rounded-lg hover:bg-green-50 text-green-600" title="WhatsApp">
                      <MessageCircle className="w-4 h-4"/>
                    </a>
                  )}
                  {can('collections.notes') && (
                    <button onClick={() => setShowNoteModal(loan)}
                      className="p-2 rounded-lg hover:bg-blue-50 text-blue-600" title="Registrar nota">
                      <FileText className="w-4 h-4"/>
                    </button>
                  )}
                  {can('collections.promises') && (
                    <button onClick={() => { setShowPromiseModal(loan); setPromiseForm({ promisedDate: loan.nextDueDate?.split('T')[0] || '', amount: String(loan.nextInstallmentAmount || loan.totalBalance || ''), notes: '' }) }}
                      className="flex items-center gap-1 px-2 py-1.5 bg-amber-500 text-white rounded-lg text-xs hover:bg-amber-600">
                      <Calendar className="w-3 h-3"/>Promesa
                    </button>
                  )}
                  {can('payments.create') && (
                    <button onClick={() => { setShowPayModal(loan); setPayForm(f => ({ ...f, amount: String(loan.nextInstallmentAmount || '') })) }}
                      className="flex items-center gap-1 px-2 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700">
                      <DollarSign className="w-3 h-3"/>Cobrar
                    </button>
                  )}
                  <button onClick={() => handleToggleExpand(loan.id)}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
                    {expandedId === loan.id ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">Nota — {showNoteModal.clientName}</h2>
              <button onClick={() => setShowNoteModal(null)} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5"/></button>
            </div>
            <div className="space-y-3">
              <select value={noteType} onChange={e => setNoteType(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="call">Llamada</option>
                <option value="visit">Visita</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="other">Otro</option>
              </select>
              <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={3}
                placeholder="Detalle de la gestión realizada..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1" onClick={() => setShowNoteModal(null)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSaveNote} disabled={isSavingNote || !noteText.trim()}>
                {isSavingNote ? 'Guardando...' : 'Guardar Nota'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Promise Modal */}
      {showPromiseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title flex items-center gap-2"><Calendar className="w-5 h-5"/>Promesa de Pago — {showPromiseModal.clientName}</h2>
              <button onClick={() => setShowPromiseModal(null)} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5"/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fecha Prometida *</label>
                <input type="date" value={promiseForm.promisedDate} onChange={e => setPromiseForm(f => ({ ...f, promisedDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Monto Prometido *</label>
                <input type="number" step="0.01" value={promiseForm.amount} onChange={e => setPromiseForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas (opcional)</label>
                <textarea value={promiseForm.notes} onChange={e => setPromiseForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Compromiso del cliente..."/>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1" onClick={() => setShowPromiseModal(null)}>Cancelar</Button>
              <Button className="flex-1 bg-amber-500 hover:bg-amber-600" onClick={handleSavePromise}
                disabled={isSavingPromise || !promiseForm.promisedDate || !promiseForm.amount}>
                {isSavingPromise ? 'Guardando...' : 'Registrar Promesa'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Quick Pay Modal */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">Registrar Pago — {showPayModal.clientName}</h2>
              <button onClick={() => setShowPayModal(null)} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5"/></button>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 mb-4 text-sm">
              <span className="text-slate-600">Préstamo: </span><span className="font-mono font-bold">{showPayModal.loanNumber}</span>
              <span className="ml-4 text-slate-600">Saldo: </span><span className="font-bold text-red-600">{formatCurrency(showPayModal.totalBalance)}</span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Monto *</label>
                <input type="number" step="0.01" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Método de Pago</label>
                <select value={payForm.paymentMethod} onChange={e => setPayForm(f => ({ ...f, paymentMethod: e.target.value, bankAccountId: e.target.value === 'cash' ? '' : f.bankAccountId }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia</option>
                  <option value="check">Cheque</option>
                </select>
              </div>
              {payForm.paymentMethod !== 'cash' && bankAccounts.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cuenta Bancaria</label>
                  <select value={payForm.bankAccountId} onChange={e => setPayForm(f => ({ ...f, bankAccountId: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">-- Selecciona cuenta --</option>
                    {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.bankName} {a.accountNumber ? `- ${a.accountNumber}` : ''}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Referencia (opcional)</label>
                <input type="text" value={payForm.reference} onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))}
                  placeholder="Num. transferencia o cheque..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1" onClick={() => setShowPayModal(null)}>Cancelar</Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleQuickPay} disabled={isSavingPay || !payForm.amount}>
                {isSavingPay ? 'Registrando...' : 'Registrar Pago'}
              </Button>
            </div>
          </Card>
        </div>
      )}
      </>)}
    </div>
  )
}

export default CollectionsPage

import React, { useState, useEffect } from 'react'
import { usePermission } from '@/hooks/usePermission'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { PageLoadingState } from '@/components/ui/Loading'
import EmptyState from '@/components/ui/EmptyState'
import { Phone, MessageCircle, DollarSign, AlertCircle, ChevronDown, ChevronUp, FileText, X, RefreshCw, Calendar, CheckCircle, Clock, Users, StickyNote, ClipboardList, Briefcase } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import api, { isAccessDenied, isSubscriptionExpired } from '@/lib/api'
import toast from 'react-hot-toast'
import { useContext } from 'react'
import { TenantContext } from '@/contexts/TenantContext'
import { printPaymentReceipt, sendReceiptByWhatsApp } from '@/lib/printReceipt'
import { Printer } from 'lucide-react'
import CollectionTasksTab from './CollectionTasksTab'
import { useT } from '@/lib/i18n'

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

const UPCOMING_DAYS_OPTIONS = [1, 3, 7, 15, 30]

const CollectionsPage: React.FC = () => {
  const { can } = usePermission()
  const t = useT()
  const { state: tenantState } = useContext(TenantContext)
  const [lastPayment, setLastPayment] = useState<any>(null)
  const [showPostPaymentModal, setShowPostPaymentModal] = useState(false)
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
  const [payLoanDetail, setPayLoanDetail] = useState<any>(null)
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
      if (!isAccessDenied(err) && !isSubscriptionExpired(err)) toast.error(t('coll.load_error'))
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

  // Cargar detalle del prestamo (con cuotas) al abrir modal de pago
  useEffect(() => {
    if (!showPayModal) { setPayLoanDetail(null); return }
    api.get(`/loans/${showPayModal.id}`)
      .then(res => setPayLoanDetail(res.data))
      .catch(() => setPayLoanDetail(null))
  }, [showPayModal])

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
      toast.success(t('coll.note_saved'))
      // Refrescar notas si la tarjeta está expandida
      if (expandedId === showNoteModal.id) fetchNotes(showNoteModal.id)
      setShowNoteModal(null); setNoteText('')
    } catch { toast.error(t('coll.note_error')) }
    finally { setIsSavingNote(false) }
  }

  const handleQuickPay = async () => {
    if (!showPayModal || !payForm.amount) return toast.error(t('coll.enter_amount'))
    if (payForm.paymentMethod !== 'cash' && !payForm.bankAccountId) return toast.error(t('coll.select_bank'))
    try {
      setIsSavingPay(true)
      const payRes = await api.post('/payments', {
        loanId: showPayModal.id,
        amount: parseFloat(payForm.amount),
        paymentMethod: payForm.paymentMethod,
        bankAccountId: payForm.bankAccountId || null,
        reference: payForm.reference || null,
        paymentDate: new Date().toISOString(),
      })
      toast.success(t('pay.post_title'))
      const loanForReceipt = showPayModal
      setShowPayModal(null)
      setPayForm({ amount: '', paymentMethod: 'cash', bankAccountId: '', reference: '' })
      fetchLoans()
      if (payRes?.data?.payment) {
        const pmt = payRes.data.payment as any
        const rcp = payRes.data.receipt as any
        setLastPayment({
          ...pmt,
          receiptNumber: rcp?.receiptNumber || pmt.receiptNumber,
          clientName: loanForReceipt.clientName,
          loanNumber: loanForReceipt.loanNumber,
          loanId: loanForReceipt.id,
          clientWhatsapp: (loanForReceipt as any).whatsapp || (loanForReceipt as any).phonePersonal || '',
          moraBalance: loanForReceipt.moraBalance,
          principalBalance: (loanForReceipt as any).totalBalance,
        })
        setShowPostPaymentModal(true)
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('pay.register_error'))
    } finally { setIsSavingPay(false) }
  }

  const handleSavePromise = async () => {
    if (!showPromiseModal || !promiseForm.promisedDate || !promiseForm.amount) {
      return toast.error(t('coll.date_amount_required'))
    }
    try {
      setIsSavingPromise(true)
      await api.post('/collections/promises', {
        loanId: showPromiseModal.id,
        promisedDate: promiseForm.promisedDate,
        promisedAmount: parseFloat(promiseForm.amount),
        notes: promiseForm.notes || null,
      })
      toast.success(t('coll.promise_saved'))
      setShowPromiseModal(null)
      setPromiseForm({ promisedDate: '', amount: '', notes: '' })
      fetchLoans()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('coll.promise_error'))
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
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-semibold whitespace-nowrap">
          <AlertCircle className="w-3 h-3"/>
          {loan.daysOverdueReal > 0 ? t('coll.days_in_mora').replace('{n}', String(loan.daysOverdueReal)) : t('coll.in_mora_short')}
        </span>
      )
    }
    if (loan.collectionStatus === 'upcoming') {
      const d = loan.daysUntilDue
      const label = d <= 0 ? t('coll.due_today') : d === 1 ? t('coll.due_tomorrow') : t('coll.due_in_days').replace('{n}', String(d))
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold">
          <Clock className="w-3 h-3"/>{label}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-semibold">
        <CheckCircle className="w-3 h-3"/>{t('coll.current_badge')}
      </span>
    )
  }

  if (isLoading && mainTab === 'portfolio') return <PageLoadingState />

  const FILTERS: { id: FilterType; label: string; color: string; activeColor: string }[] = [
    { id: 'all',      label: t('common.all'),       color: 'bg-slate-100 text-slate-600 hover:bg-slate-200',   activeColor: 'bg-[#1e3a5f] text-white' },
    { id: 'overdue',  label: t('coll.in_mora'),     color: 'bg-red-50 text-red-600 hover:bg-red-100',          activeColor: 'bg-red-600 text-white' },
    { id: 'upcoming', label: t('coll.f_upcoming'),  color: 'bg-amber-50 text-amber-600 hover:bg-amber-100',    activeColor: 'bg-amber-500 text-white' },
    { id: 'current',  label: t('coll.current'),     color: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100', activeColor: 'bg-emerald-600 text-white' },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">{t('coll.title')}</h1>
          <p className="text-slate-500 text-sm mt-0.5 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5"/>
            {scope === 'all' ? t('coll.scope_all') : t('coll.scope_assigned')}
          </p>
        </div>
        {mainTab === 'portfolio' && (
          <Button variant="outline" size="sm" onClick={handleRefresh} className="flex items-center gap-1">
            <RefreshCw className="w-4 h-4"/>{t('common.refresh')}
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
            {t('coll.tab_portfolio')}
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
              {t('coll.tab_agenda')}
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
          <p className="text-xs text-slate-500 uppercase font-medium">{t('coll.total')}</p>
          <p className="text-2xl font-bold text-slate-900 mt-0.5">{counts.all}</p>
        </Card>
        <Card className="p-3 text-center bg-red-50">
          <p className="text-xs text-slate-500 uppercase font-medium">{t('coll.in_mora')}</p>
          <p className="text-2xl font-bold text-red-600 mt-0.5">{counts.overdue}</p>
        </Card>
        <Card className="p-3 text-center bg-amber-50">
          <p className="text-xs text-slate-500 uppercase font-medium">{t('coll.upcoming_short')}</p>
          <p className="text-2xl font-bold text-amber-600 mt-0.5">{counts.upcoming}</p>
        </Card>
        <Card className="p-3 text-center bg-emerald-50">
          <p className="text-xs text-slate-500 uppercase font-medium">{t('coll.current')}</p>
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
            <span className="text-xs text-slate-500 font-medium">{t('coll.window')}</span>
            {UPCOMING_DAYS_OPTIONS.map(opt => (
              <button key={opt} onClick={() => handleDaysChange(opt)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${upcomingDays === opt ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}>
                {opt === 1 ? t('coll.tomorrow') : t('coll.n_days').replace('{n}', String(opt))}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search */}
      <input type="text" placeholder={t('coll.search_ph')}
        value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>

      {/* Loan list */}
      {filtered.length === 0 ? (
        <EmptyState icon={CheckCircle}
          title={searchTerm ? t('coll.empty_no_results') : filter === 'overdue' ? t('coll.empty_no_overdue') : filter === 'upcoming' ? t('coll.empty_no_upcoming') : filter === 'current' ? t('coll.empty_no_current') : t('coll.empty_no_active')}
          description={searchTerm ? t('coll.empty_desc_search') : t('coll.empty_desc_cat')} />
      ) : (
        <div className="space-y-3">
          {filtered.map(loan => (
            <Card key={loan.id} className={getCardStyle(loan.collectionStatus)}>
              <div className="flex flex-col sm:flex-row sm:items-start sm:gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800">{loan.clientName}</span>
                    <span className="text-xs font-mono text-slate-400">{loan.loanNumber}</span>
                    {getStatusBadge(loan)}
                  </div>
                  <div className="grid grid-cols-1 sm:flex sm:flex-wrap sm:gap-4 gap-1 mt-1.5 text-sm">
                    <span className="text-slate-500">{t('coll.balance')}: <strong className="text-slate-800">{formatCurrency(loan.totalBalance)}</strong></span>
                    {(loan.moraBalance || 0) > 0 && (
                      <span className="text-red-600 font-semibold">{t('pay.mora_label')}: {formatCurrency(loan.moraBalance)}</span>
                    )}
                    {loan.nextDueDate && (
                      <span className="text-slate-500">
                        {t('coll.next_installment')}: <strong className="text-slate-700">
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
                          <p className="text-xs font-semibold text-slate-400 uppercase mb-2">{t('coll.next_installments')}</p>
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
                          <StickyNote className="w-3 h-3"/>{t('coll.history')}
                        </p>
                        {(loanNotes[loan.id] || []).length === 0 ? (
                          <p className="text-xs text-slate-400 italic px-2">{t('coll.no_notes')}</p>
                        ) : (
                          <div className="space-y-2">
                            {(loanNotes[loan.id] || []).map((n: any) => {
                              const typeLabels: Record<string, string> = { call: t('coll.nt_call'), visit: t('coll.nt_visit'), whatsapp: t('coll.nt_whatsapp'), other: t('coll.nt_other') }
                              return (
                                <div key={n.id} className="bg-slate-50 rounded-lg px-3 py-2 text-xs">
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className="font-semibold text-slate-600">{typeLabels[n.type] || n.type}</span>
                                    <span className="text-slate-400">{new Date(n.createdAt || n.created_at).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                  <p className="text-slate-700">{n.note}</p>
                                  {n.userName && <p className="text-slate-400 mt-0.5">{t('coll.by')} {n.userName}</p>}
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
                <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-start sm:justify-end mt-3 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  {loan.phonePersonal && (
                    <a href={`tel:${loan.phonePersonal}`} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" title={t('coll.call')}>
                      <Phone className="w-4 h-4"/>
                    </a>
                  )}
                  {(loan.whatsapp || loan.phonePersonal) && (
                    <a href={`https://wa.me/${(loan.whatsapp || loan.phonePersonal || '').replace(/\D/g,'')}`}
                      target="_blank" rel="noreferrer"
                      className="p-2 rounded-lg hover:bg-green-50 text-green-600" title={t('pay.send_whatsapp')}>
                      <MessageCircle className="w-4 h-4"/>
                    </a>
                  )}
                  {can('collections.notes') && (
                    <button onClick={() => setShowNoteModal(loan)}
                      className="p-2 rounded-lg hover:bg-blue-50 text-blue-600" title={t('coll.add_note')}>
                      <FileText className="w-4 h-4"/>
                    </button>
                  )}
                  {can('collections.promises') && (
                    <button onClick={() => { setShowPromiseModal(loan); setPromiseForm({ promisedDate: loan.nextDueDate?.split('T')[0] || '', amount: String(loan.nextInstallmentAmount || loan.totalBalance || ''), notes: '' }) }}
                      className="flex items-center gap-1 px-2 py-1.5 bg-amber-500 text-white rounded-lg text-xs hover:bg-amber-600">
                      <Calendar className="w-3 h-3"/>{t('coll.promise')}
                    </button>
                  )}
                  {can('payments.create') && (
                    <button onClick={() => { setShowPayModal(loan); setPayForm(f => ({ ...f, amount: String(loan.nextInstallmentAmount || '') })) }}
                      className="flex items-center gap-1 px-2 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700">
                      <DollarSign className="w-3 h-3"/>{t('coll.collect')}
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
          <Card className="w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">{t('coll.note_title')} — {showNoteModal.clientName}</h2>
              <button onClick={() => setShowNoteModal(null)} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5"/></button>
            </div>
            <div className="space-y-3">
              <select value={noteType} onChange={e => setNoteType(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="call">{t('coll.opt_call')}</option>
                <option value="visit">{t('coll.opt_visit')}</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="other">{t('coll.opt_other')}</option>
              </select>
              <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={3}
                placeholder={t('coll.note_ph')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1" onClick={() => setShowNoteModal(null)}>{t('common.cancel')}</Button>
              <Button className="flex-1" onClick={handleSaveNote} disabled={isSavingNote || !noteText.trim()}>
                {isSavingNote ? t('pay.saving') : t('coll.save_note')}
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
              <h2 className="section-title flex items-center gap-2"><Calendar className="w-5 h-5"/>{t('coll.promise_title')} — {showPromiseModal.clientName}</h2>
              <button onClick={() => setShowPromiseModal(null)} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5"/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('coll.promised_date')}</label>
                <input type="date" value={promiseForm.promisedDate} onChange={e => setPromiseForm(f => ({ ...f, promisedDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('coll.promised_amount')}</label>
                <input type="number" step="0.01" value={promiseForm.amount} onChange={e => setPromiseForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('pay.notes')} ({t('common.optional')})</label>
                <textarea value={promiseForm.notes} onChange={e => setPromiseForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t('coll.promise_ph')}/>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1" onClick={() => setShowPromiseModal(null)}>{t('common.cancel')}</Button>
              <Button className="flex-1 bg-amber-500 hover:bg-amber-600" onClick={handleSavePromise}
                disabled={isSavingPromise || !promiseForm.promisedDate || !promiseForm.amount}>
                {isSavingPromise ? t('pay.saving') : t('coll.register_promise')}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Quick Pay Modal */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-2 sm:p-4 overflow-y-auto">
          <Card className="w-full max-w-lg my-2 sm:my-4 max-h-[95vh] sm:max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">{t('pay.register')} — {showPayModal.clientName}</h2>
              <button onClick={() => setShowPayModal(null)} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5"/></button>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 mb-4 text-sm">
              <span className="text-slate-600">{t('col.loan')}: </span><span className="font-mono font-bold">{showPayModal.loanNumber}</span>
              <span className="ml-4 text-slate-600">{t('coll.balance')}: </span><span className="font-bold text-red-600">{formatCurrency(showPayModal.totalBalance)}</span>
            </div>

            {/* Tabla de cuotas pendientes/vencidas */}
            {payLoanDetail?.installments && payLoanDetail.installments.filter((i: any) => i.status !== 'paid' && i.status !== 'waived').length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden mb-4">
                <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{t('pay.installments_status')}</span>
                  <div className="flex gap-1.5 flex-wrap text-[10px]">
                    {(() => {
                      const overdueCount = payLoanDetail.installments.filter((i: any) => i.status !== 'paid' && i.status !== 'waived' && (i.moraDays || 0) > 0).length
                      const totalMoraInst = payLoanDetail.installments.reduce((s: number, i: any) => s + (i.status !== 'paid' && i.status !== 'waived' ? (i.moraAmount || 0) : 0), 0)
                      return (<>
                        {overdueCount > 0 && (
                          <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{t('pay.overdue_badge').replace('{n}', String(overdueCount))}</span>
                        )}
                        {totalMoraInst > 0 && (
                          <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">{t('pay.mora_label')}: {formatCurrency(totalMoraInst)}</span>
                        )}
                        {(payLoanDetail.prorrogaFee || 0) > 0 && (
                          <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-medium">{t('pay.prorroga_label')}: {formatCurrency(payLoanDetail.prorrogaFee)}</span>
                        )}
                      </>)
                    })()}
                  </div>
                </div>
                <div className="max-h-40 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-semibold text-slate-600">#</th>
                        <th className="text-left px-3 py-1.5 font-semibold text-slate-600">{t('pay.due')}</th>
                        <th className="text-center px-3 py-1.5 font-semibold text-slate-600">{t('col.days')}</th>
                        <th className="text-right px-3 py-1.5 font-semibold text-slate-600">{t('pay.cuota')}</th>
                        <th className="text-right px-3 py-1.5 font-semibold text-slate-600">{t('pay.mora_label')}</th>
                        <th className="text-right px-3 py-1.5 font-semibold text-slate-600">{t('pay.pending')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payLoanDetail.installments.filter((i: any) => i.status !== 'paid' && i.status !== 'waived').slice(0, 12).map((inst: any) => {
                        const moraDays = inst.moraDays || 0
                        const isOverdue = moraDays > 0
                        const cuota = (inst.principalAmount || 0) + (inst.interestAmount || 0)
                        const pendiente = Math.max(0, cuota - (inst.paidTotal || 0)) + (inst.moraAmount || 0)
                        const isPartial = inst.status === 'partial' || (inst.paidTotal || 0) > 0
                        return (
                          <tr key={inst.id} className={`border-t border-slate-100 ${isOverdue ? 'bg-red-50' : isPartial ? 'bg-amber-50' : ''}`}>
                            <td className="px-3 py-1.5 text-slate-600">{inst.installmentNumber}</td>
                            <td className="px-3 py-1.5 text-slate-700">{inst.dueDate ? new Date(inst.dueDate).toLocaleDateString('es-DO') : '—'}</td>
                            <td className="px-3 py-1.5 text-center">
                              {isOverdue
                                ? <span className="text-red-700 font-semibold">{t('pay.days_overdue').replace('{n}', String(moraDays))}</span>
                                : isPartial
                                  ? <span className="text-amber-700">{t('pay.partial')}</span>
                                  : <span className="text-slate-400">—</span>}
                            </td>
                            <td className="px-3 py-1.5 text-right text-slate-700">{formatCurrency(cuota)}</td>
                            <td className="px-3 py-1.5 text-right">
                              {(inst.moraAmount || 0) > 0
                                ? <span className="text-red-600 font-semibold">{formatCurrency(inst.moraAmount)}</span>
                                : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-3 py-1.5 text-right font-semibold text-slate-900">{formatCurrency(pendiente)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('col.amount')} *</label>
                <input type="number" step="0.01" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('pay.method_label').replace(' *','')}</label>
                <select value={payForm.paymentMethod} onChange={e => setPayForm(f => ({ ...f, paymentMethod: e.target.value, bankAccountId: e.target.value === 'cash' ? '' : f.bankAccountId }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="cash">{t('method.cash')}</option>
                  <option value="transfer">{t('method.transfer')}</option>
                  <option value="check">{t('method.check')}</option>
                </select>
              </div>
              {payForm.paymentMethod !== 'cash' && bankAccounts.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('col.bank')}</label>
                  <select value={payForm.bankAccountId} onChange={e => setPayForm(f => ({ ...f, bankAccountId: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">{t('coll.select_account')}</option>
                    {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.bankName} {a.accountNumber ? `- ${a.accountNumber}` : ''}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('pay.reference')} ({t('common.optional')})</label>
                <input type="text" value={payForm.reference} onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))}
                  placeholder={t('pay.reference_ph')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1" onClick={() => setShowPayModal(null)}>{t('common.cancel')}</Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleQuickPay} disabled={isSavingPay || !payForm.amount}>
                {isSavingPay ? t('pay.registering') : t('pay.register')}
              </Button>
            </div>
          </Card>
        </div>
      )}
      </>)}
      {/* Modal Post-Pago */}
      {showPostPaymentModal && lastPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowPostPaymentModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{t('pay.post_title')}</h3>
                  <p className="text-xs text-slate-500">{t('pay.receipt_word')} {lastPayment.receiptNumber || lastPayment.paymentNumber} · {formatCurrency(lastPayment.amount || 0)}</p>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-slate-600">{t('pay.post_question')}</p>
              <button type="button" onClick={async () => { const tn = (tenantState as any)?.currentTenant?.tenant || { name: 'Negocio' }; await printPaymentReceipt(lastPayment, tn); }} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#1e3a5f] text-white rounded-lg font-medium hover:bg-[#152a45] transition">
                <Printer className="w-4 h-4" /> {t('pay.print_receipt')}
              </button>
              <button type="button" onClick={() => { const tn = (tenantState as any)?.currentTenant?.tenant || { name: 'Negocio' }; const phone = lastPayment.clientWhatsapp || ''; if (!phone) toast(t('pay.no_whatsapp'), { icon: '⚠️' }); sendReceiptByWhatsApp(phone, lastPayment, tn, { principalBalance: lastPayment.principalBalance, interestBalance: lastPayment.interestBalance, moraBalance: lastPayment.moraBalance }); }} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition">
                <MessageCircle className="w-4 h-4" /> {t('pay.send_whatsapp')}
              </button>
              <button type="button" onClick={() => setShowPostPaymentModal(false)} className="w-full px-4 py-2 text-sm text-slate-600 hover:text-slate-900">{t('common.close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CollectionsPage

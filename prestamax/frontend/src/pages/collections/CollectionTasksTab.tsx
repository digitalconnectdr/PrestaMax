import React, { useState, useEffect, useCallback } from 'react'
import { usePermission } from '@/hooks/usePermission'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import {
  ClipboardList, Plus, X, CheckCircle2, Clock, AlertCircle,
  ChevronDown, ChevronUp, Pencil, Trash2, User, Calendar,
  Link2, RefreshCw, History, ListTodo, Play, Download
} from 'lucide-react'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import { formatDate } from '@/lib/utils'
import { useT, t as tg } from '@/lib/i18n'

// ── Types — camelCase to match API interceptor's automatic conversion ──────────
interface Collector {
  id: string
  fullName: string
  email: string
}

interface LoanOption {
  id: string
  loanNumber: string
  clientName: string
  clientId: string
}

interface ClientOption {
  id: string
  fullName: string
}

interface CollectionTask {
  id: string
  assignedTo: string
  assignedToName: string | null
  createdBy: string
  createdByName: string | null
  loanId: string | null
  clientId: string | null
  loanNumber: string | null
  clientName: string | null
  title: string
  description: string | null
  taskType: string
  priority: string
  dueDate: string           // camelCase — API interceptor converts due_date → dueDate
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  resultNotes: string | null
  completedAt: string | null
  createdAt: string
}

interface TaskFormData {
  title: string
  description: string
  task_type: string    // sent as-is; snakelize interceptor keeps snake_case unchanged
  priority: string
  due_date: string     // sent as-is; backend receives d.due_date
  assigned_to: string
  loan_id: string
  client_id: string
}

const EMPTY_FORM: TaskFormData = {
  title: '', description: '', task_type: 'other', priority: 'medium',
  due_date: '', assigned_to: '', loan_id: '', client_id: '',
}

const TASK_TYPES = [
  { value: 'call',     labelKey: 'task.type.call' },
  { value: 'visit',    labelKey: 'task.type.visit' },
  { value: 'whatsapp', labelKey: 'task.type.whatsapp' },
  { value: 'payment',  labelKey: 'task.type.payment' },
  { value: 'document', labelKey: 'task.type.document' },
  { value: 'other',    labelKey: 'task.type.other' },
]

const PRIORITIES = [
  { value: 'high',   labelKey: 'task.prio.high',   color: 'text-red-600 bg-red-50 border-red-200' },
  { value: 'medium', labelKey: 'task.prio.medium', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { value: 'low',    labelKey: 'task.prio.low',    color: 'text-slate-500 bg-slate-50 border-slate-200' },
]

// ── Date helpers ───────────────────────────────────────────────────────────────
const formatDueDate = (due: string | null | undefined): string => {
  if (!due) return '—'
  const normalized = due.includes('T') ? due : due + 'T12:00:00'
  const d = new Date(normalized)
  if (isNaN(d.getTime())) return due
  return d.toLocaleDateString('es-DO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

const isDueDatePast = (due: string | null | undefined): boolean => {
  if (!due) return false
  const normalized = due.includes('T') ? due : due + 'T23:59:59'
  return new Date(normalized) < new Date()
}

// ── Small display components ──────────────────────────────────────────────────
const PriorityBadge: React.FC<{ priority: string }> = ({ priority }) => {
  const t = useT()
  const p = PRIORITIES.find(p => p.value === priority) || PRIORITIES[1]
  return <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${p.color}`}>{t(p.labelKey)}</span>
}

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const t = useT()
  if (status === 'pending')     return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full"><Clock className="w-3 h-3"/>{t('task.st_pending')}</span>
  if (status === 'in_progress') return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full"><Play className="w-3 h-3"/>{t('task.st_in_progress')}</span>
  if (status === 'completed')   return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full"><CheckCircle2 className="w-3 h-3"/>{t('task.st_completed')}</span>
  return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full"><X className="w-3 h-3"/>{t('task.st_cancelled')}</span>
}

const TypeLabel: React.FC<{ type: string }> = ({ type }) => {
  const t = useT()
  const found = TASK_TYPES.find(ty => ty.value === type)
  return <span className="text-xs text-slate-500">{found ? t(found.labelKey) : type}</span>
}

// ── CSV export helper ─────────────────────────────────────────────────────────
function exportTasksCSV(tasks: CollectionTask[], from: string, to: string) {
  const filtered = tasks.filter(t => {
    if (!from && !to) return true
    const d = t.completedAt || t.createdAt || ''
    const date = d.split('T')[0]
    if (from && date < from) return false
    if (to   && date > to)   return false
    return true
  })
  if (filtered.length === 0) return toast.error(tg('task.export_empty'))

  const headers = [tg('task.csv.title'), tg('col.status'), tg('task.priority_label'), tg('task.type_label'), tg('task.csv.collector'), tg('col.client'), tg('col.loan'), tg('task.csv.due'), tg('task.csv.completed'), tg('task.csv.result')]
  const rows = filtered.map(t => [
    `"${t.title}"`,
    t.status === 'completed' ? tg('task.st_completed') : t.status === 'cancelled' ? tg('task.st_cancelled') : t.status,
    tg(PRIORITIES.find(p => p.value === t.priority)?.labelKey || '') || t.priority,
    tg(TASK_TYPES.find(ty => ty.value === t.taskType)?.labelKey || '') || t.taskType,
    `"${t.assignedToName || ''}"`,
    `"${t.clientName || ''}"`,
    `"${t.loanNumber || ''}"`,
    `"${formatDueDate(t.dueDate)}"`,
    `"${t.completedAt ? formatDate(t.completedAt) : ''}"`,
    `"${(t.resultNotes || '').replace(/"/g, "'")}"`,
  ])

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `historial-tareas-${from || 'inicio'}-${to || 'hoy'}.csv`
  link.click()
  URL.revokeObjectURL(url)
  toast.success(tg('task.exported').replace('{n}', String(filtered.length)))
}

// ── Main component ────────────────────────────────────────────────────────────
const CollectionTasksTab: React.FC = () => {
  const { can } = usePermission()
  const t = useT()
  const canManage = can('collections.tasks.manage')
  const canView   = can('collections.tasks') || canManage

  const [activeTab, setActiveTab]           = useState<'pending' | 'history'>('pending')
  const [tasks, setTasks]                   = useState<CollectionTask[]>([])
  const [isLoading, setIsLoading]           = useState(true)
  const [canManageState, setCanManageState] = useState(false)
  const [collectors, setCollectors]         = useState<Collector[]>([])
  const [loanOptions, setLoanOptions]       = useState<LoanOption[]>([])
  const [clientOptions, setClientOptions]   = useState<ClientOption[]>([])
  const [expandedId, setExpandedId]         = useState<string | null>(null)
  const [filterCollector, setFilterCollector] = useState('')

  // Export filters
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo]     = useState('')

  // Form modal
  const [showForm, setShowForm]         = useState(false)
  const [editingTask, setEditingTask]   = useState<CollectionTask | null>(null)
  const [form, setForm]                 = useState<TaskFormData>(EMPTY_FORM)
  const [isSaving, setIsSaving]         = useState(false)

  // Per-task status update loading
  const [updatingId, setUpdatingId]     = useState<string | null>(null)

  // Complete modal
  const [completingTask, setCompletingTask] = useState<CollectionTask | null>(null)
  const [resultNotes, setResultNotes]       = useState('')
  const [isCompleting, setIsCompleting]     = useState(false)

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // ── Permission/plan denied flag ────────────────────────────────────────────
  const [accessDenied, setAccessDenied] = useState<{ reason: 'plan' | 'permission' } | null>(null)

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    setIsLoading(true)
    try {
      const params: Record<string, string> = {}
      // NOTE: query params are NOT converted by the camelCase interceptor — use snake_case directly
      if (filterCollector) params.assigned_to = filterCollector
      const res = await api.get('/collection-tasks', { params })
      setTasks(res.data.tasks || [])
      setCanManageState(res.data.canManage || false)
      setAccessDenied(null)
    } catch (err: any) {
      // Plan o permiso no incluye Agenda — mostrar mensaje amigable, sin error
      if (err?.response?.status === 403) {
        const code = err?.response?.data?.code
        setAccessDenied({ reason: code === 'PLAN_FEATURE_REQUIRED' ? 'plan' : 'permission' })
        setTasks([])
      } else {
        toast.error(t('task.load_error'))
      }
    }
    finally { setIsLoading(false) }
  }, [filterCollector])

  const fetchDropdownData = useCallback(async () => {
    try {
      const [collectorsRes, loansRes, clientsRes] = await Promise.all([
        api.get('/collection-tasks/collectors').catch(() => ({ data: [] })),
        api.get('/loans?limit=500').catch(() => ({ data: [] })),
        api.get('/clients?limit=500').catch(() => ({ data: { clients: [] } })),
      ])

      // Collectors — API returns fullName after camelCase conversion
      setCollectors(
        (collectorsRes.data || []).map((c: any) => ({
          id: c.id,
          fullName: c.fullName || c.full_name || '',
          email: c.email || '',
        }))
      )

      // Loans — backend returns { data: [...], total, page, limit }
      // After camelCase interceptor the wrapper key stays "data" (it's already camelCase)
      const loansRaw: any[] = Array.isArray(loansRes.data)
        ? loansRes.data
        : loansRes.data?.data || loansRes.data?.loans || []
      setLoanOptions(
        loansRaw
          .filter((l: any) => ['active','current','in_mora','overdue','disbursed','restructured'].includes(l.status))
          .map((l: any) => ({
            id: l.id,
            loanNumber: l.loanNumber || '',
            clientName: l.clientName || '',
            clientId:   l.clientId   || '',
          }))
      )

      // Clients — backend returns { data: [...], total, page, limit }
      const clientsRaw: any[] = Array.isArray(clientsRes.data)
        ? clientsRes.data
        : clientsRes.data?.data || clientsRes.data?.clients || []
      setClientOptions(
        clientsRaw.map((c: any) => ({
          id: c.id,
          fullName: c.fullName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Sin nombre',
        }))
      )
    } catch { /* silencioso */ }
  }, [])

  useEffect(() => {
    if (canView) {
      fetchTasks()
      fetchDropdownData()
    }
  }, [canView, filterCollector])

  // ── Derived ────────────────────────────────────────────────────────────────
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress')
  const historyTasks = tasks.filter(t => t.status === 'completed' || t.status === 'cancelled')
  const displayTasks = activeTab === 'pending' ? pendingTasks : historyTasks

  // ── Form handlers ──────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingTask(null)
    setForm({ ...EMPTY_FORM, due_date: new Date().toISOString().split('T')[0] })
    setShowForm(true)
  }

  const openEdit = (task: CollectionTask) => {
    setEditingTask(task)
    setForm({
      title:       task.title,
      description: task.description || '',
      task_type:   task.taskType,
      priority:    task.priority,
      due_date:    task.dueDate?.split('T')[0] || task.dueDate || '',
      assigned_to: task.assignedTo,
      loan_id:     task.loanId    || '',
      client_id:   task.clientId  || '',
    })
    setShowForm(true)
  }

  const handleLoanSelect = (loanId: string) => {
    if (!loanId) { setForm(f => ({ ...f, loan_id: '', client_id: '' })); return }
    const loan = loanOptions.find(l => l.id === loanId)
    setForm(f => ({ ...f, loan_id: loanId, client_id: loan?.clientId || '' }))
  }

  const handleSave = async () => {
    if (!form.title.trim())                    return toast.error(t('task.title_required'))
    if (canManageState && !form.assigned_to)   return toast.error(t('task.assign_required'))
    if (!form.due_date)                        return toast.error(t('task.due_required'))

    setIsSaving(true)
    try {
      // Payload keys are snake_case — the snakelize interceptor leaves them unchanged
      const payload = {
        title:       form.title.trim(),
        description: form.description.trim() || null,
        task_type:   form.task_type,
        priority:    form.priority,
        due_date:    form.due_date,
        assigned_to: form.assigned_to  || undefined,
        loan_id:     form.loan_id      || null,
        client_id:   form.client_id    || null,
      }
      if (editingTask) {
        await api.put(`/collection-tasks/${editingTask.id}`, payload)
        toast.success(t('task.updated'))
      } else {
        await api.post('/collection-tasks', payload)
        toast.success(t('task.created'))
      }
      setShowForm(false)
      setEditingTask(null)
      fetchTasks()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('task.save_error'))
    } finally { setIsSaving(false) }
  }

  const handleStatusChange = async (task: CollectionTask, status: CollectionTask['status']) => {
    if (status === 'completed') { setCompletingTask(task); setResultNotes(''); return }
    setUpdatingId(task.id)
    try {
      await api.patch(`/collection-tasks/${task.id}/status`, { status })
      setTasks(prev => prev.map(x => x.id === task.id ? { ...x, status } : x))
      toast.success(status === 'in_progress' ? t('task.started') : t('prom.status_updated'))
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('prom.status_error'))
    } finally { setUpdatingId(null) }
  }

  const handleComplete = async () => {
    if (!completingTask) return
    setIsCompleting(true)
    try {
      await api.patch(`/collection-tasks/${completingTask.id}/status`, {
        status: 'completed',
        result_notes: resultNotes.trim() || null,
      })
      toast.success(t('task.completed_ok'))
      setCompletingTask(null)
      fetchTasks()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('common.error'))
    } finally { setIsCompleting(false) }
  }

  const handleDelete = async () => {
    if (!deletingId) return
    setIsDeleting(true)
    try {
      await api.delete(`/collection-tasks/${deletingId}`)
      setTasks(prev => prev.filter(x => x.id !== deletingId))
      toast.success(t('task.deleted')); setDeletingId(null)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('common.error'))
    } finally { setIsDeleting(false) }
  }

  // ── No permission ──────────────────────────────────────────────────────────
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <AlertCircle className="w-12 h-12 mb-3 opacity-40" />
        <p className="font-medium text-slate-600">{t('task.no_access')}</p>
        <p className="text-sm mt-1">{t('task.no_access_desc')}</p>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sub-tabs */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={() => setActiveTab('pending')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'pending' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <ListTodo className="w-4 h-4"/>
              {t('task.pending_tab')}
              {pendingTasks.length > 0 && <span className="ml-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 rounded-full">{pendingTasks.length}</span>}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <History className="w-4 h-4"/>
              {t('task.history_tab')}
              {historyTasks.length > 0 && <span className="ml-0.5 bg-slate-200 text-slate-600 text-[10px] font-bold px-1.5 rounded-full">{historyTasks.length}</span>}
            </button>
          </div>

          {/* Collector filter */}
          {canManageState && collectors.length > 0 && (
            <select
              value={filterCollector}
              onChange={e => setFilterCollector(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
            >
              <option value="">{t('task.all_collectors')}</option>
              {collectors.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={fetchTasks} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors" title={t('common.refresh')}>
            <RefreshCw className="w-4 h-4"/>
          </button>
          {canManageState && (
            <Button onClick={openCreate} className="flex items-center gap-1.5">
              <Plus className="w-4 h-4"/>{t('task.new')}
            </Button>
          )}
        </div>
      </div>

      {/* History export bar */}
      {activeTab === 'history' && historyTasks.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <span className="text-xs font-semibold text-slate-500 uppercase">{t('task.export_history')}</span>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-600">{t('common.from')}:</label>
            <input
              type="date"
              value={exportFrom}
              onChange={e => setExportFrom(e.target.value)}
              className="px-2 py-1 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-600">{t('common.to')}:</label>
            <input
              type="date"
              value={exportTo}
              onChange={e => setExportTo(e.target.value)}
              className="px-2 py-1 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => exportTasksCSV(historyTasks, exportFrom, exportTo)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#16304f] transition-colors"
          >
            <Download className="w-3.5 h-3.5"/>{t('acct.download_csv')}
          </button>
          <span className="text-[10px] text-slate-400">{t('task.export_hint')}</span>
        </div>
      )}

      {/* Task list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin mr-2"/>
          {t('task.loading')}
        </div>
      ) : accessDenied ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <ClipboardList className="w-12 h-12 mb-3 opacity-30"/>
          {accessDenied.reason === 'plan' ? (
            <>
              <p className="font-medium text-slate-600">{t('task.plan_title')}</p>
              <p className="text-sm mt-1 text-center max-w-md">{t('task.plan_desc')}</p>
            </>
          ) : (
            <>
              <p className="font-medium text-slate-600">{t('task.perm_title')}</p>
              <p className="text-sm mt-1 text-center max-w-md">{t('task.perm_desc')}</p>
            </>
          )}
        </div>
      ) : displayTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          {activeTab === 'pending' ? (
            <>
              <ClipboardList className="w-12 h-12 mb-3 opacity-30"/>
              <p className="font-medium text-slate-600">{t('task.empty_pending')}</p>
              <p className="text-sm mt-1">{canManageState ? t('task.empty_pending_manage') : t('task.empty_pending_collector')}</p>
            </>
          ) : (
            <>
              <History className="w-12 h-12 mb-3 opacity-30"/>
              <p className="font-medium text-slate-600">{t('task.empty_history')}</p>
              <p className="text-sm mt-1">{t('task.empty_history_desc')}</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {displayTasks.map(task => {
            const isExpanded = expandedId === task.id
            const isUpdating = updatingId === task.id
            const isOverdue  = task.status !== 'completed' && task.status !== 'cancelled' && isDueDatePast(task.dueDate)

            return (
              <Card
                key={task.id}
                className={`p-0 overflow-hidden ${
                  task.priority === 'high'   && task.status !== 'completed' ? 'border-l-4 border-l-red-400' :
                  task.priority === 'medium' && task.status !== 'completed' ? 'border-l-4 border-l-amber-400' :
                  'border-l-4 border-l-slate-200'
                } ${task.status === 'completed' ? 'opacity-70' : ''}`}
              >
                {/* Main row */}
                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {task.status === 'completed'   && <CheckCircle2 className="w-5 h-5 text-emerald-500"/>}
                    {task.status === 'in_progress' && <Play className="w-5 h-5 text-blue-500"/>}
                    {task.status === 'pending'     && <Clock className="w-5 h-5 text-slate-400"/>}
                    {task.status === 'cancelled'   && <X className="w-5 h-5 text-red-400"/>}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className={`font-semibold text-slate-800 ${task.status === 'completed' ? 'line-through text-slate-400' : ''}`}>
                        {task.title}
                      </span>
                      <PriorityBadge priority={task.priority}/>
                      <StatusBadge status={task.status}/>
                      {isOverdue && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 bg-red-100 text-red-600 rounded border border-red-200 uppercase">
                          <AlertCircle className="w-2.5 h-2.5"/>{t('task.overdue_badge')}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3"/>{formatDueDate(task.dueDate)}
                      </span>
                      <TypeLabel type={task.taskType}/>
                      {canManageState && task.assignedToName && (
                        <span className="flex items-center gap-1"><User className="w-3 h-3"/>{task.assignedToName}</span>
                      )}
                      {task.clientName && (
                        <span className="flex items-center gap-1 text-blue-600">
                          <Link2 className="w-3 h-3"/>{task.clientName}{task.loanNumber ? ` — ${task.loanNumber}` : ''}
                        </span>
                      )}
                    </div>

                    {task.description && !isExpanded && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-1">{task.description}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {(task.status === 'pending' || task.status === 'in_progress') && (
                      <>
                        {task.status === 'pending' && (
                          <button
                            onClick={() => handleStatusChange(task, 'in_progress')}
                            disabled={isUpdating}
                            className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium disabled:opacity-50"
                          >{isUpdating ? '...' : t('task.start')}</button>
                        )}
                        <button
                          onClick={() => handleStatusChange(task, 'completed')}
                          disabled={isUpdating}
                          className="px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 font-medium disabled:opacity-50"
                        >{t('task.complete')}</button>
                      </>
                    )}

                    {canManageState && task.status !== 'completed' && task.status !== 'cancelled' && (
                      <>
                        <button onClick={() => openEdit(task)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700" title={t('common.edit')}>
                          <Pencil className="w-3.5 h-3.5"/>
                        </button>
                        <button onClick={() => setDeletingId(task.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600" title={t('common.delete')}>
                          <Trash2 className="w-3.5 h-3.5"/>
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={e => { e.preventDefault(); e.stopPropagation(); setExpandedId(isExpanded ? null : task.id) }}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                    </button>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-2 bg-slate-50/50">
                    {task.description && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('task.description_label')}</p>
                        <p className="text-sm text-slate-700 whitespace-pre-line">{task.description}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">{t('task.created_by')}</p>
                        <p className="text-slate-700">{task.createdByName || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">{t('task.assigned_to_label')}</p>
                        <p className="text-slate-700">{task.assignedToName || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">{t('task.created_date')}</p>
                        <p className="text-slate-700">{formatDate(task.createdAt)}</p>
                      </div>
                      {task.completedAt && (
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">{t('task.completed_label')}</p>
                          <p className="text-slate-700">{formatDate(task.completedAt)}</p>
                        </div>
                      )}
                    </div>
                    {task.resultNotes && (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                        <p className="text-[10px] font-bold text-emerald-700 uppercase mb-0.5">{t('task.result_label')}</p>
                        <p className="text-sm text-emerald-800">{task.resultNotes}</p>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Create / Edit Modal ──────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="section-title flex items-center gap-2">
                <ClipboardList className="w-5 h-5"/>
                {editingTask ? t('task.edit') : t('task.new')}
              </h2>
              <button onClick={() => { setShowForm(false); setEditingTask(null) }} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5"/></button>
            </div>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('task.title_label')}</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder={t('task.title_ph')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('task.desc_label')}</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                  placeholder={t('task.desc_ph')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('task.type_label')}</label>
                  <select value={form.task_type} onChange={e => setForm(f => ({ ...f, task_type: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {TASK_TYPES.map(ty => <option key={ty.value} value={ty.value}>{t(ty.labelKey)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('task.priority_label')}</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {PRIORITIES.map(p => <option key={p.value} value={p.value}>{t(p.labelKey)}</option>)}
                  </select>
                </div>
              </div>

              {/* Due date */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('task.due_label')}</label>
                <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>

              {/* Assign to */}
              {canManageState && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('task.assign_label')}</label>
                  {collectors.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">{t('task.no_collectors')}</p>
                  ) : (
                    <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">{t('task.select_collector')}</option>
                      {collectors.map(c => <option key={c.id} value={c.id}>{c.fullName} ({c.email})</option>)}
                    </select>
                  )}
                </div>
              )}

              {/* Loan / Client link */}
              <div className="border border-dashed border-slate-200 rounded-lg p-3 space-y-3 bg-slate-50">
                <p className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1.5">
                  <Link2 className="w-3 h-3"/>{t('task.link_label')}
                </p>

                <div>
                  <label className="block text-xs text-slate-600 mb-1">{t('col.loan')}</label>
                  <select value={form.loan_id} onChange={e => handleLoanSelect(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">{t('task.no_loan')}</option>
                    {loanOptions.map(l => (
                      <option key={l.id} value={l.id}>#{l.loanNumber} — {l.clientName}</option>
                    ))}
                  </select>
                  {form.loan_id && <p className="text-[10px] text-slate-400 mt-0.5">{t('task.auto_client')}</p>}
                </div>

                {!form.loan_id && (
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">{t('task.client_no_loan')}</label>
                    <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">{t('task.no_client')}</option>
                      {clientOptions.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
                    </select>
                  </div>
                )}

                <p className="text-[10px] text-slate-400">{t('task.both_blank')}</p>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => { setShowForm(false); setEditingTask(null) }}>{t('common.cancel')}</Button>
              <Button className="flex-1" onClick={handleSave} disabled={isSaving || !form.title.trim() || !form.due_date}>
                {isSaving ? t('pay.saving') : editingTask ? t('common.save_changes') : t('task.create')}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Complete Modal ───────────────────────────────────────────────────── */}
      {completingTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-500"/>{t('task.complete_title')}</h2>
              <button onClick={() => setCompletingTask(null)} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5"/></button>
            </div>
            <div className="bg-slate-50 rounded-lg px-3 py-2 mb-4">
              <p className="font-semibold text-slate-800 text-sm">{completingTask.title}</p>
              {completingTask.clientName && (
                <p className="text-xs text-slate-500 mt-0.5">{completingTask.clientName}{completingTask.loanNumber ? ` — ${completingTask.loanNumber}` : ''}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('task.result_notes_label')}</label>
              <textarea value={resultNotes} onChange={e => setResultNotes(e.target.value)} rows={3} autoFocus
                placeholder={t('task.result_ph')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1" onClick={() => setCompletingTask(null)}>{t('common.cancel')}</Button>
              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={handleComplete} disabled={isCompleting}>
                {isCompleting ? t('pay.saving') : t('task.confirm_complete')}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Delete Confirm ───────────────────────────────────────────────────── */}
      {deletingId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-600"/>
              </div>
              <div>
                <p className="font-semibold text-slate-800">{t('task.delete_q')}</p>
                <p className="text-sm text-slate-500">{t('task.delete_desc')}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1" onClick={() => setDeletingId(null)}>{t('common.cancel')}</Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? t('task.deleting') : t('common.delete')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default CollectionTasksTab

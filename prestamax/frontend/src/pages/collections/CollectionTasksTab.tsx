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
  { value: 'call',     label: '📞 Llamada' },
  { value: 'visit',    label: '🚶 Visita' },
  { value: 'whatsapp', label: '💬 WhatsApp' },
  { value: 'payment',  label: '💵 Cobro de cuota' },
  { value: 'document', label: '📄 Documento' },
  { value: 'other',    label: '📝 Otro' },
]

const PRIORITIES = [
  { value: 'high',   label: 'Alta',  color: 'text-red-600 bg-red-50 border-red-200' },
  { value: 'medium', label: 'Media', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { value: 'low',    label: 'Baja',  color: 'text-slate-500 bg-slate-50 border-slate-200' },
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
  const p = PRIORITIES.find(p => p.value === priority) || PRIORITIES[1]
  return <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${p.color}`}>{p.label}</span>
}

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  if (status === 'pending')     return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full"><Clock className="w-3 h-3"/>Pendiente</span>
  if (status === 'in_progress') return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full"><Play className="w-3 h-3"/>En progreso</span>
  if (status === 'completed')   return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full"><CheckCircle2 className="w-3 h-3"/>Completada</span>
  return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full"><X className="w-3 h-3"/>Cancelada</span>
}

const TypeLabel: React.FC<{ type: string }> = ({ type }) => {
  const t = TASK_TYPES.find(t => t.value === type)
  return <span className="text-xs text-slate-500">{t ? t.label : type}</span>
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
  if (filtered.length === 0) return toast.error('No hay tareas en ese rango de fechas.')

  const headers = ['Título','Estado','Prioridad','Tipo','Cobrador','Cliente','Préstamo','Fecha Límite','Fecha Completada','Resultado']
  const rows = filtered.map(t => [
    `"${t.title}"`,
    t.status === 'completed' ? 'Completada' : t.status === 'cancelled' ? 'Cancelada' : t.status,
    PRIORITIES.find(p => p.value === t.priority)?.label || t.priority,
    TASK_TYPES.find(ty => ty.value === t.taskType)?.label || t.taskType,
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
  toast.success(`${filtered.length} tareas exportadas`)
}

// ── Main component ────────────────────────────────────────────────────────────
const CollectionTasksTab: React.FC = () => {
  const { can } = usePermission()
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
    } catch { toast.error('Error al cargar la agenda') }
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
    if (!form.title.trim())                    return toast.error('El título es requerido')
    if (canManageState && !form.assigned_to)   return toast.error('Debes asignar la tarea a un cobrador')
    if (!form.due_date)                        return toast.error('La fecha límite es requerida')

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
        toast.success('Tarea actualizada')
      } else {
        await api.post('/collection-tasks', payload)
        toast.success('Tarea creada y cobrador notificado')
      }
      setShowForm(false)
      setEditingTask(null)
      fetchTasks()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al guardar la tarea')
    } finally { setIsSaving(false) }
  }

  const handleStatusChange = async (task: CollectionTask, status: CollectionTask['status']) => {
    if (status === 'completed') { setCompletingTask(task); setResultNotes(''); return }
    setUpdatingId(task.id)
    try {
      await api.patch(`/collection-tasks/${task.id}/status`, { status })
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status } : t))
      toast.success(status === 'in_progress' ? 'Tarea iniciada' : 'Estado actualizado')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al actualizar estado')
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
      toast.success('Tarea completada')
      setCompletingTask(null)
      fetchTasks()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error')
    } finally { setIsCompleting(false) }
  }

  const handleDelete = async () => {
    if (!deletingId) return
    setIsDeleting(true)
    try {
      await api.delete(`/collection-tasks/${deletingId}`)
      setTasks(prev => prev.filter(t => t.id !== deletingId))
      toast.success('Tarea eliminada'); setDeletingId(null)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error')
    } finally { setIsDeleting(false) }
  }

  // ── No permission ──────────────────────────────────────────────────────────
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <AlertCircle className="w-12 h-12 mb-3 opacity-40" />
        <p className="font-medium text-slate-600">Sin acceso</p>
        <p className="text-sm mt-1">No tienes permiso para ver la agenda de cobranza.</p>
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
              Pendientes
              {pendingTasks.length > 0 && <span className="ml-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 rounded-full">{pendingTasks.length}</span>}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <History className="w-4 h-4"/>
              Historial
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
              <option value="">Todos los cobradores</option>
              {collectors.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={fetchTasks} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors" title="Actualizar">
            <RefreshCw className="w-4 h-4"/>
          </button>
          {canManageState && (
            <Button onClick={openCreate} className="flex items-center gap-1.5">
              <Plus className="w-4 h-4"/>Nueva Tarea
            </Button>
          )}
        </div>
      </div>

      {/* History export bar */}
      {activeTab === 'history' && historyTasks.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <span className="text-xs font-semibold text-slate-500 uppercase">Exportar historial</span>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-600">Desde:</label>
            <input
              type="date"
              value={exportFrom}
              onChange={e => setExportFrom(e.target.value)}
              className="px-2 py-1 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-600">Hasta:</label>
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
            <Download className="w-3.5 h-3.5"/>Descargar CSV
          </button>
          <span className="text-[10px] text-slate-400">Deja las fechas en blanco para exportar todo el historial</span>
        </div>
      )}

      {/* Task list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin mr-2"/>
          Cargando agenda...
        </div>
      ) : displayTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          {activeTab === 'pending' ? (
            <>
              <ClipboardList className="w-12 h-12 mb-3 opacity-30"/>
              <p className="font-medium text-slate-600">Sin tareas pendientes</p>
              <p className="text-sm mt-1">{canManageState ? 'Crea una nueva tarea para asignarla a un cobrador.' : 'No tienes tareas asignadas por el momento.'}</p>
            </>
          ) : (
            <>
              <History className="w-12 h-12 mb-3 opacity-30"/>
              <p className="font-medium text-slate-600">Sin historial aún</p>
              <p className="text-sm mt-1">Las tareas completadas o canceladas aparecerán aquí.</p>
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
                          <AlertCircle className="w-2.5 h-2.5"/>Vencida
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
                          >{isUpdating ? '...' : 'Iniciar'}</button>
                        )}
                        <button
                          onClick={() => handleStatusChange(task, 'completed')}
                          disabled={isUpdating}
                          className="px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 font-medium disabled:opacity-50"
                        >Completar</button>
                      </>
                    )}

                    {canManageState && task.status !== 'completed' && task.status !== 'cancelled' && (
                      <>
                        <button onClick={() => openEdit(task)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700" title="Editar">
                          <Pencil className="w-3.5 h-3.5"/>
                        </button>
                        <button onClick={() => setDeletingId(task.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600" title="Eliminar">
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
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Descripción</p>
                        <p className="text-sm text-slate-700 whitespace-pre-line">{task.description}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Creada por</p>
                        <p className="text-slate-700">{task.createdByName || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Asignada a</p>
                        <p className="text-slate-700">{task.assignedToName || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Fecha creación</p>
                        <p className="text-slate-700">{formatDate(task.createdAt)}</p>
                      </div>
                      {task.completedAt && (
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Completada</p>
                          <p className="text-slate-700">{formatDate(task.completedAt)}</p>
                        </div>
                      )}
                    </div>
                    {task.resultNotes && (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                        <p className="text-[10px] font-bold text-emerald-700 uppercase mb-0.5">Resultado</p>
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
                {editingTask ? 'Editar Tarea' : 'Nueva Tarea'}
              </h2>
              <button onClick={() => { setShowForm(false); setEditingTask(null) }} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5"/></button>
            </div>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Título *</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Ej: Llamar para recordar pago de cuota"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción (opcional)</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                  placeholder="Instrucciones adicionales..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
                  <select value={form.task_type} onChange={e => setForm(f => ({ ...f, task_type: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Prioridad</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Due date */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fecha límite *</label>
                <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>

              {/* Assign to */}
              {canManageState && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Asignar a *</label>
                  {collectors.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No hay cobradores disponibles.</p>
                  ) : (
                    <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">-- Selecciona un cobrador --</option>
                      {collectors.map(c => <option key={c.id} value={c.id}>{c.fullName} ({c.email})</option>)}
                    </select>
                  )}
                </div>
              )}

              {/* Loan / Client link */}
              <div className="border border-dashed border-slate-200 rounded-lg p-3 space-y-3 bg-slate-50">
                <p className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1.5">
                  <Link2 className="w-3 h-3"/>Vincular a Préstamo / Cliente (opcional)
                </p>

                <div>
                  <label className="block text-xs text-slate-600 mb-1">Préstamo</label>
                  <select value={form.loan_id} onChange={e => handleLoanSelect(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— Sin préstamo asociado —</option>
                    {loanOptions.map(l => (
                      <option key={l.id} value={l.id}>#{l.loanNumber} — {l.clientName}</option>
                    ))}
                  </select>
                  {form.loan_id && <p className="text-[10px] text-slate-400 mt-0.5">Cliente asignado automáticamente al seleccionar el préstamo.</p>}
                </div>

                {!form.loan_id && (
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Cliente (sin préstamo específico)</label>
                    <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— Sin cliente asociado —</option>
                      {clientOptions.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
                    </select>
                  </div>
                )}

                <p className="text-[10px] text-slate-400">Puedes dejar ambos en blanco si la tarea no está vinculada a un préstamo o cliente específico.</p>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => { setShowForm(false); setEditingTask(null) }}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSave} disabled={isSaving || !form.title.trim() || !form.due_date}>
                {isSaving ? 'Guardando...' : editingTask ? 'Guardar Cambios' : 'Crear Tarea'}
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
              <h2 className="section-title flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-500"/>Completar Tarea</h2>
              <button onClick={() => setCompletingTask(null)} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5"/></button>
            </div>
            <div className="bg-slate-50 rounded-lg px-3 py-2 mb-4">
              <p className="font-semibold text-slate-800 text-sm">{completingTask.title}</p>
              {completingTask.clientName && (
                <p className="text-xs text-slate-500 mt-0.5">{completingTask.clientName}{completingTask.loanNumber ? ` — ${completingTask.loanNumber}` : ''}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Resultado / Notas (opcional)</label>
              <textarea value={resultNotes} onChange={e => setResultNotes(e.target.value)} rows={3} autoFocus
                placeholder="Ej: Cliente pagó en efectivo. Quedan 2 cuotas pendientes..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1" onClick={() => setCompletingTask(null)}>Cancelar</Button>
              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={handleComplete} disabled={isCompleting}>
                {isCompleting ? 'Guardando...' : 'Confirmar Completada'}
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
                <p className="font-semibold text-slate-800">¿Eliminar esta tarea?</p>
                <p className="text-sm text-slate-500">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1" onClick={() => setDeletingId(null)}>Cancelar</Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? 'Eliminando...' : 'Eliminar'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default CollectionTasksTab

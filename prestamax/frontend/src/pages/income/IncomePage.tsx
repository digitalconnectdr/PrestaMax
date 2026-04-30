import React, { useState, useEffect } from 'react'
import { usePermission } from '@/hooks/usePermission'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { PageLoadingState } from '@/components/ui/Loading'
import EmptyState from '@/components/ui/EmptyState'
import { TrendingUp, TrendingDown, Plus, X, Trash2, BarChart3 } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import api, { isAccessDenied } from '@/lib/api'
import toast from 'react-hot-toast'

interface Entry {
  id: string
  type: 'income' | 'expense'
  category: string
  description: string
  amount: number
  transactionDate: string
  paymentMethod: string
  bankAccountId: string | null
  reference: string | null
  notes: string | null
  registeredByName: string
}

interface BankAccount {
  id: string
  bankName: string
  accountNumber: string
  currency: string
  currentBalance: number
}

interface Summary {
  totalIncome: number
  totalExpenses: number
}

const INCOME_CATEGORIES = ['ventas', 'comisiones', 'recuperaciones', 'intereses', 'otros']
const EXPENSE_CATEGORIES = ['nomina', 'alquiler', 'servicios', 'marketing', 'operaciones', 'impuestos', 'suministros', 'delivery', 'otros']

const CATEGORY_LABELS: Record<string, string> = {
  ventas: 'Ventas', comisiones: 'Comisiones', recuperaciones: 'Recuperaciones', intereses: 'Intereses',
  nomina: 'Nómina', alquiler: 'Alquiler', servicios: 'Servicios públicos', marketing: 'Marketing',
  operaciones: 'Operaciones', impuestos: 'Impuestos', suministros: 'Suministros',
  delivery: 'Delivery / Transporte', otros: 'Otros',
}

const IncomePage: React.FC = () => {
  const { can } = usePermission()
  const [entries, setEntries] = useState<Entry[]>([])
  const [summary, setSummary] = useState<Summary>({ totalIncome: 0, totalExpenses: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const emptyForm = {
    type: 'expense',
    category: 'otros',
    description: '',
    amount: '',
    transactionDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'cash',
    bankAccountId: '',
    reference: '',
    notes: '',
  }
  const [form, setForm] = useState(emptyForm)

  const fetchEntries = async () => {
    try {
      const params = new URLSearchParams()
      if (typeFilter) params.append('type', typeFilter)
      if (fromDate) params.append('from_date', fromDate)
      if (toDate) params.append('to_date', toDate)
      const [res, bankRes] = await Promise.all([
        api.get(`/income?${params.toString()}`),
        api.get('/settings/bank-accounts').catch(()=>({data:[]}))
      ])
      setEntries(res.data.data || [])
      if (res.data.summary) setSummary(res.data.summary)
      setBankAccounts(Array.isArray(bankRes.data) ? bankRes.data.filter((a:any)=>a.isActive) : [])
    } catch (err) {
      if (!isAccessDenied(err)) toast.error('Error al cargar registros')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchEntries() }, [typeFilter, fromDate, toDate])

  const handleCreate = async () => {
    if (!form.description || !form.amount) {
      toast.error('Descripción y monto son requeridos')
      return
    }
    try {
      setIsSubmitting(true)
      await api.post('/income', {
        type: form.type,
        category: form.category,
        description: form.description,
        amount: parseFloat(form.amount),
        transactionDate: new Date(form.transactionDate + 'T12:00:00').toISOString(),
        paymentMethod: form.paymentMethod,
        bankAccountId: form.bankAccountId || null,
        reference: form.reference || null,
        notes: form.notes || null,
      })
      toast.success(form.type === 'income' ? 'Ingreso registrado' : 'Gasto registrado')
      setShowModal(false)
      setForm(emptyForm)
      fetchEntries()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al registrar')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este registro?')) return
    try {
      await api.delete(`/income/${id}`)
      toast.success('Registro eliminado')
      fetchEntries()
    } catch (err: any) {
      toast.error('Error al eliminar')
    }
  }

  if (isLoading) return <PageLoadingState />

  const filtered = entries.filter(e =>
    (e.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (e.category || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const netBalance = summary.totalIncome - summary.totalExpenses

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="page-title">Ingresos y Gastos</h1>
          <p className="text-slate-600 text-sm mt-1">Control financiero operativo del negocio</p>
        </div>
        {can('income.create') && (
          <Button onClick={() => setShowModal(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />Nuevo Registro
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-emerald-50 border-emerald-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg"><TrendingUp className="w-5 h-5 text-emerald-600"/></div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-medium">Total Ingresos</p>
              <p className="text-xl font-bold text-emerald-700">{formatCurrency(summary.totalIncome)}</p>
            </div>
          </div>
        </Card>
        <Card className="bg-red-50 border-red-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg"><TrendingDown className="w-5 h-5 text-red-600"/></div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-medium">Total Gastos</p>
              <p className="text-xl font-bold text-red-700">{formatCurrency(summary.totalExpenses)}</p>
            </div>
          </div>
        </Card>
        <Card className={`p-4 ${netBalance >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${netBalance >= 0 ? 'bg-blue-100' : 'bg-orange-100'}`}>
              <BarChart3 className={`w-5 h-5 ${netBalance >= 0 ? 'text-blue-600' : 'text-orange-600'}`}/>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-medium">Balance Neto</p>
              <p className={`text-xl font-bold ${netBalance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>{formatCurrency(netBalance)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input type="text" placeholder="Buscar por descripción o categoría..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Ingresos y Gastos</option>
            <option value="income">Solo Ingresos</option>
            <option value="expense">Solo Gastos</option>
          </select>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>
      </Card>

      {/* Table */}
      {filtered.length > 0 ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Fecha</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Tipo</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Categoría</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Descripción</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Monto</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Registrado por</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(entry => (
                  <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-slate-600">{formatDate(entry.transactionDate)}</td>
                    <td className="py-3 px-4 text-center">
                      {entry.type === 'income' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                          <TrendingUp className="w-3 h-3"/>Ingreso
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          <TrendingDown className="w-3 h-3"/>Gasto
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{CATEGORY_LABELS[entry.category] || entry.category}</td>
                    <td className="py-3 px-4 font-medium">{entry.description}</td>
                    <td className={`py-3 px-4 text-right font-semibold ${entry.type === 'income' ? 'text-emerald-700' : 'text-red-700'}`}>
                      {entry.type === 'income' ? '+' : '-'}{formatCurrency(entry.amount)}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500">{entry.registeredByName || '—'}</td>
                    <td className="py-3 px-4 text-center">
                      {can('income.delete') && (
                        <button onClick={() => handleDelete(entry.id)} className="p-1.5 hover:bg-red-50 rounded text-red-500 transition-colors" title="Eliminar">
                          <Trash2 className="w-4 h-4"/>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState icon={BarChart3} title="Sin registros" description="Registra ingresos y gastos operativos del negocio" action={can('income.create') ? {label:'Nuevo Registro',onClick:()=>setShowModal(true)} : undefined} />
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="section-title">Nuevo Registro</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5"/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setForm(f => ({ ...f, type: 'income', category: 'otros' }))}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors ${form.type === 'income' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                    <TrendingUp className="w-4 h-4 inline mr-1"/>Ingreso
                  </button>
                  <button onClick={() => setForm(f => ({ ...f, type: 'expense', category: 'otros' }))}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors ${form.type === 'expense' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                    <TrendingDown className="w-4 h-4 inline mr-1"/>Gasto
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Categoría</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {(form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción *</label>
                <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción del movimiento" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Monto *</label>
                <input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fecha</label>
                <input type="date" value={form.transactionDate} onChange={e => setForm(f => ({ ...f, transactionDate: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Método de Pago</label>
                <select value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia</option>
                  <option value="check">Cheque</option>
                  <option value="card">Tarjeta</option>
                </select>
              </div>
              {bankAccounts.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cuenta Bancaria (opcional)</label>
                  <select value={form.bankAccountId} onChange={e => setForm(f => ({ ...f, bankAccountId: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— Sin cuenta asociada —</option>
                    {bankAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.bankName} {acc.accountNumber} ({acc.currency})</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">Seleccionar afectará el balance de la cuenta.</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Referencia (opcional)</label>
                <input type="text" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="Número de referencia" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas (opcional)</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)} disabled={isSubmitting}>Cancelar</Button>
              <Button className={`flex-1 ${form.type === 'income' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`} onClick={handleCreate} disabled={isSubmitting || !form.description || !form.amount}>
                {isSubmitting ? 'Guardando...' : `Registrar ${form.type === 'income' ? 'Ingreso' : 'Gasto'}`}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default IncomePage

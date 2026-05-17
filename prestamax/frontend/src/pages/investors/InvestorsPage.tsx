import React, { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { PageLoadingState } from '@/components/ui/Loading'
import EmptyState from '@/components/ui/EmptyState'
import { Users, Plus, X, Edit2, Trash2, FileText, DollarSign, Eye } from 'lucide-react'
import api, { isAccessDenied } from '@/lib/api'
import toast from 'react-hot-toast'
import { usePermission } from '@/hooks/usePermission'
import { formatCurrency } from '@/lib/utils'

interface Investor {
  id: string
  fullName: string
  email: string | null
  phone: string | null
  idNumber: string | null
  modelType: 'fixed_rate' | 'equity'
  fixedRateMonthly: number
  equityPercentInterest: number
  commissionPercent: number
  capitalContributed: number
  notes: string | null
  isActive: number
  loanCount?: number
  activeCapital?: number
}

const EMPTY_FORM = {
  fullName: '',
  email: '',
  phone: '',
  idNumber: '',
  modelType: 'fixed_rate' as 'fixed_rate' | 'equity',
  fixedRateMonthly: '',
  equityPercentInterest: '',
  commissionPercent: '',
  capitalContributed: '',
  notes: '',
}

const InvestorsPage: React.FC = () => {
  const { can } = usePermission()
  const navigate = useNavigate()
  const [investors, setInvestors] = useState<Investor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Investor | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [isSaving, setIsSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const canCreate = can('investors.create')
  const canEdit   = can('investors.edit')
  const canDelete = can('investors.delete')

  // Permission guard: redirige si el plan/usuario no tiene investors.view
  if (!can('investors.view')) return <Navigate to="/dashboard" replace />

  const load = async () => {
    setIsLoading(true)
    try {
      const res = await api.get('/investors')
      setInvestors(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      if (!isAccessDenied(err)) toast.error('Error al cargar inversionistas')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const openEdit = (inv: Investor) => {
    setEditing(inv)
    setForm({
      fullName: inv.fullName || '',
      email: inv.email || '',
      phone: inv.phone || '',
      idNumber: inv.idNumber || '',
      modelType: inv.modelType,
      fixedRateMonthly: String(inv.fixedRateMonthly || ''),
      equityPercentInterest: String(inv.equityPercentInterest || ''),
      commissionPercent: String(inv.commissionPercent || ''),
      capitalContributed: String(inv.capitalContributed || ''),
      notes: inv.notes || '',
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.fullName.trim()) return toast.error('Nombre completo es requerido')
    setIsSaving(true)
    try {
      const payload = {
        fullName: form.fullName.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        idNumber: form.idNumber.trim() || null,
        modelType: form.modelType,
        fixedRateMonthly: parseFloat(form.fixedRateMonthly) || 0,
        equityPercentInterest: parseFloat(form.equityPercentInterest) || 0,
        commissionPercent: parseFloat(form.commissionPercent) || 0,
        capitalContributed: parseFloat(form.capitalContributed) || 0,
        notes: form.notes.trim() || null,
      }
      if (editing) {
        await api.put(`/investors/${editing.id}`, payload)
        toast.success('Inversionista actualizado')
      } else {
        await api.post('/investors', payload)
        toast.success('Inversionista creado')
      }
      setShowForm(false)
      setEditing(null)
      load()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al guardar')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (inv: Investor) => {
    if (!confirm(`¿Desactivar al inversionista "${inv.fullName}"? Los préstamos asignados a él se mantendrán intactos.`)) return
    try {
      await api.delete(`/investors/${inv.id}`)
      toast.success('Inversionista desactivado')
      load()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al desactivar')
    }
  }

  const filtered = investors.filter(i => {
    if (!searchTerm) return true
    const q = searchTerm.toLowerCase()
    return (
      (i.fullName || '').toLowerCase().includes(q) ||
      (i.email || '').toLowerCase().includes(q) ||
      (i.phone || '').includes(q) ||
      (i.idNumber || '').includes(q)
    )
  })

  const totalCapital = investors.reduce((s, i) => s + (i.activeCapital || 0), 0)
  const activeCount = investors.filter(i => i.isActive).length

  if (isLoading) return <PageLoadingState />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Users className="w-6 h-6" /> Inversionistas
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Gestiona los inversionistas que aportan capital al pool de préstamos.
          </p>
        </div>
        {canCreate && (
          <Button onClick={openCreate} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />Nuevo Inversionista
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 text-center bg-blue-50">
          <p className="text-xs text-slate-500 uppercase font-medium">Inversionistas activos</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{activeCount}</p>
        </Card>
        <Card className="p-4 text-center bg-emerald-50">
          <p className="text-xs text-slate-500 uppercase font-medium">Capital colocado</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{formatCurrency(totalCapital)}</p>
        </Card>
        <Card className="p-4 text-center bg-slate-50">
          <p className="text-xs text-slate-500 uppercase font-medium">Total registrados</p>
          <p className="text-2xl font-bold text-slate-700 mt-1">{investors.length}</p>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <Input
          type="text"
          placeholder="Buscar por nombre, email, teléfono o cédula..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </Card>

      {/* List */}
      {filtered.length > 0 ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Nombre</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Modelo</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">% / Tasa</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Comisión</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Préstamos</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Capital activo</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Estado</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => (
                  <tr key={inv.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-semibold text-slate-800">{inv.fullName}</p>
                        {inv.email && <p className="text-xs text-slate-500">{inv.email}</p>}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${inv.modelType === 'fixed_rate' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                        {inv.modelType === 'fixed_rate' ? 'Tasa Fija' : 'Participación'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-700">
                      {inv.modelType === 'fixed_rate'
                        ? `${inv.fixedRateMonthly}% mens.`
                        : `${inv.equityPercentInterest}% del interés`}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-700">{inv.commissionPercent}%</td>
                    <td className="py-3 px-4 text-right text-slate-700">{inv.loanCount || 0}</td>
                    <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                      {formatCurrency(inv.activeCapital || 0)}
                    </td>
                    <td className="py-3 px-4">
                      {inv.isActive ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Activo</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 font-medium">Inactivo</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => navigate(`/investors/${inv.id}`)}
                          className="p-1.5 hover:bg-blue-50 rounded text-blue-600"
                          title="Ver detalle"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => openEdit(inv)}
                            className="p-1.5 hover:bg-slate-100 rounded text-slate-600"
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        {canDelete && inv.isActive === 1 && (
                          <button
                            onClick={() => handleDelete(inv)}
                            className="p-1.5 hover:bg-red-50 rounded text-red-500"
                            title="Desactivar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={Users}
          title="Sin inversionistas"
          description={searchTerm ? 'No hay resultados para tu búsqueda.' : 'Registra el primer inversionista para empezar a vincular préstamos.'}
          action={canCreate ? { label: 'Nuevo Inversionista', onClick: openCreate } : undefined}
        />
      )}

      {/* Modal de Create/Edit */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-2 sm:p-4 overflow-y-auto">
          <Card className="w-full max-w-lg my-2 sm:my-4 max-h-[95vh] sm:max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">{editing ? 'Editar Inversionista' : 'Nuevo Inversionista'}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <Input label="Nombre completo *" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                <Input label="Teléfono" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <Input label="Cédula / Identificación" value={form.idNumber} onChange={e => setForm(f => ({ ...f, idNumber: e.target.value }))} />

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Modelo de rendimiento *</label>
                <select
                  value={form.modelType}
                  onChange={e => setForm(f => ({ ...f, modelType: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="fixed_rate">Tasa Fija (interés garantizado mensual)</option>
                  <option value="equity">Participación (% del interés cobrado)</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {form.modelType === 'fixed_rate'
                    ? 'El inversionista recibe un % mensual fijo sobre su capital aportado.'
                    : 'El inversionista recibe un % de los intereses cobrados de los préstamos vinculados.'}
                </p>
              </div>

              {form.modelType === 'fixed_rate' ? (
                <Input
                  label="Tasa mensual fija (%) *"
                  type="number"
                  step="0.01"
                  value={form.fixedRateMonthly}
                  onChange={e => setForm(f => ({ ...f, fixedRateMonthly: e.target.value }))}
                  placeholder="Ej: 3 = 3% mensual"
                />
              ) : (
                <Input
                  label="% del interés que recibe (%) *"
                  type="number"
                  step="0.01"
                  value={form.equityPercentInterest}
                  onChange={e => setForm(f => ({ ...f, equityPercentInterest: e.target.value }))}
                  placeholder="Ej: 70 = 70% del interés cobrado"
                />
              )}

              <Input
                label="Comisión por administración (%)"
                type="number"
                step="0.01"
                value={form.commissionPercent}
                onChange={e => setForm(f => ({ ...f, commissionPercent: e.target.value }))}
                placeholder="Ej: 10 = 10% que retiene el prestamista"
              />

              <Input
                label="Capital aportado"
                type="number"
                step="0.01"
                value={form.capitalContributed}
                onChange={e => setForm(f => ({ ...f, capitalContributed: e.target.value }))}
                placeholder="Monto total del aporte del inversionista"
              />

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas internas</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Cualquier información adicional sobre el inversionista..."
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)} disabled={isSaving}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Guardando...' : (editing ? 'Actualizar' : 'Crear')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default InvestorsPage

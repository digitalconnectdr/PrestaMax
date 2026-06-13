import React, { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { PageLoadingState } from '@/components/ui/Loading'
import EmptyState from '@/components/ui/EmptyState'
import { Users, Plus, X, Edit2, Trash2, Eye } from 'lucide-react'
import api, { isAccessDenied, isSubscriptionExpired } from '@/lib/api'
import toast from 'react-hot-toast'
import { usePermission } from '@/hooks/usePermission'
import { useConfirm } from '@/hooks/useConfirm'
import { formatCurrency } from '@/lib/utils'
import { useT } from '@/lib/i18n'

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
  const t = useT()
  const { can } = usePermission()
  const { confirm, ConfirmHost } = useConfirm()
  const navigate = useNavigate()
  const [investors, setInvestors] = useState<Investor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Investor | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [isSaving, setIsSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const canView   = can('investors.view')
  const canCreate = can('investors.create')
  const canEdit   = can('investors.edit')
  const canDelete = can('investors.delete')

  const load = async () => {
    setIsLoading(true)
    try {
      const res = await api.get('/investors')
      setInvestors(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      if (!isAccessDenied(err) && !isSubscriptionExpired(err)) toast.error(t('inv.load_error'))
    } finally {
      setIsLoading(false)
    }
  }

  // IMPORTANTE: los hooks deben declararse SIEMPRE antes de cualquier `return` condicional
  useEffect(() => {
    if (canView) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView])

  // Permission guard: redirige si el plan/usuario no tiene investors.view
  if (!canView) return <Navigate to="/dashboard" replace />

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
    if (!form.fullName.trim()) return toast.error(t('inv.name_required'))
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
        toast.success(t('inv.updated'))
      } else {
        await api.post('/investors', payload)
        toast.success(t('inv.created'))
      }
      setShowForm(false)
      setEditing(null)
      load()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('inv.save_error'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (inv: Investor) => {
    const ok = await confirm({
      title: t('inv.delete_title').replace('{name}', inv.fullName),
      message: t('inv.delete_msg'),
      confirmText: t('common.delete'),
      variant: 'danger',
    })
    if (!ok) return
    try {
      const res = await api.delete(`/investors/${inv.id}`)
      const hard = res?.data?.hardDeleted ?? (res?.data as any)?.hard_deleted
      toast.success(hard ? t('inv.deleted') : t('inv.deactivated'))
      load()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('inv.delete_error'))
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
      <ConfirmHost />
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Users className="w-6 h-6" /> {t('inv.title')}
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            {t('inv.subtitle')}
          </p>
        </div>
        {canCreate && (
          <Button onClick={openCreate} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />{t('inv.new')}
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 text-center bg-blue-50">
          <p className="text-xs text-slate-500 uppercase font-medium">{t('inv.active_count')}</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{activeCount}</p>
        </Card>
        <Card className="p-4 text-center bg-emerald-50">
          <p className="text-xs text-slate-500 uppercase font-medium">{t('inv.placed_capital')}</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{formatCurrency(totalCapital)}</p>
        </Card>
        <Card className="p-4 text-center bg-slate-50">
          <p className="text-xs text-slate-500 uppercase font-medium">{t('inv.total_registered')}</p>
          <p className="text-2xl font-bold text-slate-700 mt-1">{investors.length}</p>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <Input
          type="text"
          placeholder={t('inv.search_ph')}
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </Card>

      {/* List */}
      {filtered.length > 0 ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('inv.h_name')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('inv.h_model')}</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('inv.h_rate')}</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('inv.h_commission')}</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('inv.h_loans')}</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('inv.h_active_capital')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('inv.h_status')}</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('inv.h_actions')}</th>
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
                        {inv.modelType === 'fixed_rate' ? t('inv.fixed_rate') : t('inv.equity')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-700">
                      {inv.modelType === 'fixed_rate'
                        ? t('inv.rate_monthly').replace('{n}', String(inv.fixedRateMonthly))
                        : t('inv.pct_interest').replace('{n}', String(inv.equityPercentInterest))}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-700">{inv.commissionPercent}%</td>
                    <td className="py-3 px-4 text-right text-slate-700">{inv.loanCount || 0}</td>
                    <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                      {formatCurrency(inv.activeCapital || 0)}
                    </td>
                    <td className="py-3 px-4">
                      {inv.isActive ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">{t('inv.active')}</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 font-medium">{t('inv.inactive')}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => navigate(`/investors/${inv.id}`)}
                          className="p-1.5 hover:bg-blue-50 rounded text-blue-600"
                          title={t('inv.view_detail')}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => openEdit(inv)}
                            className="p-1.5 hover:bg-slate-100 rounded text-slate-600"
                            title={t('inv.edit')}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        {canDelete && inv.isActive === 1 && (
                          <button
                            onClick={() => handleDelete(inv)}
                            className="p-1.5 hover:bg-red-50 rounded text-red-500"
                            title={t('inv.deactivate')}
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
          title={t('inv.empty_title')}
          description={searchTerm ? t('inv.empty_search') : t('inv.empty_desc')}
          action={canCreate ? { label: t('inv.new'), onClick: openCreate } : undefined}
        />
      )}

      {/* Modal de Create/Edit */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-2 sm:p-4 overflow-y-auto">
          <Card className="w-full max-w-lg my-2 sm:my-4 max-h-[95vh] sm:max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">{editing ? t('inv.form_edit') : t('inv.form_new')}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <Input label={t('inv.f_fullname')} value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <Input label={t('inv.f_email')} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                <Input label={t('inv.f_phone')} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <Input label={t('inv.f_id')} value={form.idNumber} onChange={e => setForm(f => ({ ...f, idNumber: e.target.value }))} />

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('inv.f_model')}</label>
                <select
                  value={form.modelType}
                  onChange={e => setForm(f => ({ ...f, modelType: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="fixed_rate">{t('inv.opt_fixed')}</option>
                  <option value="equity">{t('inv.opt_equity')}</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {form.modelType === 'fixed_rate'
                    ? t('inv.help_fixed')
                    : t('inv.help_equity')}
                </p>
              </div>

              {form.modelType === 'fixed_rate' ? (
                <Input
                  label={t('inv.f_fixed_rate')}
                  type="number"
                  step="0.01"
                  value={form.fixedRateMonthly}
                  onChange={e => setForm(f => ({ ...f, fixedRateMonthly: e.target.value }))}
                  placeholder={t('inv.ph_fixed_rate')}
                />
              ) : (
                <Input
                  label={t('inv.f_equity_pct')}
                  type="number"
                  step="0.01"
                  value={form.equityPercentInterest}
                  onChange={e => setForm(f => ({ ...f, equityPercentInterest: e.target.value }))}
                  placeholder={t('inv.ph_equity_pct')}
                />
              )}

              <Input
                label={t('inv.f_commission')}
                type="number"
                step="0.01"
                value={form.commissionPercent}
                onChange={e => setForm(f => ({ ...f, commissionPercent: e.target.value }))}
                placeholder={t('inv.ph_commission')}
              />

              <Input
                label={t('inv.f_capital')}
                type="number"
                step="0.01"
                value={form.capitalContributed}
                onChange={e => setForm(f => ({ ...f, capitalContributed: e.target.value }))}
                placeholder={t('inv.ph_capital')}
              />

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('inv.f_notes')}</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t('inv.ph_notes')}
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)} disabled={isSaving}>
                {t('common.cancel')}
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={isSaving}>
                {isSaving ? t('inv.saving') : (editing ? t('inv.update') : t('inv.create'))}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default InvestorsPage

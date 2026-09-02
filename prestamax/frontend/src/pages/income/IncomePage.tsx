import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePermission } from '@/hooks/usePermission'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { PageLoadingState } from '@/components/ui/Loading'
import EmptyState from '@/components/ui/EmptyState'
import { TrendingUp, TrendingDown, Plus, X, Trash2, BarChart3, Briefcase, ExternalLink } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import api, { isAccessDenied, isSubscriptionExpired } from '@/lib/api'
import toast from 'react-hot-toast'
import { useT, t as tg } from '@/lib/i18n'

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
  investorPayoutId?: string | null
  investorId?: string | null
  investorName?: string | null
  payoutPeriodFrom?: string | null
  payoutPeriodTo?: string | null
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

const CATEGORY_LABEL_KEYS: Record<string, string> = {
  ventas: 'inc.cat_ventas', comisiones: 'inc.cat_comisiones', recuperaciones: 'inc.cat_recuperaciones', intereses: 'inc.cat_intereses',
  nomina: 'inc.cat_nomina', alquiler: 'inc.cat_alquiler', servicios: 'inc.cat_servicios', marketing: 'inc.cat_marketing',
  operaciones: 'inc.cat_operaciones', impuestos: 'inc.cat_impuestos', suministros: 'inc.cat_suministros',
  delivery: 'inc.cat_delivery', otros: 'inc.cat_otros',
  investor_payout: 'inc.cat_investor_payout',
}
const categoryLabel = (cat: string): string => CATEGORY_LABEL_KEYS[cat] ? tg(CATEGORY_LABEL_KEYS[cat]) : cat

const IncomePage: React.FC = () => {
  const t = useT()
  const { can } = usePermission()
  const navigate = useNavigate()
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
      if (!isAccessDenied(err) && !isSubscriptionExpired(err)) toast.error(t('inc.load_error'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchEntries() }, [typeFilter, fromDate, toDate])

  const handleCreate = async () => {
    if (!form.description || !form.amount) {
      toast.error(t('inc.desc_amount_required'))
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
      toast.success(form.type === 'income' ? t('inc.income_registered') : t('inc.expense_registered'))
      setShowModal(false)
      setForm(emptyForm)
      fetchEntries()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('inc.register_error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('inc.delete_confirm'))) return
    try {
      await api.delete(`/income/${id}`)
      toast.success(t('inc.deleted'))
      fetchEntries()
    } catch (err: any) {
      toast.error(t('inc.delete_error'))
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
          <h1 className="page-title">{t('nav.income')}</h1>
          <p className="text-slate-600 text-sm mt-1">{t('inc.subtitle')}</p>
        </div>
        {can('income.create') && (
          <Button onClick={() => setShowModal(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />{t('inc.new_entry')}
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-emerald-50 border-emerald-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg"><TrendingUp className="w-5 h-5 text-emerald-600"/></div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-medium">{t('inc.total_income')}</p>
              <p className="text-xl font-bold text-emerald-700">{formatCurrency(summary.totalIncome)}</p>
            </div>
          </div>
        </Card>
        <Card className="bg-red-50 border-red-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg"><TrendingDown className="w-5 h-5 text-red-600"/></div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-medium">{t('inc.total_expenses')}</p>
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
              <p className="text-xs text-slate-500 uppercase font-medium">{t('inc.net_balance')}</p>
              <p className={`text-xl font-bold ${netBalance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>{formatCurrency(netBalance)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input type="text" placeholder={t('inc.search_ph')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">{t('nav.income')}</option>
            <option value="income">{t('inc.filter_income_only')}</option>
            <option value="expense">{t('inc.filter_expense_only')}</option>
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
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('inc.col_date')}</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">{t('inc.col_type')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('inc.col_category')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('inc.col_description')}</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('inc.col_amount')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('inc.col_registered_by')}</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">{t('inc.col_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(entry => (
                  <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-slate-600">{formatDate(entry.transactionDate)}</td>
                    <td className="py-3 px-4 text-center">
                      {entry.type === 'income' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                          <TrendingUp className="w-3 h-3"/>{t('inc.type_income')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          <TrendingDown className="w-3 h-3"/>{t('inc.type_expense')}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {entry.category === 'investor_payout' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 bg-purple-100 border border-purple-200 rounded-full px-2 py-0.5">
                          <Briefcase className="w-3 h-3" />{t('inc.investor_payout_badge')}
                        </span>
                      ) : (
                        categoryLabel(entry.category)
                      )}
                    </td>
                    <td className="py-3 px-4 font-medium">
                      <div>{entry.description}</div>
                      {entry.investorId && (
                        <button
                          onClick={() => navigate(`/investors/${entry.investorId}`)}
                          className="mt-0.5 inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 hover:underline"
                          title={t('inc.view_investor_tooltip')}
                        >
                          <ExternalLink className="w-3 h-3" />
                          {t('inc.view_investor')}{entry.investorName ? `: ${entry.investorName}` : ''}
                        </button>
                      )}
                    </td>
                    <td className={`py-3 px-4 text-right font-semibold ${entry.type === 'income' ? 'text-emerald-700' : 'text-red-700'}`}>
                      {entry.type === 'income' ? '+' : '-'}{formatCurrency(entry.amount)}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500">{entry.registeredByName || '—'}</td>
                    <td className="py-3 px-4 text-center">
                      {can('income.delete') && (
                        <button onClick={() => handleDelete(entry.id)} className="p-1.5 hover:bg-red-50 rounded text-red-500 transition-colors" title={t('common.delete')}>
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
        <EmptyState icon={BarChart3} title={t('inc.empty_title')} description={t('inc.empty_desc')} action={can('income.create') ? {label:t('inc.new_entry'),onClick:()=>setShowModal(true)} : undefined} />
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="section-title">{t('inc.new_entry')}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5"/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('inc.field_type')}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setForm(f => ({ ...f, type: 'income', category: 'otros' }))}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors ${form.type === 'income' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                    <TrendingUp className="w-4 h-4 inline mr-1"/>{t('inc.type_income')}
                  </button>
                  <button onClick={() => setForm(f => ({ ...f, type: 'expense', category: 'otros' }))}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors ${form.type === 'expense' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                    <TrendingDown className="w-4 h-4 inline mr-1"/>{t('inc.type_expense')}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('inc.col_category')}</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {(form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => (
                    <option key={c} value={c}>{categoryLabel(c)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('inc.field_description')}</label>
                <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t('inc.desc_placeholder')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('inc.field_amount')}</label>
                <input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('inc.col_date')}</label>
                <input type="date" value={form.transactionDate} onChange={e => setForm(f => ({ ...f, transactionDate: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('inc.field_payment_method')}</label>
                <select value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="cash">{t('method.cash')}</option>
                  <option value="transfer">{t('method.transfer')}</option>
                  <option value="check">{t('method.check')}</option>
                  <option value="card">{t('method.card')}</option>
                </select>
              </div>
              {bankAccounts.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('inc.field_bank_account')}</label>
                  <select value={form.bankAccountId} onChange={e => setForm(f => ({ ...f, bankAccountId: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">{t('inc.no_bank_account')}</option>
                    {bankAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.bankName} {acc.accountNumber} ({acc.currency})</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">{t('inc.bank_account_hint')}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('inc.field_reference')}</label>
                <input type="text" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder={t('inc.ref_placeholder')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('inc.field_notes')}</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)} disabled={isSubmitting}>{t('common.cancel')}</Button>
              <Button className={`flex-1 ${form.type === 'income' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`} onClick={handleCreate} disabled={isSubmitting || !form.description || !form.amount}>
                {isSubmitting ? t('common.saving') : t('inc.register_btn').replace('{type}', form.type === 'income' ? t('inc.type_income') : t('inc.type_expense'))}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default IncomePage

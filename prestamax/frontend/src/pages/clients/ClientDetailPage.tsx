import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { usePermission } from '@/hooks/usePermission'
import { useConfirm } from '@/hooks/useConfirm'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { PageLoadingState } from '@/components/ui/Loading'
import LoanStatusBadge from '@/components/shared/LoanStatusBadge'
import { ArrowLeft, Mail, Phone, MapPin, Calendar, User, Briefcase, Edit2, Plus, Lock, Users2, Shield, Info, TrendingUp, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import { formatDate, formatCurrency, getScoreLabel, getScoreColor, getScoreBarColor, getScoreBgColor } from '@/lib/utils'
import api, { isAccessDenied, isSubscriptionExpired } from '@/lib/api'
import toast from 'react-hot-toast'
import { useT } from '@/lib/i18n'

interface Client {
  id: string
  fullName: string
  firstName: string
  lastName: string
  clientNumber: string
  email: string | null
  phonePersonal: string | null
  phoneWork: string | null
  phoneFamily: string | null
  whatsapp: string | null
  whatsappSilenced?: number | boolean
  idType: string
  idNumber: string
  birthDate: string | null
  gender: string | null
  maritalStatus: string | null
  address: string | null
  city: string | null
  province: string | null
  occupation: string | null
  employer: string | null
  workAddress?: string | null
  monthlyIncome: number | null
  notes: string | null
  score: number | null
  scoreUpdatedAt: string | null
  isActive: number
  loans?: any[]
  references?: any[]
  guarantors?: any[]
}

interface Loan {
  id: string
  loanNumber: string
  status: string
  disbursedAmount: number
  approvedAmount: number
  totalBalance: number
  moraBalance: number
  daysOverdue: number
  productName: string
  maturityDate: string | null
}

// Score factors shown in the explanation panel
const SCORE_FACTORS = [
  {
    icon: CheckCircle2,
    labelKey: 'cd.sf_punctuality',
    weight: 40,
    descKey: 'cd.sf_punctuality_d',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  {
    icon: TrendingUp,
    labelKey: 'cd.sf_liquidated',
    weight: 30,
    descKey: 'cd.sf_liquidated_d',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    icon: Clock,
    labelKey: 'cd.sf_tenure',
    weight: 20,
    descKey: 'cd.sf_tenure_d',
    color: 'text-violet-600',
    bg: 'bg-violet-50',
  },
  {
    icon: AlertTriangle,
    labelKey: 'cd.sf_nomora',
    weight: 10,
    descKey: 'cd.sf_nomora_d',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
  },
]

const EMPTY_REF  = { type: 'personal', fullName: '', phone: '', relationship: '', employer: '' }

const EMPTY_GUAR = { fullName: '', idNumber: '', phone: '', address: '' }

const ClientDetailPage: React.FC = () => {
  const t = useT()
  const { id } = useParams()
  const { confirm, ConfirmHost } = useConfirm()
  const genderLabel = (g?: string | null) => g === 'male' ? t('cf.g_male') : g === 'female' ? t('cf.g_female') : g === 'other' ? t('cf.g_other') : (g || '')
  const maritalLabel = (m?: string | null) => m === 'single' ? t('cf.m_single') : m === 'married' ? t('cf.m_married') : m === 'divorced' ? t('cf.m_divorced') : m === 'widowed' ? t('cf.m_widowed') : m === 'common_law' ? t('cf.m_common_law') : (m || '')
  const navigate = useNavigate()
  const { can } = usePermission()
  const [client, setClient] = useState<Client | null>(null)
  const [loans, setLoans] = useState<Loan[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'info' | 'loans' | 'contacts'>('info')

  // References & Guarantors forms
  const [showRefForm, setShowRefForm]   = useState(false)
  const [showGuarForm, setShowGuarForm] = useState(false)
  const [refForm,  setRefForm]  = useState({ ...EMPTY_REF })
  const [guarForm, setGuarForm] = useState({ ...EMPTY_GUAR })
  const [isSavingRef,  setIsSavingRef]  = useState(false)
  const [isSavingGuar, setIsSavingGuar] = useState(false)

  const reloadClient = async () => {
    if (!id) return
    const res = await api.get(`/clients/${id}`)
    setClient(res.data)
    if (res.data.loans) setLoans(res.data.loans)
  }

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return
      try {
        const res = await api.get(`/clients/${id}`)
        const clientData = res.data
        setClient(clientData)
        if (clientData.loans && Array.isArray(clientData.loans)) {
          setLoans(clientData.loans)
        }
      } catch (err: any) {
        const status = err?.response?.status
        if (status === 404) {
          toast.error(t('cd.not_found'))
        } else {
          toast.error(t('cd.load_error'))
        }
        navigate('/clients')
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [id])

  const handleAddReference = async () => {
    if (!refForm.fullName.trim()) return toast.error(t('cd.ref_name_req'))
    setIsSavingRef(true)
    try {
      await api.post(`/clients/${id}/references`, {
        type: refForm.type, fullName: refForm.fullName.trim(),
        phone: refForm.phone.trim() || null,
        relationship: refForm.relationship.trim() || null,
        employer: refForm.employer.trim() || null,
      })
      toast.success(t('cd.ref_added'))
      setRefForm({ ...EMPTY_REF })
      setShowRefForm(false)
      await reloadClient()
    } catch { toast.error(t('cd.ref_error')) }
    finally { setIsSavingRef(false) }
  }

  const handleAddGuarantor = async () => {
    if (!guarForm.fullName.trim()) return toast.error(t('cd.guar_name_req'))
    setIsSavingGuar(true)
    try {
      await api.post(`/clients/${id}/guarantors`, {
        fullName: guarForm.fullName.trim(),
        idNumber: guarForm.idNumber.trim() || null,
        phone: guarForm.phone.trim() || null,
        address: guarForm.address.trim() || null,
      })
      toast.success(t('cd.guar_added'))
      setGuarForm({ ...EMPTY_GUAR })
      setShowGuarForm(false)
      await reloadClient()
    } catch { toast.error(t('cd.guar_error')) }
    finally { setIsSavingGuar(false) }
  }

  const handleBlock = async () => {
    if (!client) return
    const ok_ = await confirm({
      title: t('cd.block_title').replace('{name}', client.fullName),
      message: t('cd.block_msg'),
      confirmText: t('cd.deactivate'),
      variant: 'danger',
    })
    if (!ok_) return
    try {
      await api.delete(`/clients/${client.id}`)
      toast.success(t('cd.deactivated'))
      reloadClient()
    } catch {
      toast.error(t('cd.deactivate_error'))
    }
  }

  const handleReactivate = async () => {
    if (!client) return
    const ok_ = await confirm({
      title: t('cd.reactivate_title').replace('{name}', client.fullName),
      message: t('cd.reactivate_msg'),
      confirmText: t('cd.reactivate'),
      variant: 'success',
    })
    if (!ok_) return
    try {
      await api.post(`/clients/${client.id}/reactivate`)
      toast.success(t('cd.reactivated'))
      reloadClient()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('cd.reactivate_error'))
    }
  }

  if (isLoading) return <PageLoadingState />
  if (!client) return null

  const activeLoans = loans.filter(l => ['active', 'in_mora', 'disbursed', 'overdue'].includes(l.status))
  const completedLoans = loans.filter(l => l.status === 'liquidated')
  const score = client.score ?? 50

  return (
    <div className="space-y-6">
      <ConfirmHost />
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/clients')} className="p-2 hover:bg-slate-100 rounded-lg transition-colors mt-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg">
              {(client.firstName?.[0] || client.fullName?.[0] || '?').toUpperCase()}
            </div>
            <div>
              <h1 className="page-title">{client.fullName || `${client.firstName} ${client.lastName}`}</h1>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-slate-500 text-sm font-mono">{client.clientNumber}</span>
                {!client.isActive && (
                  <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">{t('cd.inactive')}</span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {can('clients.edit') && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/clients/${client.id}/edit`)} className="flex items-center gap-1">
              <Edit2 className="w-3.5 h-3.5"/>{t('cd.edit')}
            </Button>
          )}
          {can('loans.create') && (
            <Button size="sm" onClick={() => navigate(`/loans/new?client_id=${client.id}`)} className="flex items-center gap-1 bg-green-600 hover:bg-green-700">
              <Plus className="w-3.5 h-3.5"/>{t('cd.new_loan')}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-1">
          {[
            { id: 'info', label: t('cd.tab_info') },
            { id: 'loans', label: t('cd.tab_loans').replace('{n}', String(loans.length)) },
            { id: 'contacts', label: t('cd.tab_contacts') },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${activeTab === tab.id ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB: INFO ── */}
      {activeTab === 'info' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Personal Data */}
            <Card>
              <h3 className="section-title mb-4 flex items-center gap-2"><User className="w-4 h-4"/>{t('cd.personal')}</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500 font-semibold uppercase">{t('cd.full_name')}</p>
                  <p className="text-slate-900 font-medium mt-1">{client.fullName}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-semibold uppercase">{t('cd.id')}</p>
                  <p className="text-slate-900 font-medium mt-1 font-mono">{client.idNumber || '—'}</p>
                </div>
                {client.birthDate && (
                  <div>
                    <p className="text-xs text-slate-500 font-semibold uppercase">{t('cd.birth_date')}</p>
                    <p className="text-slate-900 font-medium mt-1 flex items-center gap-1"><Calendar className="w-3.5 h-3.5"/>{formatDate(client.birthDate)}</p>
                  </div>
                )}
                {client.gender && (
                  <div>
                    <p className="text-xs text-slate-500 font-semibold uppercase">{t('cd.gender')}</p>
                    <p className="text-slate-900 font-medium mt-1">{genderLabel(client.gender)}</p>
                  </div>
                )}
                {client.maritalStatus && (
                  <div>
                    <p className="text-xs text-slate-500 font-semibold uppercase">{t('cd.marital')}</p>
                    <p className="text-slate-900 font-medium mt-1">{maritalLabel(client.maritalStatus)}</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Contact */}
            <Card>
              <h3 className="section-title mb-4 flex items-center gap-2"><Phone className="w-4 h-4"/>{t('cd.contact')}</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {client.phonePersonal && (
                  <div>
                    <p className="text-xs text-slate-500 font-semibold uppercase">{t('cd.phone_personal')}</p>
                    <p className="text-slate-900 font-medium mt-1 flex items-center gap-1"><Phone className="w-3.5 h-3.5"/>{client.phonePersonal}</p>
                  </div>
                )}
                {client.whatsapp && (
                  <div>
                    <p className="text-xs text-slate-500 font-semibold uppercase">WhatsApp</p>
                    <p className="text-slate-900 font-medium mt-1">{client.whatsapp}</p>
                    <label className="mt-2 flex items-start gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!client.whatsappSilenced}
                        onChange={async (e) => {
                          const next = e.target.checked
                          try {
                            await api.put(`/clients/${client.id}/whatsapp-silenced`, { silenced: next })
                            setClient(prev => prev ? { ...prev, whatsappSilenced: next ? 1 : 0 } : prev)
                            toast.success(next ? t('cd.wa_silenced') : t('cd.wa_unsilenced'))
                          } catch { toast.error(t('cd.wa_update_error')) }
                        }}
                        className="mt-0.5"
                      />
                      <span className="text-slate-600">
                        {t('cd.wa_silence_label')}
                        <span className="block text-slate-400 text-[11px]">{t('cd.wa_silence_hint')}</span>
                      </span>
                    </label>
                  </div>
                )}
                {client.phoneWork && (
                  <div>
                    <p className="text-xs text-slate-500 font-semibold uppercase">{t('cd.phone_work')}</p>
                    <p className="text-slate-900 font-medium mt-1">{client.phoneWork}</p>
                  </div>
                )}
                {client.email && (
                  <div>
                    <p className="text-xs text-slate-500 font-semibold uppercase">{t('cd.email')}</p>
                    <p className="text-slate-900 font-medium mt-1 flex items-center gap-1"><Mail className="w-3.5 h-3.5"/>{client.email}</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Address */}
            {(client.address || client.city || client.province) && (
              <Card>
                <h3 className="section-title mb-4 flex items-center gap-2"><MapPin className="w-4 h-4"/>{t('cd.location')}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {client.address && (
                    <div className="col-span-2">
                      <p className="text-xs text-slate-500 font-semibold uppercase">{t('cd.address')}</p>
                      <p className="text-slate-900 font-medium mt-1">{client.address}</p>
                    </div>
                  )}
                  {client.city && <div><p className="text-xs text-slate-500 font-semibold uppercase">{t('cd.city')}</p><p className="text-slate-900 font-medium mt-1">{client.city}</p></div>}
                  {client.province && <div><p className="text-xs text-slate-500 font-semibold uppercase">{t('cd.province')}</p><p className="text-slate-900 font-medium mt-1">{client.province}</p></div>}
                </div>
              </Card>
            )}

            {/* Work */}
            {(client.occupation || client.employer || client.workAddress || client.monthlyIncome) && (
              <Card>
                <h3 className="section-title mb-4 flex items-center gap-2"><Briefcase className="w-4 h-4"/>{t('cd.work')}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {client.occupation && <div><p className="text-xs text-slate-500 font-semibold uppercase">{t('cd.occupation')}</p><p className="text-slate-900 font-medium mt-1">{client.occupation}</p></div>}
                  {client.employer && <div><p className="text-xs text-slate-500 font-semibold uppercase">{t('cd.employer')}</p><p className="text-slate-900 font-medium mt-1">{client.employer}</p></div>}
                  {client.workAddress && <div><p className="text-xs text-slate-500 font-semibold uppercase">{t('cd.work_address')}</p><p className="text-slate-900 font-medium mt-1">{client.workAddress}</p></div>}
                  {client.monthlyIncome != null && <div><p className="text-xs text-slate-500 font-semibold uppercase">{t('cd.monthly_income')}</p><p className="text-slate-900 font-medium mt-1 text-green-700">{formatCurrency(client.monthlyIncome)}</p></div>}
                </div>
              </Card>
            )}

            {client.notes && (
              <Card>
                <h3 className="section-title mb-2">{t('cd.notes')}</h3>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{client.notes}</p>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Score Crediticio */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="section-title">{t('cd.score_title')}</h3>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getScoreBgColor(score)} ${getScoreColor(score)}`}>
                  {getScoreLabel(score)}
                </span>
              </div>

              {/* Barra principal */}
              <div className="mb-5">
                <div className="flex items-end justify-between mb-1.5">
                  <span className={`text-4xl font-black ${getScoreColor(score)}`}>{score}</span>
                  <span className="text-sm text-slate-400 mb-1">{t('cd.of_100')}</span>
                </div>
                <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${getScoreBarColor(score)}`}
                    style={{ width: `${score}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-1 px-0.5">
                  <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
                </div>
              </div>

              {/* Rangos de referencia */}
              <div className="grid grid-cols-5 gap-0.5 mb-5 text-center text-[9px]">
                {[
                  { range: '0–29', label: t('cd.score_deficient'), bar: 'bg-red-400' },
                  { range: '30–49', label: t('cd.score_regular'), bar: 'bg-orange-400' },
                  { range: '50–69', label: t('cd.score_good'), bar: 'bg-yellow-400' },
                  { range: '70–84', label: t('cd.score_vgood'), bar: 'bg-green-400' },
                  { range: '85–100', label: t('cd.score_excellent'), bar: 'bg-emerald-500' },
                ].map(r => (
                  <div key={r.label} className="space-y-1">
                    <div className={`h-1.5 rounded-full ${r.bar}`} />
                    <div className="text-slate-500 leading-tight">{r.label}</div>
                    <div className="text-slate-400">{r.range}</div>
                  </div>
                ))}
              </div>

              {/* Factores del score */}
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <Info className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{t('cd.how_calc')}</span>
                </div>
                <div className="space-y-2.5">
                  {SCORE_FACTORS.map(f => (
                    <div key={f.labelKey} className={`flex items-start gap-2.5 p-2 rounded-lg ${f.bg}`}>
                      <f.icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${f.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-xs font-semibold ${f.color}`}>{t(f.labelKey)}</span>
                          <span className={`text-xs font-bold ${f.color} flex-shrink-0`}>{f.weight}%</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{t(f.descKey)}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
                  {t('cd.score_recalc')}
                  {client.scoreUpdatedAt && (
                    <> {t('cd.last_update')} <span className="font-medium">{formatDate(client.scoreUpdatedAt)}</span>.</>
                  )}
                </p>
              </div>
            </Card>

            {/* Summary */}
            <Card>
              <h3 className="section-title mb-4">{t('cd.summary')}</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">{t('cd.active_loans')}</span>
                  <span className="font-bold text-blue-700">{activeLoans.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">{t('cd.completed_loans')}</span>
                  <span className="font-bold text-emerald-700">{completedLoans.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">{t('cd.total_lent')}</span>
                  <span className="font-semibold">{formatCurrency(loans.reduce((s, l) => s + (l.disbursedAmount || l.approvedAmount || 0), 0))}</span>
                </div>
                <div className="flex justify-between border-t pt-3">
                  <span className="text-slate-600">{t('cd.pending_balance')}</span>
                  <span className="font-bold text-red-600">{formatCurrency(activeLoans.reduce((s, l) => s + (l.totalBalance || 0), 0))}</span>
                </div>
              </div>
            </Card>

            {/* Actions */}
            <Card>
              <h3 className="section-title mb-3">{t('cd.actions')}</h3>
              <div className="space-y-2">
                {can('loans.create') && (
                  <Button size="sm" className="w-full flex items-center gap-2 bg-green-600 hover:bg-green-700" onClick={() => navigate(`/loans/new?client_id=${client.id}`)}>
                    <Plus className="w-4 h-4"/>{t('cd.new_loan')}
                  </Button>
                )}
                {can('clients.edit') && (
                  <Button variant="outline" size="sm" className="w-full flex items-center gap-2" onClick={() => navigate(`/clients/${client.id}/edit`)}>
                    <Edit2 className="w-4 h-4"/>{t('cd.edit_data')}
                  </Button>
                )}
                {client.isActive ? (
                  can('clients.delete') && (
                    <button onClick={handleBlock} className="w-full text-sm px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-2 justify-center transition-colors">
                      <Lock className="w-4 h-4"/>{t('cd.deactivate_client')}
                    </button>
                  )
                ) : (
                  <div className="space-y-2">
                    <div className="text-center text-xs text-slate-500 py-1 bg-slate-50 rounded">
                      {t('cd.deactivated_note')}
                    </div>
                    {can('clients.edit') && (
                      <button onClick={handleReactivate} className="w-full text-sm px-3 py-2 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 flex items-center gap-2 justify-center transition-colors">
                        <Lock className="w-4 h-4"/>{t('cd.reactivate_client')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ── TAB: LOANS ── */}
      {activeTab === 'loans' && (
        <div className="space-y-4">
          {activeLoans.length > 0 && (
            <Card>
              <h3 className="section-title mb-4">{t('cd.active_loans_n').replace('{n}', String(activeLoans.length))}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3 font-semibold text-slate-700">{t('cd.h_number')}</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-700">{t('cd.h_product')}</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('cd.h_disbursed')}</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('cd.h_balance')}</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('cd.h_mora')}</th>
                    <th className="text-center py-2 px-3 font-semibold text-slate-700">{t('cd.h_status')}</th>
                  </tr></thead>
                  <tbody>{activeLoans.map(l => (
                    <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/loans/${l.id}`)}>
                      <td className="py-2 px-3 font-medium text-blue-700 font-mono">{l.loanNumber}</td>
                      <td className="py-2 px-3 text-slate-600 text-xs">{l.productName}</td>
                      <td className="py-2 px-3 text-right">{formatCurrency(l.disbursedAmount || l.approvedAmount || 0)}</td>
                      <td className="py-2 px-3 text-right font-bold">{formatCurrency(l.totalBalance || 0)}</td>
                      <td className={`py-2 px-3 text-right text-xs ${(l.moraBalance || 0) > 0 ? 'text-red-600 font-bold' : 'text-slate-400'}`}>{formatCurrency(l.moraBalance || 0)}</td>
                      <td className="py-2 px-3 text-center"><LoanStatusBadge status={l.status as any}/></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </Card>
          )}

          {completedLoans.length > 0 && (
            <Card>
              <h3 className="section-title mb-4">{t('cd.completed_loans_n').replace('{n}', String(completedLoans.length))}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3 font-semibold text-slate-700">{t('cd.h_number')}</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-700">{t('cd.h_product')}</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('cd.h_amount')}</th>
                    <th className="text-center py-2 px-3 font-semibold text-slate-700">{t('cd.h_status')}</th>
                  </tr></thead>
                  <tbody>{completedLoans.map(l => (
                    <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/loans/${l.id}`)}>
                      <td className="py-2 px-3 font-medium text-slate-600 font-mono">{l.loanNumber}</td>
                      <td className="py-2 px-3 text-slate-500 text-xs">{l.productName}</td>
                      <td className="py-2 px-3 text-right">{formatCurrency(l.disbursedAmount || l.approvedAmount || 0)}</td>
                      <td className="py-2 px-3 text-center"><LoanStatusBadge status={l.status as any}/></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </Card>
          )}

          {loans.length === 0 && (
            <Card className="text-center py-10">
              <DollarSign className="w-10 h-10 text-slate-300 mx-auto mb-3"/>
              <p className="text-slate-500">{t('cd.no_loans')}</p>
              {can('loans.create') && (
                <Button size="sm" className="mt-4 bg-green-600 hover:bg-green-700" onClick={() => navigate(`/loans/new?client_id=${client.id}`)}>
                  {t('cd.create_first_loan')}
                </Button>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ── TAB: CONTACTS ── */}
      {activeTab === 'contacts' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ── REFERENCIAS ── */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title flex items-center gap-2"><Users2 className="w-4 h-4"/>{t('cd.references')}</h3>
              {can('clients.edit') && (
                <button onClick={() => setShowRefForm(v => !v)}
                  className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 flex items-center gap-1 transition-colors">
                  <Plus className="w-3 h-3"/>{t('cd.add')}
                </button>
              )}
            </div>

            {showRefForm && (
              <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <p className="text-xs font-semibold text-slate-600 uppercase">{t('cd.new_ref')}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-500 mb-0.5 block">{t('cd.type')}</label>
                    <select value={refForm.type} onChange={e => setRefForm(p => ({...p, type: e.target.value}))}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500">
                      <option value="personal">{t('cd.r_personal')}</option>
                      <option value="commercial">{t('cd.r_commercial')}</option>
                      <option value="family">{t('cd.r_family')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-0.5 block">{t('cd.name_req')}</label>
                    <input value={refForm.fullName} onChange={e => setRefForm(p => ({...p, fullName: e.target.value}))}
                      placeholder={t('cd.fullname_ph')}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"/>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-0.5 block">{t('cd.phone')}</label>
                    <input value={refForm.phone} onChange={e => setRefForm(p => ({...p, phone: e.target.value}))}
                      placeholder="809-000-0000"
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"/>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-0.5 block">{t('cd.relationship')}</label>
                    <input value={refForm.relationship} onChange={e => setRefForm(p => ({...p, relationship: e.target.value}))}
                      placeholder={t('cd.rel_ph')}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"/>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-slate-500 mb-0.5 block">{t('cd.employer_opt')}</label>
                    <input value={refForm.employer} onChange={e => setRefForm(p => ({...p, employer: e.target.value}))}
                      placeholder={t('cd.employer_ph')}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"/>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={handleAddReference} disabled={isSavingRef}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {isSavingRef ? t('cd.saving') : t('cd.save_ref')}
                  </button>
                  <button onClick={() => { setShowRefForm(false); setRefForm({ ...EMPTY_REF }) }}
                    className="px-3 py-1.5 text-slate-500 text-xs rounded-md hover:bg-slate-100 transition-colors">{t('common.cancel')}</button>
                </div>
              </div>
            )}

            {(client.references || []).length > 0 ? (
              <div className="space-y-3">
                {(client.references || []).map((ref: any, i: number) => (
                  <div key={ref.id || i} className="p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-slate-800 text-sm">{ref.fullName}</p>
                        {ref.relationship && <p className="text-xs text-slate-500 mt-0.5">{ref.relationship}</p>}
                        {ref.phone && <p className="text-xs text-slate-600 mt-0.5">📞 {ref.phone}</p>}
                        {ref.employer && <p className="text-xs text-slate-400 mt-0.5">🏢 {ref.employer}</p>}
                      </div>
                      <span className="text-xs px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-500 capitalize">{ref.type || 'personal'}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">{t('cd.no_refs')}</p>
            )}
          </Card>

          {/* ── GARANTES ── */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title flex items-center gap-2"><Shield className="w-4 h-4"/>{t('cd.guarantors')}</h3>
              {can('clients.edit') && (
                <button onClick={() => setShowGuarForm(v => !v)}
                  className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 flex items-center gap-1 transition-colors">
                  <Plus className="w-3 h-3"/>{t('cd.add')}
                </button>
              )}
            </div>

            {showGuarForm && (
              <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <p className="text-xs font-semibold text-slate-600 uppercase">{t('cd.new_guar')}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="text-xs text-slate-500 mb-0.5 block">{t('cd.guar_fullname')}</label>
                    <input value={guarForm.fullName} onChange={e => setGuarForm(p => ({...p, fullName: e.target.value}))}
                      placeholder={t('cd.guar_fullname_ph')}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"/>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-0.5 block">{t('cd.guar_id')}</label>
                    <input value={guarForm.idNumber} onChange={e => setGuarForm(p => ({...p, idNumber: e.target.value}))}
                      placeholder="001-0000000-0"
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"/>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-0.5 block">{t('cd.phone')}</label>
                    <input value={guarForm.phone} onChange={e => setGuarForm(p => ({...p, phone: e.target.value}))}
                      placeholder="809-000-0000"
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"/>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-slate-500 mb-0.5 block">{t('cd.guar_address')}</label>
                    <input value={guarForm.address} onChange={e => setGuarForm(p => ({...p, address: e.target.value}))}
                      placeholder={t('cd.guar_address_ph')}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"/>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={handleAddGuarantor} disabled={isSavingGuar}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {isSavingGuar ? t('cd.saving') : t('cd.save_guar')}
                  </button>
                  <button onClick={() => { setShowGuarForm(false); setGuarForm({ ...EMPTY_GUAR }) }}
                    className="px-3 py-1.5 text-slate-500 text-xs rounded-md hover:bg-slate-100 transition-colors">{t('common.cancel')}</button>
                </div>
              </div>
            )}

            {(client.guarantors || []).length > 0 ? (
              <div className="space-y-3">
                {(client.guarantors || []).map((g: any, i: number) => (
                  <div key={g.id || i} className="p-3 bg-slate-50 rounded-lg">
                    <p className="font-medium text-slate-800 text-sm">{g.fullName}</p>
                    {g.idNumber && <p className="text-xs text-slate-600 font-mono mt-0.5">🪪 {g.idNumber}</p>}
                    {g.phone && <p className="text-xs text-slate-600 mt-0.5">📞 {g.phone}</p>}
                    {g.address && <p className="text-xs text-slate-400 mt-0.5">📍 {g.address}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">{t('cd.no_guars')}</p>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}

const DollarSign: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
  </svg>
)

export default ClientDetailPage

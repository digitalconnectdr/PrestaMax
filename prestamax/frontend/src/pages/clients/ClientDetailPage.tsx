import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { usePermission } from '@/hooks/usePermission'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { PageLoadingState } from '@/components/ui/Loading'
import LoanStatusBadge from '@/components/shared/LoanStatusBadge'
import { ArrowLeft, Mail, Phone, MapPin, Calendar, User, Briefcase, Edit2, Plus, Lock, Users2, Shield, Info, TrendingUp, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import { formatDate, formatCurrency, getScoreLabel, getScoreColor, getScoreBarColor, getScoreBgColor } from '@/lib/utils'
import api, { isAccessDenied } from '@/lib/api'
import toast from 'react-hot-toast'

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
    label: 'Puntualidad en pagos',
    weight: 40,
    description: 'Proporción de cuotas pagadas a tiempo, sin días de mora.',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  {
    icon: TrendingUp,
    label: 'Préstamos liquidados',
    weight: 30,
    description: 'Porcentaje de préstamos completados exitosamente sobre el total.',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    icon: Clock,
    label: 'Antigüedad como cliente',
    weight: 20,
    description: 'Tiempo de relación con la empresa (máximo 5 años para puntaje completo).',
    color: 'text-violet-600',
    bg: 'bg-violet-50',
  },
  {
    icon: AlertTriangle,
    label: 'Ausencia de mora activa',
    weight: 10,
    description: 'Penalización si existen cuotas actualmente en estado de mora.',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
  },
]

const EMPTY_REF  = { type: 'personal', fullName: '', phone: '', relationship: '', employer: '' }

// Mapeos para traducir valores en ingles a etiquetas en espanol
const GENDER_LABELS: Record<string, string> = { male: 'Masculino', female: 'Femenino', other: 'Otro' }
const MARITAL_LABELS: Record<string, string> = {
  single: 'Soltero', married: 'Casado', divorced: 'Divorciado',
  widowed: 'Viudo', common_law: 'Unión Libre',
}
const EMPTY_GUAR = { fullName: '', idNumber: '', phone: '', address: '' }

const ClientDetailPage: React.FC = () => {
  const { id } = useParams()
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
          toast.error('Cliente no encontrado')
        } else {
          toast.error('Error al cargar cliente')
        }
        navigate('/clients')
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [id])

  const handleAddReference = async () => {
    if (!refForm.fullName.trim()) return toast.error('El nombre es requerido')
    setIsSavingRef(true)
    try {
      await api.post(`/clients/${id}/references`, {
        type: refForm.type, fullName: refForm.fullName.trim(),
        phone: refForm.phone.trim() || null,
        relationship: refForm.relationship.trim() || null,
        employer: refForm.employer.trim() || null,
      })
      toast.success('Referencia agregada')
      setRefForm({ ...EMPTY_REF })
      setShowRefForm(false)
      await reloadClient()
    } catch { toast.error('Error al agregar referencia') }
    finally { setIsSavingRef(false) }
  }

  const handleAddGuarantor = async () => {
    if (!guarForm.fullName.trim()) return toast.error('El nombre del garante es requerido')
    setIsSavingGuar(true)
    try {
      await api.post(`/clients/${id}/guarantors`, {
        fullName: guarForm.fullName.trim(),
        idNumber: guarForm.idNumber.trim() || null,
        phone: guarForm.phone.trim() || null,
        address: guarForm.address.trim() || null,
      })
      toast.success('Garante agregado')
      setGuarForm({ ...EMPTY_GUAR })
      setShowGuarForm(false)
      await reloadClient()
    } catch { toast.error('Error al agregar garante') }
    finally { setIsSavingGuar(false) }
  }

  const handleBlock = async () => {
    if (!client) return
    if (!confirm(`¿Desactivar al cliente ${client.fullName}? No podrán registrarse nuevos préstamos.`)) return
    try {
      await api.delete(`/clients/${client.id}`)
      toast.success('Cliente desactivado')
      navigate('/clients')
    } catch {
      toast.error('Error al desactivar cliente')
    }
  }

  if (isLoading) return <PageLoadingState />
  if (!client) return null

  const activeLoans = loans.filter(l => ['active', 'in_mora', 'disbursed', 'overdue'].includes(l.status))
  const completedLoans = loans.filter(l => l.status === 'liquidated')
  const score = client.score ?? 50

  return (
    <div className="space-y-6">
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
                  <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">Inactivo</span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {can('clients.edit') && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/clients/${client.id}/edit`)} className="flex items-center gap-1">
              <Edit2 className="w-3.5 h-3.5"/>Editar
            </Button>
          )}
          {can('loans.create') && (
            <Button size="sm" onClick={() => navigate(`/loans/new?client_id=${client.id}`)} className="flex items-center gap-1 bg-green-600 hover:bg-green-700">
              <Plus className="w-3.5 h-3.5"/>Nuevo Préstamo
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-1">
          {[
            { id: 'info', label: 'Información Personal' },
            { id: 'loans', label: `Préstamos (${loans.length})` },
            { id: 'contacts', label: 'Referencias y Garantes' },
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
              <h3 className="section-title mb-4 flex items-center gap-2"><User className="w-4 h-4"/>Datos Personales</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500 font-semibold uppercase">Nombre Completo</p>
                  <p className="text-slate-900 font-medium mt-1">{client.fullName}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-semibold uppercase">Cédula / ID</p>
                  <p className="text-slate-900 font-medium mt-1 font-mono">{client.idNumber || '—'}</p>
                </div>
                {client.birthDate && (
                  <div>
                    <p className="text-xs text-slate-500 font-semibold uppercase">Fecha Nacimiento</p>
                    <p className="text-slate-900 font-medium mt-1 flex items-center gap-1"><Calendar className="w-3.5 h-3.5"/>{formatDate(client.birthDate)}</p>
                  </div>
                )}
                {client.gender && (
                  <div>
                    <p className="text-xs text-slate-500 font-semibold uppercase">Género</p>
                    <p className="text-slate-900 font-medium mt-1">{GENDER_LABELS[client.gender || ''] || client.gender}</p>
                  </div>
                )}
                {client.maritalStatus && (
                  <div>
                    <p className="text-xs text-slate-500 font-semibold uppercase">Estado Civil</p>
                    <p className="text-slate-900 font-medium mt-1">{MARITAL_LABELS[client.maritalStatus || ''] || client.maritalStatus}</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Contact */}
            <Card>
              <h3 className="section-title mb-4 flex items-center gap-2"><Phone className="w-4 h-4"/>Contacto</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {client.phonePersonal && (
                  <div>
                    <p className="text-xs text-slate-500 font-semibold uppercase">Teléfono Personal</p>
                    <p className="text-slate-900 font-medium mt-1 flex items-center gap-1"><Phone className="w-3.5 h-3.5"/>{client.phonePersonal}</p>
                  </div>
                )}
                {client.whatsapp && (
                  <div>
                    <p className="text-xs text-slate-500 font-semibold uppercase">WhatsApp</p>
                    <p className="text-slate-900 font-medium mt-1">{client.whatsapp}</p>
                  </div>
                )}
                {client.phoneWork && (
                  <div>
                    <p className="text-xs text-slate-500 font-semibold uppercase">Teléfono Trabajo</p>
                    <p className="text-slate-900 font-medium mt-1">{client.phoneWork}</p>
                  </div>
                )}
                {client.email && (
                  <div>
                    <p className="text-xs text-slate-500 font-semibold uppercase">Email</p>
                    <p className="text-slate-900 font-medium mt-1 flex items-center gap-1"><Mail className="w-3.5 h-3.5"/>{client.email}</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Address */}
            {(client.address || client.city || client.province) && (
              <Card>
                <h3 className="section-title mb-4 flex items-center gap-2"><MapPin className="w-4 h-4"/>Ubicación</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {client.address && (
                    <div className="col-span-2">
                      <p className="text-xs text-slate-500 font-semibold uppercase">Dirección</p>
                      <p className="text-slate-900 font-medium mt-1">{client.address}</p>
                    </div>
                  )}
                  {client.city && <div><p className="text-xs text-slate-500 font-semibold uppercase">Ciudad</p><p className="text-slate-900 font-medium mt-1">{client.city}</p></div>}
                  {client.province && <div><p className="text-xs text-slate-500 font-semibold uppercase">Provincia</p><p className="text-slate-900 font-medium mt-1">{client.province}</p></div>}
                </div>
              </Card>
            )}

            {/* Work */}
            {(client.occupation || client.employer || client.workAddress || client.monthlyIncome) && (
              <Card>
                <h3 className="section-title mb-4 flex items-center gap-2"><Briefcase className="w-4 h-4"/>Trabajo e Ingresos</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {client.occupation && <div><p className="text-xs text-slate-500 font-semibold uppercase">Ocupación</p><p className="text-slate-900 font-medium mt-1">{client.occupation}</p></div>}
                  {client.employer && <div><p className="text-xs text-slate-500 font-semibold uppercase">Empleador</p><p className="text-slate-900 font-medium mt-1">{client.employer}</p></div>}
                  {client.workAddress && <div><p className="text-xs text-slate-500 font-semibold uppercase">Dirección de la Empresa</p><p className="text-slate-900 font-medium mt-1">{client.workAddress}</p></div>}
                  {client.monthlyIncome != null && <div><p className="text-xs text-slate-500 font-semibold uppercase">Ingreso Mensual</p><p className="text-slate-900 font-medium mt-1 text-green-700">{formatCurrency(client.monthlyIncome)}</p></div>}
                </div>
              </Card>
            )}

            {client.notes && (
              <Card>
                <h3 className="section-title mb-2">Notas</h3>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{client.notes}</p>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Score Crediticio */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="section-title">Score Crediticio</h3>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getScoreBgColor(score)} ${getScoreColor(score)}`}>
                  {getScoreLabel(score)}
                </span>
              </div>

              {/* Barra principal */}
              <div className="mb-5">
                <div className="flex items-end justify-between mb-1.5">
                  <span className={`text-4xl font-black ${getScoreColor(score)}`}>{score}</span>
                  <span className="text-sm text-slate-400 mb-1">de 100 puntos</span>
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
                  { range: '0–29', label: 'Deficiente', bar: 'bg-red-400' },
                  { range: '30–49', label: 'Regular', bar: 'bg-orange-400' },
                  { range: '50–69', label: 'Bueno', bar: 'bg-yellow-400' },
                  { range: '70–84', label: 'Muy Bueno', bar: 'bg-green-400' },
                  { range: '85–100', label: 'Excelente', bar: 'bg-emerald-500' },
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
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">¿Cómo se calcula?</span>
                </div>
                <div className="space-y-2.5">
                  {SCORE_FACTORS.map(f => (
                    <div key={f.label} className={`flex items-start gap-2.5 p-2 rounded-lg ${f.bg}`}>
                      <f.icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${f.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-xs font-semibold ${f.color}`}>{f.label}</span>
                          <span className={`text-xs font-bold ${f.color} flex-shrink-0`}>{f.weight}%</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{f.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
                  El score se recalcula automáticamente cada vez que se registra o anula un pago.
                  {client.scoreUpdatedAt && (
                    <> Última actualización: <span className="font-medium">{formatDate(client.scoreUpdatedAt)}</span>.</>
                  )}
                </p>
              </div>
            </Card>

            {/* Summary */}
            <Card>
              <h3 className="section-title mb-4">Resumen</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Préstamos Activos</span>
                  <span className="font-bold text-blue-700">{activeLoans.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Préstamos Completados</span>
                  <span className="font-bold text-emerald-700">{completedLoans.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Total Prestado</span>
                  <span className="font-semibold">{formatCurrency(loans.reduce((s, l) => s + (l.disbursedAmount || l.approvedAmount || 0), 0))}</span>
                </div>
                <div className="flex justify-between border-t pt-3">
                  <span className="text-slate-600">Saldo Pendiente</span>
                  <span className="font-bold text-red-600">{formatCurrency(activeLoans.reduce((s, l) => s + (l.totalBalance || 0), 0))}</span>
                </div>
              </div>
            </Card>

            {/* Actions */}
            <Card>
              <h3 className="section-title mb-3">Acciones</h3>
              <div className="space-y-2">
                {can('loans.create') && (
                  <Button size="sm" className="w-full flex items-center gap-2 bg-green-600 hover:bg-green-700" onClick={() => navigate(`/loans/new?client_id=${client.id}`)}>
                    <Plus className="w-4 h-4"/>Nuevo Préstamo
                  </Button>
                )}
                {can('clients.edit') && (
                  <Button variant="outline" size="sm" className="w-full flex items-center gap-2" onClick={() => navigate(`/clients/${client.id}/edit`)}>
                    <Edit2 className="w-4 h-4"/>Editar Datos
                  </Button>
                )}
                {can('clients.delete') && (
                  client.isActive ? (
                    <button onClick={handleBlock} className="w-full text-sm px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-2 justify-center transition-colors">
                      <Lock className="w-4 h-4"/>Desactivar Cliente
                    </button>
                  ) : (
                    <span className="block text-center text-xs text-slate-400 py-2">Cliente inactivo</span>
                  )
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
              <h3 className="section-title mb-4">Préstamos Activos ({activeLoans.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3 font-semibold text-slate-700">Número</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-700">Producto</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">Desembolsado</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">Saldo</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">Mora</th>
                    <th className="text-center py-2 px-3 font-semibold text-slate-700">Estado</th>
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
              <h3 className="section-title mb-4">Préstamos Completados ({completedLoans.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3 font-semibold text-slate-700">Número</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-700">Producto</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">Monto</th>
                    <th className="text-center py-2 px-3 font-semibold text-slate-700">Estado</th>
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
              <p className="text-slate-500">Este cliente no tiene préstamos registrados</p>
              {can('loans.create') && (
                <Button size="sm" className="mt-4 bg-green-600 hover:bg-green-700" onClick={() => navigate(`/loans/new?client_id=${client.id}`)}>
                  Crear Primer Préstamo
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
              <h3 className="section-title flex items-center gap-2"><Users2 className="w-4 h-4"/>Referencias</h3>
              {can('clients.edit') && (
                <button onClick={() => setShowRefForm(v => !v)}
                  className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 flex items-center gap-1 transition-colors">
                  <Plus className="w-3 h-3"/>Agregar
                </button>
              )}
            </div>

            {showRefForm && (
              <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <p className="text-xs font-semibold text-slate-600 uppercase">Nueva Referencia</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-500 mb-0.5 block">Tipo</label>
                    <select value={refForm.type} onChange={e => setRefForm(p => ({...p, type: e.target.value}))}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500">
                      <option value="personal">Personal</option>
                      <option value="commercial">Comercial</option>
                      <option value="family">Familiar</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-0.5 block">Nombre *</label>
                    <input value={refForm.fullName} onChange={e => setRefForm(p => ({...p, fullName: e.target.value}))}
                      placeholder="Nombre completo"
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"/>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-0.5 block">Teléfono</label>
                    <input value={refForm.phone} onChange={e => setRefForm(p => ({...p, phone: e.target.value}))}
                      placeholder="809-000-0000"
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"/>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-0.5 block">Parentesco / Relación</label>
                    <input value={refForm.relationship} onChange={e => setRefForm(p => ({...p, relationship: e.target.value}))}
                      placeholder="Amigo, vecino..."
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"/>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-slate-500 mb-0.5 block">Empleador (opcional)</label>
                    <input value={refForm.employer} onChange={e => setRefForm(p => ({...p, employer: e.target.value}))}
                      placeholder="Empresa donde trabaja"
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"/>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={handleAddReference} disabled={isSavingRef}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {isSavingRef ? 'Guardando...' : 'Guardar Referencia'}
                  </button>
                  <button onClick={() => { setShowRefForm(false); setRefForm({ ...EMPTY_REF }) }}
                    className="px-3 py-1.5 text-slate-500 text-xs rounded-md hover:bg-slate-100 transition-colors">Cancelar</button>
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
              <p className="text-sm text-slate-400 text-center py-4">Sin referencias registradas</p>
            )}
          </Card>

          {/* ── GARANTES ── */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title flex items-center gap-2"><Shield className="w-4 h-4"/>Garantes</h3>
              {can('clients.edit') && (
                <button onClick={() => setShowGuarForm(v => !v)}
                  className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 flex items-center gap-1 transition-colors">
                  <Plus className="w-3 h-3"/>Agregar
                </button>
              )}
            </div>

            {showGuarForm && (
              <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <p className="text-xs font-semibold text-slate-600 uppercase">Nuevo Garante</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="text-xs text-slate-500 mb-0.5 block">Nombre Completo *</label>
                    <input value={guarForm.fullName} onChange={e => setGuarForm(p => ({...p, fullName: e.target.value}))}
                      placeholder="Nombre completo del garante"
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"/>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-0.5 block">Cédula / ID</label>
                    <input value={guarForm.idNumber} onChange={e => setGuarForm(p => ({...p, idNumber: e.target.value}))}
                      placeholder="001-0000000-0"
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"/>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-0.5 block">Teléfono</label>
                    <input value={guarForm.phone} onChange={e => setGuarForm(p => ({...p, phone: e.target.value}))}
                      placeholder="809-000-0000"
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"/>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-slate-500 mb-0.5 block">Dirección</label>
                    <input value={guarForm.address} onChange={e => setGuarForm(p => ({...p, address: e.target.value}))}
                      placeholder="Dirección del garante"
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"/>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={handleAddGuarantor} disabled={isSavingGuar}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {isSavingGuar ? 'Guardando...' : 'Guardar Garante'}
                  </button>
                  <button onClick={() => { setShowGuarForm(false); setGuarForm({ ...EMPTY_GUAR }) }}
                    className="px-3 py-1.5 text-slate-500 text-xs rounded-md hover:bg-slate-100 transition-colors">Cancelar</button>
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
              <p className="text-sm text-slate-400 text-center py-4">Sin garantes registrados</p>
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

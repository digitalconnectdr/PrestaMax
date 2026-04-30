import React, { useState, useEffect } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { PageLoadingState } from '@/components/ui/Loading'
import EmptyState from '@/components/ui/EmptyState'
import {
  ShieldCheck, Building2, Users2, CreditCard, TrendingUp,
  Download, Database, CheckCircle, XCircle, AlertCircle, RefreshCw, Crown,
  Calendar, Clock, RotateCcw, ChevronDown, ChevronUp, Edit2, X, Info,
  Trash2, Save, Activity, HardDrive, FileText, ClipboardList, Plus, Eye, EyeOff, KeyRound,
  Lock, Unlock, Settings2
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PERM_BY_MODULE, PERM_DEFS, PermKey } from '@/lib/permissions'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'

interface Tenant {
  id: string
  name: string
  slug: string
  email: string
  phone: string
  isActive: number
  planId: string
  planName: string
  priceMonthly: number
  maxCollectors: number
  maxClients: number
  maxUsers: number
  memberCount: number
  loanCount: number
  clientCount: number
  createdAt: string
  // Subscription fields
  subscriptionStatus: string
  subscriptionStart: string | null
  subscriptionEnd: string | null
  billingCycle: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  subscriptionNotes: string | null
  daysRemaining: number | null
  trialDaysRemaining: number | null
  trialEndDate: string | null
}

interface Backup {
  filename: string
  size: number
  createdAt: string
}

interface Plan {
  id: string
  name: string
  slug: string
  priceMonthly: number
  maxCollectors: number
  maxClients: number
  maxUsers: number
  isActive: number
  trialDays: number
  features: string   // JSON array string
  description: string
  isTrialDefault?: boolean | number
}

interface RevenueByPlan {
  planName: string
  slug: string
  priceMonthly: number
  tenantCount: number
  monthlyRevenue: number
}

interface RecentSubscription {
  name: string
  email: string
  planName: string
  subscriptionStatus: string
  subscriptionStart: string | null
  subscriptionEnd: string | null
  daysRemaining: number | null
}

interface SubscriptionsByStatus {
  active: number
  trial: number
  expired: number
  cancelled: number
  suspended: number
}

interface PlatformStats {
  tenantCount: number
  userCount: number
  loanCount: number
  totalPortfolio: number
  activeLoans: number
  paymentCount: number
  clientCount: number
  expiringSoon: number
  trialCount: number
  dbSizeBytes: number
  dbSizeMB: string
  recentLogs: AuditLog[]
  // Subscription & revenue
  activeSubscriptions: number
  expiredSubscriptions: number
  estimatedMonthlyRevenue: number
  revenueByPlan: RevenueByPlan[]
  subscriptionsByStatus: SubscriptionsByStatus
  recentSubscriptions: RecentSubscription[]
}

interface AuditLog {
  id: string
  tenantId: string | null
  userId: string | null
  userName: string
  userEmail: string | null
  action: string
  entityType: string | null
  entityId: string | null
  description: string
  metadata: string
  ipAddress: string | null
  createdAt: string
}

interface PlatformUser {
  id: string
  email: string
  fullName: string
  isActive: number
  platformRole: string
  tenantCount: number
  lastLogin: string
  createdAt: string
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  support: 'Soporte',
  none: 'Sin rol',
}



const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  login: { label: 'Inicio de sesión', color: 'bg-blue-100 text-blue-700' },
  logout: { label: 'Cierre de sesión', color: 'bg-slate-100 text-slate-600' },
  create_loan: { label: 'Préstamo creado', color: 'bg-emerald-100 text-emerald-700' },
  update_loan: { label: 'Préstamo editado', color: 'bg-amber-100 text-amber-700' },
  register_payment: { label: 'Pago registrado', color: 'bg-green-100 text-green-700' },
  create_client: { label: 'Cliente creado', color: 'bg-cyan-100 text-cyan-700' },
  update_client: { label: 'Cliente editado', color: 'bg-cyan-100 text-cyan-700' },
  reset_password: { label: 'Contraseña reseteada', color: 'bg-orange-100 text-orange-700' },
  block_user: { label: 'Usuario bloqueado', color: 'bg-red-100 text-red-700' },
  create_user: { label: 'Usuario creado', color: 'bg-purple-100 text-purple-700' },
  update_settings: { label: 'Configuración actualizada', color: 'bg-slate-100 text-slate-700' },
}

const PlatformAdminPage: React.FC = () => {
  const { state } = useAuth()
  const [activeTab, setActiveTab] = useState('overview')
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [backups, setBackups] = useState<Backup[]>([])
  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([])
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [isDeletingBackup, setIsDeletingBackup] = useState<string | null>(null)
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [planForm, setPlanForm] = useState({ name: '', slug: '', priceMonthly: '', maxCollectors: '-1', maxClients: '-1', maxUsers: '-1', trialDays: '10', description: '', features: [] as PermKey[], isTrialDefault: false })
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [planEditForm, setPlanEditForm] = useState({ name: '', slug: '', priceMonthly: '', maxCollectors: '-1', maxClients: '-1', maxUsers: '-1', trialDays: '10', description: '', features: [] as PermKey[], isActive: true, isTrialDefault: false })
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [isBootstrapping, setIsBootstrapping] = useState(false)
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null)
  // Nueva Empresa modal
  const [showNewTenantModal, setShowNewTenantModal] = useState(false)
  const [showAdminPassword, setShowAdminPassword] = useState(false)
  const [isCreatingTenant, setIsCreatingTenant] = useState(false)
  const [newTenantForm, setNewTenantForm] = useState({
    name: '', email: '', phone: '', currency: 'DOP', planId: '',
    adminName: '', adminEmail: '', adminPassword: '',
  })
  const [resetPwModal, setResetPwModal] = useState<{ userId: string; userName: string } | null>(null)
  const [resetPwValue, setResetPwValue] = useState('')
  // Purge tenant data
  const [purgeModal, setPurgeModal] = useState<{ tenantId: string; tenantName: string } | null>(null)
  const [purgeConfirmName, setPurgeConfirmName] = useState('')
  const [isPurging, setIsPurging] = useState(false)
  const [showResetPw, setShowResetPw] = useState(false)
  const [isResettingPw, setIsResettingPw] = useState(false)
  // Block/unblock + permissions
  const [permModal, setPermModal] = useState<{ userId: string; userName: string } | null>(null)
  const [permMemberships, setPermMemberships] = useState<any[]>([])
  const [permSelectedTenant, setPermSelectedTenant] = useState<string>('')
  const [permExplicit, setPermExplicit] = useState<Record<string, boolean>>({})
  const [permRole, setPermRole] = useState<string>('collector')
  const [isSavingPerm, setIsSavingPerm] = useState(false)
  const [isTogglingActive, setIsTogglingActive] = useState<string | null>(null)
  const [editingSubscription, setEditingSubscription] = useState<string | null>(null)
  const [subscriptionForm, setSubscriptionForm] = useState({
    planId: '', subscriptionStatus: 'active', subscriptionStart: '', subscriptionEnd: '',
    billingCycle: 'monthly', subscriptionNotes: ''
  })
  const userPlatformRole = (state.user as any)?.platformRole || (state.user as any)?.platform_role || ''
  const isPlatformAdmin = ['admin', 'platform_owner', 'platform_admin'].includes(userPlatformRole)

  const loadData = async (tab: string) => {
    setIsLoading(true)
    try {
      if (tab === 'overview' || tab === 'tenants') {
        const [statsRes, tenantsRes, plansRes] = await Promise.all([
          api.get('/admin/stats'), api.get('/admin/tenants'), api.get('/admin/plans')
        ])
        setStats(statsRes.data)
        setTenants(tenantsRes.data || [])
        setPlans(plansRes.data || [])
      } else if (tab === 'plans') {
        const res = await api.get('/admin/plans')
        setPlans(res.data || [])
      } else if (tab === 'backup') {
        const [backupsRes, tenantsRes, plansRes] = await Promise.all([
          api.get('/admin/backups'),
          api.get('/admin/tenants'),
          api.get('/admin/plans'),
        ])
        setBackups(backupsRes.data || [])
        setTenants(tenantsRes.data || [])
        setPlans(plansRes.data || [])
      } else if (tab === 'users') {
        const res = await api.get('/admin/users')
        setPlatformUsers(res.data || [])
      } else if (tab === 'logs') {
        const [logsRes, statsRes] = await Promise.all([api.get('/admin/audit-logs?limit=200'), api.get('/admin/stats')])
        setAuditLogs(logsRes.data || [])
        setStats(statsRes.data)
      }
    } catch (err: any) {
      if (err?.response?.status === 403) {
        // Not a platform admin — handled below
      } else {
        toast.error(err?.response?.data?.error || 'Error cargando datos')
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadData(activeTab) }, [activeTab])

  const handleToggleTenant = async (tenant: Tenant) => {
    try {
      await api.put(`/admin/tenants/${tenant.id}`, { is_active: tenant.isActive ? 0 : 1 })
      toast.success(`Empresa ${tenant.isActive ? 'suspendida' : 'activada'}`)
      loadData('tenants')
    } catch (err: any) {
      toast.error('Error al actualizar empresa')
    }
  }

  const handleAssignPlan = async (tenantId: string, planId: string) => {
    try {
      await api.put(`/admin/tenants/${tenantId}`, { plan_id: planId || null })
      toast.success('Plan asignado')
      loadData('tenants')
    } catch (err: any) {
      toast.error('Error al asignar plan')
    }
  }

  const handleCreateBackup = async () => {
    try {
      setIsBackingUp(true)
      const res = await api.post('/admin/backup', {})
      toast.success(`Backup creado: ${res.data.filename}`)
      setBackups(res.data.backups || [])
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al crear backup')
    } finally {
      setIsBackingUp(false)
    }
  }

  const handleDeleteBackup = async (filename: string) => {
    if (!window.confirm(`¿Eliminar el backup "${filename}"? Esta acción no se puede deshacer.`)) return
    try {
      setIsDeletingBackup(filename)
      await api.delete(`/admin/backup/${encodeURIComponent(filename)}`)
      toast.success('Backup eliminado correctamente')
      setBackups(prev => prev.filter(b => b.filename !== filename))
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al eliminar backup')
    } finally {
      setIsDeletingBackup(null)
    }
  }

  const handlePurgeTenantData = async () => {
    if (!purgeModal) return
    if (!purgeConfirmName.trim()) return toast.error('Escribe el nombre de la empresa para confirmar')
    try {
      setIsPurging(true)
      const res = await api.delete(`/admin/tenants/${purgeModal.tenantId}/purge-data`, {
        data: { confirm_name: purgeConfirmName }
      })
      toast.success(res.data.message || 'Datos eliminados correctamente')
      setPurgeModal(null)
      setPurgeConfirmName('')
      // Refresh tenants list
      const tenantsRes = await api.get('/admin/tenants')
      setTenants(tenantsRes.data || [])
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al eliminar datos')
    } finally {
      setIsPurging(false)
    }
  }

  const handleCreatePlan = async () => {
    if (!planForm.name || !planForm.slug) return toast.error('Nombre y slug son requeridos')
    try {
      await api.post('/admin/plans', {
        name: planForm.name, slug: planForm.slug,
        price_monthly: parseFloat(planForm.priceMonthly) || 0,
        max_collectors: parseInt(planForm.maxCollectors) || -1,
        max_clients: parseInt(planForm.maxClients) || -1,
        max_users: parseInt(planForm.maxUsers) || -1,
        trial_days: parseInt(planForm.trialDays) || 10,
        description: planForm.description,
        features: JSON.stringify(planForm.features),
        is_trial_default: planForm.isTrialDefault ? 1 : 0,
      })
      toast.success('Plan creado')
      setShowPlanForm(false)
      setPlanForm({ name: '', slug: '', priceMonthly: '', maxCollectors: '-1', maxClients: '-1', maxUsers: '-1', trialDays: '10', description: '', features: [], isTrialDefault: false })
      loadData('plans')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al crear plan')
    }
  }

  const handleSeedDefaultPlans = async () => {
    try {
      const res = await api.post('/admin/plans/seed-defaults', {})
      setPlans(res.data.plans || [])
      toast.success('Planes predeterminados cargados correctamente')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al cargar planes')
    }
  }

  const startEditPlan = (plan: Plan) => {
    let features: PermKey[] = []
    try { features = JSON.parse(plan.features || '[]') as PermKey[] } catch(_) {}
    setPlanEditForm({
      name: plan.name, slug: plan.slug,
      priceMonthly: String(plan.priceMonthly),
      maxCollectors: String(plan.maxCollectors),
      maxClients: String(plan.maxClients),
      maxUsers: String(plan.maxUsers),
      trialDays: String(plan.trialDays ?? 10),
      description: plan.description || '',
      features,
      isActive: !!plan.isActive,
      isTrialDefault: !!plan.isTrialDefault,
    })
    setEditingPlan(plan)
  }

  const handleSavePlanEdit = async () => {
    if (!editingPlan) return
    try {
      await api.put(`/admin/plans/${editingPlan.id}`, {
        name: planEditForm.name,
        price_monthly: parseFloat(planEditForm.priceMonthly) || 0,
        max_collectors: parseInt(planEditForm.maxCollectors),
        max_clients: parseInt(planEditForm.maxClients),
        max_users: parseInt(planEditForm.maxUsers),
        trial_days: parseInt(planEditForm.trialDays) || 10,
        description: planEditForm.description,
        features: JSON.stringify(planEditForm.features),
        is_active: planEditForm.isActive ? 1 : 0,
        is_trial_default: planEditForm.isTrialDefault ? 1 : 0,
      })
      toast.success('Plan actualizado')
      setEditingPlan(null)
      loadData('plans')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al actualizar plan')
    }
  }

  const handleDeletePlan = async (plan: Plan) => {
    if (!confirm(`¿Eliminar el plan "${plan.name}"? Esta acción no se puede deshacer.`)) return
    try {
      await api.delete(`/admin/plans/${plan.id}`)
      toast.success('Plan eliminado')
      loadData('plans')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al eliminar plan')
    }
  }

  const togglePlanFeature = (key: PermKey, inEdit: boolean) => {
    if (inEdit) {
      setPlanEditForm(p => ({
        ...p, features: p.features.includes(key) ? p.features.filter(f => f !== key) : [...p.features, key]
      }))
    } else {
      setPlanForm(p => ({
        ...p, features: p.features.includes(key) ? p.features.filter(f => f !== key) : [...p.features, key]
      }))
    }
  }

  const startEditSubscription = (tenant: Tenant) => {
    setSubscriptionForm({
      planId: tenant.planId || '',
      subscriptionStatus: tenant.subscriptionStatus || 'trial',
      subscriptionStart: tenant.subscriptionStart?.slice(0,10) || '',
      subscriptionEnd: tenant.subscriptionEnd?.slice(0,10) || '',
      billingCycle: tenant.billingCycle || 'monthly',
      subscriptionNotes: tenant.subscriptionNotes || '',
    })
    setEditingSubscription(tenant.id)
    setExpandedTenant(tenant.id)
  }

  const handleSaveSubscription = async (tenantId: string) => {
    try {
      await api.put(`/admin/tenants/${tenantId}`, {
        plan_id: subscriptionForm.planId || null,
        subscription_status: subscriptionForm.subscriptionStatus,
        subscription_start: subscriptionForm.subscriptionStart || null,
        subscription_end: subscriptionForm.subscriptionEnd || null,
        billing_cycle: subscriptionForm.billingCycle,
        subscription_notes: subscriptionForm.subscriptionNotes || null,
      })
      toast.success('Suscripción actualizada')
      setEditingSubscription(null)
      loadData('tenants')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al actualizar suscripción')
    }
  }

  const handleRenew = async (tenantId: string, months: number) => {
    const billingCycle = months === 1 ? 'monthly' : months === 12 ? 'annual' : 'monthly'
    try {
      await api.post(`/admin/tenants/${tenantId}/renew`, { months, billing_cycle: billingCycle })
      toast.success(`Suscripción renovada por ${months} mes${months > 1 ? 'es' : ''}`)
      loadData('tenants')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al renovar')
    }
  }

  const getSubscriptionBadge = (tenant: Tenant) => {
    const status = tenant.subscriptionStatus
    const days = tenant.daysRemaining
    if (status === 'trial') return { label: 'Período de Prueba', color: 'bg-blue-100 text-blue-700 border-blue-200' }
    if (status === 'expired' || (status === 'active' && days !== null && days < 0)) return { label: 'Vencida', color: 'bg-red-100 text-red-700 border-red-200' }
    if (status === 'canceled') return { label: 'Cancelada', color: 'bg-slate-100 text-slate-600 border-slate-200' }
    if (status === 'suspended') return { label: 'Suspendida', color: 'bg-orange-100 text-orange-700 border-orange-200' }
    if (status === 'active' && days !== null && days <= 7) return { label: `Vence en ${days}d`, color: 'bg-amber-100 text-amber-700 border-amber-200' }
    if (status === 'active') return { label: 'Activa', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
    return { label: status, color: 'bg-slate-100 text-slate-600 border-slate-200' }
  }


  const handleToggleActive = async (userId: string, currentActive: number) => {
    setIsTogglingActive(userId)
    try {
      const res = await api.put(`/admin/users/${userId}/toggle-active`, {})
      toast.success(res.data.is_active ? 'Usuario desbloqueado' : 'Usuario bloqueado')
      loadData('users')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al cambiar estado')
    } finally { setIsTogglingActive(null) }
  }

  const handleOpenPermissions = async (user: PlatformUser) => {
    try {
      const res = await api.get(`/admin/users/${user.id}/memberships`)
      const memberships = res.data.memberships || []
      setPermMemberships(memberships)
      setPermModal({ userId: user.id, userName: user.fullName })
      if (memberships.length > 0) {
        const first = memberships[0]
        setPermSelectedTenant(first.tenantId)
        setPermRole(first.roles || 'collector')
        try {
          const explicit = JSON.parse(first.explicitPermissions || '{}')
          setPermExplicit(explicit)
        } catch (_) { setPermExplicit({}) }
      }
    } catch (err: any) {
      toast.error('Error al cargar datos del usuario')
    }
  }

  const handleSelectPermTenant = (tenantId: string) => {
    setPermSelectedTenant(tenantId)
    const m = permMemberships.find((x: any) => x.tenantId === tenantId)
    if (m) {
      setPermRole(m.roles || 'collector')
      try {
        const explicit = JSON.parse(m.explicitPermissions || '{}')
        setPermExplicit(explicit)
      } catch (_) { setPermExplicit({}) }
    }
  }

  const handleSavePermissions = async () => {
    if (!permModal || !permSelectedTenant) return
    setIsSavingPerm(true)
    try {
      await api.put(`/admin/users/${permModal.userId}/memberships/${permSelectedTenant}/role`, { roles: permRole })
      await api.put(`/admin/users/${permModal.userId}/memberships/${permSelectedTenant}/permissions`, { explicit: permExplicit })
      toast.success('Permisos actualizados')
      setPermModal(null)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al guardar permisos')
    } finally { setIsSavingPerm(false) }
  }

  const handleSetRole = async (userId: string, role: string) => {
    try {
      await api.put(`/admin/users/${userId}/platform-role`, { platform_role: role })
      toast.success('Rol actualizado')
      loadData('users')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al actualizar rol')
    }
  }

  const handleAdminResetPassword = async () => {
    if (!resetPwModal) return
    if (!resetPwValue || resetPwValue.length < 6) return toast.error('La contraseña debe tener al menos 6 caracteres')
    setIsResettingPw(true)
    try {
      await api.post(`/admin/users/${resetPwModal.userId}/reset-password`, { new_password: resetPwValue })
      toast.success(`Contraseña de ${resetPwModal.userName} actualizada`)
      setResetPwModal(null)
      setResetPwValue('')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al resetear contraseña')
    } finally { setIsResettingPw(false) }
  }

  const handleCreateTenant = async () => {
    if (!newTenantForm.name.trim()) return toast.error('Nombre de empresa es requerido')
    if (!newTenantForm.adminName.trim()) return toast.error('Nombre del administrador es requerido')
    if (!newTenantForm.adminEmail.trim()) return toast.error('Email del administrador es requerido')
    if (!newTenantForm.adminPassword) return toast.error('Contraseña del administrador es requerida')
    if (newTenantForm.adminPassword.length < 8) return toast.error('La contraseña debe tener al menos 8 caracteres')
    try {
      setIsCreatingTenant(true)
      const res = await api.post('/admin/tenants', {
        name: newTenantForm.name.trim(),
        email: newTenantForm.email || null,
        phone: newTenantForm.phone || null,
        currency: newTenantForm.currency,
        plan_id: newTenantForm.planId || null,
        admin_name: newTenantForm.adminName.trim(),
        admin_email: newTenantForm.adminEmail.trim(),
        admin_password: newTenantForm.adminPassword,
      })
      toast.success(res.data.message || 'Empresa creada exitosamente')
      setShowNewTenantModal(false)
      setNewTenantForm({ name: '', email: '', phone: '', currency: 'DOP', planId: '', adminName: '', adminEmail: '', adminPassword: '' })
      loadData('tenants')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al crear empresa')
    } finally {
      setIsCreatingTenant(false)
    }
  }

  const handleBootstrap = async () => {
    if (!confirm('¿Convertirte en administrador de plataforma? Solo es posible si aún no hay ningún admin registrado.')) return
    try {
      setIsBootstrapping(true)
      await api.post('/admin/bootstrap', {})
      toast.success('¡Ahora eres administrador de plataforma! Cierra sesión y vuelve a entrar para ver el panel completo.')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error de bootstrap')
    } finally {
      setIsBootstrapping(false)
    }
  }

  const TABS = [
    { id: 'overview', label: 'Resumen', icon: TrendingUp },
    { id: 'tenants', label: 'Empresas', icon: Building2 },
    { id: 'plans', label: 'Planes', icon: CreditCard },
    { id: 'users', label: 'Usuarios', icon: Users2 },
    { id: 'logs', label: 'Logs', icon: ClipboardList },
    { id: 'backup', label: 'Backups', icon: Database },
  ]

  // Show bootstrap UI if user is logged in but not yet platform admin
  if (!isPlatformAdmin) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-900 rounded-lg">
            <ShieldCheck className="w-6 h-6 text-white"/>
          </div>
          <div>
            <h1 className="page-title">Administración de Plataforma</h1>
            <p className="text-slate-600 text-sm">Acceso restringido</p>
          </div>
        </div>
        <Card className="max-w-lg mx-auto text-center py-8">
          <Crown className="w-12 h-12 text-amber-500 mx-auto mb-4"/>
          <h3 className="text-lg font-semibold mb-2">Configuración inicial de plataforma</h3>
          <p className="text-sm text-slate-500 mb-6">
            Si aún no hay ningún administrador registrado en la plataforma, puedes hacer clic en el botón de abajo para convertirte en el primer administrador. Este botón solo funciona una vez.
          </p>
          <Button onClick={handleBootstrap} disabled={isBootstrapping} className="flex items-center gap-2 mx-auto">
            <ShieldCheck className="w-4 h-4"/>
            {isBootstrapping ? 'Procesando...' : 'Configurar como Administrador de Plataforma'}
          </Button>
          <p className="text-xs text-slate-400 mt-4">Después de esto, deberás cerrar sesión y volver a entrar.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-900 rounded-lg">
          <ShieldCheck className="w-6 h-6 text-white"/>
        </div>
        <div>
          <h1 className="page-title">Administración de Plataforma</h1>
          <p className="text-slate-600 text-sm">Panel exclusivo para el administrador de PrestaMax</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 pb-3 px-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === tab.id ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                <Icon className="w-4 h-4"/>{tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {isLoading ? <PageLoadingState /> : (
        <>
          {/* ── OVERVIEW ── */}
          {activeTab === 'overview' && stats && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4 text-center bg-blue-50">
                  <Building2 className="w-6 h-6 text-blue-600 mx-auto mb-1"/>
                  <p className="text-2xl font-bold text-blue-700">{stats.tenantCount}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Empresas Activas</p>
                </Card>
                <Card className="p-4 text-center bg-emerald-50">
                  <Users2 className="w-6 h-6 text-emerald-600 mx-auto mb-1"/>
                  <p className="text-2xl font-bold text-emerald-700">{stats.userCount}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Usuarios Totales</p>
                </Card>
                <Card className="p-4 text-center bg-purple-50">
                  <CreditCard className="w-6 h-6 text-purple-600 mx-auto mb-1"/>
                  <p className="text-2xl font-bold text-purple-700">{stats.activeLoans ?? stats.loanCount}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Préstamos Activos</p>
                </Card>
                <Card className="p-4 text-center bg-amber-50">
                  <TrendingUp className="w-6 h-6 text-amber-600 mx-auto mb-1"/>
                  <p className="text-lg font-bold text-amber-700">{formatCurrency(stats.totalPortfolio)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Cartera Activa</p>
                </Card>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4 text-center">
                  <p className="text-xl font-bold text-slate-800">{stats.clientCount ?? 0}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Clientes Registrados</p>
                </Card>
                <Card className="p-4 text-center">
                  <p className="text-xl font-bold text-slate-800">{stats.paymentCount ?? 0}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Pagos Procesados</p>
                </Card>
                <Card className={`p-4 text-center ${(stats.expiringSoon ?? 0) > 0 ? 'bg-amber-50' : ''}`}>
                  <p className={`text-xl font-bold ${(stats.expiringSoon ?? 0) > 0 ? 'text-amber-700' : 'text-slate-800'}`}>{stats.expiringSoon ?? 0}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Vencen en 7 días</p>
                </Card>
                <Card className="p-4 text-center bg-blue-50">
                  <p className="text-xl font-bold text-blue-700">{stats.trialCount ?? 0}</p>
                  <p className="text-xs text-slate-500 mt-0.5">En Período de Prueba</p>
                </Card>
              </div>

              {/* ── Subscription & Revenue ── */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4 text-center bg-emerald-50">
                  <TrendingUp className="w-6 h-6 text-emerald-600 mx-auto mb-1"/>
                  <p className="text-lg font-bold text-emerald-700">{formatCurrency(stats.estimatedMonthlyRevenue ?? 0)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Ingresos Est. / Mes</p>
                </Card>
                <Card className="p-4 text-center bg-blue-50">
                  <CheckCircle className="w-6 h-6 text-blue-600 mx-auto mb-1"/>
                  <p className="text-2xl font-bold text-blue-700">{stats.activeSubscriptions ?? 0}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Suscripciones Activas</p>
                </Card>
                <Card className="p-4 text-center bg-amber-50">
                  <Clock className="w-6 h-6 text-amber-600 mx-auto mb-1"/>
                  <p className="text-2xl font-bold text-amber-700">{stats.subscriptionsByStatus?.trial ?? stats.trialCount ?? 0}</p>
                  <p className="text-xs text-slate-500 mt-0.5">En Período de Prueba</p>
                </Card>
                <Card className="p-4 text-center bg-red-50">
                  <XCircle className="w-6 h-6 text-red-500 mx-auto mb-1"/>
                  <p className="text-2xl font-bold text-red-600">{stats.expiredSubscriptions ?? 0}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Suscripciones Vencidas</p>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Revenue by plan */}
                <Card>
                  <h3 className="section-title mb-4 flex items-center gap-2"><Crown className="w-4 h-4"/>Rendimiento por Plan</h3>
                  {(stats.revenueByPlan || []).length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-2 px-3 font-semibold text-slate-700">Plan</th>
                            <th className="text-center py-2 px-3 font-semibold text-slate-700">Suscriptores</th>
                            <th className="text-right py-2 px-3 font-semibold text-slate-700">Precio/Mes</th>
                            <th className="text-right py-2 px-3 font-semibold text-slate-700">Ingresos/Mes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(stats.revenueByPlan || []).map((row, i) => (
                            <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="py-2 px-3 font-medium text-slate-800">{row.planName}</td>
                              <td className="py-2 px-3 text-center">
                                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">{row.tenantCount}</span>
                              </td>
                              <td className="py-2 px-3 text-right text-slate-600">{formatCurrency(row.priceMonthly)}</td>
                              <td className="py-2 px-3 text-right font-semibold text-emerald-700">{formatCurrency(row.monthlyRevenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-50">
                            <td colSpan={3} className="py-2 px-3 text-sm font-semibold text-slate-700">Total estimado</td>
                            <td className="py-2 px-3 text-right font-bold text-emerald-700">{formatCurrency(stats.estimatedMonthlyRevenue ?? 0)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 italic text-center py-6">Sin datos de planes disponibles</p>
                  )}
                </Card>

                {/* Recent subscriptions */}
                <Card>
                  <h3 className="section-title mb-4 flex items-center gap-2"><Calendar className="w-4 h-4"/>Suscripciones Recientes</h3>
                  {(stats.recentSubscriptions || []).length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {(stats.recentSubscriptions || []).map((sub, i) => {
                        const statusColors: Record<string, string> = {
                          active: 'bg-emerald-100 text-emerald-700',
                          trial: 'bg-amber-100 text-amber-700',
                          expired: 'bg-red-100 text-red-600',
                          cancelled: 'bg-slate-100 text-slate-600',
                          suspended: 'bg-orange-100 text-orange-700',
                        }
                        const statusLabels: Record<string, string> = {
                          active: 'Activa', trial: 'Prueba', expired: 'Vencida',
                          cancelled: 'Cancelada', suspended: 'Suspendida',
                        }
                        const colorCls = statusColors[sub.subscriptionStatus] || 'bg-slate-100 text-slate-600'
                        const statusLabel = statusLabels[sub.subscriptionStatus] || sub.subscriptionStatus
                        return (
                          <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-800 truncate">{sub.name}</p>
                              <p className="text-xs text-slate-400 truncate">{sub.planName} · {sub.email}</p>
                              {sub.daysRemaining !== null && sub.daysRemaining !== undefined && (
                                <p className={`text-xs ${sub.daysRemaining <= 7 ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                                  {sub.daysRemaining > 0 ? `Vence en ${sub.daysRemaining} día(s)` : 'Vencida'}
                                </p>
                              )}
                            </div>
                            <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${colorCls}`}>{statusLabel}</span>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 italic text-center py-6">Sin suscripciones recientes</p>
                  )}
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <h3 className="section-title mb-4 flex items-center gap-2"><Activity className="w-4 h-4"/>Estado de la Plataforma</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">Base de datos</span>
                      <span className="flex items-center gap-1 text-sm text-emerald-600 font-medium"><CheckCircle className="w-4 h-4"/>Operativa</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600 flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5"/>Tamaño BD</span>
                      <span className="text-sm font-medium text-slate-700">{stats.dbSizeMB ?? '?'} MB</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">API Backend</span>
                      <span className="flex items-center gap-1 text-sm text-emerald-600 font-medium"><CheckCircle className="w-4 h-4"/>Activa</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">Empresas registradas</span>
                      <span className="text-sm font-medium text-slate-700">{stats.tenantCount}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-slate-600">Total préstamos (histórico)</span>
                      <span className="text-sm font-medium text-slate-700">{stats.loanCount}</span>
                    </div>
                  </div>
                </Card>

                <Card>
                  <h3 className="section-title mb-4 flex items-center gap-2"><ClipboardList className="w-4 h-4"/>Actividad Reciente</h3>
                  {(stats.recentLogs || []).length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {(stats.recentLogs || []).map((log, i) => {
                        const actionInfo = ACTION_LABELS[log.action] || { label: log.action, color: 'bg-slate-100 text-slate-600' }
                        return (
                          <div key={i} className="flex items-start gap-2 py-1.5 border-b border-slate-50 last:border-0">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium whitespace-nowrap flex-shrink-0 ${actionInfo.color}`}>{actionInfo.label}</span>
                            <div className="min-w-0">
                              <p className="text-xs text-slate-700 truncate">{log.description}</p>
                              <p className="text-xs text-slate-400">{log.userName} · {log.createdAt?.slice(0,16).replace('T',' ')}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 italic text-center py-6">Sin actividad registrada aún</p>
                  )}
                  <button onClick={() => setActiveTab('logs')} className="mt-3 text-xs text-blue-600 hover:underline">Ver todos los logs →</button>
                </Card>
              </div>
            </div>
          )}

          {/* ── TENANTS ── */}
          {activeTab === 'tenants' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="section-title">Prestamistas Registrados ({tenants.length})</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Gestión de suscripciones, planes y acceso</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => loadData('tenants')} size="sm" variant="outline" className="flex items-center gap-1">
                    <RefreshCw className="w-4 h-4"/>Actualizar
                  </Button>
                  <Button onClick={() => setShowNewTenantModal(true)} size="sm" className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                    <Plus className="w-4 h-4"/>Nueva Empresa
                  </Button>
                </div>
              </div>

              {/* Summary alerts */}
              {tenants.some(t => t.subscriptionStatus === 'expired' || (t.daysRemaining !== null && t.daysRemaining <= 7 && t.daysRemaining >= 0)) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5"/>
                  <div className="text-sm text-amber-800">
                    <strong>Atención:</strong> hay suscripciones vencidas o próximas a vencer.
                    {tenants.filter(t => t.subscriptionStatus === 'expired' || (t.daysRemaining !== null && t.daysRemaining < 0)).map(t => (
                      <span key={t.id} className="ml-1 font-semibold">{t.name}</span>
                    ))}
                  </div>
                </div>
              )}

              {tenants.length > 0 ? (
                <div className="space-y-3">
                  {tenants.map(t => {
                    const badge = getSubscriptionBadge(t)
                    const isExpanded = expandedTenant === t.id
                    const isEditing = editingSubscription === t.id
                    const plan = plans.find(p => p.id === t.planId)

                    return (
                      <Card key={t.id} className={`transition-all ${!t.isActive ? 'opacity-70 bg-slate-50' : ''}`}>
                        {/* Main row */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${t.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`}/>
                              <span className="font-semibold text-slate-900 text-base">{t.name}</span>
                              {/* Subscription status badge */}
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${badge.color}`}>
                                {badge.label}
                              </span>
                              {/* Plan badge */}
                              {t.planName && (
                                <span className="text-xs bg-[#1e3a5f] text-white px-2 py-0.5 rounded-full font-medium">
                                  {t.planName} · ${t.priceMonthly}/mes
                                </span>
                              )}
                              {!t.planName && (
                                <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">Sin plan</span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
                              <span className="text-xs text-slate-500">{t.email || t.slug}</span>
                              <span className="text-xs text-slate-400">Registrado: {formatDate(t.createdAt)}</span>
                              {t.subscriptionEnd && (
                                <span className={`text-xs font-medium flex items-center gap-1 ${
                                  t.daysRemaining !== null && t.daysRemaining < 0 ? 'text-red-600' :
                                  t.daysRemaining !== null && t.daysRemaining <= 7 ? 'text-amber-600' :
                                  'text-slate-500'
                                }`}>
                                  <Calendar className="w-3 h-3"/>
                                  Vence: {t.subscriptionEnd.slice(0,10)}
                                  {t.daysRemaining !== null && (
                                    <span>({t.daysRemaining < 0 ? `vencida hace ${Math.abs(t.daysRemaining)}d` : `en ${t.daysRemaining}d`})</span>
                                  )}
                                </span>
                              )}
                              {t.subscriptionStatus === 'trial' && t.trialDaysRemaining !== null && (
                                <span className={`text-xs font-medium flex items-center gap-1 ${
                                  t.trialDaysRemaining <= 0 ? 'text-red-600' :
                                  t.trialDaysRemaining <= 5 ? 'text-amber-600' :
                                  'text-blue-600'
                                }`}>
                                  ⏱️
                                  {t.trialDaysRemaining <= 0
                                    ? `Prueba vencida hace ${Math.abs(t.trialDaysRemaining)}d`
                                    : `${t.trialDaysRemaining}d de prueba restantes`}
                                  {t.trialEndDate && <span className="text-slate-400 font-normal">(hasta {t.trialEndDate})</span>}
                                </span>
                              )}
                            </div>
                            {/* Usage stats */}
                            <div className="flex flex-wrap gap-3 mt-2">
                              <span className="text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                👥 {t.memberCount} usuarios {plan && plan.maxUsers !== -1 ? `/ ${plan.maxUsers}` : ''}
                              </span>
                              <span className="text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                🏦 {t.loanCount} préstamos
                              </span>
                              <span className="text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                👤 {t.clientCount} clientes {plan && plan.maxClients !== -1 ? `/ ${plan.maxClients}` : ''}
                              </span>
                            </div>
                          </div>
                          {/* Actions */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => startEditSubscription(t)}
                              className="p-1.5 hover:bg-blue-50 rounded text-blue-600 transition-colors" title="Gestionar suscripción">
                              <Edit2 className="w-4 h-4"/>
                            </button>
                            <button onClick={() => handleToggleTenant(t)}
                              className={`p-1.5 rounded transition-colors ${t.isActive ? 'hover:bg-red-50 text-red-500' : 'hover:bg-emerald-50 text-emerald-600'}`}
                              title={t.isActive ? 'Suspender acceso' : 'Reactivar acceso'}>
                              {t.isActive ? <XCircle className="w-4 h-4"/> : <CheckCircle className="w-4 h-4"/>}
                            </button>
                            <button onClick={() => setExpandedTenant(isExpanded ? null : t.id)}
                              className="p-1.5 hover:bg-slate-100 rounded text-slate-500 transition-colors">
                              {isExpanded ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                            </button>
                          </div>
                        </div>

                        {/* Expanded section */}
                        {isExpanded && (
                          <div className="mt-4 pt-4 border-t border-slate-200">
                            {isEditing ? (
                              /* ── EDIT SUBSCRIPTION FORM ── */
                              <div className="space-y-4">
                                <h4 className="font-semibold text-slate-800 flex items-center gap-2">
                                  <CreditCard className="w-4 h-4 text-blue-600"/>Gestionar Suscripción: {t.name}
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">Plan</label>
                                    <select value={subscriptionForm.planId} onChange={e => setSubscriptionForm(p=>({...p,planId:e.target.value}))}
                                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                                      <option value="">— Sin plan asignado —</option>
                                      {plans.map(p => <option key={p.id} value={p.id}>{p.name} — ${p.priceMonthly}/mes</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">Estado de Suscripción</label>
                                    <select value={subscriptionForm.subscriptionStatus} onChange={e => setSubscriptionForm(p=>({...p,subscriptionStatus:e.target.value}))}
                                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                                      <option value="trial">Período de Prueba</option>
                                      <option value="active">Activa</option>
                                      <option value="expired">Vencida</option>
                                      <option value="suspended">Suspendida</option>
                                      <option value="canceled">Cancelada</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">Fecha de Inicio</label>
                                    <input type="date" value={subscriptionForm.subscriptionStart} onChange={e => setSubscriptionForm(p=>({...p,subscriptionStart:e.target.value}))}
                                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">Fecha de Vencimiento</label>
                                    <input type="date" value={subscriptionForm.subscriptionEnd} onChange={e => setSubscriptionForm(p=>({...p,subscriptionEnd:e.target.value}))}
                                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">Ciclo de Facturación</label>
                                    <select value={subscriptionForm.billingCycle} onChange={e => setSubscriptionForm(p=>({...p,billingCycle:e.target.value}))}
                                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                                      <option value="monthly">Mensual</option>
                                      <option value="annual">Anual</option>
                                      <option value="quarterly">Trimestral</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">Notas (internas)</label>
                                    <input value={subscriptionForm.subscriptionNotes} onChange={e => setSubscriptionForm(p=>({...p,subscriptionNotes:e.target.value}))}
                                      placeholder="Pago recibido vía transferencia..."
                                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                                  </div>
                                </div>
                                {/* Quick renew buttons */}
                                <div>
                                  <p className="text-xs font-medium text-slate-700 mb-2">Renovación Rápida (desde hoy):</p>
                                  <div className="flex gap-2 flex-wrap">
                                    {[1, 3, 6, 12].map(m => (
                                      <button key={m} onClick={() => handleRenew(t.id, m)}
                                        className="text-xs px-3 py-1.5 border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors font-medium">
                                        +{m} {m === 1 ? 'mes' : 'meses'}
                                        {m === 12 && ' (anual)'}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={() => handleSaveSubscription(t.id)}>Guardar Cambios</Button>
                                  <Button size="sm" variant="ghost" onClick={() => setEditingSubscription(null)}>Cancelar</Button>
                                </div>
                              </div>
                            ) : (
                              /* ── SUBSCRIPTION DETAIL VIEW ── */
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Subscription info */}
                                <div>
                                  <h4 className="text-xs font-semibold text-slate-500 uppercase mb-3 flex items-center gap-1.5">
                                    <CreditCard className="w-3.5 h-3.5"/>Suscripción
                                  </h4>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-slate-500">Estado</span>
                                      <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium ${badge.color}`}>{badge.label}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-500">Plan</span>
                                      <span className="font-medium text-slate-800">{t.planName || '—'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-500">Precio</span>
                                      <span className="font-medium text-slate-800">${t.priceMonthly ?? '—'}/mes</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-500">Ciclo</span>
                                      <span className="font-medium text-slate-800 capitalize">{t.billingCycle || 'Mensual'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-500">Inicio</span>
                                      <span className="font-medium text-slate-800">{t.subscriptionStart?.slice(0,10) || '—'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-500">Vencimiento</span>
                                      <span className={`font-medium ${t.daysRemaining !== null && t.daysRemaining < 0 ? 'text-red-600' : t.daysRemaining !== null && t.daysRemaining <= 7 ? 'text-amber-600' : 'text-slate-800'}`}>
                                        {t.subscriptionEnd?.slice(0,10) || '—'}
                                        {t.daysRemaining !== null && t.subscriptionEnd && (
                                          <span className="text-xs ml-1">
                                            ({t.daysRemaining < 0 ? `vencida hace ${Math.abs(t.daysRemaining)}d` : `${t.daysRemaining}d restantes`})
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                    {t.subscriptionNotes && (
                                      <div className="flex justify-between">
                                        <span className="text-slate-500">Notas</span>
                                        <span className="font-medium text-slate-700 text-right max-w-xs">{t.subscriptionNotes}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Plan benefits */}
                                <div>
                                  <h4 className="text-xs font-semibold text-slate-500 uppercase mb-3 flex items-center gap-1.5">
                                    <Info className="w-3.5 h-3.5"/>Beneficios del Plan
                                  </h4>
                                  {plan ? (
                                    <div className="space-y-2 text-sm">
                                      <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                                        <span className="text-slate-600">👥 Cobradores</span>
                                        <span className="font-bold text-slate-800">
                                          {plan.maxCollectors === -1 ? '∞ Ilimitado' : `${t.memberCount} / ${plan.maxCollectors}`}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                                        <span className="text-slate-600">👤 Clientes</span>
                                        <span className="font-bold text-slate-800">
                                          {plan.maxClients === -1 ? '∞ Ilimitado' : `${t.clientCount} / ${plan.maxClients}`}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                                        <span className="text-slate-600">🔑 Usuarios</span>
                                        <span className="font-bold text-slate-800">
                                          {plan.maxUsers === -1 ? '∞ Ilimitado' : `${t.memberCount} / ${plan.maxUsers}`}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between p-2 bg-blue-50 rounded-lg">
                                        <span className="text-blue-700 font-medium">💰 Precio</span>
                                        <span className="font-bold text-blue-800">${plan.priceMonthly}/mes</span>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-sm text-slate-400 italic p-3 bg-slate-50 rounded-lg">
                                      Sin plan asignado. Asigna un plan para ver los beneficios.
                                    </div>
                                  )}
                                  <Button size="sm" className="mt-3 flex items-center gap-1.5" onClick={() => startEditSubscription(t)}>
                                    <Edit2 className="w-3.5 h-3.5"/>Gestionar Suscripción
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </Card>
                    )
                  })}
                </div>
              ) : (
                <EmptyState icon={Building2} title="Sin empresas" description="No hay prestamistas registrados en la plataforma" />
              )}
            </div>
          )}

          {/* ── PLANS ── */}
          {activeTab === 'plans' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div>
                  <h3 className="section-title">Planes de Suscripción</h3>
                  <p className="text-xs text-slate-500 mt-0.5">-1 significa ilimitado · Define qué funciones tiene cada plan</p>
                </div>
                <div className="flex gap-2">
                  {plans.length === 0 && (
                    <Button onClick={handleSeedDefaultPlans} size="sm" variant="outline" className="flex items-center gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                      <RefreshCw className="w-4 h-4"/>Cargar Predeterminados
                    </Button>
                  )}
                  <Button onClick={() => { setShowPlanForm(!showPlanForm); setEditingPlan(null) }} size="sm" className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4"/>Nuevo Plan
                  </Button>
                </div>
              </div>

              {/* Create plan form */}
              {showPlanForm && !editingPlan && (
                <Card className="bg-slate-50 border-blue-200">
                  <h4 className="font-semibold mb-4">Crear Nuevo Plan</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                    <div><label className="block text-xs font-medium text-slate-700 mb-1">Nombre *</label><input value={planForm.name} onChange={e=>setPlanForm(p=>({...p,name:e.target.value}))} placeholder="Plan Básico" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/></div>
                    <div><label className="block text-xs font-medium text-slate-700 mb-1">Slug (URL) *</label><input value={planForm.slug} onChange={e=>setPlanForm(p=>({...p,slug:e.target.value}))} placeholder="basico" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/></div>
                    <div><label className="block text-xs font-medium text-slate-700 mb-1">Precio/mes (USD)</label><input type="number" value={planForm.priceMonthly} onChange={e=>setPlanForm(p=>({...p,priceMonthly:e.target.value}))} placeholder="29.99" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/></div>
                    <div><label className="block text-xs font-medium text-slate-700 mb-1">Máx. Cobradores (-1=∞)</label><input type="number" value={planForm.maxCollectors} onChange={e=>setPlanForm(p=>({...p,maxCollectors:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/></div>
                    <div><label className="block text-xs font-medium text-slate-700 mb-1">Máx. Clientes (-1=∞)</label><input type="number" value={planForm.maxClients} onChange={e=>setPlanForm(p=>({...p,maxClients:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/></div>
                    <div><label className="block text-xs font-medium text-slate-700 mb-1">Máx. Usuarios (-1=∞)</label><input type="number" value={planForm.maxUsers} onChange={e=>setPlanForm(p=>({...p,maxUsers:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/></div>
                    <div><label className="block text-xs font-medium text-slate-700 mb-1">Días de Prueba</label><input type="number" value={planForm.trialDays} onChange={e=>setPlanForm(p=>({...p,trialDays:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/></div>
                    <div className="md:col-span-2"><label className="block text-xs font-medium text-slate-700 mb-1">Descripción</label><input value={planForm.description} onChange={e=>setPlanForm(p=>({...p,description:e.target.value}))} placeholder="Ideal para..." className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/></div>
                    <div className="md:col-span-2 flex items-center gap-2 pt-1">
                      <input type="checkbox" id="create-trial-default" checked={planForm.isTrialDefault} onChange={e=>setPlanForm(p=>({...p,isTrialDefault:e.target.checked}))} className="w-4 h-4 accent-amber-500"/>
                      <label htmlFor="create-trial-default" className="text-sm text-slate-700 font-medium cursor-pointer">Marcar como <span className="text-amber-700">Plan de Prueba</span> (se asigna automáticamente a nuevos registros)</label>
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="block text-xs font-semibold text-slate-700 mb-3">Permisos del plan</label>
                    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                      {Object.entries(PERM_BY_MODULE).map(([module, { label, perms }]) => (
                        <div key={module}>
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</div>
                          <div className="grid grid-cols-2 gap-1">
                            {perms.map(p => {
                              const isOn = planForm.features.includes(p.key as PermKey)
                              return (
                                <button
                                  key={p.key}
                                  type="button"
                                  onClick={() => togglePlanFeature(p.key as PermKey, false)}
                                  className={`flex items-start gap-2 p-2 rounded-lg border text-left text-xs transition-all ${
                                    isOn ? 'bg-blue-50 border-blue-300 text-blue-800' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                                  }`}
                                >
                                  <div className={`mt-0.5 w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${isOn ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                                    {isOn && <svg className="w-2.5 h-2.5 text-white" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor"><path d="M5 13l4 4L19 7"></path></svg>}
                                  </div>
                                  <span className="leading-tight">{p.label}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleCreatePlan} className="flex items-center gap-1"><Save className="w-3.5 h-3.5"/>Crear Plan</Button>
                    <Button size="sm" variant="ghost" onClick={()=>setShowPlanForm(false)}>Cancelar</Button>
                  </div>
                </Card>
              )}

              {/* Edit plan form */}
              {editingPlan && (
                <Card className="bg-amber-50 border-amber-200">
                  <h4 className="font-semibold mb-4 text-amber-900">Editando: {editingPlan.name}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                    <div><label className="block text-xs font-medium text-slate-700 mb-1">Nombre *</label><input value={planEditForm.name} onChange={e=>setPlanEditForm(p=>({...p,name:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/></div>
                    <div><label className="block text-xs font-medium text-slate-700 mb-1">Precio/mes (USD)</label><input type="number" value={planEditForm.priceMonthly} onChange={e=>setPlanEditForm(p=>({...p,priceMonthly:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/></div>
                    <div><label className="block text-xs font-medium text-slate-700 mb-1">Días de Prueba</label><input type="number" value={planEditForm.trialDays} onChange={e=>setPlanEditForm(p=>({...p,trialDays:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/></div>
                    <div><label className="block text-xs font-medium text-slate-700 mb-1">Máx. Cobradores</label><input type="number" value={planEditForm.maxCollectors} onChange={e=>setPlanEditForm(p=>({...p,maxCollectors:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/></div>
                    <div><label className="block text-xs font-medium text-slate-700 mb-1">Máx. Clientes</label><input type="number" value={planEditForm.maxClients} onChange={e=>setPlanEditForm(p=>({...p,maxClients:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/></div>
                    <div><label className="block text-xs font-medium text-slate-700 mb-1">Máx. Usuarios</label><input type="number" value={planEditForm.maxUsers} onChange={e=>setPlanEditForm(p=>({...p,maxUsers:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/></div>
                    <div className="md:col-span-2"><label className="block text-xs font-medium text-slate-700 mb-1">Descripción</label><input value={planEditForm.description} onChange={e=>setPlanEditForm(p=>({...p,description:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/></div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={planEditForm.isActive} onChange={e=>setPlanEditForm(p=>({...p,isActive:e.target.checked}))} className="w-4 h-4"/>
                        <span className="text-sm text-slate-700">Plan activo</span>
                        <span className="mx-3 border-l border-slate-200 h-4"/>
                        <input type="checkbox" id="edit-trial-default" checked={planEditForm.isTrialDefault} onChange={e=>setPlanEditForm(p=>({...p,isTrialDefault:e.target.checked}))} className="w-4 h-4 accent-amber-500"/>
                        <label htmlFor="edit-trial-default" className="text-sm text-amber-700 font-medium cursor-pointer">Plan de Prueba</label>
                      </label>
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="block text-xs font-semibold text-slate-700 mb-3">Permisos del plan</label>
                    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                      {Object.entries(PERM_BY_MODULE).map(([module, { label, perms }]) => (
                        <div key={module}>
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</div>
                          <div className="grid grid-cols-2 gap-1">
                            {perms.map(p => {
                              const isOn = planEditForm.features.includes(p.key as PermKey)
                              return (
                                <button
                                  key={p.key}
                                  type="button"
                                  onClick={() => togglePlanFeature(p.key as PermKey, true)}
                                  className={`flex items-start gap-2 p-2 rounded-lg border text-left text-xs transition-all ${
                                    isOn ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                                  }`}
                                >
                                  <div className={`mt-0.5 w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${isOn ? 'bg-amber-500 border-amber-500' : 'border-slate-300'}`}>
                                    {isOn && <svg className="w-2.5 h-2.5 text-white" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor"><path d="M5 13l4 4L19 7"></path></svg>}
                                  </div>
                                  <span className="leading-tight">{p.label}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSavePlanEdit} className="flex items-center gap-1"><Save className="w-3.5 h-3.5"/>Guardar Cambios</Button>
                    <Button size="sm" variant="ghost" onClick={()=>setEditingPlan(null)}>Cancelar</Button>
                  </div>
                </Card>
              )}

              {plans.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {plans.map(plan => {
                    let features: PermKey[] = []
                    try { features = JSON.parse(plan.features || '[]') as PermKey[] } catch(_) {}
                    return (
                      <Card key={plan.id} className={`relative ${!plan.isActive ? 'opacity-60' : ''} ${editingPlan?.id === plan.id ? 'ring-2 ring-amber-400' : ''}`}>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-bold text-slate-800 text-lg">{plan.name}</h4>
                              {plan.isTrialDefault ? (
                                <span className="text-xs bg-amber-100 text-amber-700 border border-amber-300 px-2 py-0.5 rounded-full font-semibold">Plan de Prueba</span>
                              ) : null}
                            </div>
                            <p className="text-2xl font-bold text-blue-700">${plan.priceMonthly}<span className="text-sm text-slate-500 font-normal">/mes</span></p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${plan.isActive?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-500'}`}>
                              {plan.isActive?'Activo':'Inactivo'}
                            </span>
                            <div className="flex gap-1">
                              <button onClick={() => startEditPlan(plan)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors" title="Editar plan">
                                <Edit2 className="w-3.5 h-3.5"/>
                              </button>
                              <button onClick={() => handleDeletePlan(plan)} disabled={!!plan.isTrialDefault} className={`p-1.5 rounded transition-colors ${plan.isTrialDefault ? "text-slate-200 cursor-not-allowed" : "text-slate-400 hover:text-red-600 hover:bg-red-50"}`} title={plan.isTrialDefault ? "El Plan Trial no puede eliminarse" : "Eliminar plan"}>
                                <Trash2 className="w-3.5 h-3.5"/>
                              </button>
                            </div>
                          </div>
                        </div>
                        {plan.description && <p className="text-xs text-slate-500 mb-2 italic">{plan.description}</p>}
                        <div className="space-y-1 text-sm text-slate-600 mb-3">
                          <p>👥 Cobradores: <strong>{plan.maxCollectors === -1 ? '∞ Ilimitado' : plan.maxCollectors}</strong></p>
                          <p>👤 Clientes: <strong>{plan.maxClients === -1 ? '∞ Ilimitado' : plan.maxClients}</strong></p>
                          <p>🔑 Usuarios: <strong>{plan.maxUsers === -1 ? '∞ Ilimitado' : plan.maxUsers}</strong></p>
                          <p>⏱️ Prueba gratis: <strong>{plan.trialDays ?? 10} días</strong></p>
                        </div>
                        {features.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-slate-500 mb-1.5">
                              {features.length} permisos configurados
                              {Object.entries(PERM_BY_MODULE).map(([mod, { label, perms }]) => {
                                const count = perms.filter(p => features.includes(p.key as PermKey)).length
                                if (count === 0) return null
                                return <span key={mod} className="ml-1 inline-block bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-xs">{label}: {count}</span>
                              })}
                            </p>
                          </div>
                        )}
                        <p className="text-xs text-slate-400 mt-2 font-mono">/{plan.slug}</p>
                      </Card>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <CreditCard className="w-12 h-12 text-slate-300 mx-auto mb-3"/>
                  <p className="text-slate-600 font-medium mb-1">Sin planes configurados</p>
                  <p className="text-sm text-slate-400 mb-4">Carga los planes predeterminados o crea uno nuevo</p>
                  <div className="flex gap-2 justify-center">
                    <Button onClick={handleSeedDefaultPlans} className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4"/>Cargar Planes Predeterminados
                    </Button>
                    <Button variant="outline" onClick={() => setShowPlanForm(true)}>Crear Plan Manual</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── USERS ── */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="section-title">Usuarios de Plataforma ({platformUsers.length})</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Gestiona roles de acceso a nivel de plataforma</p>
                </div>
                <Button onClick={() => loadData('users')} size="sm" variant="outline" className="flex items-center gap-1">
                  <RefreshCw className="w-4 h-4"/>Actualizar
                </Button>
              </div>
              {platformUsers.length > 0 ? (
                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">Usuario</th>
                        <th className="text-center py-3 px-4 font-semibold text-slate-700">Empresas</th>
                        <th className="text-center py-3 px-4 font-semibold text-slate-700">Último acceso</th>
                        <th className="text-center py-3 px-4 font-semibold text-slate-700">Rol Plataforma</th>
                        <th className="text-center py-3 px-4 font-semibold text-slate-700">Estado</th>
                        <th className="text-center py-3 px-4 font-semibold text-slate-700">Cambiar Rol</th>
                        <th className="text-center py-3 px-4 font-semibold text-slate-700">Acciones</th>
                      </tr></thead>
                      <tbody>{platformUsers.map(u => (
                        <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-800">{u.fullName}</div>
                            <div className="text-xs text-slate-500">{u.email}</div>
                          </td>
                          <td className="py-3 px-4 text-center text-slate-600">{u.tenantCount}</td>
                          <td className="py-3 px-4 text-center text-xs text-slate-500">{u.lastLogin ? formatDate(u.lastLogin) : 'Nunca'}</td>
                          <td className="py-3 px-4 text-center">
                            {u.platformRole === 'admin' ? (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                <Crown className="w-3 h-3"/>Admin
                              </span>
                            ) : u.platformRole === 'support' ? (
                              <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                                <ShieldCheck className="w-3 h-3"/>Soporte
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">Sin rol</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {u.isActive ? (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3"/>Activo</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3"/>Inactivo</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <select
                              value={u.platformRole || 'none'}
                              onChange={e => handleSetRole(u.id, e.target.value)}
                              className="px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
                              <option value="none">Sin rol</option>
                              <option value="support">Soporte</option>
                              <option value="admin">Administrador</option>
                            </select>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center gap-1 justify-center flex-wrap">
                              <button
                                onClick={() => handleToggleActive(u.id, u.isActive)}
                                disabled={isTogglingActive === u.id}
                                title={u.isActive ? 'Bloquear usuario' : 'Desbloquear usuario'}
                                className={`inline-flex items-center gap-1 px-2 py-1 text-xs border rounded-lg transition-colors ${u.isActive ? 'text-red-700 bg-red-50 hover:bg-red-100 border-red-200' : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'}`}>
                                {u.isActive ? <Lock className="w-3 h-3"/> : <Unlock className="w-3 h-3"/>}
                                {u.isActive ? 'Bloquear' : 'Desbloquear'}
                              </button>
                              <button
                                onClick={() => handleOpenPermissions(u)}
                                title="Gestionar permisos"
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors">
                                <Settings2 className="w-3 h-3"/>Permisos
                              </button>
                              <button
                                onClick={() => { setResetPwModal({ userId: u.id, userName: u.fullName }); setResetPwValue(''); setShowResetPw(false) }}
                                title="Resetear contraseña"
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg transition-colors">
                                <KeyRound className="w-3 h-3"/>Reset pwd
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </Card>
              ) : (
                <EmptyState icon={Users2} title="Sin usuarios" description="No hay usuarios registrados" />
              )}
            </div>
          )}

          {/* ── LOGS ── */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="section-title">Log de Cambios de Usuarios</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Registro de acciones realizadas por usuarios en el sistema</p>
                </div>
                <Button onClick={() => loadData('logs')} size="sm" variant="outline" className="flex items-center gap-1">
                  <RefreshCw className="w-4 h-4"/>Actualizar
                </Button>
              </div>
              {auditLogs.length > 0 ? (
                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left py-3 px-4 font-semibold text-slate-700 text-xs">Acción</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-700 text-xs">Descripción</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-700 text-xs">Usuario</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-700 text-xs">Empresa</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-700 text-xs">Fecha</th>
                      </tr></thead>
                      <tbody>
                        {auditLogs.map((log, i) => {
                          const actionInfo = ACTION_LABELS[log.action] || { label: log.action, color: 'bg-slate-100 text-slate-600' }
                          const tenant = tenants.find(t => t.id === log.tenantId)
                          return (
                            <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="py-2.5 px-4">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${actionInfo.color}`}>{actionInfo.label}</span>
                              </td>
                              <td className="py-2.5 px-4 text-slate-700 max-w-xs">
                                <p className="truncate text-xs">{log.description}</p>
                              </td>
                              <td className="py-2.5 px-4">
                                <p className="text-xs font-medium text-slate-700">{log.userName}</p>
                                {log.userEmail && <p className="text-xs text-slate-400">{log.userEmail}</p>}
                              </td>
                              <td className="py-2.5 px-4 text-xs text-slate-500">{tenant?.name || (log.tenantId ? '—' : 'Plataforma')}</td>
                              <td className="py-2.5 px-4 text-xs text-slate-400 whitespace-nowrap">{log.createdAt?.slice(0,16).replace('T',' ')}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ) : (
                <EmptyState icon={ClipboardList} title="Sin registros" description="Aún no hay actividad registrada en el sistema. Los logs se generarán conforme los usuarios realicen acciones." />
              )}
            </div>
          )}

          {/* ── BACKUP ── */}
          {activeTab === 'backup' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="section-title">Sistema de Respaldo (Backup)</h3>
                  <p className="text-sm text-slate-500 mt-1">Realiza y gestiona copias de seguridad de la base de datos</p>
                </div>
                <Button onClick={handleCreateBackup} disabled={isBackingUp} className="flex items-center gap-2">
                  <Database className="w-4 h-4"/>
                  {isBackingUp ? 'Creando backup...' : 'Crear Backup Ahora'}
                </Button>
              </div>

              <Card className="bg-blue-50 border-blue-200">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5"/>
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">Información del sistema de backup</p>
                    <p>Los backups se guardan en el servidor en la carpeta <code>backups/</code>. Se recomienda realizar un backup antes de actualizaciones mayores y al menos una vez por semana.</p>
                  </div>
                </div>
              </Card>

              {backups.length > 0 ? (
                <Card>
                  <h4 className="font-semibold mb-4">Backups disponibles ({backups.length})</h4>
                  <div className="space-y-2">
                    {backups.map((b, i) => (
                      <div key={i} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                        <div className="flex items-center gap-3">
                          <Database className="w-4 h-4 text-slate-400"/>
                          <div>
                            <p className="text-sm font-medium text-slate-700 font-mono">{b.filename}</p>
                            <p className="text-xs text-slate-500">{formatDate(b.createdAt)} · {formatBytes(b.size)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {i === 0 && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Más reciente</span>}
                          <span className="text-xs text-slate-500">{formatBytes(b.size)}</span>
                          <button
                            onClick={() => handleDeleteBackup(b.filename)}
                            disabled={isDeletingBackup === b.filename}
                            title="Eliminar backup"
                            className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {isDeletingBackup === b.filename
                              ? <span className="text-xs">...</span>
                              : <Trash2 className="w-4 h-4"/>
                            }
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              ) : (
                <EmptyState icon={Database} title="Sin backups" description="Crea tu primer backup de la base de datos" action={{label:'Crear Backup',onClick:handleCreateBackup}} />
              )}

              {/* ── Limpieza de Datos por Empresa ── */}
              {userPlatformRole === 'platform_owner' && (
                <div className="mt-8 space-y-4">
                  <div>
                    <h3 className="section-title text-red-700">Limpieza de Datos por Empresa</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      Elimina toda la data operacional de una empresa (préstamos, clientes, pagos, contratos, etc.) sin borrar la cuenta ni el plan.
                      Útil para empresas inactivas por más de 2 años.
                    </p>
                  </div>

                  <Card className="border-red-200 bg-red-50">
                    <div className="flex gap-3">
                      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"/>
                      <div className="text-sm text-red-800">
                        <p className="font-semibold mb-1">⚠️ Acción irreversible</p>
                        <p>Esta acción elimina permanentemente todos los datos operacionales de la empresa seleccionada. Se recomienda realizar un backup antes de proceder. Los datos de la cuenta (plan, suscripción) se conservan.</p>
                      </div>
                    </div>
                  </Card>

                  {tenants.length > 0 ? (
                    <Card>
                      <h4 className="font-semibold mb-4 text-slate-700">Empresas registradas</h4>
                      <div className="space-y-2">
                        {tenants.map(t => (
                          <div key={t.id} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                                <span className="text-xs font-bold text-slate-600">{t.name?.charAt(0).toUpperCase()}</span>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-slate-800">{t.name}</p>
                                <p className="text-xs text-slate-500">{t.email} · Plan: {plans.find(p => p.id === t.planId)?.name || 'Sin plan'} · {t.subscriptionStatus}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => { setPurgeModal({ tenantId: t.id, tenantName: t.name }); setPurgeConfirmName('') }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 transition-colors border border-red-200"
                            >
                              <Trash2 className="w-3.5 h-3.5"/>
                              Borrar datos
                            </button>
                          </div>
                        ))}
                      </div>
                    </Card>
                  ) : (
                    <Card>
                      <p className="text-sm text-slate-500 text-center py-4">No hay empresas registradas aún.</p>
                    </Card>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── MODAL: Nueva Empresa ── */}
      {showNewTenantModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowNewTenantModal(false) }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-100 rounded-lg">
                  <Building2 className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Nueva Empresa Prestamista</h3>
                  <p className="text-xs text-slate-500">Crea una nueva empresa con su administrador</p>
                </div>
              </div>
              <button onClick={() => setShowNewTenantModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-5">
              {/* Empresa section */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />Datos de la Empresa
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Nombre de la Empresa *</label>
                    <input value={newTenantForm.name} onChange={e => setNewTenantForm(p=>({...p,name:e.target.value}))}
                      placeholder="Ej: Prestamos Rápidos S.A."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                      <input type="email" value={newTenantForm.email} onChange={e => setNewTenantForm(p=>({...p,email:e.target.value}))}
                        placeholder="empresa@email.com"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Teléfono</label>
                      <input value={newTenantForm.phone} onChange={e => setNewTenantForm(p=>({...p,phone:e.target.value}))}
                        placeholder="809-000-0000"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Moneda</label>
                      <select value={newTenantForm.currency} onChange={e => setNewTenantForm(p=>({...p,currency:e.target.value}))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]">
                        <option value="DOP">DOP — Peso Dominicano</option>
                        <option value="USD">USD — Dólar Americano</option>
                        <option value="EUR">EUR — Euro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Plan</label>
                      <select value={newTenantForm.planId} onChange={e => setNewTenantForm(p=>({...p,planId:e.target.value}))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]">
                        <option value="">Sin plan específico</option>
                        {plans.map(plan => (
                          <option key={plan.id} value={plan.id}>{plan.name} — {formatCurrency(plan.priceMonthly)}/mes</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-1.5 pt-2 border-t border-slate-100">
                  <Users2 className="w-3.5 h-3.5" />Administrador de la Empresa
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Nombre completo *</label>
                    <input value={newTenantForm.adminName} onChange={e => setNewTenantForm(p=>({...p,adminName:e.target.value}))}
                      placeholder="Nombre del administrador"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Email *</label>
                    <input type="email" value={newTenantForm.adminEmail} onChange={e => setNewTenantForm(p=>({...p,adminEmail:e.target.value}))}
                      placeholder="admin@empresa.com"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Contraseña *</label>
                    <div className="relative">
                      <input
                        type={showAdminPassword ? 'text' : 'password'}
                        value={newTenantForm.adminPassword}
                        onChange={e => setNewTenantForm(p=>({...p,adminPassword:e.target.value}))}
                        placeholder="Mínimo 8 caracteres"
                        className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" />
                      <button type="button" onClick={() => setShowAdminPassword(v=>!v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 p-5 border-t border-slate-200">
                <Button variant="outline" onClick={() => setShowNewTenantModal(false)}>Cancelar</Button>
                <Button onClick={handleCreateTenant} disabled={isCreatingTenant} className="flex items-center gap-2">
                  {isCreatingTenant ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Plus className="w-4 h-4"/>}
                  {isCreatingTenant ? 'Creando...' : 'Crear Empresa'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Reset Password ── */}

      {/* ── Permissions Modal ── */}
      {permModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <Card className="w-full max-w-2xl my-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="section-title flex items-center gap-2"><Settings2 className="w-4 h-4"/> Gestionar Permisos</h2>
                <p className="text-xs text-slate-500 mt-0.5">{permModal.userName}</p>
              </div>
              <button onClick={() => setPermModal(null)} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5"/></button>
            </div>

            {permMemberships.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">Este usuario no pertenece a ninguna empresa.</p>
            ) : (
              <div className="space-y-4">
                {/* Tenant selector */}
                {permMemberships.length > 1 && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Empresa</label>
                    <select
                      value={permSelectedTenant}
                      onChange={e => handleSelectPermTenant(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {permMemberships.map((m: any) => (
                        <option key={m.tenantId} value={m.tenantId}>{m.tenantName}</option>
                      ))}
                    </select>
                  </div>
                )}
                {permMemberships.length === 1 && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg text-sm text-slate-700">
                    <Building2 className="w-4 h-4 text-slate-400"/>
                    <span className="font-medium">{permMemberships[0].tenantName}</span>
                  </div>
                )}

                {/* Role selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Rol en la Empresa</label>
                  <select
                    value={permRole}
                    onChange={e => setPermRole(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="admin">Administrador</option>
                    <option value="official">Oficial</option>
                    <option value="collector">Cobrador</option>
                  </select>
                </div>

                {/* Permissions by module */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Permisos Granulares</label>
                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {Object.entries(PERM_BY_MODULE).map(([mod, { label: modLabel, perms }]) => (
                      <div key={mod} className="border border-slate-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-slate-700 mb-2">{modLabel}</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {perms.map(def => {
                            const val = permExplicit[def.key as PermKey]
                            return (
                              <label key={def.key} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={val === true}
                                  onChange={e => setPermExplicit(prev => ({ ...prev, [def.key]: e.target.checked }))}
                                  className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className={val === false ? 'line-through text-slate-400' : 'text-slate-700'}>
                                  {def.label}
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="secondary" className="flex-1" onClick={() => setPermModal(null)}>Cancelar</Button>
                  <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleSavePermissions} disabled={isSavingPerm}>
                    {isSavingPerm ? 'Guardando...' : '✓ Guardar Permisos'}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
      {resetPwModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-orange-600"/>
                <h3 className="font-bold text-slate-900">Resetear Contraseña</h3>
              </div>
              <button onClick={() => { setResetPwModal(null); setResetPwValue('') }}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
                <X className="w-4 h-4"/>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600">Nueva contraseña para <strong>{resetPwModal.userName}</strong></p>
              <div className="relative">
                <input
                  type={showResetPw ? 'text' : 'password'}
                  value={resetPwValue}
                  onChange={e => setResetPwValue(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" />
                <button type="button" onClick={() => setShowResetPw(v=>!v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showResetPw ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-slate-200">
              <Button variant="outline" onClick={() => { setResetPwModal(null); setResetPwValue('') }}>Cancelar</Button>
              <Button onClick={handleAdminResetPassword} disabled={isResettingPw} className="flex items-center gap-2">
                {isResettingPw ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
                {isResettingPw ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Confirmar Purga de Datos de Empresa ── */}
      {purgeModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-red-200 bg-red-50 rounded-t-xl">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-red-100 rounded-lg">
                  <Trash2 className="w-5 h-5 text-red-700"/>
                </div>
                <div>
                  <h3 className="font-bold text-red-900">Borrar Datos de Empresa</h3>
                  <p className="text-xs text-red-600">Esta acción es permanente e irreversible</p>
                </div>
              </div>
              <button onClick={() => { setPurgeModal(null); setPurgeConfirmName('') }}
                className="p-1.5 hover:bg-red-100 rounded-lg text-red-500">
                <X className="w-4 h-4"/>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-800 font-medium mb-1">Se eliminarán TODOS los datos de:</p>
                <p className="text-base font-bold text-red-900">"{purgeModal.tenantName}"</p>
                <p className="text-xs text-red-700 mt-2">Incluyendo: préstamos, clientes, pagos, recibos, contratos, cobranzas, productos, cuentas bancarias, plantillas, mensajes de WhatsApp y logs de auditoría.</p>
                <p className="text-xs text-red-700 mt-1 font-medium">Se conservará: la cuenta de la empresa, su plan y configuración de suscripción.</p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">
                  Escribe el nombre exacto de la empresa para confirmar:
                </label>
                <input
                  type="text"
                  value={purgeConfirmName}
                  onChange={e => setPurgeConfirmName(e.target.value)}
                  placeholder={purgeModal.tenantName}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                  autoFocus
                />
                <p className="text-xs text-slate-500 mt-1">Debe coincidir exactamente (mayúsculas y minúsculas)</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-slate-200">
              <Button variant="outline" onClick={() => { setPurgeModal(null); setPurgeConfirmName('') }} disabled={isPurging}>
                Cancelar
              </Button>
              <button
                onClick={handlePurgeTenantData}
                disabled={isPurging || purgeConfirmName.trim().toLowerCase() !== purgeModal.tenantName.trim().toLowerCase()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPurging ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Trash2 className="w-4 h-4"/>}
                {isPurging ? 'Eliminando...' : 'Confirmar y Borrar Todo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PlatformAdminPage

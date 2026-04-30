import React, { useState, useEffect, useCallback, useContext } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { TenantContext } from '@/contexts/TenantContext'
import { PERM_BY_MODULE, PERM_DEFS, PermKey, PERM_REQUIRES_FEATURE, planAllowsPermission } from '@/lib/permissions'
import { usePermission } from '@/hooks/usePermission'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { PageLoadingState } from '@/components/ui/Loading'
import EmptyState from '@/components/ui/EmptyState'
import {
  Settings, Building2, Users2, Package, FileText, Landmark,
  Plus, Trash2, Edit2, X, CheckCircle, XCircle, Save, Eye, KeyRound, Lock, Unlock,
  CreditCard, AlertCircle, Calendar, TrendingUp, Star, ArrowLeftRight, Upload, Image,
  Shield, ShieldCheck, ShieldX, ToggleLeft, ToggleRight
} from 'lucide-react'
import { SUPPORTED_CURRENCIES } from '@/lib/utils'
import api, { isAccessDenied } from '@/lib/api'
import toast from 'react-hot-toast'

// ─── Interfaces ───────────────────────────────────────────────────
interface TenantData { name: string; email: string; phone: string; address: string; currency: string; scoreMode: string; signatureMode: string; rnc: string; representativeName: string; logoUrl: string; signatureUrl: string; city: string; notaryName: string; notaryCollegiateNumber: string; notaryOfficeAddress: string; acreedorIdNumber: string; testigo1Nombre: string; testigo1Id: string; testigo1Domicilio: string; testigo2Nombre: string; testigo2Id: string; testigo2Domicilio: string }
interface SettingsData { moraRateDaily: number; moraGraceDays: number; rebateEnabled: number; rebateType: string; moraBase: string; moraFixedEnabled: number; moraFixedAmount: number }
interface CurrencySettings { multiCurrencyEnabled: boolean; enabledCurrencies: string[] }
interface LoanProduct { id: string; name: string; code: string; type: string; rate: number; minTerm: number; maxTerm: number; isActive: number; paymentFrequency: string; amortizationType: string; minAmount: number; maxAmount: number }
interface Member { id: string; userId: string; fullName: string; email: string; roles: string; isActive: number; userActive: number; branchId: string | null; lastLogin: string | null }
interface Branch { id: string; name: string; address: string; phone: string; isActive: number }
interface BankAccount { id: string; bankName: string; accountNumber: string; accountType: string; accountHolder: string; currency: string; isActive: number; initialBalance: number; currentBalance: number; loanedBalance: number }
interface ContractTemplate { id: string; name: string; type: string; body: string; isDefault: number; version: number }
interface AccountTransfer { id: string; fromAccountId: string; toAccountId: string; fromBankName: string; toBankName: string; amount: number; notes: string; createdAt: string; transferredAt?: string; transferred_at?: string }

const TABS = [
  { id: 'general',       label: 'General',           icon: Settings,  path: '/settings',              perm: 'settings.general' as const },
  { id: 'branches',      label: 'Sucursales',         icon: Building2, path: '/settings/branches',     perm: 'settings.branches' as const },
  { id: 'users',         label: 'Usuarios',           icon: Users2,    path: '/settings/users',        perm: 'settings.users' as const },
  { id: 'products',      label: 'Productos',          icon: Package,   path: '/settings/products',     perm: 'settings.products' as const },
  { id: 'bank_accounts', label: 'Cuentas Bancarias',  icon: Landmark,  path: '/settings/bank-accounts', perm: 'settings.bank_accounts' as const },
  { id: 'templates',     label: 'Plantillas',         icon: FileText,  path: '/templates',             perm: 'templates.view' as const },
  { id: 'subscription',  label: 'Mi Suscripción',     icon: CreditCard, path: '/settings/subscription', perm: 'settings.general' as const },
]

const PATH_TO_TAB: Record<string, string> = {
  '/settings': 'general',
  '/settings/products': 'products',
  '/settings/users': 'users',
  '/settings/branches': 'branches',
  '/settings/bank-accounts': 'bank_accounts',
  '/templates': 'templates',
  '/settings/subscription': 'subscription',
}

const BANKS_DR = ['BHD Banco', 'Banco Popular', 'Banco Qik', 'BanReservas', 'Banco Santa Cruz', 'Banesco', 'Scotiabank', 'Citibank', 'Bancamérica', 'Banco Caribe', 'Otro']

// ─── Role hierarchy helpers ──────────────────────────────────────────────────
const ROLE_LEVEL: Record<string, number> = {
  tenant_owner: 4,
  admin: 3,
  prestamista: 2, oficial: 2, cashier: 2, loan_officer: 2,
  cobrador: 1, collector: 1,
}
const maxLevel = (roles: string[]) => Math.max(0, ...roles.map(r => ROLE_LEVEL[r] ?? 0))
const parseRoles = (rolesStr: string): string[] => { try { return JSON.parse(rolesStr || '[]') } catch(_) { return [] } }

const SettingsPage: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { state: tenantState } = useContext(TenantContext)
  const activeTab = PATH_TO_TAB[location.pathname] || 'general'
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // General
  const [tenant, setTenant] = useState<TenantData>({ name: '', email: '', phone: '', address: '', currency: 'DOP', scoreMode: 'global', signatureMode: 'physical', rnc: '', representativeName: '', logoUrl: '', signatureUrl: '', city: '', notaryName: '', notaryCollegiateNumber: '', notaryOfficeAddress: '', acreedorIdNumber: '', testigo1Nombre: '', testigo1Id: '', testigo1Domicilio: '', testigo2Nombre: '', testigo2Id: '', testigo2Domicilio: '' })
  const [moraSettings, setMoraSettings] = useState<SettingsData>({ moraRateDaily: 0.001, moraGraceDays: 3, rebateEnabled: 1, rebateType: 'proportional', moraBase: 'cuota_vencida', moraFixedEnabled: 0, moraFixedAmount: 0 })
  const [currencySettings, setCurrencySettings] = useState<CurrencySettings>({ multiCurrencyEnabled: false, enabledCurrencies: ['DOP'] })
  const [isSavingCurrencies, setIsSavingCurrencies] = useState(false)

  // Products
  const [products, setProducts] = useState<LoanProduct[]>([])
  const [showProductForm, setShowProductForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<LoanProduct | null>(null)
  const [newProduct, setNewProduct] = useState({ name:'', code:'', description:'', type:'personal', minAmount:'', maxAmount:'', minTerm:'', maxTerm:'', interestRate:'', paymentFrequency:'monthly', amortizationType:'fixed_installment' })

  // Users
  const [members, setMembers] = useState<Member[]>([])
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email:'', fullName:'', roles:'["cobrador"]' })
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [resetPasswordResult, setResetPasswordResult] = useState<{name: string, password: string} | null>(null)
  // Permissions modal
  const [permMember, setPermMember] = useState<Member | null>(null)
  const [permExplicit, setPermExplicit] = useState<Record<string, boolean>>({})
  const [permEffective, setPermEffective] = useState<string[]>([])
  const [permRoles, setPermRoles] = useState<string[]>([])
  const [planFeatures, setPlanFeatures] = useState<string[]>([])
  const [isSavingPerms, setIsSavingPerms] = useState(false)
  const { isAdmin: currentUserIsAdmin, can } = usePermission()

  // Branches
  const [branches, setBranches] = useState<Branch[]>([])
  const [showBranchForm, setShowBranchForm] = useState(false)
  const [newBranch, setNewBranch] = useState({ name:'', address:'', phone:'' })

  // Bank Accounts
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [showBankForm, setShowBankForm] = useState(false)
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null)
  const [bankForm, setBankForm] = useState({ bankName:'', accountNumber:'', accountType:'checking', accountHolder:'', currency:'DOP', initialBalance:'0' })
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [transfers, setTransfers] = useState<AccountTransfer[]>([])
  const [transferForm, setTransferForm] = useState({ fromAccountId:'', toAccountId:'', amount:'', notes:'', exchangeRate:'' })
  const [isTransferring, setIsTransferring] = useState(false)
  const [transferAccountFilter, setTransferAccountFilter] = useState<string>('all')

  // Templates
  const [templates, setTemplates] = useState<ContractTemplate[]>([])
  const [editingTemplate, setEditingTemplate] = useState<ContractTemplate | null>(null)
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [templateForm, setTemplateForm] = useState({ name:'', type:'personal', body:'', isDefault: false })
  const [isLoadingDefaultTpl, setIsLoadingDefaultTpl] = useState(false)

  // Subscription
  const [subscriptionData, setSubscriptionData] = useState<any>(null)

  const loadTab = useCallback(async (tab: string) => {
    setIsLoading(true)
    try {
      if (tab === 'general') {
        const res = await api.get('/settings')
        const d = res.data
        if (d.tenant) {
          setTenant({
            name: d.tenant.name || '',
            email: d.tenant.email || '',
            phone: d.tenant.phone || '',
            address: d.tenant.address || '',
            currency: d.tenant.currency || 'DOP',
            scoreMode: d.tenant.scoreMode || 'global',
            signatureMode: d.tenant.signatureMode || 'physical',
            rnc: d.tenant.rnc || '',
            representativeName: d.tenant.representativeName || '',
            logoUrl: d.tenant.logoUrl || '',
            signatureUrl: d.tenant.signatureUrl || '',
            city: d.tenant.city || '',
            notaryName: d.tenant.notaryName || '',
            notaryCollegiateNumber: d.tenant.notaryCollegiateNumber || '',
            notaryOfficeAddress: d.tenant.notaryOfficeAddress || '',
            acreedorIdNumber: d.tenant.acreedorIdNumber || '',
            testigo1Nombre: d.tenant.testigo1Nombre || '',
            testigo1Id: d.tenant.testigo1Id || '',
            testigo1Domicilio: d.tenant.testigo1Domicilio || '',
            testigo2Nombre: d.tenant.testigo2Nombre || '',
            testigo2Id: d.tenant.testigo2Id || '',
            testigo2Domicilio: d.tenant.testigo2Domicilio || '',
          })
        }
        if (d.settings) {
          setMoraSettings({
            moraRateDaily: d.settings.moraRateDaily ?? 0.001,
            moraGraceDays: d.settings.moraGraceDays ?? 3,
            rebateEnabled: d.settings.rebateEnabled ?? 1,
            rebateType: d.settings.rebateType || 'proportional',
            moraBase: d.settings.moraBase || 'cuota_vencida',
            moraFixedEnabled: d.settings.moraFixedEnabled ?? 0,
            moraFixedAmount: d.settings.moraFixedAmount ?? 0,
          })
          const rawCurrencies = d.settings.enabledCurrencies || d.settings.enabled_currencies
          const parsedCurrencies: string[] = (() => {
            try { return JSON.parse(rawCurrencies || '["DOP"]') } catch(_) { return ['DOP'] }
          })()
          setCurrencySettings({
            multiCurrencyEnabled: !!(d.settings.multiCurrencyEnabled || d.settings.multi_currency_enabled),
            enabledCurrencies: parsedCurrencies.length ? parsedCurrencies : ['DOP'],
          })
        }
      } else if (tab === 'products') {
        const res = await api.get('/products')
        setProducts(Array.isArray(res.data) ? res.data : [])
      } else if (tab === 'users') {
        const res = await api.get('/settings/users')
        setMembers(Array.isArray(res.data) ? res.data : [])
      } else if (tab === 'branches') {
        const res = await api.get('/settings/branches')
        setBranches(Array.isArray(res.data) ? res.data : [])
      } else if (tab === 'bank_accounts') {
        const [accRes, trfRes] = await Promise.all([
          api.get('/settings/bank-accounts'),
          api.get('/settings/bank-accounts/transfers').catch(()=>({data:[]}))
        ])
        setBankAccounts(Array.isArray(accRes.data) ? accRes.data : [])
        setTransfers(Array.isArray(trfRes.data) ? trfRes.data : [])
      } else if (tab === 'templates') {
        const res = await api.get('/settings')
        setTemplates(Array.isArray(res.data.templates) ? res.data.templates : [])
      } else if (tab === 'subscription') {
        const res = await api.get('/admin/my-subscription')
        setSubscriptionData(res.data)
      }
    } catch (err: any) {
      if (!isAccessDenied(err)) toast.error('Error cargando datos')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { loadTab(activeTab) }, [activeTab, loadTab])

  // ─── GENERAL SAVE ────────────────────────────────────────────────
  const handleSaveGeneral = async () => {
    setIsSaving(true)
    try {
      await api.put('/settings/tenant', {
        name: tenant.name,
        email: tenant.email,
        phone: tenant.phone,
        address: tenant.address,
        currency: tenant.currency,
        scoreMode: tenant.scoreMode,
        signatureMode: tenant.signatureMode,
        rnc: tenant.rnc || null,
        representativeName: tenant.representativeName || null,
        city: tenant.city || null,
        notaryName: tenant.notaryName || null,
        notaryCollegiateNumber: tenant.notaryCollegiateNumber || null,
        notaryOfficeAddress: tenant.notaryOfficeAddress || null,
        acreedorIdNumber: tenant.acreedorIdNumber || null,
        testigo1Nombre: tenant.testigo1Nombre || null,
        testigo1Id: tenant.testigo1Id || null,
        testigo1Domicilio: tenant.testigo1Domicilio || null,
        testigo2Nombre: tenant.testigo2Nombre || null,
        testigo2Id: tenant.testigo2Id || null,
        testigo2Domicilio: tenant.testigo2Domicilio || null,
      })
      await api.put('/settings/mora', {
        moraRateDaily: moraSettings.moraRateDaily,
        moraGraceDays: moraSettings.moraGraceDays,
        rebateEnabled: moraSettings.rebateEnabled,
        rebateType: moraSettings.rebateType,
        moraBase: moraSettings.moraBase,
        moraFixedEnabled: moraSettings.moraFixedEnabled,
        moraFixedAmount: moraSettings.moraFixedAmount,
      })
      toast.success('Configuración guardada exitosamente')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al guardar configuración')
    } finally {
      setIsSaving(false)
    }
  }

  // ─── CURRENCIES ──────────────────────────────────────────────────
  const handleSaveCurrencies = async () => {
    setIsSavingCurrencies(true)
    try {
      await api.put('/settings/currencies', {
        multi_currency_enabled: currencySettings.multiCurrencyEnabled,
        enabled_currencies: currencySettings.enabledCurrencies,
      })
      toast.success('Configuración de monedas guardada')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al guardar monedas')
    } finally {
      setIsSavingCurrencies(false)
    }
  }

  const toggleCurrency = (code: string) => {
    if (code === 'DOP') return // DOP siempre activa
    setCurrencySettings(prev => ({
      ...prev,
      enabledCurrencies: prev.enabledCurrencies.includes(code)
        ? prev.enabledCurrencies.filter(c => c !== code)
        : [...prev.enabledCurrencies, code],
    }))
  }

  // ─── PRODUCTS ────────────────────────────────────────────────────
  const startEditProduct = (p: LoanProduct) => {
    setEditingProduct(p)
    setNewProduct({
      name: p.name, code: p.code, description: '', type: p.type,
      minAmount: String(p.minAmount), maxAmount: String(p.maxAmount),
      minTerm: String(p.minTerm), maxTerm: String(p.maxTerm),
      interestRate: String(p.rate), paymentFrequency: p.paymentFrequency,
      amortizationType: p.amortizationType,
    })
    setShowProductForm(true)
  }

  const handleAddProduct = async () => {
    if (!newProduct.name || !newProduct.code) return toast.error('Nombre y código son requeridos')
    const payload = {
      name: newProduct.name, code: newProduct.code, description: newProduct.description || null,
      type: newProduct.type, minAmount: parseFloat(newProduct.minAmount)||0, maxAmount: parseFloat(newProduct.maxAmount)||0,
      minTerm: parseInt(newProduct.minTerm)||0, maxTerm: parseInt(newProduct.maxTerm)||0,
      interestRate: parseFloat(newProduct.interestRate)||0,
      paymentFrequency: newProduct.paymentFrequency, amortizationType: newProduct.amortizationType,
    }
    try {
      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, payload)
        toast.success('Producto actualizado')
      } else {
        await api.post('/products', payload)
        toast.success('Producto creado')
      }
      setShowProductForm(false)
      setEditingProduct(null)
      setNewProduct({ name:'', code:'', description:'', type:'personal', minAmount:'', maxAmount:'', minTerm:'', maxTerm:'', interestRate:'', paymentFrequency:'monthly', amortizationType:'fixed_installment' })
      loadTab('products')
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Error al guardar producto') }
  }

  // ─── USERS ────────────────────────────────────────────────────────
  const handleInviteUser = async () => {
    if (!inviteForm.email || !inviteForm.fullName) return toast.error('Email y nombre son requeridos')
    try {
      let rolesArr = ['cobrador']
      try { rolesArr = JSON.parse(inviteForm.roles) } catch(_) {}
      await api.post('/settings/users/invite', { email: inviteForm.email, fullName: inviteForm.fullName, roles: rolesArr })
      toast.success('Usuario agregado al tenant')
      setShowInviteForm(false)
      setInviteForm({ email:'', fullName:'', roles:'["cobrador"]' })
      loadTab('users')
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Error al invitar usuario') }
  }

  const handleUpdateMember = async (memberId: string, update: Record<string, any>) => {
    try {
      await api.put(`/settings/users/${memberId}`, update)
      toast.success('Usuario actualizado')
      loadTab('users')
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Error al actualizar usuario') }
  }

  const handleResetPassword = async (member: Member) => {
    if (!confirm(`¿Restablecer la contraseña de ${member.fullName}? Se generará una contraseña temporal.`)) return
    try {
      const res = await api.post(`/settings/users/${member.id}/reset-password`, {})
      setResetPasswordResult({ name: member.fullName, password: res.data.tempPassword })
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Error al restablecer contraseña') }
  }

  const isTenantOwner = (member: Member) => {
    try { return JSON.parse(member.roles || '[]').includes('tenant_owner') } catch(_) { return false }
  }

  // Role hierarchy: current user can only modify members with strictly lower role level
  const myRoles: string[] = (tenantState.currentTenant as any)?.roles || []
  const myRoleLevel = maxLevel(myRoles)
  // Tabs visible according to plan permissions (from can()) — fully dynamic, never hardcoded
  const visibleTabs = TABS.filter(tab => can(tab.perm))
  const canModifyMember = (m: Member) => {
    const targetLevel = maxLevel(parseRoles(m.roles))
    return myRoleLevel > targetLevel
  }

  const openPermissions = async (m: Member) => {
    try {
      const [permRes, subRes] = await Promise.all([
        api.get(`/settings/users/${m.id}/permissions`),
        api.get('/admin/my-subscription').catch(() => ({ data: { features: [] } }))
      ])
      setPermMember(m)
      setPermExplicit(permRes.data.explicit || {})
      setPermEffective(permRes.data.effective || [])
      setPermRoles(permRes.data.roles || [])
      setPlanFeatures(subRes.data.features || [])
    } catch(err: any) { toast.error('Error cargando permisos') }
  }

  const handleSavePermissions = async () => {
    if (!permMember) return
    setIsSavingPerms(true)
    try {
      const res = await api.put(`/settings/users/${permMember.id}/permissions`, { explicit: permExplicit })
      setPermEffective(res.data.effective || [])
      toast.success('Permisos actualizados correctamente')
    } catch(err: any) { toast.error(err?.response?.data?.error || 'Error al guardar permisos') }
    finally { setIsSavingPerms(false) }
  }

  const toggleExplicit = (key: PermKey, currentEffective: boolean) => {
    // Verificar si está bloqueado por el plan
    // Plans now store PermKeys directly instead of generic features
    const isBlockedByPlan = planFeatures.length > 0 && !planFeatures.includes(key)

    if (isBlockedByPlan) {
      toast.error('Esta función requiere un plan superior. Ve a Mi Suscripción para actualizar.')
      return
    }

    setPermExplicit(prev => {
      const next = { ...prev }
      // If currently granting explicitly, remove explicit (fall back to role default)
      // If role default grants it and we want to revoke → set false
      // If role default denies it and we want to grant → set true
      // If explicitly set, toggle to opposite
      if (key in next) {
        // Was explicitly set — remove to go back to role default
        delete next[key]
      } else {
        // Not explicitly set — set opposite of current effective value
        next[key] = !currentEffective
      }
      return next
    })
  }

  // ─── BRANCHES ────────────────────────────────────────────────────
  const handleAddBranch = async () => {
    if (!newBranch.name) return toast.error('Nombre de sucursal es requerido')
    try {
      await api.post('/settings/branches', newBranch)
      toast.success('Sucursal creada')
      setShowBranchForm(false)
      setNewBranch({ name:'', address:'', phone:'' })
      loadTab('branches')
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Error al crear sucursal') }
  }

  // ─── BANK ACCOUNTS ───────────────────────────────────────────────
  const handleSaveBank = async () => {
    if (!bankForm.bankName) return toast.error('Nombre del banco es requerido')
    try {
      const payload = { bankName: bankForm.bankName, accountNumber: bankForm.accountNumber, accountType: bankForm.accountType, accountHolder: bankForm.accountHolder, currency: bankForm.currency, initialBalance: parseFloat(bankForm.initialBalance)||0 }
      if (editingBank) {
        await api.put(`/settings/bank-accounts/${editingBank.id}`, payload)
        toast.success('Cuenta actualizada')
      } else {
        await api.post('/settings/bank-accounts', payload)
        toast.success('Cuenta bancaria agregada')
      }
      setShowBankForm(false)
      setEditingBank(null)
      setBankForm({ bankName:'', accountNumber:'', accountType:'checking', accountHolder:'', currency:'DOP', initialBalance:'0' })
      loadTab('bank_accounts')
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Error al guardar cuenta') }
  }

  const handleTransfer = async () => {
    if (!transferForm.fromAccountId || !transferForm.toAccountId) return toast.error('Selecciona las cuentas de origen y destino')
    if (!transferForm.amount || parseFloat(transferForm.amount) <= 0) return toast.error('Monto inválido')
    const fromAcc = bankAccounts.find(a => a.id === transferForm.fromAccountId)
    const toAcc   = bankAccounts.find(a => a.id === transferForm.toAccountId)
    const currenciesDiffer = !!(fromAcc && toAcc && fromAcc.currency !== toAcc.currency)
    const exRate = parseFloat(transferForm.exchangeRate)
    if (currenciesDiffer && (!transferForm.exchangeRate || exRate <= 0)) {
      return toast.error(`Las cuentas tienen divisas diferentes (${fromAcc?.currency} → ${toAcc?.currency}). Ingresa el tipo de cambio.`)
    }
    // Warn if rate seems suspicious: when crossing local↔strong, TC must be > 1
    const STRONG_H = ['USD','EUR','GBP','CAD','CHF','AUD']
    const fromIsStrongH = STRONG_H.includes(fromAcc?.currency ?? '')
    const toIsStrongH   = STRONG_H.includes(toAcc?.currency ?? '')
    const crossingH = fromIsStrongH !== toIsStrongH
    if (currenciesDiffer && crossingH && exRate > 0 && exRate < 1) {
      const strongH = fromIsStrongH ? fromAcc!.currency : toAcc!.currency
      const localH  = fromIsStrongH ? toAcc!.currency  : fromAcc!.currency
      const ok = confirm(`⚠️ El tipo de cambio ingresado (${exRate}) parece estar al revés.\nLa convención es: 1 ${strongH} = TC ${localH}, así que TC debe ser mayor a 1.\n\n¿Deseas continuar de todas formas?`)
      if (!ok) return
    }
    setIsTransferring(true)
    try {
      await api.post('/settings/bank-accounts/transfer', {
        fromAccountId: transferForm.fromAccountId,
        toAccountId:   transferForm.toAccountId,
        amount:        parseFloat(transferForm.amount),
        notes:         transferForm.notes || null,
        exchangeRate:  currenciesDiffer ? exRate : 1,
      })
      toast.success('Transferencia realizada exitosamente')
      setShowTransferModal(false)
      setTransferForm({ fromAccountId:'', toAccountId:'', amount:'', notes:'', exchangeRate:'' })
      loadTab('bank_accounts')
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Error al realizar transferencia') }
    finally { setIsTransferring(false) }
  }

  const handleDeleteBank = async (id: string) => {
    if (!confirm('¿Desactivar esta cuenta bancaria?')) return
    try {
      await api.delete(`/settings/bank-accounts/${id}`)
      toast.success('Cuenta desactivada')
      loadTab('bank_accounts')
    } catch (err: any) { toast.error('Error al desactivar cuenta') }
  }

  // ─── TEMPLATES ───────────────────────────────────────────────────
  const TEMPLATE_VAR_GROUPS = [
    {
      label: 'Datos del Deudor',
      vars: [
        { token: '{{client_name}}', desc: 'Nombre completo' },
        { token: '{{client_id}}', desc: 'Cédula / ID' },
        { token: '{{client_address}}', desc: 'Dirección' },
        { token: '{{client_city}}', desc: 'Ciudad' },
        { token: '{{client_email}}', desc: 'Email' },
        { token: '{{client_phone}}', desc: 'Teléfono' },
      ]
    },
    {
      label: 'Datos del Prestamista',
      vars: [
        { token: '{{company_name}}', desc: 'Nombre empresa' },
        { token: '{{company_address}}', desc: 'Dirección empresa' },
        { token: '{{company_phone}}', desc: 'Teléfono empresa' },
        { token: '{{company_email}}', desc: 'Email empresa' },
        { token: '{{rnc}}', desc: 'RNC de la empresa' },
        { token: '{{representative_name}}', desc: 'Nombre del representante' },
        { token: '{{company_logo}}', desc: 'URL del logo de la empresa' },
        { token: '{{company_signature}}', desc: 'URL de la firma' },
      ]
    },
    {
      label: 'Datos del Préstamo',
      vars: [
        { token: '{{loan_number}}', desc: 'No. Préstamo' },
        { token: '{{amount}}', desc: 'Monto' },
        { token: '{{rate}}', desc: 'Tasa de interés' },
        { token: '{{term}}', desc: 'Plazo' },
        { token: '{{monthly_payment}}', desc: 'Cuota' },
        { token: '{{start_date}}', desc: 'Fecha inicio' },
        { token: '{{end_date}}', desc: 'Fecha fin' },
        { token: '{{next_payment_date}}', desc: 'Próximo pago' },
        { token: '{{print_date}}', desc: 'Fecha de impresión' },
      ]
    },
    {
      label: 'Plan de Pagos',
      vars: [
        { token: '{{payment_plan}}', desc: 'Tabla completa (#, Vence, Cuota)' },
      ]
    },
    {
      label: 'Montos en Palabras (Pagaré)',
      vars: [
        { token: '{{amount_words}}', desc: 'Monto en letras (ej: SEIS MIL PESOS (RD$6,000.00))' },
        { token: '{{amount_raw}}', desc: 'Monto numérico sin formato' },
        { token: '{{installment_amount}}', desc: 'Cuota en número (RD$X,XXX.XX)' },
        { token: '{{installment_amount_words}}', desc: 'Cuota en letras' },
        { token: '{{rate_pct}}', desc: 'Tasa en número (ej: 5)' },
        { token: '{{rate_words}}', desc: 'Tasa en letras (ej: cinco)' },
        { token: '{{loan_term}}', desc: 'Plazo en número (ej: 12)' },
        { token: '{{loan_term_words}}', desc: 'Plazo en letras (ej: doce)' },
        { token: '{{frequency_label}}', desc: 'Frecuencia de pago (ej: Mensual)' },
      ]
    },
    {
      label: 'Fechas en Palabras (Pagaré)',
      vars: [
        { token: '{{today_date_long}}', desc: 'Hoy en palabras (ej: trece (13) días del mes de abril...)' },
        { token: '{{maturity_date_long}}', desc: 'Fecha de vencimiento en palabras' },
        { token: '{{first_payment_date_long}}', desc: 'Primer pago en palabras' },
        { token: '{{disbursement_date_long}}', desc: 'Fecha de desembolso en palabras' },
        { token: '{{date}}', desc: 'Fecha de hoy (corta)' },
      ]
    },
    {
      label: 'Notaría y Testigos',
      vars: [
        { token: '{{notary_name}}', desc: 'Nombre del Notario' },
        { token: '{{notary_collegiate_number}}', desc: 'No. de Colegiatura del Notario' },
        { token: '{{notary_office_address}}', desc: 'Dirección del Notario' },
        { token: '{{acreedor_id}}', desc: 'Cédula del Acreedor' },
        { token: '{{company_city}}', desc: 'Ciudad del Prestamista' },
        { token: '{{testigo1_nombre}}', desc: 'Nombre Testigo 1' },
        { token: '{{testigo1_id}}', desc: 'Cédula Testigo 1' },
        { token: '{{testigo1_domicilio}}', desc: 'Domicilio Testigo 1' },
        { token: '{{testigo2_nombre}}', desc: 'Nombre Testigo 2' },
        { token: '{{testigo2_id}}', desc: 'Cédula Testigo 2' },
        { token: '{{testigo2_domicilio}}', desc: 'Domicilio Testigo 2' },
      ]
    },
  ]

  const handleSaveTemplate = async () => {
    if (!templateForm.name || !templateForm.body) return toast.error('Nombre y contenido son requeridos')
    try {
      if (editingTemplate) {
        await api.put(`/settings/templates/${editingTemplate.id}`, { name: templateForm.name, type: templateForm.type, body: templateForm.body, isDefault: templateForm.isDefault })
        toast.success('Plantilla actualizada')
      } else {
        await api.post('/settings/templates', { name: templateForm.name, type: templateForm.type, body: templateForm.body, isDefault: templateForm.isDefault })
        toast.success('Plantilla creada')
      }
      setShowTemplateForm(false)
      setEditingTemplate(null)
      setTemplateForm({ name:'', type:'personal', body:'', isDefault: false })
      loadTab('templates')
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Error al guardar plantilla') }
  }

  const handleLoadDefaultTemplate = async (key: string) => {
    setIsLoadingDefaultTpl(true)
    try {
      await api.post(`/settings/default-templates/${key}`, {})
      toast.success('Plantilla cargada exitosamente')
      loadTab('templates')
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Error al cargar plantilla') }
    finally { setIsLoadingDefaultTpl(false) }
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('¿Eliminar esta plantilla?')) return
    try {
      await api.delete(`/settings/templates/${id}`)
      toast.success('Plantilla eliminada')
      loadTab('templates')
    } catch (err: any) { toast.error('Error al eliminar plantilla') }
  }

  const startEditBank = (acc: BankAccount) => {
    setEditingBank(acc)
    setBankForm({ bankName: acc.bankName, accountNumber: acc.accountNumber, accountType: acc.accountType, accountHolder: acc.accountHolder, currency: acc.currency, initialBalance: String(acc.initialBalance||0) })
    setShowBankForm(true)
  }

  const startEditTemplate = (tpl: ContractTemplate) => {
    setEditingTemplate(tpl)
    setTemplateForm({ name: tpl.name, type: tpl.type, body: tpl.body, isDefault: !!tpl.isDefault })
    setShowTemplateForm(true)
  }

  const getRoles = (member: Member) => {
    try { return JSON.parse(member.roles || '[]').join(', ') } catch(_) { return member.roles || '' }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Configuración</h1>
        <p className="text-slate-600 text-sm mt-1">Administra tu empresa y preferencias</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button key={tab.id} onClick={() => navigate(tab.path)}
                className={`flex items-center gap-2 pb-3 px-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab.id ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}>
                <Icon className="w-4 h-4" />{tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {isLoading ? <PageLoadingState /> : (
        <>
          {/* ── GENERAL ── */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <Card>
                <h3 className="section-title mb-4">Información de la Empresa</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="Nombre de la Empresa" value={tenant.name} onChange={e => setTenant(p=>({...p,name:e.target.value}))} />
                  <Input label="Email" type="email" value={tenant.email} onChange={e => setTenant(p=>({...p,email:e.target.value}))} />
                  <Input label="Teléfono" value={tenant.phone} onChange={e => setTenant(p=>({...p,phone:e.target.value}))} />
                  <Input label="Dirección" value={tenant.address} onChange={e => setTenant(p=>({...p,address:e.target.value}))} />
                  <Input label="RNC (opcional)" value={tenant.rnc} onChange={e => { const v=e.target.value.replace(/\D/g,'').slice(0,10); setTenant(p=>({...p,rnc:v})) }} placeholder="Número 10 dígitos" maxLength={10} />
                  <Input label="Nombre del Representante" value={tenant.representativeName} onChange={e => setTenant(p=>({...p,representativeName:e.target.value}))} placeholder="Nombre completo del representante legal" />
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Moneda</label>
                    <select value={tenant.currency} onChange={e=>setTenant(p=>({...p,currency:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {SUPPORTED_CURRENCIES.map(cur => (
                        <option key={cur.code} value={cur.code}>{cur.code} — {cur.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Modo de Score</label>
                    <select value={tenant.scoreMode} onChange={e=>setTenant(p=>({...p,scoreMode:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="global">Global (todos los prestamistas)</option>
                      <option value="per_tenant">Por Empresa</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Firma de Contrato</label>
                    <select value={tenant.signatureMode} onChange={e=>setTenant(p=>({...p,signatureMode:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="physical">Física</option>
                      <option value="digital">Digital</option>
                    </select>
                  </div>
                </div>
                {/* Logo & Signature — file upload (stored as base64) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100">
                  {/* Logo */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                      <Image className="w-4 h-4"/>Logo de la Empresa
                    </label>
                    {tenant.logoUrl ? (
                      <div className="relative border border-slate-200 rounded-lg p-3 bg-slate-50 flex items-center gap-3">
                        <img src={tenant.logoUrl} alt="Logo" className="h-14 object-contain rounded" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-600 font-medium">Logo cargado</p>
                          <button
                            type="button"
                            onClick={() => setTenant(p => ({ ...p, logoUrl: '' }))}
                            className="text-xs text-red-500 hover:text-red-700 mt-0.5"
                          >
                            Eliminar imagen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-5 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                        <Upload className="w-7 h-7 text-slate-400 mb-1.5" />
                        <span className="text-sm text-slate-600 font-medium">Haz clic para subir imagen</span>
                        <span className="text-xs text-slate-400 mt-0.5">PNG, JPG, SVG (máx. 2MB)</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            if (file.size > 2 * 1024 * 1024) { toast.error('La imagen no puede superar los 2MB'); return }
                            const reader = new FileReader()
                            reader.onload = ev => setTenant(p => ({ ...p, logoUrl: ev.target?.result as string }))
                            reader.readAsDataURL(file)
                          }}
                        />
                      </label>
                    )}
                    <p className="text-xs text-slate-400 mt-1">Variable en contratos: <code className="bg-slate-100 px-1 rounded">{'{{company_logo}}'}</code></p>
                  </div>

                  {/* Signature */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                      <Upload className="w-4 h-4"/>Imagen de Firma
                    </label>
                    {tenant.signatureUrl ? (
                      <div className="relative border border-slate-200 rounded-lg p-3 bg-slate-50 flex items-center gap-3">
                        <img src={tenant.signatureUrl} alt="Firma" className="h-14 object-contain rounded" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-600 font-medium">Firma cargada</p>
                          <button
                            type="button"
                            onClick={() => setTenant(p => ({ ...p, signatureUrl: '' }))}
                            className="text-xs text-red-500 hover:text-red-700 mt-0.5"
                          >
                            Eliminar imagen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-5 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                        <Upload className="w-7 h-7 text-slate-400 mb-1.5" />
                        <span className="text-sm text-slate-600 font-medium">Haz clic para subir imagen</span>
                        <span className="text-xs text-slate-400 mt-0.5">PNG, JPG, SVG (máx. 2MB)</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            if (file.size > 2 * 1024 * 1024) { toast.error('La imagen no puede superar los 2MB'); return }
                            const reader = new FileReader()
                            reader.onload = ev => setTenant(p => ({ ...p, signatureUrl: ev.target?.result as string }))
                            reader.readAsDataURL(file)
                          }}
                        />
                      </label>
                    )}
                    <p className="text-xs text-slate-400 mt-1">Variable en contratos: <code className="bg-slate-100 px-1 rounded">{'{{company_signature}}'}</code></p>
                  </div>
                </div>
              </Card>

              {/* Notarial / Legal Document Settings */}
              <Card>
                <h3 className="section-title mb-1">Datos para Documentos Notariales</h3>
                <p className="text-xs text-slate-400 mb-4">Estos datos se usan como variables en plantillas de Pagaré Notarial y contratos legales.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="Ciudad / Municipio" value={tenant.city} onChange={e=>setTenant(p=>({...p,city:e.target.value}))} placeholder="Santiago" />
                  <Input label="Nombre del Notario" value={tenant.notaryName} onChange={e=>setTenant(p=>({...p,notaryName:e.target.value}))} placeholder="Lic. Juan Pérez" />
                  <Input label="Número de Colegiatura del Notario" value={tenant.notaryCollegiateNumber} onChange={e=>setTenant(p=>({...p,notaryCollegiateNumber:e.target.value}))} placeholder="Ej. 5883" />
                  <Input label="Cédula del Acreedor / Representante" value={tenant.acreedorIdNumber} onChange={e=>setTenant(p=>({...p,acreedorIdNumber:e.target.value}))} placeholder="001-0000000-0" />
                </div>
                <div className="mt-3">
                  <Input label="Dirección del Estudio del Notario" value={tenant.notaryOfficeAddress} onChange={e=>setTenant(p=>({...p,notaryOfficeAddress:e.target.value}))} placeholder="Calle 16 de Agosto No. 124, Edificio Rama, Santiago" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-100">
                  <p className="col-span-full text-xs font-semibold text-slate-500 uppercase tracking-wide">Testigo 1</p>
                  <Input label="Nombre" value={tenant.testigo1Nombre} onChange={e=>setTenant(p=>({...p,testigo1Nombre:e.target.value}))} placeholder="Nombre completo" />
                  <Input label="Cédula" value={tenant.testigo1Id} onChange={e=>setTenant(p=>({...p,testigo1Id:e.target.value}))} placeholder="001-0000000-0" />
                  <Input label="Domicilio" value={tenant.testigo1Domicilio} onChange={e=>setTenant(p=>({...p,testigo1Domicilio:e.target.value}))} placeholder="Ciudad, Provincia" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3 pt-3 border-t border-slate-100">
                  <p className="col-span-full text-xs font-semibold text-slate-500 uppercase tracking-wide">Testigo 2</p>
                  <Input label="Nombre" value={tenant.testigo2Nombre} onChange={e=>setTenant(p=>({...p,testigo2Nombre:e.target.value}))} placeholder="Nombre completo" />
                  <Input label="Cédula" value={tenant.testigo2Id} onChange={e=>setTenant(p=>({...p,testigo2Id:e.target.value}))} placeholder="001-0000000-0" />
                  <Input label="Domicilio" value={tenant.testigo2Domicilio} onChange={e=>setTenant(p=>({...p,testigo2Domicilio:e.target.value}))} placeholder="Ciudad, Provincia" />
                </div>
              </Card>

              <Card>
                <h3 className="section-title mb-4">Configuración de Mora</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Aplicar Mora Sobre</label>
                    <select value={moraSettings.moraBase} onChange={e=>setMoraSettings(p=>({...p,moraBase:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="cuota_vencida">Cuota Vencida (capital + interés)</option>
                      <option value="capital_pendiente">Capital Pendiente</option>
                      <option value="capital_vencido">Capital Vencido</option>
                    </select>
                    <p className="text-xs text-slate-400 mt-1">Base de cálculo del porcentaje de mora diario</p>
                  </div>
                  <Input label="Tasa de Mora Diaria (%)" type="number" step="0.001" value={moraSettings.moraRateDaily}
                    onChange={e=>setMoraSettings(p=>({...p,moraRateDaily:parseFloat(e.target.value)||0}))} />
                  <Input label="Días de Gracia" type="number" value={moraSettings.moraGraceDays}
                    onChange={e=>setMoraSettings(p=>({...p,moraGraceDays:parseInt(e.target.value)||0}))} />
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Cargo de Mora Fijo</label>
                    <select value={moraSettings.moraFixedEnabled} onChange={e=>setMoraSettings(p=>({...p,moraFixedEnabled:parseInt(e.target.value)}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value={1}>Habilitado</option>
                      <option value={0}>Deshabilitado</option>
                    </select>
                  </div>
                  {moraSettings.moraFixedEnabled === 1 && (
                    <Input label="Monto Fijo de Mora (por evento)" type="number" step="0.01" value={moraSettings.moraFixedAmount}
                      onChange={e=>setMoraSettings(p=>({...p,moraFixedAmount:parseFloat(e.target.value)||0}))}
                      placeholder="Ej: 50.00"
                    />
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Rebaja por Pago Anticipado</label>
                    <select value={moraSettings.rebateEnabled} onChange={e=>setMoraSettings(p=>({...p,rebateEnabled:parseInt(e.target.value)}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value={1}>Habilitada</option>
                      <option value={0}>Deshabilitada</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Rebaja</label>
                    <select value={moraSettings.rebateType} onChange={e=>setMoraSettings(p=>({...p,rebateType:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="proportional">Proporcional</option>
                      <option value="fixed">Fija</option>
                    </select>
                  </div>
                </div>
              </Card>

              <Button onClick={handleSaveGeneral} isLoading={isSaving} disabled={isSaving} className="flex items-center gap-2">
                <Save className="w-4 h-4" />
                {isSaving ? 'Guardando...' : 'Guardar Cambios'}
              </Button>

              {/* ── Multi-Currency ── */}
              <Card>
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard className="w-4 h-4 text-blue-600"/>
                  <h3 className="section-title">Monedas Habilitadas</h3>
                </div>
                <p className="text-xs text-slate-500 mb-4">Activa el soporte multi-moneda para emitir préstamos en otras divisas. El Peso Dominicano (DOP) siempre está activo.</p>
                <div className="flex items-center gap-3 mb-4">
                  <button
                    onClick={() => setCurrencySettings(p => ({ ...p, multiCurrencyEnabled: !p.multiCurrencyEnabled }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${currencySettings.multiCurrencyEnabled ? 'bg-blue-600' : 'bg-slate-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${currencySettings.multiCurrencyEnabled ? 'translate-x-6' : 'translate-x-1'}`}/>
                  </button>
                  <span className="text-sm font-medium text-slate-700">
                    {currencySettings.multiCurrencyEnabled ? 'Multi-moneda activada' : 'Multi-moneda desactivada'}
                  </span>
                </div>

                {currencySettings.multiCurrencyEnabled && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {SUPPORTED_CURRENCIES.map(cur => {
                      const isEnabled = currencySettings.enabledCurrencies.includes(cur.code)
                      const isBase = cur.code === 'DOP'
                      return (
                        <button
                          key={cur.code}
                          onClick={() => toggleCurrency(cur.code)}
                          disabled={isBase}
                          className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                            isEnabled ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'
                          } ${isBase ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isEnabled ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                            {cur.symbol}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{cur.code}</p>
                            <p className="text-xs text-slate-500">{cur.name}</p>
                          </div>
                          {isBase && <span className="ml-auto text-xs text-blue-600 font-medium">Base</span>}
                          {!isBase && isEnabled && <CheckCircle className="ml-auto w-4 h-4 text-blue-600"/>}
                        </button>
                      )
                    })}
                  </div>
                )}
                <div className="mt-4">
                  <Button size="sm" onClick={handleSaveCurrencies} isLoading={isSavingCurrencies} disabled={isSavingCurrencies} className="flex items-center gap-2">
                    <Save className="w-4 h-4"/>Guardar Monedas
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* ── BRANCHES ── */}
          {activeTab === 'branches' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="section-title">Sucursales</h3>
                <Button onClick={()=>setShowBranchForm(!showBranchForm)} size="sm" className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />Nueva Sucursal
                </Button>
              </div>
              {showBranchForm && (
                <Card className="bg-slate-50">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input label="Nombre *" value={newBranch.name} onChange={e=>setNewBranch(p=>({...p,name:e.target.value}))} placeholder="Sucursal Centro" />
                    <Input label="Dirección" value={newBranch.address} onChange={e=>setNewBranch(p=>({...p,address:e.target.value}))} />
                    <Input label="Teléfono" value={newBranch.phone} onChange={e=>setNewBranch(p=>({...p,phone:e.target.value}))} />
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={handleAddBranch}>Crear</Button>
                    <Button size="sm" variant="ghost" onClick={()=>setShowBranchForm(false)}>Cancelar</Button>
                  </div>
                </Card>
              )}
              {branches.length > 0 ? (
                <Card>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">Nombre</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">Dirección</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">Teléfono</th>
                    </tr></thead>
                    <tbody>{branches.map(b=>(
                      <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4 font-medium">{b.name}</td>
                        <td className="py-3 px-4 text-slate-600">{b.address||'—'}</td>
                        <td className="py-3 px-4 text-slate-600">{b.phone||'—'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </Card>
              ) : (
                <EmptyState icon={Building2} title="Sin sucursales" description="Crea sucursales para organizar tu operación" action={{label:'Nueva Sucursal',onClick:()=>setShowBranchForm(true)}} />
              )}
            </div>
          )}

          {/* ── USERS ── */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="section-title">Usuarios del Tenant</h3>
                {myRoleLevel >= 3 && (
                  <Button onClick={()=>setShowInviteForm(!showInviteForm)} size="sm" className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />Agregar Usuario
                  </Button>
                )}
              </div>
              {showInviteForm && (
                <Card className="bg-slate-50">
                  <h4 className="font-semibold mb-3">Agregar Usuario al Tenant</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input label="Email *" type="email" value={inviteForm.email} onChange={e=>setInviteForm(p=>({...p,email:e.target.value}))} placeholder="usuario@email.com" />
                    <Input label="Nombre Completo *" value={inviteForm.fullName} onChange={e=>setInviteForm(p=>({...p,fullName:e.target.value}))} />
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
                      <select value={inviteForm.roles} onChange={e=>setInviteForm(p=>({...p,roles:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value='["cobrador"]'>Cobrador</option>
                        <option value='["oficial"]'>Oficial de Préstamos</option>
                        <option value='["admin"]'>Administrador</option>
                        <option value='["prestamista"]'>Prestamista</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={handleInviteUser}>Agregar</Button>
                    <Button size="sm" variant="ghost" onClick={()=>setShowInviteForm(false)}>Cancelar</Button>
                  </div>
                </Card>
              )}
              {editingMember && (
                <Card className="bg-blue-50 border-blue-200">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-semibold text-blue-900">Editar: {editingMember.fullName}</h4>
                    <button onClick={()=>setEditingMember(null)} className="text-slate-500 hover:text-slate-700"><X className="w-4 h-4"/></button>
                  </div>
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
                      <select defaultValue={editingMember.roles} id="edit-role-select" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value='["cobrador"]'>Cobrador</option>
                        <option value='["oficial"]'>Oficial</option>
                        <option value='["admin"]'>Administrador</option>
                        <option value='["prestamista"]'>Prestamista</option>
                      </select>
                    </div>
                    <Button size="sm" onClick={()=>{
                      const sel = document.getElementById('edit-role-select') as HTMLSelectElement
                      let roles=['cobrador']; try { roles=JSON.parse(sel.value) } catch(_) {}
                      handleUpdateMember(editingMember.id, { roles })
                      setEditingMember(null)
                    }}>Guardar Rol</Button>
                  </div>
                </Card>
              )}
              {members.length > 0 ? (
                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">Nombre</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">Email</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">Rol</th>
                        <th className="text-center py-3 px-4 font-semibold text-slate-700">Estado</th>
                        <th className="text-center py-3 px-4 font-semibold text-slate-700">Acciones</th>
                      </tr></thead>
                      <tbody>{members.map(m=>(
                        <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-3 px-4 font-medium">{m.fullName}</td>
                          <td className="py-3 px-4 text-slate-600">{m.email}</td>
                          <td className="py-3 px-4">
                            {isTenantOwner(m) ? (
                              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">Propietario</span>
                            ) : (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{getRoles(m)}</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {m.isActive ? (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3"/>Activo</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3"/>Inactivo</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {canModifyMember(m) && !isTenantOwner(m) && (
                                <button onClick={()=>setEditingMember(m)} className="p-1 hover:bg-blue-100 rounded text-blue-600 transition-colors" title="Editar rol">
                                  <Edit2 className="w-4 h-4"/>
                                </button>
                              )}
                              {canModifyMember(m) && !isTenantOwner(m) && (
                                <button onClick={()=>openPermissions(m)} className="p-1 hover:bg-violet-100 rounded text-violet-600 transition-colors" title="Gestionar permisos">
                                  <Shield className="w-4 h-4"/>
                                </button>
                              )}
                              {canModifyMember(m) && (
                                <button onClick={()=>handleResetPassword(m)}
                                  className="p-1 hover:bg-amber-100 rounded text-amber-600 transition-colors" title="Restablecer contraseña">
                                  <KeyRound className="w-4 h-4"/>
                                </button>
                              )}
                              {canModifyMember(m) && !isTenantOwner(m) && (
                                <button onClick={()=>handleUpdateMember(m.id,{is_active: m.isActive ? 0 : 1})}
                                  className={`p-1 rounded transition-colors ${m.isActive?'hover:bg-red-100 text-red-500':'hover:bg-emerald-100 text-emerald-600'}`}
                                  title={m.isActive?'Bloquear usuario':'Desbloquear usuario'}>
                                  {m.isActive ? <Lock className="w-4 h-4"/> : <Unlock className="w-4 h-4"/>}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </Card>
              ) : (
                <EmptyState icon={Users2} title="Sin usuarios" description="Agrega usuarios a tu organización" action={{label:'Agregar Usuario',onClick:()=>setShowInviteForm(true)}} />
              )}
            </div>
          )}

          {/* ── PRODUCTS ── */}
          {activeTab === 'products' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="section-title">Productos de Préstamo</h3>
                <Button onClick={()=>setShowProductForm(!showProductForm)} size="sm" className="flex items-center gap-2">
                  <Plus className="w-4 h-4"/>Nuevo Producto
                </Button>
              </div>
              {showProductForm && (
                <Card className="bg-slate-50">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-semibold">{editingProduct ? 'Editar Producto' : 'Crear Nuevo Producto'}</h4>
                    <button onClick={()=>{setShowProductForm(false);setEditingProduct(null);setNewProduct({name:'',code:'',description:'',type:'personal',minAmount:'',maxAmount:'',minTerm:'',maxTerm:'',interestRate:'',paymentFrequency:'monthly',amortizationType:'fixed_installment'})}} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4"/></button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input label="Nombre *" value={newProduct.name} onChange={e=>setNewProduct(p=>({...p,name:e.target.value}))} />
                    <Input label="Código *" value={newProduct.code} onChange={e=>setNewProduct(p=>({...p,code:e.target.value}))} />
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
                      <select value={newProduct.type} onChange={e=>setNewProduct(p=>({...p,type:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="personal">Personal</option>
                        <option value="san">SAN</option>
                        <option value="commercial">Comercial</option>
                        <option value="guaranteed">Con Garantía</option>
                        <option value="reditos">Réditos</option>
                      </select>
                    </div>
                    <Input label="Tasa de Interés (%)" type="number" step="0.01" value={newProduct.interestRate} onChange={e=>setNewProduct(p=>({...p,interestRate:e.target.value}))} />
                    <Input label="Monto Mínimo" type="number" value={newProduct.minAmount} onChange={e=>setNewProduct(p=>({...p,minAmount:e.target.value}))} />
                    <Input label="Monto Máximo" type="number" value={newProduct.maxAmount} onChange={e=>setNewProduct(p=>({...p,maxAmount:e.target.value}))} />
                    <Input label="Plazo Mínimo (meses)" type="number" value={newProduct.minTerm} onChange={e=>setNewProduct(p=>({...p,minTerm:e.target.value}))} />
                    <Input label="Plazo Máximo (meses)" type="number" value={newProduct.maxTerm} onChange={e=>setNewProduct(p=>({...p,maxTerm:e.target.value}))} />
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Frecuencia de Pago</label>
                      <select value={newProduct.paymentFrequency} onChange={e=>setNewProduct(p=>({...p,paymentFrequency:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="daily">Diaria</option>
                        <option value="weekly">Semanal</option>
                        <option value="biweekly">Quincenal</option>
                        <option value="monthly">Mensual</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Amortización</label>
                      <select value={newProduct.amortizationType} onChange={e=>setNewProduct(p=>({...p,amortizationType:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="fixed_installment">Cuota Fija</option>
                        <option value="interest_only">Solo Interés</option>
                        <option value="flat_interest">Interés Plano</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button size="sm" onClick={handleAddProduct}>{editingProduct ? 'Actualizar' : 'Crear'}</Button>
                    <Button size="sm" variant="ghost" onClick={()=>{setShowProductForm(false);setEditingProduct(null)}}>Cancelar</Button>
                  </div>
                </Card>
              )}
              {products.length > 0 ? (
                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">Nombre</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">Código</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">Tipo</th>
                        <th className="text-right py-3 px-4 font-semibold text-slate-700">Tasa</th>
                        <th className="text-center py-3 px-4 font-semibold text-slate-700">Plazo</th>
                        <th className="text-center py-3 px-4 font-semibold text-slate-700">Estado</th>
                        <th className="text-center py-3 px-4 font-semibold text-slate-700">Acciones</th>
                      </tr></thead>
                      <tbody>{products.map(p=>(
                        <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-3 px-4 font-medium">{p.name}</td>
                          <td className="py-3 px-4 font-mono text-xs">{p.code}</td>
                          <td className="py-3 px-4 capitalize">{p.type}</td>
                          <td className="py-3 px-4 text-right">{p.rate}%</td>
                          <td className="py-3 px-4 text-center">{p.minTerm}–{p.maxTerm} meses</td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${p.isActive?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-500'}`}>
                              {p.isActive?'Activo':'Inactivo'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button onClick={()=>startEditProduct(p)} className="p-1.5 hover:bg-blue-50 rounded text-blue-600 transition-colors" title="Editar producto">
                              <Edit2 className="w-4 h-4"/>
                            </button>
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </Card>
              ) : (
                <EmptyState icon={Package} title="Sin productos" description="Crea productos de préstamo" action={{label:'Nuevo Producto',onClick:()=>setShowProductForm(true)}} />
              )}
            </div>
          )}

          {/* ── BANK ACCOUNTS ── */}
          {activeTab === 'bank_accounts' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="section-title">Cuentas Bancarias</h3>
                  <p className="text-sm text-slate-500 mt-1">Configura las cuentas donde recibes pagos</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={()=>{setEditingBank(null);setBankForm({bankName:'',accountNumber:'',accountType:'checking',accountHolder:'',currency:'DOP',initialBalance:'0'});setShowBankForm(true)}} size="sm" className="flex items-center gap-2">
                    <Plus className="w-4 h-4"/>Nueva Cuenta
                  </Button>
                  <Button onClick={()=>setShowTransferModal(true)} size="sm" variant="outline" className="flex items-center gap-2">
                    <ArrowLeftRight className="w-4 h-4"/>Transferencia
                  </Button>
                </div>
              </div>
              {showBankForm && (
                <Card className="bg-slate-50">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-semibold">{editingBank?'Editar Cuenta':'Nueva Cuenta Bancaria'}</h4>
                    <button onClick={()=>setShowBankForm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4"/></button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Banco *</label>
                      <select value={bankForm.bankName} onChange={e=>setBankForm(p=>({...p,bankName:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">-- Selecciona el banco --</option>
                        {BANKS_DR.map(b=><option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <Input label="Número de Cuenta" value={bankForm.accountNumber} onChange={e=>setBankForm(p=>({...p,accountNumber:e.target.value}))} placeholder="000-0000000-0" />
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Cuenta</label>
                      <select value={bankForm.accountType} onChange={e=>setBankForm(p=>({...p,accountType:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="checking">Corriente</option>
                        <option value="savings">Ahorro</option>
                        <option value="payroll">Nómina</option>
                      </select>
                    </div>
                    <Input label="Titular de la Cuenta" value={bankForm.accountHolder} onChange={e=>setBankForm(p=>({...p,accountHolder:e.target.value}))} placeholder="Nombre del titular" />
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Moneda</label>
                      <select value={bankForm.currency} onChange={e=>setBankForm(p=>({...p,currency:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {SUPPORTED_CURRENCIES.map(cur => (
                          <option key={cur.code} value={cur.code}>{cur.code} — {cur.name}</option>
                        ))}
                      </select>
                    </div>
                    <Input label="Balance Inicial" type="number" step="0.01" value={bankForm.initialBalance} onChange={e=>setBankForm(p=>({...p,initialBalance:e.target.value}))} placeholder="0.00" />
                  </div>
                  {editingBank && <p className="text-xs text-amber-600 mt-2 bg-amber-50 px-3 py-1.5 rounded">Cambiar el balance inicial ajustará el balance actual proporcionalmente.</p>}
                  <div className="flex gap-2 mt-4">
                    <Button size="sm" onClick={handleSaveBank}>{editingBank?'Actualizar':'Agregar Cuenta'}</Button>
                    <Button size="sm" variant="ghost" onClick={()=>setShowBankForm(false)}>Cancelar</Button>
                  </div>
                </Card>
              )}
              {bankAccounts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {bankAccounts.filter(a=>a.isActive).map(acc=>(
                    <Card key={acc.id}>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Landmark className="w-5 h-5 text-blue-600"/>
                            <span className="font-semibold text-slate-800">{acc.bankName}</span>
                            <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{acc.currency}</span>
                          </div>
                          {acc.accountNumber && <p className="text-sm text-slate-600 font-mono">{acc.accountNumber}</p>}
                          {acc.accountHolder && <p className="text-xs text-slate-500 mt-0.5">{acc.accountHolder}</p>}
                          <p className="text-xs text-slate-400 capitalize mt-0.5">{acc.accountType==='checking'?'Corriente':acc.accountType==='savings'?'Ahorro':'Nómina'}</p>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={()=>startEditBank(acc)} className="p-1.5 hover:bg-blue-50 rounded text-blue-600"><Edit2 className="w-4 h-4"/></button>
                          <button onClick={()=>handleDeleteBank(acc.id)} className="p-1.5 hover:bg-red-50 rounded text-red-500"><Trash2 className="w-4 h-4"/></button>
                        </div>
                      </div>
                      {/* Balance info */}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                        <div className="text-center">
                          <p className="text-xs text-slate-400">Disponible</p>
                          <p className="text-sm font-bold text-emerald-700">{Number(acc.currentBalance||0).toLocaleString('es-DO',{minimumFractionDigits:2})}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-slate-400">Prestado</p>
                          <p className="text-sm font-bold text-amber-600">{Number(acc.loanedBalance||0).toLocaleString('es-DO',{minimumFractionDigits:2})}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-slate-400">Inicial</p>
                          <p className="text-sm font-semibold text-slate-600">{Number(acc.initialBalance||0).toLocaleString('es-DO',{minimumFractionDigits:2})}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Landmark} title="Sin cuentas bancarias" description="Agrega las cuentas donde recibes pagos de tus clientes" action={{label:'Nueva Cuenta',onClick:()=>setShowBankForm(true)}} />
              )}
              {/* Transfer history */}
              {transfers.length > 0 && (() => {
                // Filter by selected account
                const filteredTransfers = transferAccountFilter === 'all'
                  ? transfers
                  : transfers.filter(t => t.fromAccountId === transferAccountFilter || t.toAccountId === transferAccountFilter)

                const downloadCSV = () => {
                  const header = 'Fecha,Origen,Moneda Origen,Destino,Moneda Destino,Monto Enviado,Monto Recibido,Tipo de Cambio,Tipo,Notas'
                  const rows = filteredTransfers.map(t => {
                    const isOut = t.fromAccountId === transferAccountFilter
                    const isIn  = t.toAccountId   === transferAccountFilter
                    const tipo  = transferAccountFilter === 'all' ? 'Transferencia'
                                : isOut ? 'Salida' : isIn ? 'Entrada' : 'Transferencia'
                    const fecha = (t.transferredAt || (t as any).transferred_at)
                      ? new Date((t.transferredAt || (t as any).transferred_at)!).toLocaleDateString('es-DO') : ''
                    const fromCur = (t as any).fromCurrencyLabel || (t as any).from_currency || ''
                    const toCur   = (t as any).toCurrencyLabel   || (t as any).to_currency   || ''
                    const amtDest = (t as any).amountDestination  || t.amount
                    const exRate  = (t as any).exchangeRate        || 1
                    return [fecha, t.fromBankName||'', fromCur, t.toBankName||'', toCur,
                      t.amount, amtDest, exRate, tipo, t.notes||''].join(',')
                  })
                  const csv = [header, ...rows].join('\n')
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a'); a.href = url
                  a.download = `transferencias_${new Date().toISOString().slice(0,10)}.csv`
                  a.click(); URL.revokeObjectURL(url)
                }

                return (
                  <Card>
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <h4 className="font-semibold text-slate-700">Historial de Transferencias</h4>
                      <div className="flex items-center gap-2">
                        <div>
                          <label className="text-xs text-slate-500 mr-1">Ver cuenta:</label>
                          <select value={transferAccountFilter} onChange={e=>setTransferAccountFilter(e.target.value)}
                            className="text-xs px-2 py-1 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500">
                            <option value="all">Todas las cuentas</option>
                            {bankAccounts.filter(a=>a.isActive).map(a=>(
                              <option key={a.id} value={a.id}>{a.bankName} ({a.currency})</option>
                            ))}
                          </select>
                        </div>
                        <button onClick={downloadCSV}
                          className="flex items-center gap-1 text-xs px-2 py-1 border border-slate-300 rounded-md hover:bg-slate-50 text-slate-600 transition-colors">
                          ⬇ CSV
                        </button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-slate-200">
                          <th className="text-left py-2 px-3 text-slate-500">Fecha</th>
                          <th className="text-left py-2 px-3 text-slate-500">Origen</th>
                          <th className="text-left py-2 px-3 text-slate-500">Destino</th>
                          <th className="text-right py-2 px-3 text-slate-500">Monto</th>
                          {transferAccountFilter !== 'all' && <th className="text-center py-2 px-3 text-slate-500">Tipo</th>}
                          <th className="text-left py-2 px-3 text-slate-500">Notas</th>
                        </tr></thead>
                        <tbody>{filteredTransfers.map(t=>{
                          const isOut = t.fromAccountId === transferAccountFilter
                          const isIn  = t.toAccountId   === transferAccountFilter
                          const fromCur = (t as any).fromCurrencyLabel || (t as any).from_currency || ''
                          const toCur   = (t as any).toCurrencyLabel   || (t as any).to_currency   || ''
                          const amtDest = (t as any).amountDestination  || t.amount
                          const exRate  = (t as any).exchangeRate
                          const fecha = (t.transferredAt || (t as any).transferred_at)
                            ? new Date((t.transferredAt || (t as any).transferred_at)!).toLocaleDateString('es-DO') : '—'
                          return (
                            <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50">
                              <td className="py-2 px-3 text-slate-500">{fecha}</td>
                              <td className="py-2 px-3">
                                <span className={isOut && transferAccountFilter !== 'all' ? 'font-semibold text-red-700' : ''}>
                                  {t.fromBankName}
                                </span>
                                {fromCur && <span className="ml-1 text-slate-400 text-[10px]">{fromCur}</span>}
                              </td>
                              <td className="py-2 px-3">
                                <span className={isIn && transferAccountFilter !== 'all' ? 'font-semibold text-emerald-700' : ''}>
                                  {t.toBankName}
                                </span>
                                {toCur && <span className="ml-1 text-slate-400 text-[10px]">{toCur}</span>}
                              </td>
                              <td className="py-2 px-3 text-right font-semibold">
                                {transferAccountFilter !== 'all' ? (
                                  isOut
                                    ? <span className="text-red-600">− {Number(t.amount).toLocaleString('es-DO',{minimumFractionDigits:2})} {fromCur}</span>
                                    : <span className="text-emerald-600">+ {Number(amtDest).toLocaleString('es-DO',{minimumFractionDigits:2})} {toCur}</span>
                                ) : (
                                  <span className="text-slate-700">
                                    {Number(t.amount).toLocaleString('es-DO',{minimumFractionDigits:2})} {fromCur}
                                    {fromCur !== toCur && amtDest && (
                                      <span className="text-slate-400 ml-1">→ {Number(amtDest).toLocaleString('es-DO',{minimumFractionDigits:2})} {toCur}</span>
                                    )}
                                  </span>
                                )}
                                {exRate && exRate !== 1 && <div className="text-slate-400 text-[10px]">TC: {exRate}</div>}
                              </td>
                              {transferAccountFilter !== 'all' && (
                                <td className="py-2 px-3 text-center">
                                  {isOut
                                    ? <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-medium">Salida</span>
                                    : <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-medium">Entrada</span>
                                  }
                                </td>
                              )}
                              <td className="py-2 px-3 text-slate-400">{t.notes||'—'}</td>
                            </tr>
                          )
                        })}</tbody>
                      </table>
                    </div>
                  </Card>
                )
              })()}
            </div>
          )}

          {/* ── TEMPLATES ── */}
          {activeTab === 'templates' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="section-title">Plantillas de Contrato</h3>
                  <p className="text-xs text-slate-500 mt-1">El sistema incluye el <strong>Contrato General de Préstamo o Pagaré</strong> (por defecto) y el <strong>Pagaré Notarial</strong>. Puedes editarlos o crear nuevas plantillas con las variables disponibles.</p>
                </div>
                {can('templates.create') ? (
                  <Button onClick={()=>{setEditingTemplate(null);setTemplateForm({name:'',type:'general',body:'',isDefault:false});setShowTemplateForm(true)}} size="sm" className="flex items-center gap-2">
                    <Plus className="w-4 h-4"/>Nueva Plantilla
                  </Button>
                ) : null}
              </div>
              {showTemplateForm && (
                <Card className="bg-slate-50">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-semibold">{editingTemplate?'Editar Plantilla':'Nueva Plantilla'}</h4>
                    <button onClick={()=>setShowTemplateForm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4"/></button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <Input label="Nombre *" value={templateForm.name} onChange={e=>setTemplateForm(p=>({...p,name:e.target.value}))} placeholder="Pagaré Estándar" />
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
                      <select value={templateForm.type} onChange={e=>setTemplateForm(p=>({...p,type:e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="general">General</option>
                        <option value="personal">Personal</option>
                        <option value="san">SAN</option>
                        <option value="commercial">Comercial</option>
                        <option value="guaranteed">Con Garantía</option>
                        <option value="notarial">Notarial</option>
                      </select>
                    </div>
                  </div>
                  {/* Variable groups */}
                  <div className="mb-3 space-y-2">
                    <p className="text-xs font-semibold text-blue-700">Variables disponibles — clic para insertar en el contrato:</p>
                    {TEMPLATE_VAR_GROUPS.map(group => (
                      <div key={group.label}>
                        <p className="text-xs text-slate-500 font-medium mb-1">{group.label}</p>
                        <div className="flex flex-wrap gap-1">
                          {group.vars.map(v => (
                            <button
                              key={v.token}
                              type="button"
                              title={v.desc}
                              onClick={() => {
                                const ta = document.getElementById('template-body') as HTMLTextAreaElement
                                if (!ta) { setTemplateForm(p=>({...p,body:p.body+v.token})); return }
                                const start = ta.selectionStart; const end = ta.selectionEnd
                                const newVal = templateForm.body.slice(0,start) + v.token + templateForm.body.slice(end)
                                setTemplateForm(p=>({...p,body:newVal}))
                                setTimeout(()=>{ ta.focus(); ta.setSelectionRange(start+v.token.length, start+v.token.length) },0)
                              }}
                              className="px-2 py-0.5 bg-white border border-blue-200 text-blue-700 rounded text-xs font-mono hover:bg-blue-50 transition-colors"
                            >{v.token}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Contenido del Contrato *</label>
                    <textarea
                      id="template-body"
                      value={templateForm.body}
                      onChange={e=>setTemplateForm(p=>({...p,body:e.target.value}))}
                      rows={16}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={`PAGARÉ\n\n{{company_name}}\n{{company_address}}\n\nPréstamo No.: {{loan_number}}\n\nYo, {{client_name}}, portador de la cédula {{client_id}}...`}
                    />
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <input type="checkbox" id="is-default" checked={templateForm.isDefault} onChange={e=>setTemplateForm(p=>({...p,isDefault:e.target.checked}))} className="rounded" />
                    <label htmlFor="is-default" className="text-sm text-slate-700">Usar como plantilla por defecto</label>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveTemplate}>{editingTemplate?'Actualizar':'Crear Plantilla'}</Button>
                    <Button size="sm" variant="ghost" onClick={()=>setShowTemplateForm(false)}>Cancelar</Button>
                  </div>
                </Card>
              )}
              {templates.length > 0 ? (
                <div className="space-y-3">
                  {templates.map(tpl=>(
                    <Card key={tpl.id}>
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-semibold text-slate-800">{tpl.name}</span>
                            {tpl.isDefault ? <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Por defecto</span> : null}
                            <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded capitalize">{tpl.type}</span>
                          </div>
                          <p className="text-xs text-slate-500">v{tpl.version} · {tpl.body.length} caracteres</p>
                          <p className="text-xs text-slate-400 mt-1 font-mono line-clamp-2">{tpl.body.slice(0,100)}...</p>
                        </div>
                        <div className="flex gap-1 ml-4 flex-shrink-0">
                          {can('templates.edit') && <button onClick={()=>startEditTemplate(tpl)} className="p-1.5 hover:bg-blue-50 rounded text-blue-600"><Edit2 className="w-4 h-4"/></button>}
                          {can('templates.delete') && <button onClick={()=>handleDeleteTemplate(tpl.id)} className="p-1.5 hover:bg-red-50 rounded text-red-500"><Trash2 className="w-4 h-4"/></button>}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : can('templates.create') ? (
                <EmptyState icon={FileText} title="Sin plantillas" description="Crea plantillas de contrato con variables dinámicas" action={{label:'Nueva Plantilla',onClick:()=>setShowTemplateForm(true)}} />
              ) : (
                <EmptyState icon={FileText} title="Sin plantillas" description="No tienes permisos para crear plantillas" />
              )}
            </div>
          )}
        </>
      )}
      {/* Transfer Modal */}
      {showTransferModal && (() => {
        const fromAcc = bankAccounts.find(a => a.id === transferForm.fromAccountId)
        const toAcc   = bankAccounts.find(a => a.id === transferForm.toAccountId)
        const currenciesDiffer = !!(fromAcc && toAcc && fromAcc.currency !== toAcc.currency)

        const sendAmt = parseFloat(transferForm.amount)      || 0
        const exRate  = parseFloat(transferForm.exchangeRate) || 0

        // TC Convention: "1 {strong_currency} = {TC} {local_currency}"
        // Strong = USD, EUR, GBP, CAD, CHF, AUD. Local = DOP, HTG, etc.
        // DOP→USD: dest = amount / TC  (e.g. 20,000 / 58.5 = 341.88 USD)
        // USD→DOP: dest = amount * TC  (e.g. 500 * 58.5 = 29,250 DOP)
        const STRONG = ['USD', 'EUR', 'GBP', 'CAD', 'CHF', 'AUD']
        const fromIsStrong = fromAcc ? STRONG.includes(fromAcc.currency) : false
        const toIsStrong   = toAcc   ? STRONG.includes(toAcc.currency)   : false
        const crossingStrength = fromIsStrong !== toIsStrong

        // Which currency is "stronger" (the reference currency for the TC label)
        const strongCur = fromIsStrong ? fromAcc!.currency : toAcc?.currency ?? ''
        const localCur  = fromIsStrong ? toAcc?.currency ?? '' : fromAcc?.currency ?? ''

        // Receive amount calculation
        let rcvAmt = 0
        if (sendAmt > 0 && exRate > 0 && currenciesDiffer) {
          if (crossingStrength) {
            rcvAmt = fromIsStrong
              ? parseFloat((sendAmt * exRate).toFixed(2))   // USD→DOP: 500 * 58.5
              : parseFloat((sendAmt / exRate).toFixed(2))   // DOP→USD: 20,000 / 58.5
          } else {
            rcvAmt = parseFloat((sendAmt * exRate).toFixed(2))
          }
        }

        // Warn if TC < 1 when crossing local↔strong (should be ~58 for DOP/USD)
        const rateSeemsSuspicious = currenciesDiffer && crossingStrength && exRate > 0 && exRate < 1

        // When swapping DOP↔USD the TC itself doesn't change (58.5 stays 58.5);
        // only invert if both are in the same strength category.
        const swapAccounts = () => setTransferForm(p => ({
          ...p,
          fromAccountId: p.toAccountId,
          toAccountId:   p.fromAccountId,
          // Keep same TC when crossing local↔strong; invert only within same category
          exchangeRate: crossingStrength ? p.exchangeRate : (exRate > 0 ? (1 / exRate).toFixed(6) : ''),
        }))

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <ArrowLeftRight className="w-5 h-5 text-blue-600"/>Transferencia entre Cuentas
                </h3>
                <button onClick={()=>setShowTransferModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
              </div>

              <div className="space-y-4">
                {/* ── ORIGEN ── */}
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <label className="block text-xs font-bold text-red-700 mb-1.5 uppercase tracking-wide">
                    🔴 Cuenta de Origen — el dinero SALE de aquí
                  </label>
                  <select value={transferForm.fromAccountId}
                    onChange={e=>setTransferForm(p=>({...p, fromAccountId:e.target.value, toAccountId: p.toAccountId === e.target.value ? '' : p.toAccountId, exchangeRate:''}))}
                    className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white">
                    <option value="">-- Selecciona la cuenta que ENVÍA --</option>
                    {bankAccounts.filter(a=>a.isActive).map(a=>(
                      <option key={a.id} value={a.id}>
                        {a.bankName} ({a.currency}) — Disponible: {Number(a.currentBalance||0).toLocaleString('es-DO',{minimumFractionDigits:2})}
                      </option>
                    ))}
                  </select>
                  {fromAcc && (
                    <p className="text-xs text-red-600 mt-1">
                      Balance actual: <strong>{Number(fromAcc.currentBalance||0).toLocaleString('es-DO',{minimumFractionDigits:2})} {fromAcc.currency}</strong>
                    </p>
                  )}
                </div>

                {/* ── SWAP BUTTON ── */}
                <div className="flex justify-center">
                  <button onClick={swapAccounts} title="Intercambiar origen y destino"
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-full text-xs text-slate-600 hover:bg-slate-50 hover:border-blue-300 hover:text-blue-600 transition-colors">
                    <ArrowLeftRight className="w-3.5 h-3.5"/>Intercambiar dirección
                  </button>
                </div>

                {/* ── DESTINO ── */}
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <label className="block text-xs font-bold text-emerald-700 mb-1.5 uppercase tracking-wide">
                    🟢 Cuenta de Destino — el dinero LLEGA aquí
                  </label>
                  <select value={transferForm.toAccountId}
                    onChange={e=>setTransferForm(p=>({...p, toAccountId:e.target.value, exchangeRate:''}))}
                    className="w-full px-3 py-2 border border-emerald-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
                    <option value="">-- Selecciona la cuenta que RECIBE --</option>
                    {bankAccounts.filter(a=>a.isActive && a.id !== transferForm.fromAccountId).map(a=>(
                      <option key={a.id} value={a.id}>
                        {a.bankName} ({a.currency}) — Balance: {Number(a.currentBalance||0).toLocaleString('es-DO',{minimumFractionDigits:2})}
                      </option>
                    ))}
                  </select>
                </div>

                {/* ── MONTO ── */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Monto a enviar {fromAcc ? `(${fromAcc.currency})` : ''} *
                  </label>
                  <input type="number" step="0.01" min="0"
                    value={transferForm.amount}
                    onChange={e=>setTransferForm(p=>({...p, amount:e.target.value}))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>

                {/* ── TIPO DE CAMBIO (solo cuando divisas difieren) ── */}
                {currenciesDiffer && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                    <p className="text-xs font-semibold text-amber-800">
                      💱 Cuentas con divisas diferentes: {fromAcc?.currency} → {toAcc?.currency}
                    </p>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Tipo de cambio: 1 {crossingStrength ? strongCur : fromAcc?.currency} = ¿cuántos {crossingStrength ? localCur : toAcc?.currency}? *
                      </label>
                      <input type="number" step="0.0001" min="0"
                        value={transferForm.exchangeRate}
                        onChange={e=>setTransferForm(p=>({...p, exchangeRate:e.target.value}))}
                        placeholder={crossingStrength ? `Ej: 58.50 (1 ${strongCur} = 58.50 ${localCur})` : 'Ej: 1.0'}
                        className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"/>
                    </div>

                    {/* Alerta de tasa sospechosa */}
                    {rateSeemsSuspicious && (
                      <div className="p-2 bg-red-100 border border-red-300 rounded text-xs text-red-700">
                        ⚠️ <strong>¡Atención!</strong> La tasa ingresada parece estar al revés.<br/>
                        La convención es: <strong>1 {strongCur} = TC {localCur}</strong>, así que el TC debe ser <strong>mayor a 1</strong>
                        (ej: 1 {strongCur} = 58.50 {localCur}).<br/>
                        ¿Quisiste decir lo contrario? Usa el botón <em>"Intercambiar dirección"</em> arriba.
                      </div>
                    )}

                    {/* Preview del resultado */}
                    {sendAmt > 0 && exRate > 0 && !rateSeemsSuspicious && (
                      <div className="p-2 bg-white border border-amber-200 rounded text-xs text-slate-700">
                        <strong>Resumen:</strong> Envías <span className="text-red-600 font-bold">{sendAmt.toLocaleString('es-DO',{minimumFractionDigits:2})} {fromAcc?.currency}</span>
                        {' → '}la cuenta destino recibirá <span className="text-emerald-600 font-bold">{rcvAmt.toLocaleString('es-DO',{minimumFractionDigits:2})} {toAcc?.currency}</span>
                        <span className="text-slate-400 ml-1">(TC: {exRate})</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Preview misma moneda */}
                {!currenciesDiffer && fromAcc && toAcc && sendAmt > 0 && (
                  <div className="p-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700">
                    <strong>Resumen:</strong> Envías <span className="text-red-600 font-bold">{sendAmt.toLocaleString('es-DO',{minimumFractionDigits:2})} {fromAcc.currency}</span>
                    {' → '}la cuenta destino recibirá <span className="text-emerald-600 font-bold">{sendAmt.toLocaleString('es-DO',{minimumFractionDigits:2})} {toAcc.currency}</span>
                  </div>
                )}

                {/* Notas */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notas (opcional)</label>
                  <textarea value={transferForm.notes}
                    onChange={e=>setTransferForm(p=>({...p,notes:e.target.value}))}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Razón de la transferencia..."/>
                </div>
              </div>

              <div className="flex gap-3 mt-5">
                <Button onClick={handleTransfer} isLoading={isTransferring} className="flex-1">Realizar Transferencia</Button>
                <Button variant="ghost" onClick={()=>setShowTransferModal(false)}>Cancelar</Button>
              </div>
            </div>
          </div>
        )
      })()}
      {/* Password Reset Modal */}
      {/* ── SUBSCRIPTION TAB ── */}
      {activeTab === 'subscription' && myRoleLevel < 2 && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-lg font-medium text-slate-600">Acceso restringido</p>
          <p className="text-sm mt-2">No tienes permisos para ver la información de suscripción.</p>
        </div>
      )}
      {activeTab === 'subscription' && myRoleLevel >= 2 && (
        <div className="space-y-6">
          {isLoading ? (
            <div className="text-center py-12 text-slate-400">Cargando información de suscripción...</div>
          ) : subscriptionData ? (() => {
            const sub = subscriptionData
            const status = sub.subscriptionStatus || sub.subscription_status || 'trial'
            const daysRemaining = sub.daysRemaining
            const trialDaysRemaining: number | null = sub.trialDaysRemaining ?? null
            const trialEndDate: string | null = sub.trialEndDate ?? null
            const planName = sub.planName || sub.plan_name || 'Sin plan'
            const features: string[] = (() => { try { return JSON.parse(sub.features || '[]') } catch(_) { return [] } })()
            const FEATURE_LABELS: Record<string, string> = {
              loans:'Gestión de Préstamos', payments:'Registro de Pagos', receipts:'Emisión de Recibos',
              clients:'Gestión de Clientes', contracts:'Contratos', reports_basic:'Reportes Básicos',
              reports_advanced:'Reportes Avanzados', whatsapp:'Mensajería WhatsApp',
              branches:'Múltiples Sucursales', multiple_collectors:'Múltiples Cobradores',
              digital_signature:'Firma Digital', export_data:'Exportación de Datos',
              api_access:'Acceso a API', priority_support:'Soporte Prioritario',
              custom_branding:'Marca Personalizada', bulk_notifications:'Notificaciones Masivas',
            }
            const STATUS_MAP: Record<string, { label: string; color: string; icon: string }> = {
              trial: { label: 'Período de Prueba', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: '🧪' },
              active: { label: 'Activa', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: '✅' },
              expired: { label: 'Vencida', color: 'bg-red-100 text-red-700 border-red-200', icon: '❌' },
              suspended: { label: 'Suspendida', color: 'bg-orange-100 text-orange-700 border-orange-200', icon: '⏸️' },
              canceled: { label: 'Cancelada', color: 'bg-slate-100 text-slate-600 border-slate-200', icon: '🚫' },
            }
            const statusInfo = STATUS_MAP[status] || { label: status, color: 'bg-slate-100 text-slate-600 border-slate-200', icon: '❓' }
            return (
              <>
                {/* Trial countdown banner */}
                {status === 'trial' && trialDaysRemaining !== null && (
                  <div className={`flex items-start gap-3 p-4 rounded-lg border ${
                    trialDaysRemaining <= 0 ? 'bg-red-50 border-red-200' :
                    trialDaysRemaining <= 5 ? 'bg-amber-50 border-amber-200' :
                    'bg-blue-50 border-blue-200'
                  }`}>
                    <span className="text-xl flex-shrink-0">⏱️</span>
                    <div className="flex-1">
                      <p className={`font-semibold text-sm ${
                        trialDaysRemaining <= 0 ? 'text-red-800' :
                        trialDaysRemaining <= 5 ? 'text-amber-800' :
                        'text-blue-800'
                      }`}>
                        {trialDaysRemaining <= 0
                          ? 'Tu período de prueba ha vencido'
                          : trialDaysRemaining === 1
                          ? '¡Te queda 1 día de prueba!'
                          : `Te quedan ${trialDaysRemaining} días de prueba gratuita`}
                      </p>
                      {trialEndDate && (
                        <p className={`text-xs mt-0.5 ${
                          trialDaysRemaining <= 0 ? 'text-red-600' :
                          trialDaysRemaining <= 5 ? 'text-amber-700' :
                          'text-blue-600'
                        }`}>
                          {trialDaysRemaining <= 0
                            ? `El período de prueba venció el ${trialEndDate}. Contacta al administrador para activar tu plan.`
                            : `Tu período de prueba finaliza el ${trialEndDate}. Contacta al administrador para activar tu plan.`}
                        </p>
                      )}
                    </div>
                    {trialDaysRemaining > 0 && (
                      <div className={`text-center flex-shrink-0 px-3 py-2 rounded-lg font-bold text-lg min-w-[60px] ${
                        trialDaysRemaining <= 5 ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {trialDaysRemaining}
                        <p className="text-xs font-normal">días</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Status Alert for expiry */}
                {(status === 'expired' || (status !== 'trial' && daysRemaining !== null && daysRemaining <= 7 && daysRemaining >= 0)) && (
                  <div className={`flex items-start gap-3 p-4 rounded-lg border ${status === 'expired' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                    <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${status === 'expired' ? 'text-red-600' : 'text-amber-600'}`}/>
                    <div>
                      <p className={`font-semibold text-sm ${status === 'expired' ? 'text-red-800' : 'text-amber-800'}`}>
                        {status === 'expired' ? 'Tu suscripción ha vencido' : `Tu suscripción vence en ${daysRemaining} día${daysRemaining !== 1 ? 's' : ''}`}
                      </p>
                      <p className={`text-xs mt-0.5 ${status === 'expired' ? 'text-red-600' : 'text-amber-700'}`}>
                        Contacta al administrador de PrestaMax para renovar tu plan y mantener el acceso.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Plan Card */}
                  <Card>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Tu Plan Actual</p>
                        <h3 className="text-2xl font-bold text-slate-900">{planName}</h3>
                        {sub.planDescription || sub.plan_description ? (
                          <p className="text-sm text-slate-500 mt-1">{sub.planDescription || sub.plan_description}</p>
                        ) : null}
                      </div>
                      <Star className="w-6 h-6 text-amber-400"/>
                    </div>
                    <div className="text-3xl font-bold text-blue-700 mb-4">
                      ${sub.priceMonthly || sub.price_monthly || '0'}<span className="text-sm font-normal text-slate-500">/mes</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm"><span className="text-slate-600">Cobradores</span><strong>{(sub.maxCollectors || sub.max_collectors) === -1 ? '∞ Ilimitado' : sub.maxCollectors || sub.max_collectors || '—'}</strong></div>
                      <div className="flex justify-between text-sm"><span className="text-slate-600">Clientes</span><strong>{(sub.maxClients || sub.max_clients) === -1 ? '∞ Ilimitado' : sub.maxClients || sub.max_clients || '—'}</strong></div>
                      <div className="flex justify-between text-sm"><span className="text-slate-600">Usuarios</span><strong>{(sub.maxUsers || sub.max_users) === -1 ? '∞ Ilimitado' : sub.maxUsers || sub.max_users || '—'}</strong></div>
                    </div>
                  </Card>

                  {/* Subscription Status */}
                  <Card>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">Estado de Suscripción</p>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">Estado</span>
                        <span className={`text-sm px-3 py-1 rounded-full border font-medium ${statusInfo.color}`}>
                          {statusInfo.icon} {statusInfo.label}
                        </span>
                      </div>
                      {(sub.subscriptionStart || sub.subscription_start) && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-600 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5"/>Inicio</span>
                          <span className="text-sm font-medium">{(sub.subscriptionStart || sub.subscription_start)?.slice(0,10)}</span>
                        </div>
                      )}
                      {(sub.subscriptionEnd || sub.subscription_end) && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-600 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5"/>Vencimiento</span>
                          <span className={`text-sm font-medium ${daysRemaining !== null && daysRemaining < 0 ? 'text-red-600' : daysRemaining !== null && daysRemaining <= 7 ? 'text-amber-600' : ''}`}>
                            {(sub.subscriptionEnd || sub.subscription_end)?.slice(0,10)}
                            {daysRemaining !== null && <span className="ml-1 text-xs">({daysRemaining < 0 ? `vencida hace ${Math.abs(daysRemaining)}d` : `${daysRemaining}d restantes`})</span>}
                          </span>
                        </div>
                      )}
                      {status === 'trial' && trialEndDate && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-600 flex items-center gap-1.5">⏱️ Fin de prueba</span>
                          <span className={`text-sm font-medium ${
                            trialDaysRemaining !== null && trialDaysRemaining <= 0 ? 'text-red-600' :
                            trialDaysRemaining !== null && trialDaysRemaining <= 5 ? 'text-amber-600' :
                            'text-blue-600'
                          }`}>
                            {trialEndDate}
                            {trialDaysRemaining !== null && (
                              <span className="ml-1 text-xs">
                                ({trialDaysRemaining <= 0 ? `vencida hace ${Math.abs(trialDaysRemaining)}d` : `${trialDaysRemaining}d restantes`})
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5"/>Uso actual</span>
                        <span className="text-sm font-medium">{sub.clientCount ?? 0} clientes · {sub.memberCount ?? 0} usuarios</span>
                      </div>
                    </div>
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <p className="text-xs text-blue-700">
                        Para renovar o cambiar tu plan, contacta al administrador de PrestaMax o escribe a soporte.
                      </p>
                    </div>
                  </Card>
                </div>

                {/* Features */}
                {features.length > 0 && (
                  <Card>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">Funciones incluidas en tu plan</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {features.map(fk => (
                        <div key={fk} className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg border border-emerald-100 text-sm text-emerald-800">
                          <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0"/>
                          {FEATURE_LABELS[fk] || fk}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </>
            )
          })() : (
            <Card className="text-center py-12">
              <CreditCard className="w-12 h-12 text-slate-300 mx-auto mb-3"/>
              <p className="text-slate-500">No hay información de suscripción disponible.</p>
              <p className="text-sm text-slate-400 mt-1">Contacta al administrador de PrestaMax.</p>
            </Card>
          )}
        </div>
      )}

      {resetPasswordResult && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-amber-600"/>
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 text-lg">Contraseña Temporal</h3>
                <p className="text-sm text-slate-500">Para: {resetPasswordResult.name}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-3">
              La contraseña ha sido restablecida. Comparte esta contraseña temporal de forma segura con el usuario:
            </p>
            <div className="bg-slate-100 border border-slate-300 rounded-lg p-4 text-center mb-4">
              <span className="font-mono text-2xl font-bold text-slate-800 tracking-widest">{resetPasswordResult.password}</span>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">⚠️</span>
              <p className="text-xs text-amber-700">Anota esta contraseña ahora. Por seguridad, no podrás verla nuevamente después de cerrar este diálogo.</p>
            </div>
            <Button onClick={() => setResetPasswordResult(null)} className="w-full">Listo, ya la anoté</Button>
          </div>
        </div>
      )}

      {/* ── Permissions Modal ── */}
      {permMember && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-6">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-200 sticky top-0 bg-white rounded-t-xl z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-violet-100 rounded-full flex items-center justify-center">
                  <Shield className="w-5 h-5 text-violet-600"/>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 text-lg">Permisos de {permMember.fullName}</h3>
                  <p className="text-xs text-slate-500">Rol base: <span className="font-medium">{permRoles.join(', ') || '—'}</span></p>
                </div>
              </div>
              <button onClick={()=>setPermMember(null)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><X className="w-5 h-5"/></button>
            </div>

            {/* Legend */}
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center gap-4 text-xs text-slate-600">
              <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-emerald-500"/>Concedido por rol (predeterminado)</span>
              <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-blue-500"/>Concedido explícitamente</span>
              <span className="flex items-center gap-1"><ShieldX className="w-3.5 h-3.5 text-red-400"/>Revocado explícitamente</span>
              <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5 text-slate-300"/>No disponible por rol</span>
              <span className="flex items-center gap-1"><Lock className="w-3.5 h-3.5 text-amber-500"/>No disponible en tu plan</span>
              <span className="ml-auto text-slate-400 italic">Haz clic en el toggle para grant/revocar explícitamente. Clic de nuevo para volver al valor del rol.</span>
            </div>

            {/* Permission matrix */}
            <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
              {Object.entries(PERM_BY_MODULE).map(([module, { label, perms }]) => (
                <div key={module}>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2 pb-1 border-b border-slate-100">{label}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {perms.map(p => {
                      const isEffective = permEffective.includes(p.key)
                      const isExplicit = p.key in permExplicit
                      const explicitVal = permExplicit[p.key]
                      
                      // Verificar si está bloqueado por el plan
                      const requiredFeatures = PERM_REQUIRES_FEATURE[p.key]
                      const isBlockedByPlan = requiredFeatures
                        ? !requiredFeatures.some(f => planFeatures.includes(f))
                        : false

                      // Determine badge style
                      let bgClass = 'bg-slate-50 border-slate-200'
                      let iconEl = <Shield className="w-4 h-4 text-slate-300"/>
                      let cursor = 'cursor-pointer hover:shadow-sm'
                      
                      if (isBlockedByPlan) {
                        bgClass = 'bg-amber-50 border-amber-200 opacity-60'
                        iconEl = <Lock className="w-4 h-4 text-amber-500"/>
                        cursor = 'cursor-not-allowed'
                      } else if (isExplicit && explicitVal) {
                        bgClass = 'bg-blue-50 border-blue-200'
                        iconEl = <ShieldCheck className="w-4 h-4 text-blue-500"/>
                      } else if (isExplicit && !explicitVal) {
                        bgClass = 'bg-red-50 border-red-200'
                        iconEl = <ShieldX className="w-4 h-4 text-red-400"/>
                      } else if (isEffective) {
                        bgClass = 'bg-emerald-50 border-emerald-200'
                        iconEl = <ShieldCheck className="w-4 h-4 text-emerald-500"/>
                      }
                      
                      return (
                        <button 
                          key={p.key} 
                          onClick={() => toggleExplicit(p.key as PermKey, isEffective)}
                          disabled={isBlockedByPlan}
                          title={isBlockedByPlan ? 'Esta función requiere un plan superior' : ''}
                          className={`flex items-start gap-3 p-2.5 rounded-lg border text-left transition-all ${bgClass} ${cursor}`}>
                          <div className="mt-0.5 flex-shrink-0">{iconEl}</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-700 leading-tight">{p.label}</div>
                            <div className={`text-xs leading-tight mt-0.5 ${isBlockedByPlan ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>
                              {isBlockedByPlan ? 'Plan requerido - Actualiza para habilitar' : p.description}
                            </div>
                          </div>
                          <div className="flex-shrink-0 mt-0.5">
                            {isBlockedByPlan ? (
                              <Lock className="w-5 h-5 text-amber-500"/>
                            ) : isEffective ? (
                              <ToggleRight className={`w-5 h-5 ${isExplicit ? 'text-blue-500' : 'text-emerald-500'}`}/>
                            ) : (
                              <ToggleLeft className={`w-5 h-5 ${isExplicit ? 'text-red-400' : 'text-slate-300'}`}/>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-5 border-t border-slate-200 sticky bottom-0 bg-white rounded-b-xl">
              <div className="text-xs text-slate-500">
                <span className="font-medium text-violet-600">{permEffective.length}</span> permisos activos de <span className="font-medium">{PERM_DEFS.length}</span> posibles en tu plan
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={()=>setPermMember(null)}>Cancelar</Button>
                <Button size="sm" onClick={handleSavePermissions} disabled={isSavingPerms}
                  className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white">
                  <Save className="w-4 h-4"/>
                  {isSavingPerms ? 'Guardando...' : 'Guardar Permisos'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SettingsPage

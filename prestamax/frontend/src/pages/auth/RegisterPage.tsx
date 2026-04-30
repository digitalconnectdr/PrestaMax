import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useTenant } from '@/hooks/useTenant'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { Building2, User, Mail, Phone, Lock, CheckCircle, ArrowLeft, Eye, EyeOff } from 'lucide-react'
import api from '@/lib/api'
import toast from 'react-hot-toast'

interface Plan {
  id: string
  name: string
  slug: string
  priceMonthly: number
  maxCollectors: number
  maxClients: number
  maxUsers: number
  trialDays: number
  description: string
}

const RegisterPage: React.FC = () => {
  const [form, setForm] = useState({
    companyName: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: '',
    phone: '',
    currency: 'DOP',
    planId: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [plans, setPlans] = useState<Plan[]>([])
  const [step, setStep] = useState<'form' | 'success'>('form')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { login } = useAuth()
  const { selectTenant, setUserTenants } = useTenant()
  const navigate = useNavigate()

  useEffect(() => {
    // Load available plans
    api.get('/public/plans').then(res => setPlans(res.data || [])).catch(() => {})
  }, [])

  const set = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }))
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!form.companyName.trim()) newErrors.companyName = 'Nombre de empresa es requerido'
    if (!form.adminName.trim()) newErrors.adminName = 'Tu nombre es requerido'
    if (!form.adminEmail.trim()) newErrors.adminEmail = 'Email es requerido'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminEmail)) newErrors.adminEmail = 'Email inválido'
    if (!form.adminPassword) newErrors.adminPassword = 'Contraseña es requerida'
    else if (form.adminPassword.length < 8) newErrors.adminPassword = 'Mínimo 8 caracteres'
    if (form.adminPassword !== form.confirmPassword) newErrors.confirmPassword = 'Las contraseñas no coinciden'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setIsLoading(true)
    try {
      const response = await api.post('/auth/register-tenant', {
        company_name: form.companyName.trim(),
        admin_name: form.adminName.trim(),
        admin_email: form.adminEmail.trim(),
        admin_password: form.adminPassword,
        phone: form.phone || null,
        currency: form.currency,
        plan_id: form.planId || null,
      })
      const { user, token, tenants } = response.data

      login(user, token)
      setUserTenants(tenants)
      if (tenants.length > 0) {
        selectTenant(tenants[0])
      }

      setStep('success')
      setTimeout(() => {
        toast.success('¡Bienvenido a PrestaMax!')
        navigate('/dashboard')
      }, 2000)
    } catch (err: any) {
      const message = err.response?.data?.error || 'Error al crear la cuenta'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const passwordStrength = (pw: string): { level: number; label: string; color: string } => {
    if (!pw) return { level: 0, label: '', color: '' }
    let score = 0
    if (pw.length >= 8) score++
    if (pw.length >= 12) score++
    if (/[A-Z]/.test(pw)) score++
    if (/[0-9]/.test(pw)) score++
    if (/[^A-Za-z0-9]/.test(pw)) score++
    if (score <= 2) return { level: score, label: 'Débil', color: 'bg-red-500' }
    if (score <= 3) return { level: score, label: 'Regular', color: 'bg-amber-500' }
    return { level: score, label: 'Fuerte', color: 'bg-emerald-500' }
  }

  const pwStrength = passwordStrength(form.adminPassword)

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1e3a5f] to-[#152a45]">
        <div className="text-center text-white p-8">
          <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-3xl font-bold mb-2">¡Cuenta creada!</h2>
          <p className="text-blue-200 text-lg mb-2">Tu empresa está lista en PrestaMax</p>
          <p className="text-blue-300 text-sm">Redirigiendo al panel principal...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-5/12 bg-gradient-to-br from-[#1e3a5f] to-[#152a45] text-white flex-col justify-between p-12">
        <div>
          <h1 className="text-4xl font-bold mb-2">
            <span className="text-[#f59e0b]">Presta</span>Max
          </h1>
          <p className="text-blue-200 text-lg">Gestión Profesional de Préstamos</p>
        </div>

        <div className="space-y-6">
          <div>
            <p className="text-2xl font-bold mb-2">Comienza tu período de prueba</p>
            <p className="text-blue-100">
              Registra tu empresa y empieza a gestionar tu cartera de préstamos de forma profesional.
            </p>
          </div>

          <div className="space-y-4">
            {[
              { icon: '🏦', text: 'Múltiples tipos de préstamos' },
              { icon: '📊', text: 'Dashboard en tiempo real' },
              { icon: '💬', text: 'Mensajería vía WhatsApp' },
              { icon: '📄', text: 'Contratos y recibos automáticos' },
              { icon: '👥', text: 'Gestión de cobradores' },
              { icon: '🔒', text: 'Datos seguros e independientes' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xl">{item.icon}</span>
                <span className="text-blue-100">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-xs text-blue-300 space-y-0.5">
          <p>PrestaMax — Powered by <span className="font-semibold text-[#f59e0b]">JPRS Digital Connect</span></p>
          <p className="text-blue-400">v1.0 · @digitalconnect_dr</p>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="w-full lg:w-7/12 flex items-start justify-center bg-white p-6 overflow-y-auto">
        <div className="w-full max-w-lg py-8">
          {/* Mobile header */}
          <div className="lg:hidden mb-6">
            <h1 className="text-3xl font-bold mb-1">
              <span className="text-[#1e3a5f]">Presta</span>
              <span className="text-[#f59e0b]">Max</span>
            </h1>
          </div>

          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al inicio de sesión
          </button>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">Crear cuenta</h2>
          <p className="text-slate-600 text-sm mb-6">Registra tu empresa y comienza gratis</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Company Info */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                Datos de la Empresa
              </p>
              <div>
                <Input
                  label="Nombre de la Empresa *"
                  placeholder="Ej: Prestamos Rápidos S.A."
                  value={form.companyName}
                  onChange={e => set('companyName', e.target.value)}
                />
                {errors.companyName && <p className="text-red-500 text-xs mt-1">{errors.companyName}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Input
                    label="Teléfono"
                    placeholder="809-000-0000"
                    value={form.phone}
                    onChange={e => set('phone', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Moneda</label>
                  <select
                    value={form.currency}
                    onChange={e => set('currency', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  >
                    <option value="DOP">DOP — Peso Dominicano</option>
                    <option value="USD">USD — Dólar Americano</option>
                    <option value="EUR">EUR — Euro</option>
                    <option value="GTQ">GTQ — Quetzal</option>
                    <option value="HNL">HNL — Lempira</option>
                    <option value="MXN">MXN — Peso Mexicano</option>
                    <option value="COP">COP — Peso Colombiano</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Admin User Info */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                Tu Cuenta de Administrador
              </p>
              <div>
                <Input
                  label="Tu nombre completo *"
                  placeholder="Ej: Juan Pérez"
                  value={form.adminName}
                  onChange={e => set('adminName', e.target.value)}
                />
                {errors.adminName && <p className="text-red-500 text-xs mt-1">{errors.adminName}</p>}
              </div>
              <div>
                <Input
                  type="email"
                  label="Correo Electrónico *"
                  placeholder="tu@empresa.com"
                  value={form.adminEmail}
                  onChange={e => set('adminEmail', e.target.value)}
                />
                {errors.adminEmail && <p className="text-red-500 text-xs mt-1">{errors.adminEmail}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Mínimo 8 caracteres"
                    value={form.adminPassword}
                    onChange={e => set('adminPassword', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {form.adminPassword && (
                  <div className="mt-1.5">
                    <div className="flex gap-1 mb-0.5">
                      {[1, 2, 3, 4, 5].map(n => (
                        <div key={n} className={`h-1 flex-1 rounded-full transition-all ${n <= pwStrength.level ? pwStrength.color : 'bg-slate-200'}`} />
                      ))}
                    </div>
                    {pwStrength.label && (
                      <p className="text-xs text-slate-500">Contraseña <span className="font-medium">{pwStrength.label}</span></p>
                    )}
                  </div>
                )}
                {errors.adminPassword && <p className="text-red-500 text-xs mt-1">{errors.adminPassword}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Confirmar Contraseña *</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Repite tu contraseña"
                    value={form.confirmPassword}
                    onChange={e => set('confirmPassword', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] pr-10 ${errors.confirmPassword ? 'border-red-400' : 'border-slate-300'}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}
              </div>
            </div>

            {/* Plan selector (optional) */}
            {plans.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Plan (opcional)</label>
                <select
                  value={form.planId}
                  onChange={e => set('planId', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                >
                  <option value="">Comenzar en período de prueba gratuita</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} — ${p.priceMonthly}/mes · {p.trialDays || 10} días de prueba
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">Puedes cambiar tu plan en cualquier momento desde la configuración.</p>
              </div>
            )}

            <Button type="submit" isLoading={isLoading} size="lg" className="w-full">
              Crear mi Cuenta
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-200 text-center space-y-2">
            <p className="text-sm text-slate-600">
              ¿Ya tienes cuenta?{' '}
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-[#1e3a5f] font-semibold hover:underline"
              >
                Inicia sesión aquí
              </button>
            </p>
            <p className="text-xs text-slate-400">
              Al registrarte aceptas nuestros{' '}
              <a href="/terms" className="text-[#1e3a5f] hover:underline font-medium">Términos y Condiciones</a>
              {' '}y nuestra{' '}
              <a href="/privacy" className="text-[#1e3a5f] hover:underline font-medium">Política de Privacidad</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RegisterPage

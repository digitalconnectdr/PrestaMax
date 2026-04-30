import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useTenant } from '@/hooks/useTenant'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import {
  LayoutDashboard, ShieldCheck,
  Globe, Star, Link2, MessageSquare
} from 'lucide-react'
import api from '@/lib/api'
import toast from 'react-hot-toast'

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const { login } = useAuth()
  const { selectTenant, setUserTenants } = useTenant()
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const response = await api.post('/auth/login', { email, password })
      const { user, token, tenants } = response.data

      login(user, token)
      setUserTenants(tenants)

      if (tenants.length > 0) {
        selectTenant(tenants[0])
      }

      toast.success('Bienvenido a PrestaMax')
      navigate('/dashboard')
    } catch (err: any) {
      const message = err.response?.data?.message || 'Error al iniciar sesión'
      setError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Brand */}
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-[#1e3a5f] to-[#152a45] text-white flex-col justify-between p-10 overflow-y-auto">
        <div>
          <h1 className="text-4xl font-bold mb-1">
            <span className="text-[#f59e0b]">Presta</span>Max
          </h1>
          <p className="text-blue-200 text-base">Gestión Profesional de Préstamos</p>
        </div>

        <div className="space-y-8 my-8">
          <div>
            <p className="text-3xl font-bold mb-2">Controla tu cartera</p>
            <p className="text-blue-200 leading-relaxed">
              Plataforma completa para prestamistas: gestiona préstamos, clientes y cobranza con total seguridad.
            </p>
          </div>

          <ul className="space-y-4">
            {[
              { icon: LayoutDashboard, title: 'Dashboard en tiempo real',   desc: 'Cartera, mora y flujo de caja al instante' },
              { icon: Star,            title: 'Score crediticio interno',    desc: 'Clasificación 1–5 según comportamiento de pago' },
              { icon: Globe,           title: 'Multi-moneda',               desc: 'Préstamos en DOP, USD, EUR, HTG y más' },
              { icon: Link2,           title: 'Solicitud en línea',         desc: 'Link único para que el cliente complete su aplicación' },
              { icon: MessageSquare,   title: 'WhatsApp y notificaciones',  desc: 'Recordatorios automáticos de pago y avisos de mora' },
              { icon: ShieldCheck,     title: 'Seguro y multi-empresa',     desc: 'Cada prestamista con sus datos aislados y protegidos' },
            ].map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex items-start gap-4">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-[#f59e0b]/20 flex items-center justify-center mt-0.5">
                  <Icon className="w-4 h-4 text-[#f59e0b]" />
                </div>
                <div>
                  <p className="font-semibold text-white">{title}</p>
                  <p className="text-sm text-blue-300 mt-0.5">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="text-xs text-blue-300 space-y-0.5">
          <p>PrestaMax — Powered by <span className="font-semibold text-[#f59e0b]">JPRS Digital Connect</span></p>
          <p className="text-blue-400">v1.0 · @digitalconnect_dr</p>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="w-full md:w-1/2 flex items-center justify-center bg-white p-6">
        <div className="w-full max-w-sm">
          {/* Mobile header */}
          <div className="md:hidden mb-8">
            <h1 className="text-3xl font-bold mb-1">
              <span className="text-[#1e3a5f]">Presta</span>
              <span className="text-[#f59e0b]">Max</span>
            </h1>
            <p className="text-slate-600 text-sm">Gestión Profesional de Préstamos</p>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">Iniciar Sesión</h2>
          <p className="text-slate-600 text-sm mb-6">Ingresa tus credenciales para acceder</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Input
                type="email"
                label="Correo Electrónico"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <Input
                type="password"
                label="Contraseña"
                placeholder="Ingresa tu contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                {error}
              </div>
            )}


<Button type="submit" isLoading={isLoading} size="lg" className="w-full mt-6">
              Iniciar Sesión
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-200 space-y-3">
            <p className="text-center text-sm text-slate-600">
              ¿Aún no tienes cuenta?{' '}
              <button
                type="button"
                onClick={() => navigate('/register')}
                className="text-[#1e3a5f] font-semibold hover:underline"
              >
                Regístrate aquí
              </button>
            </p>
            <p className="text-center text-xs text-slate-400">
              ¿Necesitas ayuda? Contacta a <span className="font-medium">JPRS Digital Connect</span>
            </p>
            <p className="text-center text-xs text-slate-400">
              <a href="/terms" className="hover:text-slate-600 underline">Términos de Uso</a>
              {' · '}
              <a href="/privacy" className="hover:text-slate-600 underline">Política de Privacidad</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginPage

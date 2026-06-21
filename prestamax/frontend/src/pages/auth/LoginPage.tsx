import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
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
import { useT, setLocale, getLocale, SUPPORTED_LOCALES, type Locale } from '@/lib/i18n'

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const t = useT()
  const currentLocale = getLocale()

  const { login } = useAuth()
  const { selectTenant, setUserTenants } = useTenant()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    if (searchParams.get('revoked') === '1') {
      const msg = searchParams.get('msg') || t('auth.revoked_default')
      setError(msg)
      toast.error(msg, { duration: 6000 })
      searchParams.delete('revoked'); searchParams.delete('msg')
      setSearchParams(searchParams, { replace: true })
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    try {
      const response = await api.post('/auth/login', { email, password })
      const { user, token, tenants } = response.data
      login(user, token)
      setUserTenants(tenants)
      if (tenants.length > 0) selectTenant(tenants[0])
      toast.success(t('auth.welcome'))
      navigate('/dashboard')
    } catch (err: any) {
      const code = err.response?.data?.code
      const message = err.response?.data?.error || err.response?.data?.message || t('auth.login_error')
      setError(message)
      toast.error(message, code === 'ACCESS_REVOKED' ? { duration: 6000 } : undefined)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-b from-[#1e3a5f] via-[#17324f] to-[#0e1f35] text-white flex-col justify-between p-10 overflow-y-auto">
        <div>
          <Link to="/" className="inline-block mb-3 hover:opacity-90 transition-opacity" title={t('auth.back_home')}>
            <h1 className="text-4xl font-bold">
              <span className="text-white">Credy</span>
              <span className="text-[#f59e0b]">Tek</span>
            </h1>
          </Link>
          <p className="text-blue-200 text-base">
            {currentLocale === 'en' ? 'Personal and commercial loan management platform for professional lenders.' : currentLocale === 'pt' ? 'Plataforma de gestao de emprestimos pessoais e comerciais para credores profissionais.' : 'Plataforma de gestion de prestamos personales y comerciales para prestamistas profesionales.'}
          </p>
        </div>

        <div className="space-y-8 my-8">
          <ul className="space-y-4">
            {[
              { icon: LayoutDashboard, title: t('landing.feature.dashboard'), desc: currentLocale === 'en' ? 'Portfolio, late payments and cash flow at a glance' : currentLocale === 'pt' ? 'Carteira, mora e fluxo de caixa em tempo real' : 'Cartera, mora y flujo de caja al instante' },
              { icon: Star,            title: t('landing.feature.score'),     desc: currentLocale === 'en' ? '0-100 point classification based on payment behavior' : currentLocale === 'pt' ? 'Classificacao 0-100 pontos com base no comportamento de pagamento' : 'Clasificacion 0-100 puntos segun comportamiento de pago' },
              { icon: Globe,           title: t('landing.feature.multi'),     desc: 'DOP, USD, EUR, HTG, MXN, COP, PEN, CLP, BOB, UYU, BRL, GTQ' },
              { icon: Link2,           title: t('landing.feature.apply'),     desc: currentLocale === 'en' ? 'Unique link so the client can submit their application' : currentLocale === 'pt' ? 'Link unico para o cliente preencher sua solicitacao' : 'Link unico para que el cliente complete su aplicacion' },
              { icon: MessageSquare,   title: t('landing.feature.whatsapp'),  desc: currentLocale === 'en' ? 'Automatic payment reminders and late notices' : currentLocale === 'pt' ? 'Lembretes automaticos de pagamento e avisos de atraso' : 'Recordatorios automaticos de pago y avisos de mora' },
              { icon: ShieldCheck,     title: t('landing.feature.secure'),    desc: currentLocale === 'en' ? 'Each lender with isolated and protected data' : currentLocale === 'pt' ? 'Cada credor com seus dados isolados e protegidos' : 'Cada prestamista con sus datos aislados y protegidos' },
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
          <p>(c) 2026 CredyTek. {currentLocale === 'en' ? 'All rights reserved.' : currentLocale === 'pt' ? 'Todos os direitos reservados.' : 'Todos los derechos reservados.'}</p>
          <p>JPRS Digital Connect</p>
        </div>
      </div>

      <div className="w-full md:w-1/2 flex items-center justify-center bg-white p-6 relative">
        <div className="absolute top-4 right-4 z-10">
          <select
            value={currentLocale}
            onChange={e => setLocale(e.target.value as Locale)}
            className="px-2 py-1 text-xs border border-slate-300 rounded-md bg-white hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400"
            title={t('common.language')}
          >
            {SUPPORTED_LOCALES.map(l => (
              <option key={l.code} value={l.code}>{l.flag} {l.name}</option>
            ))}
          </select>
        </div>
        <div className="w-full max-w-sm">
          <div className="md:hidden mb-8">
            <Link to="/" className="inline-block mb-1 hover:opacity-90 transition-opacity" title={t('auth.back_home')}>
              <h1 className="text-3xl font-bold">
                <span className="text-[#1e3a5f]">Credy</span>
                <span className="text-[#f59e0b]">Tek</span>
              </h1>
            </Link>
            <p className="text-slate-500 text-sm">
              {currentLocale === 'en' ? 'Loan management platform' : currentLocale === 'pt' ? 'Plataforma de gestao de emprestimos' : 'Plataforma de gestion de prestamos'}
            </p>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">{t('auth.login')}</h2>
          <p className="text-slate-600 text-sm mb-6">{currentLocale === 'en' ? 'Enter your credentials to access' : currentLocale === 'pt' ? 'Insira suas credenciais para acessar' : 'Ingresa tus credenciales para acceder'}</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Input
                type="email"
                label={t('auth.email')}
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <Input
                type="password"
                label={t('auth.password')}
                placeholder={currentLocale === 'en' ? 'Enter your password' : currentLocale === 'pt' ? 'Digite sua senha' : 'Ingresa tu contrasena'}
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

            <Button
              type="submit"
              isLoading={isLoading}
              size="lg"
              className="w-full mt-6 bg-gradient-to-r from-[#1e3a5f] to-[#2c5a8f] hover:from-[#16304e] hover:to-[#1e3a5f] shadow-lg shadow-[#1e3a5f]/30 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 font-semibold"
            >
              {t('auth.login')}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-200 space-y-3">
            <p className="text-center text-sm text-slate-600">
              {t('auth.no_account')}{' '}
              <button
                type="button"
                onClick={() => navigate('/register')}
                className="text-[#1e3a5f] font-semibold hover:underline"
              >
                {t('auth.register')}
              </button>
            </p>
            <p className="text-center text-xs text-slate-400">
              {t('auth.need_help')} <span className="font-medium">JPRS Digital Connect</span>
            </p>
            <p className="text-center text-xs text-slate-400">
              <a href="/terms" className="hover:text-slate-600 underline">{t('auth.terms')}</a>
              {' . '}
              <a href="/privacy" className="hover:text-slate-600 underline">{t('auth.privacy')}</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginPage

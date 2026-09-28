// PublicShell — header + footer compartidos por las páginas SEO/Recursos de
// Fase 4 (landing, contacto, términos y privacidad NO se tocan — mantienen su
// propio header inline, ya existente). Un solo lugar para el "chrome" público
// de estas páginas nuevas, para no repetirlo en cada una.
import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DollarSign, ArrowRight, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { trackTrialCtaClick } from '@/lib/analytics'

const PublicHeader: React.FC = () => {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const goTry = (location: 'nav' | 'nav_mobile') => {
    trackTrialCtaClick(location)
    navigate('/register')
  }
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gradient-to-br from-[#1e3a5f] to-[#152a45] rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900">CredyTek</span>
          </Link>
          <nav className="hidden lg:flex items-center gap-6">
            <Link to="/recursos" className="text-sm text-slate-600 hover:text-slate-900">Recursos</Link>
            <Link to="/calculadora-prestamos" className="text-sm text-slate-600 hover:text-slate-900">Calculadora</Link>
            <Link to="/#pricing" className="text-sm text-slate-600 hover:text-slate-900">Precios</Link>
            <Link to="/login" className="text-sm text-slate-600 hover:text-slate-900">Iniciar sesión</Link>
            <button
              type="button"
              onClick={() => goTry('nav')}
              className="px-4 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded-lg hover:bg-[#152a45] transition"
            >
              Probar CredyTek
            </button>
          </nav>
          <button
            onClick={() => setOpen(o => !o)}
            className="lg:hidden p-2 rounded-md text-slate-600 hover:bg-slate-100"
            aria-label="Menú"
          >
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
        {open && (
          <div className="lg:hidden py-4 border-t border-slate-200 space-y-2">
            <Link to="/recursos" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded">Recursos</Link>
            <Link to="/calculadora-prestamos" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded">Calculadora</Link>
            <Link to="/#pricing" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded">Precios</Link>
            <Link to="/login" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded">Iniciar sesión</Link>
            <button
              type="button"
              onClick={() => goTry('nav_mobile')}
              className="block w-full px-3 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded text-center"
            >
              Probar CredyTek
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

const PublicFooter: React.FC = () => (
  <footer className="bg-slate-900 text-slate-300 mt-auto">
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-[#1e3a5f] to-[#152a45] rounded-lg flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-white">CredyTek</span>
          </div>
          <p className="mt-3 text-sm text-slate-400">Software de gestión de préstamos para prestamistas en República Dominicana.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white">Recursos</h4>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link to="/recursos" className="hover:text-white">Centro de recursos</Link></li>
            <li><Link to="/calculadora-prestamos" className="hover:text-white">Calculadora de préstamos</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white">Producto</h4>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link to="/software-para-prestamistas" className="hover:text-white">Software para prestamistas</Link></li>
            <li><Link to="/control-prestamos-cobros" className="hover:text-white">Control de préstamos y cobros</Link></li>
            <li><Link to="/#pricing" className="hover:text-white">Precios</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white">Legal</h4>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link to="/terms" className="hover:text-white">Términos y condiciones</Link></li>
            <li><Link to="/privacy" className="hover:text-white">Política de privacidad</Link></li>
            <li><Link to="/contact" className="hover:text-white">Contacto</Link></li>
          </ul>
        </div>
      </div>
      <div className="mt-8 pt-6 border-t border-slate-800 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} CredyTek — JPRS Digital Connect
      </div>
    </div>
  </footer>
)

const PublicShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-white flex flex-col overflow-x-hidden">
    <PublicHeader />
    <main className="flex-1">{children}</main>
    <PublicFooter />
  </div>
)

export default PublicShell

import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import api from '@/lib/api'
import { useT } from '@/lib/i18n'
import { Mail, ArrowLeft } from 'lucide-react'

const ForgotPasswordPage: React.FC = () => {
  const t = useT()
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      await api.post('/auth/forgot-password', { email })
      setSent(true)
    } catch {
      // El backend siempre responde generico -- si esto falla es un error de red
      setSent(true)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link to="/" className="inline-block mb-1 hover:opacity-90 transition-opacity">
            <h1 className="text-3xl font-bold">
              <span className="text-[#1e3a5f]">Credy</span>
              <span className="text-[#f59e0b]">Tek</span>
            </h1>
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200 p-8">
          {sent ? (
            <div className="text-center py-2">
              <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
                <Mail className="w-6 h-6 text-[#1e3a5f]" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">{t('fp.sent_title')}</h2>
              <p className="text-slate-600 text-sm mb-6">{t('fp.sent_desc')}</p>
              <Link to="/login" className="text-sm font-semibold text-[#1e3a5f] hover:underline inline-flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> {t('fp.back_to_login')}
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-slate-900 mb-1">{t('fp.title')}</h2>
              <p className="text-slate-600 text-sm mb-6">{t('fp.subtitle')}</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  type="email"
                  label={t('auth.email')}
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Button type="submit" isLoading={isLoading} size="lg" className="w-full mt-2 bg-gradient-to-r from-[#1e3a5f] to-[#2c5a8f] hover:from-[#16304e] hover:to-[#1e3a5f]">
                  {t('fp.submit')}
                </Button>
              </form>
              <div className="mt-6 pt-6 border-t border-slate-200 text-center">
                <Link to="/login" className="text-sm font-semibold text-[#1e3a5f] hover:underline inline-flex items-center gap-1">
                  <ArrowLeft className="w-4 h-4" /> {t('fp.back_to_login')}
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ForgotPasswordPage

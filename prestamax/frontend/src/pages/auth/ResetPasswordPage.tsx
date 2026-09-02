import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import { useT } from '@/lib/i18n'
import { CheckCircle2 } from 'lucide-react'

const ResetPasswordPage: React.FC = () => {
  const t = useT()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError(t('rp.mismatch'))
      return
    }
    setIsLoading(true)
    try {
      await api.post('/auth/reset-password', { token, new_password: password })
      setDone(true)
      toast.success(t('rp.success'))
      setTimeout(() => navigate('/login'), 2000)
    } catch (err: any) {
      setError(err?.response?.data?.error || t('rp.error'))
    } finally {
      setIsLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
          <h2 className="text-xl font-bold text-slate-900 mb-2">{t('rp.invalid_link')}</h2>
          <p className="text-slate-600 text-sm mb-6">{t('rp.invalid_link_desc')}</p>
          <Link to="/forgot-password" className="text-sm font-semibold text-[#1e3a5f] hover:underline">{t('rp.request_new')}</Link>
        </div>
      </div>
    )
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
          {done ? (
            <div className="text-center py-2">
              <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">{t('rp.success')}</h2>
              <p className="text-slate-600 text-sm">{t('rp.redirecting')}</p>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-slate-900 mb-1">{t('rp.title')}</h2>
              <p className="text-slate-600 text-sm mb-6">{t('rp.subtitle')}</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  type="password"
                  label={t('rp.new_password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Input
                  type="password"
                  label={t('rp.confirm_password')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
                )}
                <Button type="submit" isLoading={isLoading} size="lg" className="w-full mt-2 bg-gradient-to-r from-[#1e3a5f] to-[#2c5a8f] hover:from-[#16304e] hover:to-[#1e3a5f]">
                  {t('rp.submit')}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ResetPasswordPage

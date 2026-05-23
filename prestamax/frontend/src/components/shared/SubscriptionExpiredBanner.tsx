// SubscriptionExpiredBanner — banner global cuando suscripcion expira (HTTP 402)
import React, { useEffect, useState, useCallback } from 'react'
import { AlertCircle, CreditCard } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '@/lib/api'

/**
 * Banner global que detecta dinámicamente si la suscripción está expirada.
 * Hace polling al endpoint /auth/subscription-status para mantener el estado
 * sincronizado con el backend. Si el admin renueva, el banner desaparece
 * sin necesidad de logout.
 */
const SubscriptionExpiredBanner: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [expired, setExpired] = useState<boolean>(false)
  const [daysLeft, setDaysLeft] = useState<number | null>(null)

  const checkStatus = useCallback(async () => {
    try {
      const res = await api.get('/auth/subscription-status')
      const isExpired = !!res.data?.expired
      const dl = res.data?.daysLeft ?? null
      setExpired(isExpired)
      setDaysLeft(dl)
      // Limpiar el flag legacy de sessionStorage si ya no esta expirado
      if (!isExpired) {
        try { sessionStorage.removeItem('prestamax_subscription_expired') } catch {}
      }
    } catch {
      // Sin internet o token inválido: no mostrar banner para no asustar
      setExpired(false)
    }
  }, [])

  useEffect(() => {
    checkStatus()
  }, [checkStatus, location.pathname])

  // Polling cada 60s para detectar renovaciones del admin sin recargar
  useEffect(() => {
    const id = setInterval(checkStatus, 60_000)
    return () => clearInterval(id)
  }, [checkStatus])

  // Escuchar evento del axios interceptor (cuando un 402 ocurre entre polls)
  useEffect(() => {
    const onExpired = () => { setExpired(true); checkStatus() }
    window.addEventListener('prestamax:subscription-expired', onExpired)
    return () => window.removeEventListener('prestamax:subscription-expired', onExpired)
  }, [checkStatus])

  if (!expired) return null

  return (
    <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm sm:text-base">Tu suscripción ha expirado</p>
            <p className="text-xs sm:text-sm text-white/90 mt-0.5">
              Las funciones del sistema están bloqueadas. Renueva tu plan para volver a operar.
              {daysLeft != null && daysLeft < 0 ? ` (vencida hace ${Math.abs(daysLeft)} día(s))` : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0 w-full sm:w-auto">
          <button
            onClick={() => navigate('/settings/subscription')}
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2 bg-white text-orange-700 hover:bg-orange-50 rounded-lg text-sm font-bold transition-colors shadow-sm"
          >
            <CreditCard className="w-4 h-4" />Renovar suscripción
          </button>
        </div>
      </div>
    </div>
  )
}

export default SubscriptionExpiredBanner

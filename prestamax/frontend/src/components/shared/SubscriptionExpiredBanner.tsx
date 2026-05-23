// SubscriptionExpiredBanner — banner global cuando suscripcion expira (HTTP 402)
import React, { useEffect, useState } from 'react'
import { AlertCircle, CreditCard } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

/**
 * Banner global que aparece cuando el backend responde HTTP 402 con
 * code:'SUBSCRIPTION_EXPIRED'. Se monta arriba de toda la app (debajo del
 * header) y reemplaza los toasts de error individuales con un mensaje claro
 * y un CTA para renovar.
 */
const SubscriptionExpiredBanner: React.FC = () => {
  const navigate = useNavigate()
  const [expired, setExpired] = useState(() => {
    try { return sessionStorage.getItem('prestamax_subscription_expired') } catch { return null }
  })

  useEffect(() => {
    const onExpired = (e: any) => {
      setExpired(e.detail?.message || 'Tu suscripción ha expirado.')
    }
    window.addEventListener('prestamax:subscription-expired', onExpired as EventListener)
    return () => window.removeEventListener('prestamax:subscription-expired', onExpired as EventListener)
  }, [])

  if (!expired) return null

  return (
    <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-bold text-sm sm:text-base">Tu suscripción ha expirado</p>
            <p className="text-xs sm:text-sm text-white/90 mt-0.5">
              Las funciones del sistema están bloqueadas. Renueva tu plan para volver a operar con normalidad.
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => navigate('/settings/subscription')}
            className="flex items-center gap-2 px-4 py-2 bg-white text-orange-700 hover:bg-orange-50 rounded-lg text-sm font-bold transition-colors shadow-sm"
          >
            <CreditCard className="w-4 h-4" />Renovar suscripción
          </button>
        </div>
      </div>
    </div>
  )
}

export default SubscriptionExpiredBanner

// SubscriptionExpiredBanner — banner global de estado de suscripción.
// Cubre DOS casos: (1) ya expiró (HTTP 402, bloqueado) y (2) trial por vencer
// (aviso proactivo). Antes solo existía el caso 1 -- el tenant nunca se
// enteraba de que su prueba estaba por terminar hasta chocar con el muro de
// pago, salvo que navegara manualmente a Configuración > Suscripción (nadie
// lo hace). Esto cierra ese hueco sin tocar la lógica de bloqueo del backend.
import React, { useEffect, useState, useCallback } from 'react'
import { AlertCircle, CreditCard, Clock } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '@/lib/api'

const DISMISS_KEY = 'credytek_trial_banner_dismissed_until'

/**
 * Banner global que detecta dinámicamente el estado de la suscripción.
 * Hace polling al endpoint /auth/subscription-status para mantener el estado
 * sincronizado con el backend. Si el admin renueva, el banner desaparece
 * sin necesidad de logout.
 */
const SubscriptionExpiredBanner: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [expired, setExpired] = useState<boolean>(false)
  const [isTrial, setIsTrial] = useState<boolean>(false)
  const [daysLeft, setDaysLeft] = useState<number | null>(null)
  const [dismissedToday, setDismissedToday] = useState<boolean>(false)

  const checkStatus = useCallback(async () => {
    try {
      const res = await api.get('/auth/subscription-status')
      const isExpired = !!res.data?.expired
      const dl = res.data?.daysLeft ?? null
      setExpired(isExpired)
      setIsTrial(!!res.data?.isTrial)
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

  useEffect(() => {
    try {
      const until = localStorage.getItem(DISMISS_KEY)
      setDismissedToday(!!until && until === new Date().toISOString().slice(0, 10))
    } catch {}
  }, [])

  const goToPlans = () => {
    if (location.pathname === '/settings/subscription') {
      document.getElementById('cambiar-de-plan')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      navigate('/settings/subscription')
    }
  }

  if (expired) {
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
              onClick={goToPlans}
              className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2 bg-white text-orange-700 hover:bg-orange-50 rounded-lg text-sm font-bold transition-colors shadow-sm"
            >
              <CreditCard className="w-4 h-4" />Renovar suscripción
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Aviso proactivo de trial por vencer (3 días o menos). Se puede cerrar por
  // el resto del día (no se re-muestra hasta mañana), pero vuelve a aparecer
  // al día siguiente si sigue en trial -- no queremos que desaparezca para
  // siempre con un solo clic y nunca más se sepa que la prueba está por acabar.
  if (isTrial && daysLeft != null && daysLeft <= 3 && daysLeft >= 0 && !dismissedToday) {
    const urgent = daysLeft <= 1
    return (
      <div className={urgent ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-md' : 'bg-amber-50 border-b border-amber-200 text-amber-900'}>
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <Clock className={`w-4.5 h-4.5 flex-shrink-0 ${urgent ? '' : 'text-amber-600'}`} />
            <p className="text-sm min-w-0">
              <strong>{daysLeft === 0 ? 'Tu prueba gratis termina hoy' : daysLeft === 1 ? 'Tu prueba gratis termina mañana' : `Tu prueba gratis termina en ${daysLeft} días`}</strong>
              <span className={urgent ? 'text-white/90' : 'text-amber-700'}> — elige un plan para no perder acceso a tu cartera.</span>
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0 w-full sm:w-auto">
            <button
              onClick={goToPlans}
              className={`flex items-center justify-center gap-2 flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-sm font-bold transition-colors shadow-sm ${urgent ? 'bg-white text-orange-700 hover:bg-orange-50' : 'bg-[#1e3a5f] text-white hover:bg-[#152a45]'}`}
            >
              <CreditCard className="w-3.5 h-3.5" />Ver planes
            </button>
            <button
              onClick={() => {
                setDismissedToday(true)
                try { localStorage.setItem(DISMISS_KEY, new Date().toISOString().slice(0, 10)) } catch {}
              }}
              className={`px-2 text-xs underline flex-shrink-0 ${urgent ? 'text-white/80 hover:text-white' : 'text-amber-600 hover:text-amber-800'}`}
            >
              Ahora no
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

export default SubscriptionExpiredBanner

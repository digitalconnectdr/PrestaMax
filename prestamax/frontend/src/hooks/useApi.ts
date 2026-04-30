import { useState, useCallback } from 'react'
import api, { isAccessDenied } from '@/lib/api'
import toast from 'react-hot-toast'

export interface ApiError {
  message: string
  code?: string
  required_perm?: string
}

export function useApi<T = any>() {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const request = useCallback(async (config: any) => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await api(config)
      setData(response.data)
      return response.data
    } catch (err: any) {
      const errorCode = err.response?.data?.code
      const errorMessage = err.response?.data?.message || err.response?.data?.error || err.message || 'Error en la solicitud'
      
      const errorObj: ApiError = {
        message: errorMessage,
        code: errorCode,
        required_perm: err.response?.data?.required_perm,
      }
      
      setError(errorObj)
      
      // 403 = access denied by plan/permission - silent, no toast
      if (!isAccessDenied(err)) {
        // Handle PLAN_FEATURE_REQUIRED specially - still show toast but indicate it's a plan issue
        if (errorCode === 'PLAN_FEATURE_REQUIRED') {
          toast.error('Esta función requiere un plan superior. Actualiza tu plan para acceder.')
        } else {
          toast.error(errorMessage)
        }
      }
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { data, isLoading, error, request }
}

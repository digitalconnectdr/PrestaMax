import axios from 'axios'

// Convert snake_case keys to camelCase recursively
function camelize(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

function camelizeKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(camelizeKeys)
  }
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[camelize(key)] = camelizeKeys(value)
    }
    return result
  }
  return obj
}

// Convert camelCase keys to snake_case recursively (for outgoing requests)
function snakify(str: string): string {
  return str.replace(/([A-Z])/g, (letter) => `_${letter.toLowerCase()}`)
}

function snakifyKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(snakifyKeys)
  }
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[snakify(key)] = snakifyKeys(value)
    }
    return result
  }
  return obj
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
})

// Request interceptor: add auth token + tenant header + convert camelCase to snake_case
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('prestamax_token')
  const tenantId = localStorage.getItem('prestamax_tenant_id')

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (tenantId) {
    config.headers['X-Tenant-Id'] = tenantId
  }

  // Convert request body keys from camelCase to snake_case
  if (config.data && typeof config.data === 'object') {
    config.data = snakifyKeys(config.data)
  }

  return config
})

// Response interceptor: convert snake_case to camelCase + handle 401
api.interceptors.response.use(
  (response) => {
    response.data = camelizeKeys(response.data)
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('prestamax_token')
      localStorage.removeItem('prestamax_tenant_id')
      window.location.href = '/login'
    }
    // 403 errors are access-denied — mark them so pages can handle silently
    if (error.response?.status === 403) {
      error.isAccessDenied = true
    }
    return Promise.reject(error)
  }
)

/**
 * Returns true if the error is a 403 permission/access-denied response.
 * Pages should check this before showing error toasts — no-access should be silent.
 */
export function isAccessDenied(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { isAccessDenied?: boolean; response?: { status?: number } }
  return e.isAccessDenied === true || e.response?.status === 403
}

export default api

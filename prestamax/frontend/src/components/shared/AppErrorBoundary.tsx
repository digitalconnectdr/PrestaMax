import React from 'react'
import { isChunkLoadError, reloadOnceForNewVersion } from '@/lib/chunkReload'
import { captureError } from '@/lib/sentry'
import { t } from '@/lib/i18n'

interface State { error: Error | null; reloading: boolean }

/**
 * Última red de seguridad de la app: sin esto, cualquier error de render (o un chunk que falló al cargar tras un
 * despliegue) desmonta todo React y el usuario ve una pantalla en blanco hasta recargar a mano.
 *  - Error de carga de chunk → recarga automática una sola vez (nueva versión).
 *  - Cualquier otro error → mensaje claro con botón "Recargar", y se reporta a Sentry.
 */
export default class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, reloading: false }

  static getDerivedStateFromError(error: Error): State {
    return { error, reloading: false }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (isChunkLoadError(error)) {
      if (reloadOnceForNewVersion()) this.setState({ reloading: true })
      return
    }
    captureError(error, { tag: 'react-error-boundary' })
    // eslint-disable-next-line no-console
    console.error('[AppErrorBoundary]', error, info?.componentStack)
  }

  render() {
    const { error, reloading } = this.state
    if (!error) return this.props.children
    return (
      <div role="alert" className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-center">
          <h1 className="text-lg font-semibold text-slate-800">
            {reloading ? t('err.updating_title') : t('err.title')}
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            {reloading ? t('err.updating_desc') : t('err.desc')}
          </p>
          {!reloading && (
            <div className="mt-5 flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg bg-[#1e3a5f] text-white text-sm font-medium hover:opacity-90"
              >
                {t('err.reload')}
              </button>
              <button
                type="button"
                onClick={() => { window.location.href = '/dashboard' }}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
              >
                {t('err.home')}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }
}

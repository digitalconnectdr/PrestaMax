import React, { useState, useCallback } from 'react'
import ConfirmModal, { ConfirmVariant } from '@/components/ui/ConfirmModal'

interface ConfirmOptions {
  title: string
  message: React.ReactNode
  confirmText?: string
  cancelText?: string
  variant?: ConfirmVariant
}

/**
 * Reemplaza window.confirm() con un modal estético consistente.
 * Uso:
 *   const { confirm, ConfirmHost } = useConfirm()
 *   const ok = await confirm({ title: '¿Eliminar?', message: 'No se puede deshacer.', variant: 'danger' })
 *   if (ok) { ... }
 *
 *   En el JSX:  <ConfirmHost />
 */
export function useConfirm() {
  const [state, setState] = useState<{ open: boolean; options: ConfirmOptions | null; resolve: ((v: boolean) => void) | null }>({
    open: false, options: null, resolve: null,
  })
  const [loading, setLoading] = useState(false)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>(resolve => {
      setState({ open: true, options, resolve })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    if (state.resolve) state.resolve(true)
    setState({ open: false, options: null, resolve: null })
  }, [state])

  const handleCancel = useCallback(() => {
    if (state.resolve) state.resolve(false)
    setState({ open: false, options: null, resolve: null })
  }, [state])

  const ConfirmHost: React.FC = () => (
    <ConfirmModal
      open={state.open}
      title={state.options?.title || ''}
      message={state.options?.message || ''}
      confirmText={state.options?.confirmText}
      cancelText={state.options?.cancelText}
      variant={state.options?.variant}
      loading={loading}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  )

  return { confirm, ConfirmHost, setConfirmLoading: setLoading }
}

import React from 'react'
import { X, AlertTriangle, AlertCircle, Trash2, CheckCircle2 } from 'lucide-react'
import Button from './Button'
import Card from './Card'

export type ConfirmVariant = 'danger' | 'warning' | 'info' | 'success'

interface ConfirmModalProps {
  open: boolean
  title: string
  message: React.ReactNode
  confirmText?: string
  cancelText?: string
  variant?: ConfirmVariant
  loading?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

const VARIANT_STYLES: Record<ConfirmVariant, { icon: any; iconBg: string; iconColor: string; btn: string }> = {
  danger:  { icon: Trash2,        iconBg: 'bg-red-100',     iconColor: 'text-red-600',     btn: 'bg-red-600 hover:bg-red-700' },
  warning: { icon: AlertTriangle, iconBg: 'bg-amber-100',   iconColor: 'text-amber-600',   btn: 'bg-amber-600 hover:bg-amber-700' },
  info:    { icon: AlertCircle,   iconBg: 'bg-blue-100',    iconColor: 'text-blue-600',    btn: 'bg-blue-600 hover:bg-blue-700' },
  success: { icon: CheckCircle2,  iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', btn: 'bg-emerald-600 hover:bg-emerald-700' },
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open, title, message,
  confirmText = 'Confirmar',
  cancelText  = 'Cancelar',
  variant = 'info',
  loading = false,
  onConfirm, onCancel,
}) => {
  if (!open) return null
  const style = VARIANT_STYLES[variant]
  const Icon  = style.icon

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-[60] p-4 overflow-y-auto" onClick={onCancel}>
      <Card className="w-full max-w-md my-8" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-full ${style.iconBg} flex-shrink-0`}>
            <Icon className={`w-5 h-5 ${style.iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
              <button onClick={onCancel} className="text-slate-400 hover:text-slate-600" aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-sm text-slate-600 whitespace-pre-line">{message}</div>
          </div>
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <Button variant="outline" onClick={onCancel} disabled={loading}>{cancelText}</Button>
          <Button onClick={onConfirm} disabled={loading} className={style.btn + ' text-white'}>
            {loading ? 'Procesando…' : confirmText}
          </Button>
        </div>
      </Card>
    </div>
  )
}

export default ConfirmModal

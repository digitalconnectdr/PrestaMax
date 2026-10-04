import React from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string
  label?: string
  helperText?: string
  /** Elemento junto a la etiqueta (p. ej. una ayuda ⓘ). */
  labelAddon?: React.ReactNode
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, label, helperText, labelAddon, type = 'text', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <div className="flex items-center gap-1.5 mb-1">
            <label className="block text-sm font-medium text-slate-700">
              {label}
              {props.required && <span className="text-red-500">*</span>}
            </label>
            {labelAddon}
          </div>
        )}
        <input
          type={type}
          className={cn(
            'w-full px-3 py-2 border rounded-lg text-base transition-colors duration-200',
            'focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent',
            'disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed',
            error ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 hover:border-slate-400',
            className
          )}
          ref={ref}
          {...props}
        />
        {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
        {helperText && !error && <p className="text-slate-500 text-sm mt-1">{helperText}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'

export default Input

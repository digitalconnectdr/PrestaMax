import React from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, disabled, children, ...props }, ref) => {
    const baseStyles = 'font-medium transition-colors duration-200 rounded-lg flex items-center justify-center gap-2'

    const variants = {
      primary: 'bg-[#1e3a5f] text-white hover:bg-[#152a45] disabled:bg-slate-400',
      secondary: 'bg-slate-200 text-slate-900 hover:bg-slate-300 disabled:bg-slate-200',
      danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-400',
      ghost: 'text-slate-700 hover:bg-slate-100 disabled:text-slate-400',
      outline: 'border-2 border-[#1e3a5f] text-[#1e3a5f] hover:bg-[#1e3a5f] hover:text-white disabled:border-slate-300 disabled:text-slate-300',
    }

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-base',
      lg: 'px-6 py-3 text-lg',
    }

    return (
      <button
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={isLoading || disabled}
        ref={ref}
        {...props}
      >
        {isLoading && <span className="animate-spin">⟳</span>}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export default Button

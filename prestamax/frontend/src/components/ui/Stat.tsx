import React from 'react'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatProps {
  icon: LucideIcon
  title: string
  value: string | number
  trend?: number
  footer?: string
  color?: 'blue' | 'green' | 'amber' | 'red' | 'purple'
}

const Stat: React.FC<StatProps> = ({
  icon: Icon,
  title,
  value,
  trend,
  footer,
  color = 'blue',
}) => {
  const colors = {
    blue: 'text-blue-600 bg-blue-50',
    green: 'text-emerald-600 bg-emerald-50',
    amber: 'text-amber-600 bg-amber-50',
    red: 'text-red-600 bg-red-50',
    purple: 'text-purple-600 bg-purple-50',
  }

  return (
    <div className="bg-white rounded-lg p-6 border border-slate-200">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-slate-600 text-sm font-medium">{title}</p>
          <p className="text-2xl font-bold text-slate-900 mt-2">{value}</p>
          {footer && <p className="text-xs text-slate-500 mt-2">{footer}</p>}
        </div>
        <div className={cn('p-3 rounded-lg', colors[color])}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      {trend !== undefined && (
        <div className="mt-4 text-xs">
          <span className={trend >= 0 ? 'text-emerald-600' : 'text-red-600'}>
            {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
          </span>
          <span className="text-slate-500 ml-1">vs mes anterior</span>
        </div>
      )}
    </div>
  )
}

export default Stat

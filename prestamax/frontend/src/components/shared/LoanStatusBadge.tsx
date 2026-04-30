import React from 'react'
import Badge from '@/components/ui/Badge'
import { getLoanStatusConfig } from '@/lib/utils'
import { LoanStatus } from '@/types'

interface LoanStatusBadgeProps {
  status: LoanStatus
}

const LoanStatusBadge: React.FC<LoanStatusBadgeProps> = ({ status }) => {
  const config = getLoanStatusConfig(status)

  const variantMap: Record<string, any> = {
    'text-slate-600': 'default',
    'text-blue-600': 'info',
    'text-amber-600': 'warning',
    'text-green-600': 'success',
    'text-red-600': 'danger',
    'text-emerald-600': 'success',
    'text-orange-600': 'warning',
    'text-purple-600': 'purple',
    'text-red-700': 'danger',
  }

  return <Badge variant={variantMap[config.color] || 'default'}>{config.label}</Badge>
}

export default LoanStatusBadge

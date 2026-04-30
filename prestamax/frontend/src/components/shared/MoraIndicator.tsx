import React from 'react'
import Badge from '@/components/ui/Badge'
import { getMoraCategory } from '@/lib/utils'

interface MoraIndicatorProps {
  days: number
  showDays?: boolean
}

const MoraIndicator: React.FC<MoraIndicatorProps> = ({ days, showDays = true }) => {
  const mora = getMoraCategory(days)

  const variantMap: Record<string, any> = {
    'text-emerald-600': 'success',
    'text-yellow-600': 'warning',
    'text-orange-600': 'warning',
    'text-red-600': 'danger',
    'text-red-700': 'danger',
  }

  return (
    <Badge variant={variantMap[mora.color] || 'default'}>
      {showDays ? `${days}d - ${mora.label}` : mora.label}
    </Badge>
  )
}

export default MoraIndicator

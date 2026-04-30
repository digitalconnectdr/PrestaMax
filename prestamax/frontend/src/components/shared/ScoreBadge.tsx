import React from 'react'
import { getScoreColor, getScoreBgColor, getScoreLabel, getScoreBarColor } from '@/lib/utils'

interface ScoreBadgeProps {
  score: number
  showLabel?: boolean
  /** compact = solo pill con número, sin barra */
  compact?: boolean
}

const ScoreBadge: React.FC<ScoreBadgeProps> = ({ score, showLabel = true, compact = false }) => {
  const s = Math.max(0, Math.min(100, Math.round(score)))
  const color    = getScoreColor(s)
  const bgColor  = getScoreBgColor(s)
  const barColor = getScoreBarColor(s)
  const label    = getScoreLabel(s)

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${bgColor}`}>
        <span className={`text-sm font-bold ${color}`}>{s}</span>
        {showLabel && <span className={`text-xs font-medium ${color}`}>{label}</span>}
      </div>
    )
  }

  return (
    <div className="w-full space-y-1.5">
      <div className="flex items-center justify-between">
        <span className={`text-2xl font-bold ${color}`}>{s}<span className="text-sm font-normal text-slate-400">/100</span></span>
        {showLabel && <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${bgColor} ${color}`}>{label}</span>}
      </div>
      <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${s}%` }}
        />
      </div>
      {/* Escala de referencia */}
      <div className="flex justify-between text-[10px] text-slate-400 px-0.5">
        <span>0</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100</span>
      </div>
    </div>
  )
}

export default ScoreBadge

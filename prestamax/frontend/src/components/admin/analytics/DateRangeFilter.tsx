// DateRangeFilter — filtro temporal compartido por las vistas Resumen,
// Conversión y Comportamiento del Admin Panel (Hoy / 7 días / 30 días /
// 90 días / Personalizado). El componente padre es dueño del estado y decide
// qué query params mandar al backend (range=... o from=...&to=...).
import React from 'react'
import { Calendar } from 'lucide-react'

export type RangePreset = 'today' | '7d' | '30d' | '90d' | 'custom'

export interface DateRangeValue {
  preset: RangePreset
  from?: string // YYYY-MM-DD, solo cuando preset === 'custom'
  to?: string
}

interface Props {
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
}

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: '90d', label: '90 días' },
  { key: 'custom', label: 'Personalizado' },
]

const DateRangeFilter: React.FC<Props> = ({ value, onChange }) => {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
      <div className="flex gap-1 flex-wrap">
        {PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => onChange({ ...value, preset: p.key })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              value.preset === p.key ? 'bg-[#1e3a5f] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {value.preset === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={value.from || ''}
            onChange={e => onChange({ ...value, from: e.target.value })}
            className="px-2 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-slate-400 text-xs">a</span>
          <input
            type="date"
            value={value.to || ''}
            onChange={e => onChange({ ...value, to: e.target.value })}
            className="px-2 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}
    </div>
  )
}

/** Convierte el valor del filtro en query params reales para las llamadas a /admin/analytics/*. */
export function rangeToQuery(value: DateRangeValue): Record<string, string> {
  if (value.preset === 'custom' && value.from && value.to) {
    return { from: value.from, to: value.to }
  }
  return { range: value.preset === 'custom' ? '30d' : value.preset }
}

export default DateRangeFilter

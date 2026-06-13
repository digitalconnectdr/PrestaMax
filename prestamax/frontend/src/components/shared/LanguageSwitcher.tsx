// ─── LanguageSwitcher ────────────────────────────────────────────────────────
// Selector de idioma reutilizable. Dos variantes:
//   - 'compact' (default): botón con bandera + menú desplegable. Para el header.
//   - 'inline': fila de botones con bandera + nombre. Para Configuración.
// Cambia el idioma global vía setLocale (persiste en localStorage y re-renderiza
// toda la app que use useT()).
import React, { useEffect, useRef, useState } from 'react'
import { Globe, Check } from 'lucide-react'
import { setLocale, getLocale, SUPPORTED_LOCALES, useT, type Locale } from '@/lib/i18n'

interface Props {
  variant?: 'compact' | 'inline'
}

const LanguageSwitcher: React.FC<Props> = ({ variant = 'compact' }) => {
  const t = useT()
  const current = getLocale()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (variant === 'inline') {
    return (
      <div className="flex flex-wrap gap-2">
        {SUPPORTED_LOCALES.map(l => {
          const active = l.code === current
          return (
            <button
              key={l.code}
              type="button"
              onClick={() => setLocale(l.code as Locale)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                active ? 'bg-blue-50 border-blue-300 text-blue-800 font-medium' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="text-base">{l.flag}</span>
              <span>{l.name}</span>
              {active && <Check className="w-4 h-4 text-blue-600" />}
            </button>
          )
        })}
      </div>
    )
  }

  // compact
  const currentLocale = SUPPORTED_LOCALES.find(l => l.code === current)
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600"
        title={t('common.language')}
        aria-label={t('common.language')}
      >
        <Globe className="w-5 h-5" />
        <span className="text-sm hidden sm:inline">{currentLocale?.flag}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50">
          <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{t('common.language')}</div>
          {SUPPORTED_LOCALES.map(l => {
            const active = l.code === current
            return (
              <button
                key={l.code}
                type="button"
                onClick={() => { setLocale(l.code as Locale); setOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                  active ? 'bg-blue-50 text-blue-800 font-medium' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="text-base">{l.flag}</span>
                <span className="flex-1">{l.name}</span>
                {active && <Check className="w-4 h-4 text-blue-600" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default LanguageSwitcher

import React, { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, HelpCircle } from 'lucide-react'
import { BASE_CURRENCY, summarizeSelection } from '@/lib/currencyOptions'

export interface CurrencyOption { code: string; name: string }

interface Props {
  label: string
  helpText: string
  helpAriaLabel: string
  baseLabel: string
  listAriaLabel: string
  options: CurrencyOption[]
  value: string[]
  /** Alterna una moneda (el padre aplica la regla con el estado MÁS RECIENTE; DOP no se puede quitar). */
  onToggle: (code: string) => void
}

/**
 * Dropdown de multiselección para "Monedas de operación" (sin librerías nuevas).
 * - DOP aparece siempre seleccionada y no se puede quitar ("Base del sistema").
 * - Accesible: botón con aria-haspopup="listbox", opciones role="option" aria-selected,
 *   teclado (flechas, Inicio/Fin, Espacio/Enter, Esc, Tab) y cierre al hacer clic fuera.
 * - Ayuda contextual (ⓘ) con role="tooltip": se muestra con mouse (hover), teclado/foco y clic/tap.
 */
const CurrencyMultiSelect: React.FC<Props> = ({ label, helpText, helpAriaLabel, baseLabel, listAriaLabel, options, value, onToggle }) => {
  const uid = useId()
  const triggerId = `${uid}-trigger`
  const listId = `${uid}-list`
  const tipId = `${uid}-tip`
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [tipHover, setTipHover] = useState(false)
  const [tipFocus, setTipFocus] = useState(false)
  const [tipPinned, setTipPinned] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const tipVisible = tipHover || tipFocus || tipPinned

  // Cierra al hacer clic/tap fuera (lista y ayuda fijada con clic).
  useEffect(() => {
    if (!open && !tipPinned) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) { setOpen(false); setTipPinned(false) }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown) }
  }, [open, tipPinned])

  // Al abrir, enfoca la lista para que el teclado opere sobre ella.
  useEffect(() => { if (open) listRef.current?.focus() }, [open])

  const openList = () => { setActive(Math.max(0, options.findIndex(o => value.includes(o.code) && o.code !== BASE_CURRENCY))); setOpen(true) }
  const close = (refocus = true) => { setOpen(false); if (refocus) triggerRef.current?.focus() }
  const toggle = (code: string) => onToggle(code)

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!open) openList() }
  }
  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(options.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1) }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); const o = options[active]; if (o) toggle(o.code) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
    else if (e.key === 'Tab') { close(false) }
  }
  const onRootKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && tipVisible) { setTipHover(false); setTipFocus(false); setTipPinned(false) }
  }

  return (
    <div ref={rootRef} className="relative" onKeyDown={onRootKeyDown}>
      <div className="flex items-center gap-1.5 mb-1">
        <label id={`${uid}-label`} htmlFor={triggerId} className="block text-sm font-medium text-slate-700">{label}</label>
        <button
          type="button"
          aria-label={helpAriaLabel}
          aria-describedby={tipVisible ? tipId : undefined}
          aria-expanded={tipVisible}
          onMouseEnter={() => setTipHover(true)}
          onMouseLeave={() => setTipHover(false)}
          onFocus={() => setTipFocus(true)}
          onBlur={() => setTipFocus(false)}
          onClick={() => setTipPinned(p => !p)}
          className="text-slate-400 hover:text-[#1e3a5f] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e3a5f] rounded-full"
        >
          <HelpCircle className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      {tipVisible && (
        <div id={tipId} role="tooltip" className="absolute left-0 top-7 z-30 w-full max-w-sm rounded-lg bg-slate-800 text-white text-xs leading-relaxed p-3 shadow-lg">
          {helpText}
        </div>
      )}

      <button
        id={triggerId}
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onTriggerKeyDown}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className="truncate text-slate-800">{summarizeSelection(value)}</span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-multiselectable="true"
          aria-label={listAriaLabel}
          aria-activedescendant={`${uid}-opt-${options[active]?.code}`}
          tabIndex={0}
          onKeyDown={onListKeyDown}
          className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg focus:outline-none"
        >
          {options.map((o, i) => {
            const selected = value.includes(o.code)
            const isBase = o.code === BASE_CURRENCY
            return (
              <li
                key={o.code}
                id={`${uid}-opt-${o.code}`}
                role="option"
                aria-selected={selected}
                aria-disabled={isBase || undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => toggle(o.code)}
                className={`flex items-center gap-2 px-3 py-2 text-sm ${isBase ? 'cursor-default' : 'cursor-pointer'} ${i === active ? 'bg-blue-50' : ''}`}
              >
                <span
                  aria-hidden="true"
                  className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center ${selected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-white'} ${isBase ? 'opacity-70' : ''}`}
                >
                  {selected && <Check className="w-3 h-3" />}
                </span>
                <span className="min-w-0 flex-1 break-words text-slate-800">{o.code} — {o.name}</span>
                {isBase && <span className="flex-shrink-0 text-xs text-blue-600 font-medium">{baseLabel}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default CurrencyMultiSelect

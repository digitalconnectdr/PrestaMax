import React, { useEffect, useId, useRef, useState } from 'react'
import { HelpCircle } from 'lucide-react'

export interface InfoTipItem { term: string; text: string }

interface Props {
  /** Texto accesible del botón ⓘ (p. ej. "Más información sobre el modo de score"). */
  ariaLabel: string
  /** Frase introductoria. */
  intro: string
  /** Opciones explicadas una por una (término en negrita + descripción). */
  items?: InfoTipItem[]
  /** Aclaración final (ejemplo, restricciones). */
  note?: string
}

/**
 * Ayuda contextual (ⓘ) junto a una etiqueta de formulario. Mismo comportamiento que la de "Monedas de operación":
 * se abre con hover, foco de teclado o clic/tap (queda fijada), y se cierra con Esc, clic fuera o al quitar el foco.
 * role="tooltip" + aria-describedby; no toma el foco ni bloquea el campo.
 */
const InfoTip: React.FC<Props> = ({ ariaLabel, intro, items, note }) => {
  const tipId = useId()
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const [pinned, setPinned] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const visible = hover || focus || pinned

  useEffect(() => {
    if (!pinned) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setPinned(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown) }
  }, [pinned])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && visible) { e.stopPropagation(); setHover(false); setFocus(false); setPinned(false) }
  }

  return (
    <span ref={rootRef} className="relative inline-flex align-middle" onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-describedby={visible ? tipId : undefined}
        aria-expanded={visible}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onClick={() => setPinned(p => !p)}
        className="text-slate-400 hover:text-[#1e3a5f] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e3a5f] rounded-full"
      >
        <HelpCircle className="w-4 h-4" aria-hidden="true" />
      </button>
      {visible && (
        <span
          id={tipId}
          role="tooltip"
          className="absolute left-0 top-6 z-30 block w-80 max-w-[calc(100vw-3rem)] rounded-lg bg-slate-800 text-white text-xs font-normal leading-relaxed p-3 shadow-lg space-y-2"
        >
          <span className="block">{intro}</span>
          {items && items.length > 0 && (
            <span className="block space-y-1.5">
              {items.map(it => (
                <span key={it.term} className="block"><strong className="font-semibold">{it.term}:</strong> {it.text}</span>
              ))}
            </span>
          )}
          {note && <span className="block text-slate-300">{note}</span>}
        </span>
      )}
    </span>
  )
}

export default InfoTip

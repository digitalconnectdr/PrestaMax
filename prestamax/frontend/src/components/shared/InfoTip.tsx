import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
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

const GAP = 8      // separación entre el ícono y el globo
const MARGIN = 8   // margen mínimo con los bordes de la ventana

/**
 * Ayuda contextual (ⓘ) junto a una etiqueta de formulario. Mismo comportamiento que la de "Monedas de operación":
 * se abre con hover, foco de teclado o clic/tap (queda fijada), y se cierra con Esc, clic fuera o al quitar el foco.
 * role="tooltip" + aria-describedby; no toma el foco ni bloquea el campo.
 *
 * El globo usa position: fixed y se coloca según el espacio real de la ventana: debajo del ícono si cabe, si no arriba,
 * y se ajusta horizontalmente para no salirse de la pantalla; si aun así es más alto que el espacio, hace scroll interno.
 */
const InfoTip: React.FC<Props> = ({ ariaLabel, intro, items, note }) => {
  const tipId = useId()
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
  const rootRef = useRef<HTMLSpanElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const visible = hover || focus || pinned

  const place = useCallback(() => {
    const btn = btnRef.current
    const tip = tipRef.current
    if (!btn || !tip) return
    const r = btn.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = tip.offsetWidth
    const h = tip.scrollHeight
    const below = vh - r.bottom - GAP - MARGIN
    const above = r.top - GAP - MARGIN
    // Debajo si cabe completo; si no, donde haya más espacio.
    const useBelow = h <= below || below >= above
    const room = Math.max(120, useBelow ? below : above)
    const height = Math.min(h, room)
    const top = useBelow ? r.bottom + GAP : r.top - GAP - height
    const left = Math.min(Math.max(MARGIN, r.left), Math.max(MARGIN, vw - w - MARGIN))
    setPos({ top, left, maxHeight: room })
  }, [])

  // Mide y coloca al abrir y cuando cambia el contenido (idioma) o la ventana (resize/scroll).
  useLayoutEffect(() => {
    if (!visible) { setPos(null); return }
    place()
  }, [visible, intro, items, note, place])

  useEffect(() => {
    if (!visible) return
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [visible, place])

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
        ref={btnRef}
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
          ref={tipRef}
          id={tipId}
          role="tooltip"
          style={pos ? { top: pos.top, left: pos.left, maxHeight: pos.maxHeight } : { top: 0, left: 0, visibility: 'hidden' }}
          className="fixed z-[60] block w-80 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg bg-slate-800 text-white text-xs font-normal leading-relaxed p-3 shadow-lg space-y-2"
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

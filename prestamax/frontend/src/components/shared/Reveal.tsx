// ─── Reveal / AnimatedCounter — animaciones del landing ──────────────────────
// Reveal: aplica la clase .is-visible cuando el elemento entra al viewport
// (scroll-reveal). AnimatedCounter: anima un número de 0 a su valor al verse.
import React, { useEffect, useRef, useState } from 'react'

interface RevealProps {
  children: React.ReactNode
  className?: string
  delay?: number // ms
  as?: keyof JSX.IntrinsicElements
}

export const Reveal: React.FC<RevealProps> = ({ children, className = '', delay = 0, as = 'div' }) => {
  const ref = useRef<HTMLElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { setVisible(true); obs.unobserve(e.target) }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const Tag = as as any
  return (
    <Tag
      ref={ref}
      className={`reveal ${visible ? 'is-visible' : ''} ${className}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  )
}

interface CounterProps {
  value: number
  prefix?: string
  suffix?: string
  duration?: number // ms
  format?: (n: number) => string
  className?: string
}

export const AnimatedCounter: React.FC<CounterProps> = ({ value, prefix = '', suffix = '', duration = 1400, format, className }) => {
  const ref = useRef<HTMLSpanElement | null>(null)
  const [display, setDisplay] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setDisplay(value); return }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !started.current) {
          started.current = true
          const start = performance.now()
          const tick = (now: number) => {
            const p = Math.min(1, (now - start) / duration)
            const eased = 1 - Math.pow(1 - p, 3) // easeOutCubic
            setDisplay(value * eased)
            if (p < 1) requestAnimationFrame(tick)
            else setDisplay(value)
          }
          requestAnimationFrame(tick)
          obs.unobserve(e.target)
        }
      })
    }, { threshold: 0.4 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [value, duration])

  const text = format ? format(display) : Math.round(display).toLocaleString()
  return <span ref={ref} className={className}>{prefix}{text}{suffix}</span>
}

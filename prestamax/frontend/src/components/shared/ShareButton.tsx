// ShareButton — comparte el sitio público. En móvil usa el menú nativo
// (Web Share API → incluye WhatsApp, Instagram, etc.). En escritorio abre
// un menú con WhatsApp, Facebook, X, LinkedIn, Instagram (copia) y copiar enlace.
import React, { useEffect, useRef, useState } from 'react'
import { Share2, Link2, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { useT } from '@/lib/i18n'

const SHARE_URL = 'https://credytek.vercel.app/'

// Iconos de marca (simple-icons paths) — lucide ya no incluye logos de marca.
const Icon = {
  whatsapp: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.273.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z"/></svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
  ),
}

const ShareButton: React.FC = () => {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const url = SHARE_URL
  const text = t('share.msg')

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onEsc) }
  }, [])

  const openPopup = (href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer,width=600,height=600')
    setOpen(false)
  }

  const copyLink = async (igHint = false) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success(igHint ? t('share.ig_hint') : t('share.copied'))
      setTimeout(() => setCopied(false), 2000)
    } catch (_) { /* noop */ }
    setOpen(false)
  }

  const handleMainClick = async () => {
    // Móvil / navegadores con Web Share API → menú nativo (incluye Instagram, etc.)
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: t('share.title'), text, url })
        return
      } catch (_) { /* el usuario canceló → caemos al menú */ }
    }
    setOpen(o => !o)
  }

  const links: { key: string; label: string; color: string; icon: React.ReactNode; onClick: () => void }[] = [
    { key: 'whatsapp', label: t('share.whatsapp'), color: '#25D366', icon: Icon.whatsapp, onClick: () => openPopup(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`) },
    { key: 'facebook', label: t('share.facebook'), color: '#1877F2', icon: Icon.facebook, onClick: () => openPopup(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`) },
    { key: 'x',        label: t('share.x'),        color: '#000000', icon: Icon.x,        onClick: () => openPopup(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`) },
    { key: 'linkedin', label: t('share.linkedin'), color: '#0A66C2', icon: Icon.linkedin, onClick: () => openPopup(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`) },
    { key: 'instagram',label: t('share.instagram'),color: '#E4405F', icon: Icon.instagram, onClick: () => copyLink(true) },
  ]

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={handleMainClick}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t('share.btn')}
        title={t('share.btn')}
      >
        <Share2 className="w-4 h-4" />
        <span className="hidden sm:inline">{t('share.btn')}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50"
          role="menu"
          style={{ animation: 'lp-fade-in 0.15s ease' }}
        >
          <p className="px-4 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t('share.title')}</p>
          {links.map(l => (
            <button
              key={l.key}
              type="button"
              role="menuitem"
              onClick={l.onClick}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition"
            >
              <span style={{ color: l.color }} className="flex-shrink-0">{l.icon}</span>
              {l.label}
            </button>
          ))}
          <div className="my-1 border-t border-slate-100" />
          <button
            type="button"
            role="menuitem"
            onClick={() => copyLink(false)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition"
          >
            <span className="flex-shrink-0 text-slate-500">
              {copied ? <Check className="w-[18px] h-[18px] text-emerald-600" /> : <Link2 className="w-[18px] h-[18px]" />}
            </span>
            {copied ? t('share.copied') : t('share.copy')}
          </button>
        </div>
      )}
    </div>
  )
}

export default ShareButton

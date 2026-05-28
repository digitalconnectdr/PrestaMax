// GlobalSearch — modal command-palette con Ctrl+K
// Busca en clientes, prestamos y pagos del tenant actual.
// Resultados clickeables que navegan al detalle correspondiente.

import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, Users, DollarSign, CreditCard, Loader2 } from 'lucide-react'
import api from '@/lib/api'

interface Props {
  open: boolean
  onClose: () => void
}

interface ClientResult { id: string; fullName: string; idNumber: string; phonePersonal?: string; whatsapp?: string; isActive: number }
interface LoanResult { id: string; loanNumber: string; status: string; totalBalance: number; currency: string; clientName: string; clientId: string }
interface PaymentResult { id: string; paymentNumber: string; amount: number; paymentDate: string; loanNumber: string; clientName: string; loanId: string }

const GlobalSearch: React.FC<Props> = ({ open, onClose }) => {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<{ clients: ClientResult[]; loans: LoanResult[]; payments: PaymentResult[] }>({ clients: [], loans: [], payments: [] })

  // Auto-focus input al abrir + reset
  useEffect(() => {
    if (open) {
      setQ('')
      setResults({ clients: [], loans: [], payments: [] })
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (!open) return
    if (q.trim().length < 2) {
      setResults({ clients: [], loans: [], payments: [] })
      return
    }
    setLoading(true)
    const handle = setTimeout(async () => {
      try {
        const res = await api.get(`/search?q=${encodeURIComponent(q.trim())}`)
        setResults(res.data || { clients: [], loans: [], payments: [] })
      } catch {
        setResults({ clients: [], loans: [], payments: [] })
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(handle)
  }, [q, open])

  // ESC to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const goTo = (path: string) => {
    onClose()
    navigate(path)
  }

  const totalResults = results.clients.length + results.loans.length + results.payments.length
  const noResults = q.trim().length >= 2 && !loading && totalResults === 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-3 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <Search className="w-5 h-5 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cliente, préstamo o pago…"
            className="flex-1 text-sm outline-none placeholder:text-slate-400"
          />
          {loading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-md text-slate-400"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1">
          {q.trim().length < 2 && (
            <div className="text-center py-12 text-sm text-slate-400">
              Escribe al menos 2 caracteres para buscar
            </div>
          )}

          {noResults && (
            <div className="text-center py-12 text-sm text-slate-400">
              Sin resultados para <strong>"{q}"</strong>
            </div>
          )}

          {/* Clientes */}
          {results.clients.length > 0 && (
            <div className="py-2">
              <div className="px-4 py-1.5 text-[10px] uppercase tracking-wide font-semibold text-slate-500 flex items-center gap-1.5">
                <Users className="w-3 h-3" /> Clientes ({results.clients.length})
              </div>
              {results.clients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => goTo(`/clients/${c.id}`)}
                  className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{c.fullName}</p>
                    <p className="text-xs text-slate-500">
                      {c.idNumber}
                      {c.whatsapp || c.phonePersonal ? ` · ${c.whatsapp || c.phonePersonal}` : ''}
                    </p>
                  </div>
                  {!c.isActive && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">Inactivo</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Prestamos */}
          {results.loans.length > 0 && (
            <div className="py-2 border-t border-slate-100">
              <div className="px-4 py-1.5 text-[10px] uppercase tracking-wide font-semibold text-slate-500 flex items-center gap-1.5">
                <DollarSign className="w-3 h-3" /> Préstamos ({results.loans.length})
              </div>
              {results.loans.map((l) => (
                <button
                  key={l.id}
                  onClick={() => goTo(`/loans/${l.id}`)}
                  className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      #{l.loanNumber} <span className="text-slate-500 font-normal">· {l.clientName}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Balance: {l.currency} {Number(l.totalBalance).toLocaleString('en-US', { minimumFractionDigits: 2 })} · {l.status}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Pagos */}
          {results.payments.length > 0 && (
            <div className="py-2 border-t border-slate-100">
              <div className="px-4 py-1.5 text-[10px] uppercase tracking-wide font-semibold text-slate-500 flex items-center gap-1.5">
                <CreditCard className="w-3 h-3" /> Pagos ({results.payments.length})
              </div>
              {results.payments.map((p) => (
                <button
                  key={p.id}
                  onClick={() => goTo(`/loans/${p.loanId}`)}
                  className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      Pago #{p.paymentNumber} <span className="text-slate-500 font-normal">· {p.clientName}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Préstamo #{p.loanNumber} · Monto {Number(p.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400 flex items-center gap-3">
          <span>⌘K / Ctrl+K</span><span>•</span>
          <span>ESC para cerrar</span><span>•</span>
          <span>Click en un resultado para ir</span>
        </div>
      </div>
    </div>
  )
}

export default GlobalSearch

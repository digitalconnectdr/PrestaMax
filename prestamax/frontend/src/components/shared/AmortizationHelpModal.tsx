// AmortizationHelpModal — modal con explicacion y ejemplo de cada tipo
// de amortizacion. Se invoca desde un boton "?" al lado del select.

import React from 'react'
import { X, Info } from 'lucide-react'
import { AMORTIZATION_TYPES } from '@/lib/amortization'
import { useT } from '@/lib/i18n'

interface Props {
  open: boolean
  onClose: () => void
  highlight?: string  // tipo a destacar (el actualmente seleccionado)
}

const AmortizationHelpModal: React.FC<Props> = ({ open, onClose, highlight }) => {
  const t = useT()
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#1e3a5f]/10 flex items-center justify-center flex-shrink-0">
              <Info className="w-4 h-4 text-[#1e3a5f]" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">{t('amort.modal_title')}</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {t('amort.modal_subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-md text-slate-500"
            aria-label={t('amort.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {AMORTIZATION_TYPES.map((at) => {
            const isHighlight = highlight === at.value
            return (
              <div
                key={at.value}
                className={`rounded-xl border p-4 transition ${
                  isHighlight
                    ? 'border-[#f59e0b] bg-amber-50/50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-semibold text-slate-900">{at.label}</h4>
                  {isHighlight && (
                    <span className="text-[10px] uppercase tracking-wide font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                      {t('amort.selected')}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-600 leading-relaxed mb-3">
                  {at.longDesc}
                </p>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1.5">
                    {t('amort.example')}
                  </p>
                  <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
                    {at.example}
                  </pre>
                </div>
              </div>
            )
          })}

          <div className="text-xs text-slate-500 italic pt-2 border-t border-slate-100">
            {t('amort.modal_note')}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded-lg hover:bg-[#152a45] transition"
          >
            {t('amort.understood')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AmortizationHelpModal

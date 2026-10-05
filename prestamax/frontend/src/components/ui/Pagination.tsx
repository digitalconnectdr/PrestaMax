import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useT } from '@/lib/i18n'

interface PaginationProps {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
  disabled?: boolean
}

/** Controles "Anterior · Página X de Y · Siguiente" para listados paginados en el servidor. */
const Pagination: React.FC<PaginationProps> = ({ page, totalPages, total, pageSize, onPageChange, disabled }) => {
  const t = useT()
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  const atFirst = page <= 1
  const atLast = page >= totalPages
  const btn = 'inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent'
  return (
    <nav aria-label={t('pag.aria')} className="mt-3 pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3" data-testid="pagination">
      <p className="text-sm text-slate-500" data-testid="pagination-range">
        {t('pag.showing').replace('{from}', String(from)).replace('{to}', String(to)).replace('{total}', String(total))}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <button type="button" className={btn} onClick={() => onPageChange(page - 1)} disabled={disabled || atFirst} data-testid="pagination-prev">
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />{t('pag.prev')}
          </button>
          <span className="text-sm text-slate-600 whitespace-nowrap" aria-live="polite" data-testid="pagination-page">
            {t('pag.page_of').replace('{page}', String(page)).replace('{total}', String(totalPages))}
          </span>
          <button type="button" className={btn} onClick={() => onPageChange(page + 1)} disabled={disabled || atLast} data-testid="pagination-next">
            {t('pag.next')}<ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </nav>
  )
}

export default Pagination

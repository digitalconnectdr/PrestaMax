import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { LoanStatus } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'DOP'): string {
  const symbol = getCurrencySymbol(currency)
  return `${symbol}${new Intl.NumberFormat('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0)}`
}

// Supported currencies catalog — monedas oficiales del sistema
export const SUPPORTED_CURRENCIES: { code: string; name: string; symbol: string }[] = [
  { code: 'DOP', name: 'Peso Dominicano',           symbol: 'RD$' },
  { code: 'USD', name: 'Dólar Estadounidense',       symbol: '$'   },
  { code: 'EUR', name: 'Euro',                       symbol: '€'   },
  { code: 'HTG', name: 'Gourde Haitiano',            symbol: 'G'   },
  { code: 'MXN', name: 'Peso Mexicano',              symbol: 'MX$' },
  { code: 'COP', name: 'Peso Colombiano',            symbol: 'CO$' },
  { code: 'PEN', name: 'Sol Peruano',                symbol: 'S/'  },
  { code: 'CLP', name: 'Peso Chileno',               symbol: 'CL$' },
  { code: 'BOB', name: 'Boliviano',                  symbol: 'Bs'  },
  { code: 'UYU', name: 'Peso Uruguayo',              symbol: '$U'  },
  { code: 'BRL', name: 'Real Brasileño',             symbol: 'R$'  },
  { code: 'GTQ', name: 'Quetzal Guatemalteco',       symbol: 'Q'   },
]

export function getCurrencySymbol(currency: string): string {
  return SUPPORTED_CURRENCIES.find(c => c.code === currency)?.symbol ?? currency
}

export function getCurrencyName(currency: string): string {
  return SUPPORTED_CURRENCIES.find(c => c.code === currency)?.name ?? currency
}

function parseDate(date: string | Date | null | undefined): Date | null {
  if (!date) return null
  if (date instanceof Date) return isNaN(date.getTime()) ? null : date
  const normalized = (date as string).replace(' ', 'T')
  const d = new Date(normalized)
  return isNaN(d.getTime()) ? null : d
}

export function formatDate(date: string | Date | null | undefined, fmt = 'dd/MM/yyyy'): string {
  const d = parseDate(date)
  if (!d) return '—'
  try { return format(d, fmt, { locale: es }) } catch { return '—' }
}

export function formatDateTime(date: string | Date | null | undefined): string {
  return formatDate(date, "dd/MM/yyyy HH:mm")
}

export function daysSince(date: string | Date | null | undefined): number {
  const d = parseDate(date)
  if (!d) return 0
  return differenceInDays(new Date(), d)
}

export function getLoanStatusLabel(status: LoanStatus | string): string {
  const map: Record<string, string> = {
    draft: 'Borrador', under_review: 'En Revisión', approved: 'Aprobado',
    rejected: 'Rechazado', active: 'Activo', disbursed: 'Desembolsado',
    in_mora: 'En Mora', liquidated: 'Liquidado', paid: 'Pagado',
    cancelled: 'Cancelado', voided: 'Anulado', written_off: 'Incobrable',
    restructured: 'Reestructurado',
  }
  return map[status] || status
}

export function getScoreColor(score: number): string {
  if (score >= 85) return 'text-emerald-600'
  if (score >= 70) return 'text-green-600'
  if (score >= 50) return 'text-yellow-600'
  if (score >= 30) return 'text-orange-600'
  return 'text-red-600'
}

export function getScoreBgColor(score: number): string {
  if (score >= 85) return 'bg-emerald-100'
  if (score >= 70) return 'bg-green-100'
  if (score >= 50) return 'bg-yellow-100'
  if (score >= 30) return 'bg-orange-100'
  return 'bg-red-100'
}

export function getScoreLabel(score: number): string {
  if (score >= 85) return 'Excelente'
  if (score >= 70) return 'Muy Bueno'
  if (score >= 50) return 'Bueno'
  if (score >= 30) return 'Regular'
  return 'Deficiente'
}

export function getScoreBarColor(score: number): string {
  if (score >= 85) return 'bg-emerald-500'
  if (score >= 70) return 'bg-green-500'
  if (score >= 50) return 'bg-yellow-500'
  if (score >= 30) return 'bg-orange-500'
  return 'bg-red-500'
}

export interface LoanStatusConfig {
  label: string
  color: string
  bg: string
}

export function getLoanStatusConfig(status: LoanStatus | string): LoanStatusConfig {
  const map: Record<string, LoanStatusConfig> = {
    draft:        { label: 'Borrador',       color: 'text-slate-600',   bg: 'bg-slate-100'   },
    under_review: { label: 'En Revisión',    color: 'text-blue-600',    bg: 'bg-blue-100'    },
    approved:     { label: 'Aprobado',       color: 'text-green-600',   bg: 'bg-green-100'   },
    rejected:     { label: 'Rechazado',      color: 'text-red-600',     bg: 'bg-red-100'     },
    active:       { label: 'Activo',         color: 'text-emerald-600', bg: 'bg-emerald-100' },
    disbursed:    { label: 'Desembolsado',   color: 'text-emerald-600', bg: 'bg-emerald-100' },
    in_mora:      { label: 'En Mora',        color: 'text-orange-600',  bg: 'bg-orange-100'  },
    liquidated:   { label: 'Liquidado',      color: 'text-slate-600',   bg: 'bg-slate-100'   },
    paid:         { label: 'Pagado',         color: 'text-green-600',   bg: 'bg-green-100'   },
    cancelled:    { label: 'Cancelado',      color: 'text-slate-600',   bg: 'bg-slate-100'   },
    voided:       { label: 'Anulado',        color: 'text-red-700',     bg: 'bg-red-100'     },
    written_off:  { label: 'Incobrable',     color: 'text-red-700',     bg: 'bg-red-100'     },
    restructured: { label: 'Reestructurado', color: 'text-purple-600',  bg: 'bg-purple-100'  },
  }
  return map[status as string] || { label: String(status), color: 'text-slate-600', bg: 'bg-slate-100' }
}

export interface MoraCategory {
  label: string
  color: string
}

export function getMoraCategory(days: number): MoraCategory {
  if (days <= 0)  return { label: 'Al día',    color: 'text-emerald-600' }
  if (days <= 7)  return { label: 'Leve',      color: 'text-yellow-600'  }
  if (days <= 30) return { label: 'Moderada',  color: 'text-orange-600'  }
  if (days <= 90) return { label: 'Grave',     color: 'text-red-600'     }
  return             { label: 'Muy Grave', color: 'text-red-700'     }
}

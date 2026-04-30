import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { LoanStatus } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'DOP'): string {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

// Supported currencies catalog
export const SUPPORTED_CURRENCIES: { code: string; name: string; symbol: string }[] = [
  { code: 'DOP', name: 'Peso Dominicano', symbol: 'RD$' },
  { code: 'USD', name: 'Dólar Estadounidense', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'HTG', name: 'Gourde Haitiano', symbol: 'G' },
  { code: 'CAD', name: 'Dólar Canadiense', symbol: 'CA$' },
  { code: 'GBP', name: 'Libra Esterlina', symbol: '£' },
]

export function getCurrencySymbol(currency: string): string {
  return SUPPORTED_CURRENCIES.find(c => c.code === currency)?.symbol ?? currency
}

export function getCurrencyName(currency: string): string {
  return SUPPORTED_CURRENCIES.find(c => c.code === currency)?.name ?? currency
}

// Safely parse any date string — handles SQLite "YYYY-MM-DD HH:MM:SS" (space separator)
// and ISO 8601 "YYYY-MM-DDTHH:MM:SSZ" as well as date-only "YYYY-MM-DD".
function parseDate(date: string | Date | null | undefined): Date | null {
  if (!date) return null
  if (date instanceof Date) return isNaN(date.getTime()) ? null : date
  // Normalize SQLite format: "2026-04-23 18:30:00" → "2026-04-23T18:30:00"
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
  const d = parseDate(date)
  if (!d) return '—'
  try { return format(d, 'dd/MM/yyyy HH:mm', { locale: es }) } catch { return '—' }
}

export function getDaysOverdue(dueDate: string): number {
  const days = differenceInDays(new Date(), new Date(dueDate))
  return Math.max(0, days)
}

export function getMoraCategory(days: number): { label: string; color: string; bgColor: string } {
  if (days === 0) return { label: 'Al día', color: 'text-emerald-600', bgColor: 'bg-emerald-100' }
  if (days <= 7) return { label: '1-7 días', color: 'text-yellow-600', bgColor: 'bg-yellow-100' }
  if (days <= 15) return { label: '8-15 días', color: 'text-orange-600', bgColor: 'bg-orange-100' }
  if (days <= 30) return { label: '16-30 días', color: 'text-red-600', bgColor: 'bg-red-100' }
  return { label: '+30 días', color: 'text-red-700', bgColor: 'bg-red-200' }
}

export function getLoanStatusConfig(status: LoanStatus) {
  const configs: Record<LoanStatus, { label: string; color: string; bg: string }> = {
    draft: { label: 'Borrador', color: 'text-slate-600', bg: 'bg-slate-100' },
    under_review: { label: 'En revisión', color: 'text-blue-600', bg: 'bg-blue-100' },
    pending_docs: { label: 'Pend. Docs', color: 'text-amber-600', bg: 'bg-amber-100' },
    approved: { label: 'Aprobado', color: 'text-green-600', bg: 'bg-green-100' },
    rejected: { label: 'Rechazado', color: 'text-red-600', bg: 'bg-red-100' },
    disbursed: { label: 'Desembolsado', color: 'text-teal-600', bg: 'bg-teal-100' },
    active: { label: 'Activo', color: 'text-green-600', bg: 'bg-green-100' },
    current: { label: 'Al día', color: 'text-emerald-600', bg: 'bg-emerald-100' },
    overdue: { label: 'Vencido', color: 'text-orange-600', bg: 'bg-orange-100' },
    in_mora: { label: 'En mora', color: 'text-red-600', bg: 'bg-red-100' },
    restructured: { label: 'Reestructurado', color: 'text-purple-600', bg: 'bg-purple-100' },
    liquidated: { label: 'Liquidado', color: 'text-slate-600', bg: 'bg-slate-100' },
    written_off: { label: 'Castigado', color: 'text-gray-600', bg: 'bg-gray-200' },
    cancelled: { label: 'Anulado', color: 'text-red-500', bg: 'bg-red-50' },
  }
  return configs[status] || { label: status, color: 'text-slate-600', bg: 'bg-slate-100' }
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

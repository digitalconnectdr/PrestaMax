// printReceipt — helper compartido para imprimir recibos de pago y generar
// el texto de envio por WhatsApp. Usado desde PaymentsPage y LoanDetailPage.

import api from '@/lib/api'
import { t as tg, getLocale } from '@/lib/i18n'

export interface ReceiptPayment {
  id: string
  loanId: string
  paymentNumber: string
  receiptNumber?: string | null
  paymentDate: string
  clientName: string
  loanNumber: string
  paymentMethod: string
  bankAccountName?: string | null
  reference?: string | null
  amount: number
  appliedCapital?: number
  appliedInterest?: number
  appliedMora?: number
  registeredByName?: string | null
  notes?: string | null
  isVoided?: boolean
}

export interface ReceiptTenant {
  name?: string
  phone?: string
  email?: string
  address?: string
  logoUrl?: string
}

const methodLabel = (m: string): string => {
  const key = ({ cash: 'method.cash', transfer: 'method.transfer', check: 'method.check', card: 'method.card' } as Record<string, string>)[m]
  return key ? tg(key) : m
}

const dateLocale = (): string => ({ es: 'es-DO', en: 'en-US', pt: 'pt-BR' } as Record<string, string>)[getLocale()] || 'es-DO'

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' })

const fmtMoney = (n: number) =>
  `RD$${(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`

/**
 * Abre una ventana nueva con el recibo formateado en HTML y dispara print().
 */
export async function printPaymentReceipt(
  p: ReceiptPayment,
  tenant: ReceiptTenant | string,
): Promise<void> {
  const t = typeof tenant === 'string' ? { name: tenant } : (tenant || {})
  const tenantName = t.name || tg('rcp.business')
  const tenantPhone = t.phone || ''
  const tenantAddress = t.address || ''
  const tenantLogo = t.logoUrl || ''

  // Fetch loan detail para incluir balance, proxima fecha y cuotas X de Y
  let loan: any = null
  try {
    const r = await api.get(`/loans/${p.loanId || ''}`)
    loan = r.data
  } catch (_) { /* recibo se imprime sin estos datos si falla */ }

  let cuotasInfo = ''
  let proximoPago = ''
  let balancePendiente = ''
  if (loan?.installments && Array.isArray(loan.installments)) {
    const total = loan.installments.length
    // Cuotas totalmente liquidadas
    const paidCount = loan.installments.filter((i: any) => i.status === 'paid').length
    // Cuotas con abono parcial (recibieron pago pero no liquidaron)
    const partialCount = loan.installments.filter((i: any) =>
      i.status === 'partial' || (i.status !== 'paid' && i.status !== 'waived' && (i.paidTotal || i.paid_total || 0) > 0)
    ).length
    cuotasInfo = partialCount > 0
      ? tg('rcp.x_of_y_progress').replace('{paid}', String(paidCount)).replace('{total}', String(total)).replace('{partial}', String(partialCount))
      : tg('rcp.x_of_y').replace('{paid}', String(paidCount)).replace('{total}', String(total))
    const pending = loan.installments
      .filter((i: any) => i.status !== 'paid' && i.status !== 'waived')
      .sort((a: any, b: any) =>
        new Date(a.deferred_due_date || a.dueDate || a.due_date).getTime() -
        new Date(b.deferred_due_date || b.dueDate || b.due_date).getTime())
    if (pending.length > 0) {
      const next = pending[0]
      const nextDate = next.deferredDueDate || next.dueDate || next.due_date
      if (nextDate) proximoPago = fmtDate(nextDate)
    }
    const balance = (loan.principalBalance || 0) + (loan.interestBalance || 0) + (loan.moraBalance || 0)
    balancePendiente = fmtMoney(balance)
  }

  const win = window.open('', '_blank', 'width=420,height=700')
  if (!win) { alert(tg('rcp.popup_alert')); return }

  const rows = [
    [tg('rcp.capital_applied'), fmtMoney(p.appliedCapital || 0)],
    [tg('rcp.interest_applied'), fmtMoney(p.appliedInterest || 0)],
    [tg('rcp.mora_applied'), fmtMoney(p.appliedMora || 0)],
  ].map(([l, v]) => `<tr><td style="padding:3px 0;color:#555">${l}</td><td style="padding:3px 0;text-align:right">${v}</td></tr>`).join('')

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${tg('rcp.receipt_no')}</title>
  <style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px;color:#333}
  h2{font-size:18px;margin:0 0 4px}hr{border:none;border-top:1px dashed #ccc;margin:10px 0}
  .total{font-size:16px;font-weight:bold;color:#16a34a}.num{color:#1e3a5f;font-weight:bold}
  table{width:100%;border-collapse:collapse}.void{color:red;font-size:14px;font-weight:bold;text-align:center}
  .bal-row{background:#fef3c7;padding:6px 8px;border-radius:4px;margin:4px 0;display:flex;justify-content:space-between}
  .next-row{background:#dbeafe;padding:6px 8px;border-radius:4px;margin:4px 0;display:flex;justify-content:space-between}
  .footer{font-size:9px;color:#888;text-align:center;margin-top:16px;border-top:1px solid #eee;padding-top:8px}
  @media print{@page{margin:10mm}}</style></head><body>
  <div style="text-align:center;margin-bottom:12px">
    ${tenantLogo ? `<img src="${tenantLogo}" alt="Logo" style="max-height:70px;max-width:200px;object-fit:contain;margin-bottom:8px"/>` : ''}
    <h2>${tenantName}</h2>
    ${tenantPhone ? `<p style="margin:2px 0;font-size:12px;color:#555">${tg('rcp.tel')} ${tenantPhone}</p>` : ''}
    ${tenantAddress ? `<p style="margin:2px 0;font-size:10px;color:#888">${tenantAddress}</p>` : ''}
    <p style="margin:6px 0 0 0;font-size:11px;color:#888;font-weight:bold;letter-spacing:1px">${tg('rcp.voucher')}</p>
  </div>
  <hr/>
  <table><tbody>
    <tr><td>${tg('rcp.receipt_no')}</td><td style="text-align:right" class="num">${p.receiptNumber || p.paymentNumber}</td></tr>
    <tr><td>${tg('rcp.payment_no')}</td><td style="text-align:right" class="num">${p.paymentNumber}</td></tr>
    <tr><td>${tg('rcp.date')}</td><td style="text-align:right">${fmtDate(p.paymentDate)}</td></tr>
    <tr><td>${tg('rcp.client')}</td><td style="text-align:right">${p.clientName}</td></tr>
    <tr><td>${tg('rcp.loan')}</td><td style="text-align:right" class="num">${p.loanNumber}</td></tr>
    <tr><td>${tg('rcp.method')}</td><td style="text-align:right">${methodLabel(p.paymentMethod)}</td></tr>
    ${p.bankAccountName ? `<tr><td>${tg('rcp.account')}</td><td style="text-align:right">${p.bankAccountName}</td></tr>` : ''}
    ${p.reference ? `<tr><td>${tg('rcp.reference')}</td><td style="text-align:right">${p.reference}</td></tr>` : ''}
  </tbody></table>
  <hr/>
  <table><tbody>${rows}</tbody></table>
  <hr/>
  <div style="display:flex;justify-content:space-between;align-items:center">
    <span>${tg('rcp.total_paid')}</span><span class="total">${fmtMoney(p.amount)}</span>
  </div>
  <hr/>
  ${cuotasInfo ? `<div class="bal-row"><span>${tg('rcp.installments_paid')}</span><strong>${cuotasInfo}</strong></div>` : ''}
  ${proximoPago ? `<div class="next-row"><span>${tg('rcp.next_date')}</span><strong>${proximoPago}</strong></div>` : ''}
  ${balancePendiente ? `<div class="bal-row"><span>${tg('rcp.pending_balance')}</span><strong>${balancePendiente}</strong></div>` : ''}
  ${p.isVoided ? `<div class="void">${tg('rcp.voided')}</div><hr/>` : ''}
  <p style="font-size:10px;color:#888;text-align:center;margin-top:12px">
    ${tg('rcp.registered_by')} ${p.registeredByName || '—'}
    ${p.notes ? `<br/>${tg('rcp.notes')} ${p.notes}` : ''}
  </p>
  <p class="footer">${tg('rcp.platform')}</p>
  <script>window.onload=()=>{window.print();}</script>
  </body></html>`)
  win.document.close()
}

/**
 * Construye el texto plano del recibo para enviar por WhatsApp.
 * WhatsApp NO soporta HTML/imagenes inline desde wa.me, asi que es solo texto.
 */
export function buildReceiptWhatsAppText(
  p: ReceiptPayment,
  tenant: ReceiptTenant | string,
  loan?: { principalBalance?: number; interestBalance?: number; moraBalance?: number },
): string {
  const t = typeof tenant === 'string' ? { name: tenant } : (tenant || {})
  const tenantName = t.name || tg('rcp.business')

  const lines: string[] = []
  lines.push(tg('rcp.wa_title').replace('{name}', tenantName))
  lines.push('')
  lines.push(tg('rcp.wa_client').replace('{v}', p.clientName))
  lines.push(tg('rcp.wa_loan').replace('{v}', p.loanNumber))
  lines.push(tg('rcp.wa_receipt').replace('{v}', String(p.receiptNumber || p.paymentNumber)))
  lines.push(tg('rcp.wa_date').replace('{v}', fmtDate(p.paymentDate)))
  lines.push(tg('rcp.wa_method').replace('{v}', methodLabel(p.paymentMethod)))
  if (p.reference) lines.push(tg('rcp.wa_reference').replace('{v}', p.reference))
  lines.push('')
  lines.push(tg('rcp.wa_total').replace('{v}', fmtMoney(p.amount)))
  if ((p.appliedCapital || 0) > 0) lines.push(tg('rcp.wa_capital').replace('{v}', fmtMoney(p.appliedCapital || 0)))
  if ((p.appliedInterest || 0) > 0) lines.push(tg('rcp.wa_interest').replace('{v}', fmtMoney(p.appliedInterest || 0)))
  if ((p.appliedMora || 0) > 0) lines.push(tg('rcp.wa_mora').replace('{v}', fmtMoney(p.appliedMora || 0)))
  if (loan) {
    const balance = (loan.principalBalance || 0) + (loan.interestBalance || 0) + (loan.moraBalance || 0)
    if (balance > 0) {
      lines.push('')
      lines.push(tg('rcp.wa_balance').replace('{v}', fmtMoney(balance)))
    } else {
      lines.push('')
      lines.push(tg('rcp.wa_settled'))
    }
  }
  lines.push('')
  lines.push(tg('rcp.wa_thanks').replace('{name}', tenantName))
  return lines.join('\n')
}

/**
 * Abre WhatsApp Web/App con el recibo pre-cargado.
 * Si phone esta vacio, abre WhatsApp sin destinatario (el usuario elige).
 */
export function sendReceiptByWhatsApp(
  phone: string,
  p: ReceiptPayment,
  tenant: ReceiptTenant | string,
  loan?: { principalBalance?: number; interestBalance?: number; moraBalance?: number },
): void {
  const text = buildReceiptWhatsAppText(p, tenant, loan)
  const digits = (phone || '').replace(/\D/g, '')
  const url = digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

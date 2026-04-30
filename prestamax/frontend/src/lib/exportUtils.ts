/**
 * exportUtils.ts — CSV and PDF export helpers for PrestaMax
 */

// ── CSV ──────────────────────────────────────────────────────────────────────

/** Convert an array of objects to a CSV string */
function toCSV(headers: { key: string; label: string }[], rows: Record<string, any>[]): string {
  const escape = (v: any): string => {
    const s = v == null ? '' : String(v)
    // Wrap in quotes if contains comma, quote, or newline
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  const headerRow = headers.map(h => escape(h.label)).join(',')
  const dataRows = rows.map(row => headers.map(h => escape(row[h.key])).join(','))
  return [headerRow, ...dataRows].join('\r\n')
}

/** Download a CSV string as a file */
export function downloadCSV(filename: string, headers: { key: string; label: string }[], rows: Record<string, any>[]): void {
  // Add UTF-8 BOM so Excel renders Spanish characters correctly
  const bom = '\uFEFF'
  const csv = bom + toCSV(headers, rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ── PDF via print window ──────────────────────────────────────────────────────

interface PrintTableOptions {
  title: string
  subtitle?: string
  headers: { key: string; label: string; align?: 'left' | 'right' | 'center' }[]
  rows: Record<string, any>[]
  summary?: { label: string; value: string }[]
  filename?: string
}

/** Open a styled print window with the given table and trigger browser print-to-PDF */
export function printToPDF(options: PrintTableOptions): void {
  const { title, subtitle, headers, rows, summary } = options

  const tableRows = rows.map(row => {
    const cells = headers.map(h => {
      const align = h.align || 'left'
      return `<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:${align};font-size:12px;">${row[h.key] ?? ''}</td>`
    }).join('')
    return `<tr>${cells}</tr>`
  }).join('')

  const summaryHtml = summary ? `
    <div style="margin-top:20px;padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;display:flex;gap:32px;flex-wrap:wrap;">
      ${summary.map(s => `
        <div>
          <p style="font-size:11px;color:#64748b;margin:0;">${s.label}</p>
          <p style="font-size:15px;font-weight:700;color:#1e293b;margin:4px 0 0;">${s.value}</p>
        </div>
      `).join('')}
    </div>
  ` : ''

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1e293b; padding: 24px; }
    .header { margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid #1e3a5f; }
    .header h1 { font-size: 20px; font-weight: 700; color: #1e3a5f; }
    .header p  { font-size: 12px; color: #64748b; margin-top: 4px; }
    .badge { display:inline-block; padding:2px 8px; background:#e0f2fe; color:#0369a1; border-radius:4px; font-size:11px; font-weight:600; margin-top:6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    thead tr { background: #1e3a5f; }
    thead th { padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 600; color: white; text-transform: uppercase; letter-spacing: 0.05em; }
    tbody tr:hover { background: #f8fafc; }
    .footer { margin-top: 24px; font-size: 10px; color: #94a3b8; text-align: right; }
    @media print {
      body { padding: 0; }
      @page { margin: 15mm; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    ${subtitle ? `<p>${subtitle}</p>` : ''}
    <span class="badge">PrestaMax · Generado el ${new Date().toLocaleDateString('es-DO', { dateStyle: 'full' })}</span>
  </div>
  ${summaryHtml}
  <table>
    <thead>
      <tr>
        ${headers.map(h => `<th style="text-align:${h.align || 'left'}">${h.label}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>
  <div class="footer">PrestaMax Sistema de Préstamos &mdash; Documento generado automáticamente</div>
  <script>
    window.onload = () => { window.print(); }
  </script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) {
    alert('Permite las ventanas emergentes para generar el PDF')
    return
  }
  win.document.write(html)
  win.document.close()
}

// ── Convenience formatters ────────────────────────────────────────────────────

export function fmtCurrencyRaw(n: number | null | undefined): string {
  if (n == null) return ''
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n)
}

export function fmtDateRaw(s: string | null | undefined): string {
  if (!s) return ''
  try {
    return new Date(s).toLocaleDateString('es-DO', { year: 'numeric', month: '2-digit', day: '2-digit' })
  } catch { return s }
}

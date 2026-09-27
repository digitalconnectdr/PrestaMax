// exportHelpers — utilidades compartidas para exportar cualquier reporte
// tabular a CSV, Excel (.xlsx real via ExcelJS) o PDF (real via PDFKit).
//
// FIX (auditoria "Exportación real a Excel/PDF", Sep 2026): antes de esto,
// "exportar a PDF" en TODO el sistema significaba abrir una ventana e
// invocar window.print() del navegador (ver frontend/src/lib/exportUtils.ts),
// y el unico xlsx real vivia solo en accounting.ts. Este modulo generaliza
// ambos para poder ofrecerlos en cualquier reporte/listado (Cartera, Mora,
// Cobranzas, Clientes, Prestamos) con una sola funcion por formato.
import { Response } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export interface ExportColumn {
  key: string;
  header: string;
  width?: number; // ancho relativo para xlsx/pdf
  align?: 'left' | 'right' | 'center';
  /** Formatea el valor crudo de la fila para mostrarlo (CSV/Excel/PDF por igual). */
  format?: (value: any, row: any) => string | number;
}

function cellValue(col: ExportColumn, row: any): string | number {
  const raw = row[col.key];
  if (col.format) return col.format(raw, row);
  return raw ?? '';
}

// ─── CSV ─────────────────────────────────────────────────────────────────
function csvField(v: any): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(columns: ExportColumn[], rows: any[]): string {
  const lines = [columns.map(c => csvField(c.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map(c => csvField(cellValue(c, row))).join(','));
  }
  return lines.join('\n');
}

export function sendCsv(res: Response, filename: string, columns: ExportColumn[], rows: any[]): void {
  const csv = buildCsv(columns, rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + csv); // BOM UTF-8 para que Excel detecte acentos
}

// ─── Excel real (.xlsx) ──────────────────────────────────────────────────
export async function sendXlsx(res: Response, filename: string, title: string, columns: ExportColumn[], rows: any[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(title.slice(0, 31) || 'Reporte'); // Excel limita a 31 chars
  ws.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width || 20 }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  ws.getRow(1).eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
  for (const row of rows) {
    const values: Record<string, any> = {};
    for (const c of columns) values[c.key] = cellValue(c, row);
    ws.addRow(values);
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}

// ─── PDF real (PDFKit) ───────────────────────────────────────────────────
// Tabla simple con encabezado repetido en cada pagina, pensada para listados
// de 1 a ~500 filas (reportes/cartera/clientes/prestamos). No pretende
// reemplazar contratos/recibos (esos siguen usando su propio flujo de
// impresion, que ya funciona bien y no forma parte de este fix).
export function sendPdfTable(
  res: Response,
  filename: string,
  opts: { title: string; subtitle?: string; columns: ExportColumn[]; rows: any[] }
): void {
  const { title, subtitle, columns, rows } = opts;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ margin: 36, size: 'letter', layout: columns.length > 5 ? 'landscape' : 'portrait' });
  doc.pipe(res);

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const totalWeight = columns.reduce((s, c) => s + (c.width || 20), 0);
  const colWidths = columns.map(c => (pageWidth * (c.width || 20)) / totalWeight);
  const rowHeight = 18;

  const drawHeaderRow = (y: number) => {
    let x = doc.page.margins.left;
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
    doc.rect(doc.page.margins.left, y, pageWidth, rowHeight).fill('#1e3a5f');
    doc.fillColor('#ffffff');
    columns.forEach((c, i) => {
      doc.text(String(c.header), x + 4, y + 5, { width: colWidths[i] - 8, height: rowHeight - 6, align: c.align || 'left', ellipsis: true });
      x += colWidths[i];
    });
    doc.fillColor('#000000');
    return y + rowHeight;
  };

  // Titulo
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e3a5f').text(title, { align: 'left' });
  if (subtitle) doc.fontSize(9).font('Helvetica').fillColor('#666666').text(subtitle);
  doc.fontSize(8).fillColor('#999999').text(`Generado: ${new Date().toLocaleString('es-DO')}`);
  doc.moveDown(0.5);

  let y = drawHeaderRow(doc.y);
  doc.font('Helvetica').fontSize(8);

  rows.forEach((row, idx) => {
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = drawHeaderRow(doc.page.margins.top);
      doc.font('Helvetica').fontSize(8);
    }
    if (idx % 2 === 1) {
      doc.rect(doc.page.margins.left, y, pageWidth, rowHeight).fill('#f4f6f9');
      doc.fillColor('#000000');
    }
    let x = doc.page.margins.left;
    columns.forEach((c, i) => {
      const val = cellValue(c, row);
      doc.text(String(val), x + 4, y + 5, { width: colWidths[i] - 8, height: rowHeight - 6, align: c.align || 'left', ellipsis: true });
      x += colWidths[i];
    });
    y += rowHeight;
  });

  if (rows.length === 0) {
    doc.fontSize(9).fillColor('#999999').text('Sin datos para el período/filtro seleccionado.', doc.page.margins.left, y + 8);
  }

  // Numero de pagina en cada hoja
  const pages = (doc as any).bufferedPageRange ? (doc as any).bufferedPageRange() : null;
  if (pages) {
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(pages.start + i);
      doc.fontSize(7).fillColor('#999999').text(
        `Página ${i + 1} de ${pages.count}`,
        doc.page.margins.left,
        doc.page.height - doc.page.margins.bottom + 10,
        { width: pageWidth, height: 20, align: 'center', lineBreak: false }
      );
    }
  }

  doc.end();
}

/** Lee ?format=csv|xlsx|pdf (default csv) y despacha al helper correspondiente. */
export async function sendReport(
  res: Response,
  format: string | undefined,
  opts: { filename: string; title: string; subtitle?: string; columns: ExportColumn[]; rows: any[] }
): Promise<void> {
  const fmt = (format || 'csv').toLowerCase();
  const base = opts.filename.replace(/\.(csv|xlsx|pdf)$/i, '');
  if (fmt === 'xlsx') {
    await sendXlsx(res, `${base}.xlsx`, opts.title, opts.columns, opts.rows);
  } else if (fmt === 'pdf') {
    sendPdfTable(res, `${base}.pdf`, opts);
  } else {
    sendCsv(res, `${base}.csv`, opts.columns, opts.rows);
  }
}

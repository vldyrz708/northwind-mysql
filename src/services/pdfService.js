import PDFDocument from 'pdfkit';
import { getSale } from './salesService.js';
import { getRequest } from './purchaseRequestService.js';

// ─── colour palette (matches the app dark theme, but printed on white) ────────
const C = {
  primary:  '#1e40af', // deep blue
  accent:   '#f97316', // orange
  text:     '#111827',
  muted:    '#6b7280',
  border:   '#d1d5db',
  success:  '#059669',
  row_alt:  '#f9fafb',
};
// Spanish status labels for PDF badges
const STATUS_LABELS_ES = {
  pending:   'PENDIENTE',
  sent:      'ENVIADA',
  received:  'RECIBIDA',
  cancelled: 'CANCELADA',
};
const fmt = {
  money: (n) => `$${Number(n ?? 0).toFixed(2)}`,
  date:  (d) => {
    if (!d) return '—';
    const s = typeof d === 'string' ? d : d.toISOString();
    return s.split('T')[0];
  },
  pct: (d) => `${(Number(d ?? 0) * 100).toFixed(0)}%`,
};

// ─── shared layout helpers ─────────────────────────────────────────────────────
const pageW = 612; // Letter width in points
const margin = 50;
const contentW = pageW - margin * 2;

const header = (doc, title, folio) => {
  // Brand bar
  doc.rect(0, 0, pageW, 70).fill(C.primary);
  doc.fillColor('#ffffff')
     .font('Helvetica-Bold').fontSize(22)
     .text('NORTHWIND OPS', margin, 18);
  doc.font('Helvetica').fontSize(11)
     .text(title, margin, 44);
  doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(13)
     .text(folio, pageW - margin - 160, 28, { width: 160, align: 'right' });

  doc.fillColor(C.text);
  return 90; // next Y
};

const sectionLabel = (doc, label, y) => {
  doc.rect(margin, y, contentW, 18).fill('#eff6ff');
  doc.fillColor(C.primary).font('Helvetica-Bold').fontSize(9)
     .text(label.toUpperCase(), margin + 6, y + 4);
  doc.fillColor(C.text);
  return y + 22;
};

const infoRow = (doc, label, value, x, y, w = 240) => {
  // Guard: trim whitespace strings so COALESCE-produced ' ' renders as '—'
  const display = (typeof value === 'string' ? value.trim() : value) || '\u2014';
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.muted).text(label, x, y);
  doc.font('Helvetica').fontSize(10).fillColor(C.text)
     .text(display, x, y + 12, { width: w });
};

const drawLine = (doc, y, color = C.border) => {
  doc.moveTo(margin, y).lineTo(margin + contentW, y).strokeColor(color).lineWidth(0.5).stroke();
};

/**
 * Draws a simple grid table.
 * @param {PDFDocument} doc
 * @param {string[]}    headers
 * @param {(string|number)[][]} rows
 * @param {'left'|'right'[]}    aligns
 * @param {number[]}   widths  - must sum to contentW
 * @param {number}     startY
 * @returns {number} Y position after the table
 */
const drawTable = (doc, headers, rows, aligns, widths, startY) => {
  const rowH       = 18;
  const total      = widths.reduce((a, b) => a + b, 0);
  const safeBottom = doc.page.height - 60; // reserve space for footer

  // Draws the blue header row and returns the Y position after it
  const drawHeaderRow = (y) => {
    doc.rect(margin, y, total, rowH).fill(C.primary);
    let x = margin;
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    headers.forEach((h, i) => {
      doc.text(h, x + 3, y + 5, { width: widths[i] - 6, align: aligns[i] || 'left' });
      x += widths[i];
    });
    return y + rowH;
  };

  let y = drawHeaderRow(startY);
  let rowParity = 0;

  rows.forEach((row) => {
    // Automatic page break: draw footer on old page, open new page, repeat header
    if (y + rowH > safeBottom) {
      footer(doc);
      doc.addPage();
      y = margin + 10;
      y = drawHeaderRow(y);
      rowParity = 0;
    }

    if (rowParity % 2 === 1) {
      doc.rect(margin, y, total, rowH).fill(C.row_alt);
    }
    rowParity++;

    let x = margin;
    row.forEach((cell, i) => {
      doc.fillColor(C.text).font('Helvetica').fontSize(9)
         .text(String(cell ?? ''), x + 3, y + 4, {
           width: widths[i] - 6,
           align: aligns[i] || 'left',
           lineBreak: false,
         });
      x += widths[i];
    });
    y += rowH;
  });

  // bottom border
  drawLine(doc, y, C.primary);
  return y + 4;
};

const footer = (doc) => {
  const pageH = doc.page.height;
  const y = pageH - 38;
  drawLine(doc, y);
  doc.font('Helvetica').fontSize(8).fillColor(C.muted)
     .text(
       `Documento generado el ${fmt.date(new Date())} por Northwind Ops. Este documento es informativo.`,
       margin, y + 6, { width: contentW, align: 'center' },
     );
};

// ─── NOTA DE VENTA ─────────────────────────────────────────────────────────────
/**
 * Generates a PDF stream for a sale (order).
 * Caller must pipe and call .end():  doc.pipe(res); doc.end();
 */
export const generateSalePdf = async (orderId) => {
  const sale = await getSale(Number(orderId));
  if (!sale) throw Object.assign(new Error('Orden no encontrada'), { status: 404 });

  const doc = new PDFDocument({ margin, size: 'LETTER', bufferPages: true });

  let y = header(doc, 'NOTA DE VENTA', `Folio #${sale.OrderID}`);

  // ── Dates info row ────────────────────────────────────────────────────────
  infoRow(doc, 'Fecha de orden',    fmt.date(sale.OrderDate),    margin,           y);
  infoRow(doc, 'Fecha requerida',   fmt.date(sale.RequiredDate), margin + 170,     y);
  infoRow(doc, 'Fecha de envío',    fmt.date(sale.ShippedDate),  margin + 360,     y);
  y += 40;

  // ── Client block ──────────────────────────────────────────────────────────
  y = sectionLabel(doc, 'Datos del cliente', y);
  infoRow(doc, 'Empresa',   sale.CustomerName,    margin,       y);
  infoRow(doc, 'Contacto',  sale.ContactName,     margin + 250, y);
  infoRow(doc, 'Teléfono',  sale.CustomerPhone,   margin + 420, y, 100);
  y += 30;
  infoRow(doc, 'Dirección', `${sale.CustomerAddress || ''}, ${sale.CustomerCity || ''}, ${sale.CustomerCountry || ''}`.trim().replace(/^,\s*|,\s*$/, ''), margin, y, contentW);
  y += 28;

  // ── Seller ────────────────────────────────────────────────────────────────
  y = sectionLabel(doc, 'Vendedor', y);
  infoRow(doc, 'Empleado', sale.EmployeeName, margin, y, 300);
  y += 30;

  // ── Products table ────────────────────────────────────────────────────────
  y = sectionLabel(doc, 'Productos', y);
  y += 2;

  const tHeaders = ['Producto', 'Cant.', 'P. Unitario', 'Desc.', 'Subtotal'];
  const tAligns  = ['left', 'right', 'right', 'right', 'right'];
  const tWidths  = [220, 50, 90, 60, 92];
  const tRows = sale.items.map((i) => [
    i.ProductName,
    i.Quantity,
    fmt.money(i.UnitPrice),
    fmt.pct(i.Discount),
    fmt.money(i.LineTotal),
  ]);

  y = drawTable(doc, tHeaders, tRows, tAligns, tWidths, y);
  y += 10;

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalX = margin + contentW - 180;
  if (sale.Freight) {
    doc.font('Helvetica').fontSize(10).fillColor(C.muted)
       .text('Flete:', totalX, y)
       .text(fmt.money(sale.Freight), totalX + 80, y, { width: 100, align: 'right' });
    y += 16;
  }
  doc.rect(totalX - 10, y - 4, 190, 26).fill(C.primary);
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#ffffff')
     .text('TOTAL:', totalX, y + 3)
     .text(fmt.money(sale.Total + Number(sale.Freight || 0)), totalX + 80, y + 3, { width: 100, align: 'right' });
  doc.fillColor(C.text);
  y += 38;

  // ── Notes area ────────────────────────────────────────────────────────────
  if (y < doc.page.height - 100) {
    doc.font('Helvetica').fontSize(8).fillColor(C.muted)
       .text('Firma del cliente: ________________________    Firma del vendedor: ________________________', margin, y + 10, { width: contentW, align: 'center' });
  }

  footer(doc);
  return doc;
};

// ─── SOLICITUD DE COMPRA ───────────────────────────────────────────────────────
/**
 * Generates a PDF stream for a purchase request.
 */
export const generatePurchaseRequestPdf = async (requestId) => {
  const req = await getRequest(Number(requestId));
  if (!req) throw Object.assign(new Error('Solicitud no encontrada'), { status: 404 });

  const doc = new PDFDocument({ margin, size: 'LETTER', bufferPages: true });

  let y = header(doc, 'SOLICITUD DE COMPRA A PROVEEDOR', `Solicitud #${req.RequestID}`);

  // Status badge
  const statusColor = { pending: '#d97706', sent: C.primary, received: C.success, cancelled: '#dc2626' };
  const sColor = statusColor[req.Status] || C.muted;
  doc.rect(margin, y, 120, 18).fill(sColor);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff')
     .text(STATUS_LABELS_ES[req.Status] ?? req.Status.toUpperCase(), margin + 4, y + 4, { width: 120, align: 'center' });
  doc.fillColor(C.text);
  infoRow(doc, 'Fecha de solicitud', fmt.date(req.RequestDate), margin + 140, y, 200);
  y += 30;

  // ── Supplier block ────────────────────────────────────────────────────────
  y = sectionLabel(doc, 'Datos del proveedor', y);
  infoRow(doc, 'Empresa',   req.SupplierName,    margin,       y);
  infoRow(doc, 'Contacto',  req.ContactName,     margin + 250, y);
  infoRow(doc, 'Teléfono',  req.SupplierPhone,   margin + 420, y, 100);
  y += 30;
  infoRow(doc, 'Dirección', `${req.SupplierAddress || ''}, ${req.SupplierCity || ''}, ${req.SupplierCountry || ''}`.trim().replace(/^,\s*|,\s*$/, ''), margin, y, contentW);
  y += 28;

  // ── Responsible ───────────────────────────────────────────────────────────
  y = sectionLabel(doc, 'Responsable', y);
  infoRow(doc, 'Empleado solicitante', req.EmployeeName, margin, y, 300);
  y += 30;

  // ── Products table ────────────────────────────────────────────────────────
  y = sectionLabel(doc, 'Productos solicitados', y);
  y += 2;

  const tHeaders = ['Producto', 'Cantidad', 'Precio estimado', 'Observaciones'];
  const tAligns  = ['left', 'right', 'right', 'left'];
  const tWidths  = [200, 70, 110, 132];
  const tRows = req.items.map((i) => [
    i.ProductName,
    i.Quantity,
    i.UnitPrice != null ? fmt.money(i.UnitPrice) : '—',
    i.Notes || '',
  ]);

  y = drawTable(doc, tHeaders, tRows, tAligns, tWidths, y);
  y += 14;

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (req.Notes) {
    y = sectionLabel(doc, 'Observaciones generales', y);
    doc.font('Helvetica').fontSize(10).fillColor(C.text)
       .text(req.Notes, margin, y + 4, { width: contentW });
    y += 30;
  }

  // ── Signature line ────────────────────────────────────────────────────────
  if (y < doc.page.height - 80) {
    drawLine(doc, y + 10);
    doc.font('Helvetica').fontSize(8).fillColor(C.muted)
       .text('Autorizado por: ________________________    Recibido por: ________________________', margin, y + 18, { width: contentW, align: 'center' });
  }

  footer(doc);
  return doc;
};

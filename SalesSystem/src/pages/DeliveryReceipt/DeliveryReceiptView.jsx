import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../../components/UI.jsx';
import { Icon } from '../../components/Icons.jsx';
import './DeliveryReceiptView.css';

// Original DR Format.xls: Letter, 18pt item rows, source cell positions in mm.
const itemTop = 84.243;
const itemHeight = 6.35;
const pageWidth = 215.9;
const pageHeight = 279.4;

function drQuantity(value) {
  const match = String(value ?? '').trim().match(/^(\d+)(?:\.(\d{1,3}))?$/);
  if (!match) return '';
  const whole = BigInt(match[1]).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = (match[2] || '').replace(/0+$/, '');
  return whole + (fraction ? '.' + fraction : '');
}

function wrapDrText(value, width, context) {
  const lines = [];
  for (const paragraph of String(value ?? '').replace(/\r/g, '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (context.measureText(line ? line + ' ' + word : word).width <= width) { line += (line ? ' ' : '') + word; continue; }
      if (line) { lines.push(line); line = ''; }
      for (const character of Array.from(word)) {
        if (line && context.measureText(line + character).width > width) { lines.push(line); line = ''; }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines.length ? lines : [''];
}

function fitDrText(value, width, context, start = 9, bold = false) {
  let size = start;
  let lines;
  do {
    context.font = (bold ? 'bold ' : '') + size + 'pt "Times New Roman", Times, serif';
    lines = wrapDrText(value, width * 96 / 25.4, context);
    if (lines.length === 1 || size === 7) break;
    size = Math.max(7, size - 0.25);
  } while (size >= 7);
  return { size, lines };
}

function deliveryPages(record) {
  const context = document.createElement('canvas').getContext('2d');
  const rows = [];
  const dateParts = String(record.deliveryDate || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateParts ? Number(dateParts[2]) + '/' + Number(dateParts[3]) + '/' + dateParts[1].slice(-2) : '';
  const definitions = [
    ['deliveredTo', 'Delivered to', record.deliveredTo, 41.017, 48.26, 90.123, 2, 9],
    ['address', 'Delivery address', record.address, 33.406, 54.081, 97.734, 4, 9],
    ['deliveryDate', 'Delivery date', date, 153.365, 48.26, 38.886, 2, 9],
    ['paymentTerm', 'Payment term', record.paymentTerm, 153.365, 54.081, 38.886, 2, 9],
    ['buyerTin', 'TIN', record.buyerTin, 153.365, 59.108, 38.886, 2, 9],
    ['businessStyle', 'Business style', record.businessStyle, 41.017, 65.987, 90.123, 2, 9],
    ['invoiceNumber', 'SI number', record.invoiceNumber, 41.017, 71.5, 90.123, 2, 9],
    ['purchaseOrderNumber', 'PO number', record.purchaseOrderNumber, 153.365, 65.987, 38.886, 2, 9],
    ['preparedByName', 'Prepared by', record.preparedByName, 30.737, 197.22, 40.934, 2, 7],
    ['receivedBy', 'Received by', record.receivedBy, 153.365, 203.041, 38.886, 2, 7],
  ];
  const headers = definitions.map(([name, label, value, x, y, width, capacity, size]) => {
    const fit = fitDrText(value, width, context, size, name === 'preparedByName' || name === 'receivedBy');
    if (fit.lines.length > capacity) {
      rows.push({ text: label + ' (continued)' });
      context.font = '9pt "Times New Roman", Times, serif';
      wrapDrText(fit.lines.slice(capacity).join('\n'), 133.4 * 96 / 25.4, context).forEach(text => rows.push({ text, overflowField: name }));
    }
    return { name, x, y, width, size: fit.size, capacity, lines: fit.lines.slice(0, capacity) };
  });
  for (const [index, item] of (record.items || []).entries()) {
    const sku = String(item.sku || '').trim();
    const description = String(item.description || item.productDescription || item.productName || '').trim();
    const lower = description.toLowerCase();
    const code = sku.toLowerCase();
    const alreadyIncluded = sku && (lower === code || lower.startsWith(code + ' ') || lower.startsWith(code + '\n'));
    const text = alreadyIncluded ? description : [sku, description].filter(Boolean).join(' ');
    context.font = '9pt "Times New Roman", Times, serif';
    const descriptionLines = wrapDrText(text, 133.4 * 96 / 25.4, context);
    const unit = fitDrText(item.unit, 22.09, context);
    for (let part = 0; part < Math.max(descriptionLines.length, unit.lines.length); part++) {
      rows.push({ item, index, part, text: descriptionLines[part] || '', unit: unit.lines[part] || '', unitSize: unit.size });
    }
  }
  const pages = [];
  for (let start = 0; start < rows.length; start += 14) pages.push({ rows: rows.slice(start, start + 14) });
  if (!pages.length) pages.push({ rows: [] });
  const notes = String(record.notes || '').trim();
  context.font = '9pt "Times New Roman", Times, serif';
  const shortNotes = notes ? wrapDrText('Remarks: ' + notes, 177.8 * 96 / 25.4, context) : [];
  if (shortNotes.length <= 3) pages[pages.length - 1].notes = shortNotes;
  else {
    const longNotes = wrapDrText(notes, 133.4 * 96 / 25.4, context);
    for (let start = 0; start < longNotes.length; start += 13) pages.push({ rows: [{ text: start ? 'Remarks (continued)' : 'Remarks' }, ...longNotes.slice(start, start + 13).map(text => ({ text, remarks: true }))] });
  }
  let total = null;
  if (record.items?.length && record.items.every(item => /^\d+(?:\.\d{1,3})?$/.test(String(item.quantity ?? '')))) {
    const digits = record.items.reduce((sum, item) => {
      const [whole, fraction = ''] = String(item.quantity).split('.');
      return sum + BigInt(whole + fraction.padEnd(3, '0'));
    }, 0n).toString().padStart(4, '0');
    total = digits.slice(0, -3) + '.' + digits.slice(-3);
  }
  return { pages, headers, total };
}

function DeliveryFormChrome({ number }) {
  return <svg className="dr-form-chrome" data-template-chrome="" viewBox="0 0 215.9 279.4" aria-hidden="true">
    <g fill="#262626">
      <path transform="translate(16.5 0) scale(.75 1)" d="M66 8h16v3H76v8h-4v-8h-6zM79 12h4v8h5l-1 2h-8zM84 8h8a5 5 0 0 1 0 10h-4v1h-4zm4 3v4h4a2 2 0 0 0 0-4z" />
      <text x="91" y="18" className="dr-company-title">TTI Laguna Philippines Inc.</text>
      <g className="dr-company-details" textAnchor="middle"><text x="112" y="23">Unit 4 &amp; 5, ILO Land Inc., Warehouse No. 3</text><text x="112" y="25.8">American Road, Greenfield Automotive Park</text><text x="112" y="28.6">Brgy. Don Jose, Sta. Rosa, Laguna</text><text x="112" y="31.4">Tel. No.: (049) 557-6979</text><text x="112" y="34.2">PEZA Reg. No. 13-233</text><text x="112" y="37">VAT Reg. TIN: 008-628-433-00000</text></g>
      <text x="18.5" y="42.5" className="dr-form-title">DELIVERY RECEIPT</text><text x="159.5" y="40" className="dr-form-number">No.: {number}</text>
    </g>
    <g className="dr-form-labels"><text x="18.5" y="51.6">Delivered To:</text><text x="18.5" y="57.2">Address:</text><text x="18.5" y="69.2">Business Style:</text><text x="18.5" y="74.7">SI No.:</text><text x="139" y="51.6">Date:</text><text x="139" y="57.2">Terms:</text><text x="139" y="62.2">TIN:</text><text x="139" y="69.2">PO No.:</text></g>
    <g className="dr-form-rules">
      <path d="M40.5 52.5H131.14M33 58.4H131.14M33 64H131.14M40.5 70.6H131.14M40.5 76H131.14M153 52.5H192.251M153 58.4H192.251M153 63.5H192.251M153 70.6H192.251" />
      <rect x="5.842" y="77.893" width="186.409" height="113.771" /><path d="M30.737 77.893V177.906M55.827 77.893V177.906" />
      {Array.from({ length: 15 }, (_, index) => <line key={index} x1="5.842" y1={itemTop + index * itemHeight} x2="192.251" y2={itemTop + index * itemHeight} />)}
      <path d="M5.842 177.906H192.251M5.842 182.668H192.251M5.842 187.431H192.251M30 201.2H92M30 207H92M30 214H92M153 210.5H192.251" />
    </g>
    <g className="dr-grid-headings" textAnchor="middle"><text x="18.29" y="82.3">Quantity</text><text x="43.28" y="82.3">Unit</text><text x="124.04" y="82.3">Description</text></g>
    <g className="dr-form-footnotes"><text x="5.842" y="194.2">TLPFS-016 rev 02</text><text x="5.842" y="200.6">Prepared by:</text><text x="5.842" y="206.5">Checked by:</text><text x="5.842" y="213.5">Approved by:</text><text x="132" y="209.7">Received by:</text><text x="160" y="213.1" className="dr-signature-caption">Customer Signature Over Printed Name</text></g>
    <g className="dr-printer-details"><text x="18.5" y="220">BONS COMMERCIAL PRESS Florentino B. Bunao - Prop.</text><text x="18.5" y="222.4">6811 Santuico St., Pio del Pilar NCR, Fourth District</text><text x="18.5" y="224.8">City of Makati Tel. No.: 8892-1720</text><text x="18.5" y="227.2">Fax No. 8893-5724 VAT Reg. TIN: 100-179-405-00000</text><text x="18.5" y="229.6">Printer's Accreditation issued on 1/26/2024</text><text x="192.251" y="224.8" textAnchor="end">BIR Authority to Print No.: OCN 057AU20260000005238</text><text x="192.251" y="227.2" textAnchor="end">10 Bklts (50x3) Series: 8151-8650 date Issued: March 2, 2026</text></g>
  </svg>;
}

export default function DeliveryReceiptView({ record, onClose }) {
  const viewport = useRef(null);
  const downloadController = useRef(null);
  const [fit, setFit] = useState(1);
  const [zoom, setZoom] = useState('fit');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const layout = useMemo(() => deliveryPages(record), [record]);
  const scale = zoom === 'fit' ? fit : Number(zoom);
  useLayoutEffect(() => {
    document.body.classList.add('dr-print-open');
    const element = viewport.current;
    const measure = () => setFit(Math.min(1, Math.max(0.1, (element.clientWidth - 24) / (pageWidth * 96 / 25.4))));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { observer.disconnect(); downloadController.current?.abort(); document.body.classList.remove('dr-print-open'); };
  }, []);

  async function downloadExcel() {
    if (downloadController.current) return;
    const controller = new AbortController();
    downloadController.current = controller;
    setDownloading(true); setError('');
    try {
      const response = await fetch('/api/sales/delivery-receipts/' + record.id + '/excel', { credentials: 'same-origin', signal: controller.signal });
      if (!response.ok) {
        if (response.status === 401) window.dispatchEvent(new Event('session-expired'));
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || 'Unable to download this delivery receipt. Try again.');
      }
      const file = await response.blob();
      if (!file.size) throw new Error('The Excel file is empty. Try again.');
      const disposition = response.headers.get('Content-Disposition') || '';
      const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const plain = disposition.match(/filename="([^"]+)"|filename=([^;]+)/i);
      let filename = plain?.[1] || plain?.[2]?.trim() || record.number + '.xlsx';
      if (encoded) { try { filename = decodeURIComponent(encoded[1]); } catch { /* Keep the plain filename when the encoded header is malformed. */ } }
      filename = filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-');
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url; link.download = filename;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { if (!controller.signal.aborted) setError(error.message || 'Cannot connect to the server. Try downloading again.'); }
    finally {
      if (downloadController.current === controller) downloadController.current = null;
      if (!controller.signal.aborted) setDownloading(false);
    }
  }

  return <Modal wide className="delivery-receipt-view" title="Delivery Receipt" subtitle={record.number} onClose={onClose}>
    <div className="dr-preview-controls"><p>Original Excel format <span>Letter paper · Download Excel to print delivery data.</span></p><label>Zoom<select aria-label="Delivery receipt zoom" value={zoom} onChange={event => setZoom(event.target.value)}><option value="fit">Fit</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.25">125%</option></select></label></div>
    {error && <div className="dr-download-error notice error" role="alert">{error}</div>}
    <div ref={viewport} className="modal-body dr-preview-body" aria-label="Delivery receipt preview"><div className="dr-preview-pages">
      {layout.pages.map((page, pageIndex) => {
        const final = pageIndex === layout.pages.length - 1;
        return <div key={pageIndex} className="dr-page-frame" style={{ width: pageWidth * 96 / 25.4 * scale, height: pageHeight * 96 / 25.4 * scale }}><section className="dr-preprinted-page" data-dr-page={pageIndex + 1} aria-label={'Delivery receipt page ' + (pageIndex + 1) + ' of ' + layout.pages.length} style={{ transform: 'scale(' + scale + ')' }}>
          <DeliveryFormChrome number={record.number} />
          {layout.headers.filter(field => !['preparedByName', 'receivedBy'].includes(field.name)).map(field => <span key={field.name} className="dr-print-field dr-header-value" data-dr-field={field.name} aria-label={field.name} style={{ left: field.x + 'mm', top: field.y + 'mm', width: field.width + 'mm', height: field.capacity * 2.7 + 'mm', fontSize: field.size + 'pt' }}>{field.lines.join('\n')}</span>)}
          {page.rows.map((row, slot) => <div key={row.item ? row.index + ':' + row.part : 'note:' + slot} className={'dr-body-line' + (row.item ? '' : ' dr-continuation-line')} data-dr-item={row.item && row.part === 0 ? row.index : undefined} data-dr-sku={row.item && row.part === 0 ? row.item.sku ?? '' : undefined} data-dr-fragment={row.item ? row.index + ':' + row.part : undefined} data-dr-overflow-line={row.overflowField} data-dr-notes-line={row.remarks ? '' : undefined} style={{ top: itemTop + slot * itemHeight + 'mm' }}>
            {row.item ? <><span className="dr-line-quantity" data-dr-column={row.part === 0 ? 'quantity' : undefined}>{row.part === 0 ? drQuantity(row.item.quantity) : ''}</span><span className="dr-line-unit" data-dr-column={row.part === 0 ? 'unit' : undefined} style={{ fontSize: row.unitSize + 'pt' }}>{row.unit}</span><span className="dr-line-description" data-dr-column="description">{row.text}</span></> : <span className="dr-line-description">{row.text}</span>}
          </div>)}
          {final && <div data-dr-summary=""><div className="dr-quantity-total"><span data-dr-field="quantityTotal">{drQuantity(layout.total)}</span><strong>TOTAL</strong></div><div className="dr-end-marker">********NF********</div>{page.notes?.length > 0 && <div className="dr-remarks" data-dr-field="notes">{page.notes.map((line, index) => <div key={index}>{line}</div>)}</div>}{layout.headers.filter(field => ['preparedByName', 'receivedBy'].includes(field.name)).map(field => <span key={field.name} className="dr-print-field dr-signature-value" data-dr-field={field.name} aria-label={field.name} style={{ left: field.x + 'mm', top: field.y + 'mm', width: field.width + 'mm' }}>{field.lines.join('\n')}</span>)}</div>}
        </section></div>;
      })}
    </div></div>
    <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Close</button><button type="button" className="button primary" disabled={downloading} onClick={downloadExcel}><Icon name="file" size={17} />{downloading ? 'Downloading...' : 'Download Excel'}</button></div>
  </Modal>;
}

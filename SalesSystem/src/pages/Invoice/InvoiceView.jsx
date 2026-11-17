import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../../components/UI.jsx';
import { Icon } from '../../components/Icons.jsx';
import './InvoiceView.css';

// Physical row boundaries measured from the supplied preprinted form, in mm.
const bodyLines = [76.2, 82.3, 88.4, 94.5, 100.7, 106.8, 112.9, 119, 125.1, 131.2, 138, 144.8, 151.6, 158.4, 164.9, 172];
const rightTaxLines = [172.3, 178.7, 185.5, 192.3, 199.1, 205.9, 213.5, 222.1];
const leftTaxLines = [171.9, 178.4, 185.2, 192, 198.8];

function invoiceNumber(value, places, trim = false) {
  if (value == null || !/^-?\d+(?:\.\d+)?$/.test(String(value).trim())) return '';
  const text = String(value).trim();
  const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  let digits = BigInt(whole + fraction.padEnd(places, '0').slice(0, places));
  if (Number(fraction[places] || 0) >= 5) digits++;
  const padded = digits.toString().padStart(places + 1, '0');
  const integer = (places ? padded.slice(0, -places) : padded).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimal = trim ? padded.slice(-places).replace(/0+$/, '') : padded.slice(-places);
  return (text.startsWith('-') && digits ? '-' : '') + integer + (places && decimal ? '.' + decimal : '');
}

function wrapInvoiceText(value, width, context) {
  const lines = [];
  for (const paragraph of String(value ?? '').replace(/\r/g, '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (context.measureText(line ? line + ' ' + word : word).width <= width) {
        line += (line ? ' ' : '') + word;
        continue;
      }
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

function fitInvoiceText(value, width, context, start = 9, bold = false) {
  let size = start;
  let lines;
  do {
    context.font = (bold ? 'bold ' : '') + size + 'pt "Times New Roman", Times, serif';
    lines = wrapInvoiceText(value, width * 96 / 25.4, context);
    if (lines.length === 1 || size === 7) break;
    size = Math.max(7, size - 0.25);
  } while (size >= 7);
  return { size, lines };
}

function invoicePages(record) {
  const context = document.createElement('canvas').getContext('2d');
  const pages = [];
  const lines = [];
  const buyerName = record.billToName ?? (record.billToCustomerId == null ? record.customerName : null);
  const buyerAddress = record.billToAddress ?? (record.billToCustomerId == null ? record.customerAddress : null);
  const dateParts = String(record.invoiceDate || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateParts ? Number(dateParts[2]) + '/' + Number(dateParts[3]) + '/' + dateParts[1].slice(-2) : '';
  const definitions = [
    ['buyerName', 'Buyer name', buyerName, 43.8, 46.9, 94, 9], ['buyerAddress', 'Buyer address', buyerAddress, 32, 52.6, 106, 8],
    ['shipToName', 'Ship to', record.shipToName, 31.2, 58.2, 106.8, 9], ['invoiceDate', 'Invoice date', date, 149, 47.3, 49.5, 9],
    ['paymentTerm', 'Payment term', record.paymentTerm, 150, 52.9, 48.5, 9], ['buyerTin', 'Buyer TIN', record.buyerTin, 146, 58.5, 52.5, 9],
    ['preparedByName', 'Prepared by', record.preparedByName, 35.2, 226.8, 59, 7],
  ];
  const headers = definitions.map(([name, label, value, x, y, width, size]) => {
    const fit = fitInvoiceText(value, width, context, size, name === 'preparedByName');
    if (fit.lines.length > 2) {
      lines.push({ note: label + ' (continued)' });
      context.font = '8pt "Times New Roman", Times, serif';
      const remaining = wrapInvoiceText(fit.lines.slice(2).join('\n'), 63 * 96 / 25.4, context);
      remaining.forEach(note => lines.push({ note, overflowField: name }));
    }
    return { name, x, y, width, size: fit.size, lines: fit.lines.slice(0, 2) };
  });
  for (const [index, item] of (record.items || []).entries()) {
    const sku = String(item.sku || '').trim();
    const description = String(item.description || item.productDescription || item.productName || '').trim();
    const lowerDescription = description.toLowerCase();
    const lowerSku = sku.toLowerCase();
    const alreadyIncluded = sku && (lowerDescription === lowerSku || lowerDescription.startsWith(lowerSku + ' ') || lowerDescription.startsWith(lowerSku + '\n'));
    const text = alreadyIncluded ? description : [sku, description].filter(Boolean).join(' ');
    context.font = '8pt "Times New Roman", Times, serif';
    const wrapped = wrapInvoiceText(text, 63 * 96 / 25.4, context);
    const unit = fitInvoiceText(item.unit, 11.1, context, 8);
    for (let part = 0; part < Math.max(wrapped.length, unit.lines.length); part++) {
      lines.push({ item, index, part, description: wrapped[part] || '', unit: unit.lines[part] || '', unitSize: unit.size });
    }
  }
  for (let start = 0; start < lines.length; start += 14) pages.push({ lines: lines.slice(start, start + 14) });
  if (!pages.length) pages.push({ lines: [] });

  const notes = String(record.notes || '').trim();
  context.font = '8pt "Times New Roman", Times, serif';
  const shortNotes = notes ? wrapInvoiceText('Remarks: ' + notes, 105 * 96 / 25.4, context) : [];
  if (shortNotes.length <= 6) pages[pages.length - 1].notes = shortNotes;
  else {
    const longNotes = wrapInvoiceText(notes, 63 * 96 / 25.4, context);
    for (let start = 0; start < longNotes.length; start += 13) {
      pages.push({ lines: [{ note: start ? 'Remarks (continued)' : 'Remarks' }, ...longNotes.slice(start, start + 13).map(note => ({ note, remarks: true }))] });
    }
  }
  return { pages, headers };
}

function InvoiceFormChrome({ number }) {
  const headings = ['Quantity', 'Unit', 'Description', 'Unit Price', 'Total Amount'];
  const headingX = [32.8, 54.4, 94.9, 145.1, 180.4];
  const leftLabels = ['VATable Sales', 'VAT-Exempt Sales', 'Zero-Rated Sales', 'VAT Amount'];
  const rightLabels = ['Total Sales (VAT Inclusive)', 'Less: VAT', 'Amount: Net of VAT', 'Less Discount (SC/PWD Discount)', 'Amount Due', 'Add: VAT', 'TOTAL AMOUNT DUE'];
  return <svg className="invoice-form-chrome" data-template-chrome="" viewBox="0 0 210 297" aria-hidden="true">
    <g fill="#262626">
      <path transform="translate(16.5 0) scale(.75 1)" d="M66 8h16v3H76v11h-4V11h-6zM79 12h4v10h-4zM84 8h8a5 5 0 0 1 0 10h-4v4h-4zm4 3v4h4a2 2 0 0 0 0-4z" />
      <text x="91" y="18" className="invoice-company-title">TTI Laguna Philippines Inc.</text>
      <g className="invoice-company-details" textAnchor="middle">
        <text x="112" y="23">Unit 4 &amp; 5, ILO Land Inc., Warehouse No. 3, American Road</text>
        <text x="112" y="25.8">Greenfield Automotive Park, Don Jose, Sta. Rosa, Laguna</text>
        <text x="112" y="28.6">Tel. No.: (049) 557-6979</text>
        <text x="112" y="31.4">PEZA Reg. No. 13-233</text>
        <text x="112" y="34.2">VAT Reg. TIN: 008-628-433-00000</text>
      </g>
      <text x="18.5" y="40.8" className="invoice-form-title">SALES INVOICE</text>
      <text x="159.5" y="39" className="invoice-form-number">No.: {number}</text>
    </g>
    <g className="invoice-form-labels">
      <text x="18.5" y="50">Customer Name:</text><text x="18.5" y="55.6">Address:</text><text x="18.5" y="61.2">Ship To:</text><text x="18.5" y="66.3">SC/PWD ID NO.:</text>
      <text x="139.4" y="50.5">Date:</text><text x="139.4" y="56.1">Terms:</text><text x="139.4" y="61.7">TIN:</text><text x="139.4" y="66.8">Signature</text>
    </g>
    <g className="invoice-form-rules">
      <path d="M43.4 50.6H138M31.7 56.2H138M30.8 61.8H138M43.2 66.9H138M148.5 51H198.8M149.6 56.6H198.8M145.3 62.2H198.8M154 67.3H198.8" />
      <rect x="18.3" y="68.6" width="180.5" height="153.5" />
      <path d="M47.3 68.6V222.1M61.4 68.6V171.9M128.3 68.6V222.1M161.9 68.6V222.1M78.4 171.9V198.8" />
      {bodyLines.map(y => <line key={y} x1="18.3" y1={y} x2="198.8" y2={y} />)}
      {leftTaxLines.slice(1).map(y => <line key={'left' + y} x1="18.3" y1={y} x2="128.3" y2={y} />)}
      {rightTaxLines.slice(1, -1).map(y => <line key={'right' + y} x1="128.3" y1={y} x2="198.8" y2={y} />)}
      <path d="M18.3 205.5H128.3M18.3 213.2H128.3M34.8 232H95M34.8 239H95M34.8 246H95M145.3 246H198.8" />
    </g>
    <g className="invoice-grid-headings" textAnchor="middle">{headings.map((heading, index) => <text key={heading} x={headingX[index]} y="74.2">{heading}</text>)}</g>
    <g className="invoice-tax-labels">
      {leftLabels.map((label, index) => <text key={label} x="48.3" y={(leftTaxLines[index] + leftTaxLines[index + 1]) / 2 + 1}>{label}</text>)}
      {rightLabels.map((label, index) => <text key={label} x="129.3" y={(rightTaxLines[index] + rightTaxLines[index + 1]) / 2 + 1} className={index === 0 || index === 3 ? 'invoice-small-tax-label' : index === 6 ? 'invoice-final-tax-label' : undefined}>{label}</text>)}
    </g>
    <g className="invoice-form-footnotes">
      <text x="18.5" y="225.4">TLPFS-015 Rev.04 June2026</text>
      <text x="18.5" y="231.7">Prepared by:</text><text x="18.5" y="238.7">Checked by:</text><text x="18.5" y="245.7">Approved by:</text><text x="130.5" y="245.7">Received by:</text>
    </g>
    <g className="invoice-printer-details">
      <text x="30.5" y="252.1">BONS COMMERCIAL PRESS Florentino B. Bunao - Prop.</text>
      <text x="30.5" y="254.5">6811 Santuico St., Pio del Pilar NCR, Fourth District</text>
      <text x="30.5" y="256.9">City of Makati Tel. No.: 8892-1720</text>
      <text x="30.5" y="259.3">Fax No. 8893-5724 VAT Reg. TIN: 100-179-405-00000</text>
      <text x="30.5" y="261.7">Printer's Accreditation issued on 1/26/2024</text>
      <text x="198.8" y="259.3" textAnchor="end">BIR Authority to Print No.: OCN 057AU20260000014546</text>
      <text x="198.8" y="261.7" textAnchor="end">10 Bklts (50x3) Series: 6451-6950 date Issued: June 3, 2026</text>
    </g>
  </svg>;
}

export default function InvoiceView({ record, onClose }) {
  const viewport = useRef(null);
  const downloadController = useRef(null);
  const [fit, setFit] = useState(1);
  const [zoom, setZoom] = useState('fit');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const layout = useMemo(() => invoicePages(record), [record]);
  const pages = layout.pages;
  const scale = zoom === 'fit' ? fit : Number(zoom);
  const currency = record.currency && /^[A-Z]{3}$/.test(record.currency)
    ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: record.currency }).formatToParts(0).find(part => part.type === 'currency')?.value || record.currency
    : record.currency || '';
  const knownClass = ['Vatable', 'Vat-Exempt', 'Zero Rated'].includes(record.vatClass);
  const knownVat = record.vatAmount != null && invoiceNumber(record.vatAmount, 2) !== '';
  const knownMode = typeof record.vatInclusive === 'boolean';
  let totalQuantity = null;
  if (record.items?.length && record.items.every(item => /^\d+(?:\.\d{1,3})?$/.test(String(item.quantity ?? '')))) {
    totalQuantity = record.items.reduce((total, item) => {
      const [whole, fraction = ''] = String(item.quantity).split('.');
      return total + BigInt(whole + fraction.padEnd(3, '0'));
    }, 0n).toString().padStart(4, '0');
    totalQuantity = totalQuantity.slice(0, -3) + '.' + totalQuantity.slice(-3);
  }

  useLayoutEffect(() => {
    document.body.classList.add('invoice-print-open');
    const element = viewport.current;
    const measure = () => setFit(Math.min(1, Math.max(0.1, (element.clientWidth - 24) / (210 * 96 / 25.4))));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { observer.disconnect(); downloadController.current?.abort(); document.body.classList.remove('invoice-print-open'); };
  }, []);

  async function downloadExcel() {
    if (downloadController.current) return;
    const controller = new AbortController();
    downloadController.current = controller;
    setDownloading(true); setDownloadError('');
    try {
      const response = await fetch('/api/sales/sales-invoices/' + record.id + '/excel', { credentials: 'same-origin', signal: controller.signal });
      if (!response.ok) {
        if (response.status === 401) window.dispatchEvent(new Event('session-expired'));
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || 'Unable to download this invoice. Try again.');
      }
      const file = await response.blob();
      if (!file.size) throw new Error('The Excel file is empty. Try again.');
      const disposition = response.headers.get('Content-Disposition') || '';
      const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const plain = disposition.match(/filename="([^"]+)"|filename=([^;]+)/i);
      let filename = plain?.[1] || plain?.[2]?.trim() || record.number + '.xlsx';
      if (encoded) { try { filename = decodeURIComponent(encoded[1]); } catch { /* Use the plain filename when the header is malformed. */ } }
      filename = filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-');
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url; link.download = filename;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (!controller.signal.aborted) setDownloadError(error.message || 'Cannot connect to the server. Try downloading again.');
    } finally {
      if (downloadController.current === controller) downloadController.current = null;
      if (!controller.signal.aborted) setDownloading(false);
    }
  }

  return <Modal wide className="invoice-view" title="Invoice" subtitle={record.number} onClose={onClose}>
    <div className="invoice-preview-controls"><p>Preprinted paper <span>Download Excel to print invoice data.</span></p><label>Zoom<select aria-label="Invoice zoom" value={zoom} onChange={event => setZoom(event.target.value)}><option value="fit">Fit</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.25">125%</option></select></label></div>
    {downloadError && <div className="invoice-download-error notice error" role="alert">{downloadError}</div>}
    <div className="modal-body invoice-preview-body" ref={viewport} aria-label="Invoice print preview">
      <div className="invoice-preview-pages">
        {pages.map((page, pageIndex) => {
          const final = pageIndex === pages.length - 1;
          const summaryFields = [
            ['vatableSales', knownClass ? record.vatClass === 'Vatable' ? record.netAmount : 0 : null, 79.4, 173.5, 47.5],
            ['vatExemptSales', knownClass ? record.vatClass === 'Vat-Exempt' ? record.netAmount : 0 : null, 79.4, 180.1, 47.5],
            ['zeroRatedSales', knownClass ? record.vatClass === 'Zero Rated' ? record.netAmount : 0 : null, 79.4, 186.9, 47.5],
            ['vatAmount', record.vatAmount, 79.4, 193.7, 47.5],
            ['totalSalesVatInclusive', null, 163.4, 173.9, 33.8],
            ['lessVat', knownVat && knownMode ? record.vatInclusive ? record.vatAmount : 0 : null, 163.4, 180.5, 33.8],
            ['amountNetOfVat', null, 163.4, 187.3, 33.8],
            ['discountAmount', record.discountAmount, 163.4, 194.1, 33.8],
            ['amountDue', null, 163.4, 200.8, 33.8],
            ['addVat', knownVat && knownMode ? record.vatInclusive ? 0 : record.vatAmount : null, 163.4, 208, 33.8],
            ['totalAmountDue', record.total, 166.5, 216.1, 30.7],
          ];
          return <div key={pageIndex} className="invoice-page-frame" style={{ width: 210 * 96 / 25.4 * scale, height: 297 * 96 / 25.4 * scale }}>
            <section className="invoice-preprinted-page" data-invoice-page={pageIndex + 1} aria-label={'Invoice page ' + (pageIndex + 1) + ' of ' + pages.length} style={{ transform: 'scale(' + scale + ')' }}>
              <InvoiceFormChrome number={record.number} />
              {layout.headers.filter(field => field.name !== 'preparedByName').map(field => <span key={field.name} className="invoice-print-field invoice-header-value" data-invoice-field={field.name} aria-label={field.name} style={{ left: field.x + 'mm', top: field.y + 'mm', width: field.width + 'mm', fontSize: field.size + 'pt' }}>{field.lines.join('\n')}</span>)}
              {page.lines.map((line, slot) => <div key={line.note == null ? line.index + ':' + line.part : 'note:' + slot} className={'invoice-body-line' + (line.note != null ? ' invoice-note-line' : '')} data-invoice-item={line.item && line.part === 0 ? line.index : undefined} data-invoice-fragment={line.item ? line.index + ':' + line.part : undefined} data-invoice-overflow-line={line.overflowField} data-invoice-notes-line={line.remarks ? '' : undefined} style={{ top: bodyLines[slot] + 'mm', height: bodyLines[slot + 1] - bodyLines[slot] + 'mm' }}>
                {line.note != null ? <span className="invoice-line-description">{line.note}</span> : <>
                  <span className="invoice-line-quantity" data-invoice-column={line.part === 0 ? 'quantity' : undefined}>{line.part === 0 ? invoiceNumber(line.item.quantity, 3, true) : ''}</span>
                  <span className="invoice-line-unit" data-invoice-column={line.part === 0 ? 'unit' : undefined} style={{ fontSize: line.unitSize + 'pt' }}>{line.unit}</span>
                  <span className="invoice-line-description" data-invoice-column="description">{line.description}</span>
                  <span className="invoice-line-price" data-invoice-column={line.part === 0 ? 'unitPrice' : undefined}>{line.part === 0 && <><span>{currency}</span><span>{invoiceNumber(line.item.convertedUnitPrice ?? line.item.unitPrice, 5)}</span></>}</span>
                  <span className="invoice-line-amount" data-invoice-column={line.part === 0 ? 'grossAmount' : undefined}>{line.part === 0 ? invoiceNumber(line.item.grossAmount, 2) : ''}</span>
                </>}
              </div>)}
              {final && <div data-invoice-summary="">
                <div className="invoice-quantity-total"><span data-invoice-field="quantityTotal">{invoiceNumber(totalQuantity, 3, true)}</span><strong>TOTAL</strong><span className="invoice-end-marker">********NF********</span></div>
                {summaryFields.map(([name, value, x, y, width]) => <span key={name} className={'invoice-print-field invoice-summary-value' + (name === 'totalAmountDue' ? ' invoice-grand-total' : '')} data-invoice-field={name} aria-label={name} style={{ left: x + 'mm', top: y + 'mm', width: width + 'mm' }}>{invoiceNumber(value, 2)}</span>)}
                <span className="invoice-print-field invoice-total-currency">{currency}</span>
                {page.notes?.length > 0 && <div className="invoice-remarks" data-invoice-field="notes">{page.notes.map((line, index) => <div key={index}>{line}</div>)}</div>}
                <span className="invoice-print-field invoice-prepared-by" data-invoice-field="preparedByName">{layout.headers.find(field => field.name === 'preparedByName').lines.join('\n')}</span>
              </div>}
              <footer className="invoice-data-footer"><span data-invoice-field="invoiceNumber">{record.number}</span><span data-invoice-field="pageNumber">Page {pageIndex + 1} of {pages.length}</span></footer>
            </section>
          </div>;
        })}
      </div>
    </div>
    <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Close</button><button type="button" className="button primary" disabled={downloading} onClick={downloadExcel}><Icon name="file" size={17} />{downloading ? 'Downloading...' : 'Download Excel'}</button></div>
  </Modal>;
}

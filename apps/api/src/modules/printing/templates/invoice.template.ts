import { buildDocHeader, buildDocFooter, wrapHtmlDocument, money, esc, PrintSettings } from './shared';

/** `invoice` is whatever billingService.findInvoiceById(...) returns. */
export function buildInvoiceHtml(invoice: any, settings: PrintSettings): string {
  const patient = invoice.booking?.patient;
  const doctor = invoice.booking?.doctor;

  const rightBlock = `
    <div class="doc-label">Invoice</div>
    <div style="font-size:13pt; font-weight:700;">${esc(invoice.invoiceNumber)}</div>
    <div style="font-size:8pt; color:#64748b; margin-top:2px;">
      ${invoice.createdAt ? new Date(invoice.createdAt).toLocaleString() : ''}
    </div>
  `;

  const rows = (invoice.lines ?? [])
    .map(
      (l: any) => `
      <tr>
        <td>${esc(l.description)}</td>
        <td style="text-align:right;">${money(l.basePrice ?? l.unitPrice)}</td>
        <td style="text-align:right; color:${Number(l.discountAmount ?? 0) > 0 ? '#b45309' : '#94a3b8'};">
          ${Number(l.discountAmount ?? 0) > 0 ? '- ' + money(l.discountAmount) : '—'}
        </td>
        <td style="text-align:right; font-weight:600;">${money(l.lineTotal)}</td>
      </tr>`,
    )
    .join('');

  const body = `
    ${buildDocHeader(settings, rightBlock)}
    <h2 class="doc-title">Invoice / Payment Receipt</h2>
    <div class="doc-grid" style="grid-template-columns: 1fr 1fr 1fr;">
      <div>
        <div class="doc-label">Patient</div>
        <div style="font-weight:600;">${esc(patient?.fullName)}</div>
        <div>${esc(patient?.phone)}</div>
      </div>
      <div>
        <div class="doc-label">Referred by</div>
        <div>${esc(doctor?.fullName) || '—'}</div>
      </div>
      <div>
        <div class="doc-label">Status</div>
        <div><span class="doc-badge">${esc(String(invoice.status).replace(/_/g, ' '))}</span></div>
      </div>
    </div>
    <table class="doc-table">
      <thead>
        <tr><th>Description</th><th style="text-align:right;">Original</th><th style="text-align:right;">Discount</th><th style="text-align:right;">Total</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="max-width:260px; margin-left:auto; font-size:10pt;">
      <div style="display:flex; justify-content:space-between; font-weight:700; border-top:1px solid #e2e8f0; padding-top:6px;">
        <span>Total</span><span>${money(invoice.grandTotal)}</span>
      </div>
      <div style="display:flex; justify-content:space-between; color:#16a34a;">
        <span>Paid</span><span>${money(invoice.amountPaid)}</span>
      </div>
      <div style="display:flex; justify-content:space-between; color:${Number(invoice.amountDue) > 0 ? '#b45309' : '#64748b'}; font-weight:600;">
        <span>Due</span><span>${money(invoice.amountDue)}</span>
      </div>
    </div>
    ${buildDocFooter(settings, invoice.report?.trackingId ? `<div style="margin-top:4px;">Tracking ID: ${esc(invoice.report.trackingId)}</div>` : '')}
  `;

  return wrapHtmlDocument(body);
}

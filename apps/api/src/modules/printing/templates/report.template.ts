import { buildDocHeader, buildDocFooter, wrapHtmlDocument, money, esc, PrintSettings } from './shared';

function testBlockHtml(result: any): string {
  const rows = (result.values ?? [])
    .slice()
    .sort((a: any, b: any) => (a.parameter?.sortOrder ?? 0) - (b.parameter?.sortOrder ?? 0))
    .map(
      (v: any) => `
      <tr class="${v.isCritical ? 'doc-critical' : ''}">
        <td>${esc(v.parameter?.name ?? v.parameter?.code ?? '—')}</td>
        <td>${esc(v.valueNumeric != null ? String(v.valueNumeric) : v.valueText ?? '—')}</td>
        <td>${esc(v.unit ?? v.parameter?.unit ?? '')}</td>
        <td style="font-size:7.5pt;">${esc(v.flag ? String(v.flag).replace(/_/g, ' ') : '')}</td>
      </tr>`,
    )
    .join('');

  return `
    <div style="margin-bottom:14px;">
      <div class="doc-section">
        ${esc(result.test?.code)} — ${esc(result.test?.name)}
        ${result.isCritical ? '<span class="doc-critical" style="margin-left:8px; font-size:8pt;">CRITICAL</span>' : ''}
      </div>
      <table class="doc-table">
        <thead><tr><th>Parameter</th><th>Result</th><th>Unit</th><th>Flag</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

/** `report` is whatever reportingService.findById(...) returns. */
export function buildReportHtml(report: any, settings: PrintSettings): string {
  const inv = report.invoice;
  const patient = inv?.booking?.patient;
  const due = Number(inv?.amountDue ?? 0);
  const results = (inv?.samples ?? []).flatMap((s: any) => s.results ?? []);

  const rightBlock = `
    <div class="doc-label">Report No.</div>
    <div style="font-size:12pt; font-weight:700;">${esc(report.reportNumber)}</div>
    <div style="font-size:7.5pt; color:#64748b; margin-top:2px;">
      ${report.generatedAt ? new Date(report.generatedAt).toLocaleString() : ''}
    </div>
  `;

  const patientBlock = `
    <h2 class="doc-title">Laboratory Investigation Report</h2>
    <div class="doc-grid" style="grid-template-columns: 1fr 1fr 1fr;">
      <div>
        <div class="doc-label">Patient</div>
        <div style="font-weight:600;">${esc(patient?.fullName)}</div>
        <div>${esc(patient?.phone)}</div>
        ${patient?.gender ? `<div>${esc(patient.gender)}</div>` : ''}
      </div>
      <div>
        <div class="doc-label">Referred by</div>
        <div>${esc(inv?.booking?.doctor?.fullName) || '—'}</div>
        <div class="doc-label" style="margin-top:6px;">Invoice</div>
        <div>${esc(inv?.invoiceNumber)}</div>
      </div>
      <div>
        <div class="doc-label">Payment</div>
        <div><span class="doc-badge">${esc(String(inv?.status ?? '—').replace(/_/g, ' '))}</span></div>
        <div>Paid: ${money(inv?.amountPaid)}</div>
        <div style="font-weight:${due > 0 ? 700 : 400}; color:${due > 0 ? '#b45309' : '#16a34a'};">Due: ${money(inv?.amountDue)}</div>
      </div>
    </div>
  `;

  const footerExtra = due > 0 ? `<div style="margin-top:4px; font-weight:600;">Outstanding balance: ${money(due)}</div>` : '';

  let content: string;
  if (results.length === 0) {
    content = `
      ${buildDocHeader(settings, rightBlock)}
      ${patientBlock}
      <p style="font-size:9.5pt; color:#64748b;">No released results yet.</p>
      ${buildDocFooter(settings, footerExtra)}
    `;
  } else if (settings.reportPagination === 'ONE_TEST_PER_PAGE') {
    content = results
      .map(
        (r: any, i: number) => `
        <div class="${i < results.length - 1 ? 'doc-page-break' : ''}">
          ${buildDocHeader(settings, rightBlock)}
          ${patientBlock}
          ${testBlockHtml(r)}
          ${buildDocFooter(settings, footerExtra)}
        </div>`,
      )
      .join('');
  } else {
    content = `
      ${buildDocHeader(settings, rightBlock)}
      ${patientBlock}
      ${results.map((r: any) => testBlockHtml(r)).join('')}
      ${buildDocFooter(settings, footerExtra)}
    `;
  }

  return wrapHtmlDocument(content);
}

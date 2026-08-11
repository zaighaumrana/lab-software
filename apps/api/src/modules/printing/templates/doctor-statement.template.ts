import { buildDocHeader, buildDocFooter, wrapHtmlDocument, money, esc, PrintSettings } from './shared';

/** `dashboard` is whatever doctorsService.dashboard(...) returns. */
export function buildDoctorStatementHtml(dashboard: any, settings: PrintSettings): string {
  const { doctor, range, summary, patients } = dashboard;

  const rangeLabel =
    range.from && range.to
      ? `${new Date(range.from).toLocaleDateString()} — ${new Date(range.to).toLocaleDateString()}`
      : 'All time';

  const rightBlock = `
    <div class="doc-label">Statement Period</div>
    <div style="font-weight:700;">${esc(rangeLabel)}</div>
    <div style="font-size:7.5pt; color:#64748b; margin-top:2px;">Generated ${new Date().toLocaleString()}</div>
  `;

  const rows = (patients.rows ?? [])
    .map(
      (r: any) => `
      <tr>
        <td>${esc(r.invoiceNumber)}</td>
        <td>${esc(r.patientName)}</td>
        <td>${new Date(r.date).toLocaleDateString()}</td>
        <td style="font-size:8pt;">${esc((r.tests ?? []).join(', '))}</td>
        <td style="text-align:right;">${money(r.invoiceAmount)}</td>
        <td style="text-align:right;">${money(r.shareAmount)}</td>
      </tr>`,
    )
    .join('');

  const body = `
    ${buildDocHeader(settings, rightBlock)}
    <h2 class="doc-title">Doctor Share Statement</h2>
    <div class="doc-grid" style="grid-template-columns: 1fr 1fr;">
      <div>
        <div class="doc-label">Doctor</div>
        <div style="font-weight:600;">${esc(doctor.fullName)}</div>
        ${doctor.specialty ? `<div>${esc(doctor.specialty)}</div>` : ''}
        ${doctor.clinicName ? `<div>${esc(doctor.clinicName)}</div>` : ''}
      </div>
      <div>
        <div class="doc-label">Summary</div>
        <div>Patients referred: ${summary.totalPatients}</div>
        <div>Total revenue: ${money(summary.totalRevenue)}</div>
        <div style="font-weight:700;">Total share: ${money(summary.totalShare)}</div>
      </div>
    </div>
    <table class="doc-table">
      <thead>
        <tr>
          <th>Invoice #</th><th>Patient</th><th>Date</th><th>Tests</th>
          <th style="text-align:right;">Invoice Amount</th><th style="text-align:right;">Share Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="font-weight:700; border-top: 2px solid #1e293b;">
          <td colspan="4">Total</td>
          <td style="text-align:right;">${money(summary.totalRevenue)}</td>
          <td style="text-align:right;">${money(summary.totalShare)}</td>
        </tr>
      </tfoot>
    </table>
    ${buildDocFooter(settings)}
  `;

  return wrapHtmlDocument(body);
}

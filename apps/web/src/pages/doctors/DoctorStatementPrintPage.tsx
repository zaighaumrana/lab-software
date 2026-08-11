import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import * as doctorsApi from '../../api/doctors';
import type { DoctorDashboard } from '../../api/doctors';
import { useSettings } from '../../contexts/SettingsContext';
import { PrintFrame, useIsLetterhead } from '../../print/PrintFrame';
import { openPdf } from '../../print/openPdf';
import { Loading } from '../../components/Loading';
import '../../styles/print-document.css';

function money(n: number | undefined) {
  return `Rs ${Number(n ?? 0).toLocaleString('en-PK')}`;
}

/**
 * Doctor share statement — a printable document, built on the same shared
 * print engine as invoices/reports (PrintFrame: dynamic margins, letterhead
 * mode). Pulls every referred patient in range in one page (no UI
 * pagination — a printed statement should be complete).
 */
export function DoctorStatementPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const from = searchParams.get('from') ?? undefined;
  const to = searchParams.get('to') ?? undefined;
  const { branding, printLayout } = useSettings();
  const letterhead = useIsLetterhead();
  const [data, setData] = useState<DoctorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState('');

  async function handleOpenPdf() {
    if (!id) return;
    setPdfLoading(true);
    setPdfError('');
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      await openPdf(`/printing/doctors/${id}/statement?${params.toString()}`);
    } catch {
      setPdfError('Could not generate PDF. Please try again.');
    } finally {
      setPdfLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    doctorsApi
      .getDoctorDashboard(id, { from, to, sortBy: 'date', sortDir: 'asc', page: 1, pageSize: 1000 })
      .then(setData)
      .finally(() => setLoading(false));
  }, [id, from, to]);

  if (loading) return <Loading />;
  if (!data) return <p className="p-6 text-sm text-slate-500">Statement not found.</p>;

  const labName = printLayout.labName || branding.labName;
  const rangeLabel =
    data.range.from && data.range.to
      ? `${new Date(data.range.from).toLocaleDateString()} — ${new Date(data.range.to).toLocaleDateString()}`
      : 'All time';

  return (
    <PrintFrame>
      <div className="print-doc-root">
        <div className="print-doc-toolbar no-print">
          <span />
          <button type="button" className="btn-primary text-sm" onClick={handleOpenPdf} disabled={pdfLoading}>
            {pdfLoading ? 'Generating PDF…' : 'Open / Print PDF'}
          </button>
        </div>
        {pdfError && (
          <div
            className="no-print"
            style={{ maxWidth: '210mm', margin: '0 auto 12px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 14, color: '#b91c1c' }}
          >
            {pdfError}
          </div>
        )}

        <article className="print-doc">
          <header className="print-doc-header">
            {letterhead ? (
              <div />
            ) : (
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {branding.logoDataUrl && (
                  <img src={branding.logoDataUrl} alt="" className="print-doc-logo" />
                )}
                <div>
                  <h1 className="print-doc-lab-name">{labName}</h1>
                  {printLayout.address && <p className="print-doc-meta">{printLayout.address}</p>}
                  <p className="print-doc-meta">
                    {[printLayout.phone, printLayout.email].filter(Boolean).join('  ·  ')}
                  </p>
                </div>
              </div>
            )}
            <div style={{ textAlign: 'right' }}>
              <div className="print-doc-label">Statement Period</div>
              <div style={{ fontWeight: 700 }}>{rangeLabel}</div>
              <div style={{ fontSize: '8pt', color: '#555', marginTop: 4 }}>
                Generated {new Date().toLocaleString()}
              </div>
            </div>
          </header>

          <h2 className="print-doc-title">Doctor Share Statement</h2>

          <div className="print-doc-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <div className="print-doc-label">Doctor</div>
              <div style={{ fontWeight: 600 }}>{data.doctor.fullName}</div>
              {data.doctor.specialty && <div>{data.doctor.specialty}</div>}
              {data.doctor.clinicName && <div>{data.doctor.clinicName}</div>}
            </div>
            <div>
              <div className="print-doc-label">Summary</div>
              <div>Patients referred: {data.summary.totalPatients}</div>
              <div>Total revenue: {money(data.summary.totalRevenue)}</div>
              <div style={{ fontWeight: 700 }}>Total share: {money(data.summary.totalShare)}</div>
            </div>
          </div>

          <table className="print-doc-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Patient</th>
                <th>Date</th>
                <th>Tests</th>
                <th style={{ textAlign: 'right' }}>Invoice Amount</th>
                <th style={{ textAlign: 'right' }}>Share Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.patients.rows.map((r) => (
                <tr key={r.shareId}>
                  <td>{r.invoiceNumber}</td>
                  <td>{r.patientName}</td>
                  <td>{new Date(r.date).toLocaleDateString()}</td>
                  <td style={{ fontSize: '8pt' }}>{r.tests.join(', ')}</td>
                  <td style={{ textAlign: 'right' }}>{money(r.invoiceAmount)}</td>
                  <td style={{ textAlign: 'right' }}>{money(r.shareAmount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, borderTop: '2px solid #1f2937' }}>
                <td colSpan={4}>Total</td>
                <td style={{ textAlign: 'right' }}>{money(data.summary.totalRevenue)}</td>
                <td style={{ textAlign: 'right' }}>{money(data.summary.totalShare)}</td>
              </tr>
            </tfoot>
          </table>

          <footer className="print-doc-footer">
            {!letterhead &&
              (printLayout.footerText || 'Computer-generated doctor share statement.')}
          </footer>
        </article>
      </div>
    </PrintFrame>
  );
}

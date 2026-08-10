import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as reportsApi from '../../api/reports';
import * as billingApi from '../../api/billing';
import type { Report, Patient } from '../../types';
import { useSettings } from '../../contexts/SettingsContext';
import { PrintFrame, useIsLetterhead, useReportPagination } from '../../print/PrintFrame';
import { openPdf } from '../../print/openPdf';
import { Loading } from '../../components/Loading';
import '../../styles/print-document.css';

function money(n: number | string | undefined) {
  return `Rs ${Number(n ?? 0).toLocaleString('en-PK')}`;
}

type Branding = ReturnType<typeof useSettings>['branding'];
type PrintLayout = ReturnType<typeof useSettings>['printLayout'];

/**
 * Header + patient/payment strip repeated at the top of every printed page.
 * Only the results table below it changes page to page.
 *
 * In Letterhead mode the lab's own logo/name/address/contact block is
 * skipped entirely (that's already printed on the physical paper) — only
 * dynamic, per-report content (tracking ID, report number, patient/payment
 * info) still renders.
 */
function ReportPageHeader({
  report,
  inv,
  patient,
  due,
  labName,
  branding,
  printLayout,
  letterhead,
}: {
  report: Report;
  inv: Report['invoice'];
  patient: Patient | undefined;
  due: number;
  labName: string;
  branding: Branding;
  printLayout: PrintLayout;
  letterhead: boolean;
}) {
  return (
    <>
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
              {printLayout.labNumber && (
                <p className="print-doc-meta">Lab / Reg. No: {printLayout.labNumber}</p>
              )}
              {printLayout.address && <p className="print-doc-meta">{printLayout.address}</p>}
              <p className="print-doc-meta">
                {[printLayout.phone, printLayout.email].filter(Boolean).join('  ·  ')}
              </p>
            </div>
          </div>
        )}
        <div style={{ textAlign: 'right' }}>
          <div className="print-doc-label">Tracking ID</div>
          <div className="code" style={{ fontSize: '14pt', fontWeight: 700, letterSpacing: '0.1em' }}>
            {report.trackingId}
          </div>
          <div style={{ fontSize: '9pt', marginTop: 4 }}>{report.reportNumber}</div>
          <div style={{ fontSize: '8pt', color: '#555' }}>
            {report.generatedAt
              ? new Date(report.generatedAt).toLocaleString()
              : report.createdAt
                ? new Date(report.createdAt).toLocaleString()
                : ''}
          </div>
        </div>
      </header>

      <h2 className="print-doc-title">Laboratory Investigation Report</h2>

      <div className="print-doc-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div>
          <div className="print-doc-label">Patient</div>
          <div style={{ fontWeight: 600 }}>{patient?.fullName}</div>
          <div>{patient?.phone}</div>
          {patient?.gender && <div>{patient.gender}</div>}
          {patient?.dateOfBirth && (
            <div>DOB: {new Date(patient.dateOfBirth).toLocaleDateString()}</div>
          )}
        </div>
        <div>
          <div className="print-doc-label">Referred by</div>
          <div>{inv?.booking?.doctor?.fullName ?? '—'}</div>
          <div className="print-doc-label" style={{ marginTop: 8 }}>
            Invoice
          </div>
          <div>{inv?.invoiceNumber}</div>
        </div>
        <div>
          <div className="print-doc-label">Payment</div>
          <div>
            <span className="print-doc-badge">{(inv?.status ?? '—').replace(/_/g, ' ')}</span>
          </div>
          <div>Paid: {money(inv?.amountPaid)}</div>
          <div style={{ fontWeight: due > 0 ? 700 : 400, color: due > 0 ? '#b45309' : '#15803d' }}>
            Due: {money(inv?.amountDue)}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * In Letterhead mode the boilerplate disclaimer text is skipped (the
 * physical letterhead already has its own footer) — only the outstanding
 * balance note, which is dynamic per-report content, still prints.
 */
function ReportPageFooter({
  printLayout,
  due,
  letterhead,
}: {
  printLayout: PrintLayout;
  due: number;
  letterhead: boolean;
}) {
  return (
    <footer className="print-doc-footer">
      {!letterhead &&
        (printLayout.footerText || 'Computer-generated report. Quote tracking ID for any enquiry.')}
      {due > 0 && (
        <div style={{ marginTop: 6, fontWeight: 600 }}>Outstanding balance: {money(due)}</div>
      )}
    </footer>
  );
}

export function ReportDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const { branding, printLayout } = useSettings();
  const letterhead = useIsLetterhead();
  const pagination = useReportPagination();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  async function handleOpenPdf() {
    if (!id) return;
    setPdfLoading(true);
    try {
      await openPdf(`/printing/reports/${id}`);
    } catch {
      setError('Could not generate PDF. Please try again.');
    } finally {
      setPdfLoading(false);
    }
  }

  function load() {
    if (!id) return;
    reportsApi
      .getReport(id)
      .then((r) => {
        setReport(r);
        const due = Number(r.invoice?.amountDue ?? 0);
        setPayAmount(String(due > 0 ? due : ''));
      })
      .catch(() => setError('Report not found'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handlePayment(e: FormEvent) {
    e.preventDefault();
    if (!report?.invoice?.id) return;
    setPaying(true);
    setPayError('');
    try {
      await billingApi.recordPayment(report.invoice.id, {
        amount: Number(payAmount),
        method: payMethod,
      });
      load();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Payment failed';
      setPayError(message);
    } finally {
      setPaying(false);
    }
  }

  if (loading) return <Loading />;
  if (!report) {
    return (
      <div className="print-doc-root">
        <p>{error || 'Report not found'}</p>
        <Link to="/reports">Back</Link>
      </div>
    );
  }

  const inv = report.invoice;
  const patient = inv?.booking?.patient;
  const due = Number(inv?.amountDue ?? 0);
  const labName = printLayout.labName || branding.labName;
  const results =
    inv?.samples?.flatMap((s) => s.results ?? []).filter((r) => r.status === 'RELEASED') ?? [];

  return (
    <PrintFrame>
    <div className="print-doc-root">
      <div className="print-doc-toolbar no-print">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/reports" className="btn-secondary text-sm">
            ← Reports
          </Link>
          {inv?.id && (
            <Link to={`/invoices/${inv.id}`} className="btn-secondary text-sm">
              Invoice / collect payment
            </Link>
          )}
        </div>
        <button type="button" className="btn-primary text-sm" onClick={handleOpenPdf} disabled={pdfLoading}>
          {pdfLoading ? 'Generating PDF…' : 'Open / Print PDF'}
        </button>
      </div>

      {error && (
        <div
          className="no-print"
          style={{ maxWidth: '210mm', margin: '0 auto 12px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 14, color: '#b91c1c' }}
        >
          {error}
        </div>
      )}

      {due > 0 && (
        <div
          className="no-print"
          style={{
            maxWidth: '210mm',
            margin: '0 auto 12px',
            padding: '14px 16px',
            background: '#fffbeb',
            border: '1px solid #f59e0b',
            borderRadius: 8,
            fontSize: 14,
          }}
        >
          <strong>Balance due {money(due)}.</strong> Collect the remaining payment below
          before handing over the printed report if required by lab policy.

          <form
            onSubmit={handlePayment}
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}
          >
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 2 }}>Amount</label>
              <input
                className="input"
                type="number"
                min={0}
                max={due}
                step="1"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
                style={{ width: 140 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 2 }}>Method</label>
              <select
                className="input"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
              >
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="EASYPAISA">EasyPaisa</option>
                <option value="JAZZCASH">JazzCash</option>
              </select>
            </div>
            <button type="submit" className="btn-primary text-sm" disabled={paying}>
              {paying ? 'Saving…' : 'Record payment'}
            </button>
          </form>
          {payError && (
            <p style={{ color: '#b91c1c', fontSize: 13, marginTop: 6 }}>{payError}</p>
          )}
        </div>
      )}

      {results.length === 0 && (
        <article className="print-doc print-doc-page">
          <ReportPageHeader
            report={report}
            inv={inv}
            patient={patient}
            due={due}
            labName={labName}
            branding={branding}
            printLayout={printLayout}
            letterhead={letterhead}
          />
          <p style={{ fontSize: '10pt', color: '#555' }}>No released results yet.</p>
          <ReportPageFooter printLayout={printLayout} due={due} letterhead={letterhead} />
        </article>
      )}

      {results.length > 0 && pagination === 'ONE_TEST_PER_PAGE' && (
        // One full page per test — header/patient/payment strip repeats on
        // every page, only the parameter table below it changes.
        results.map((r) => (
          <article key={r.id} className="print-doc print-doc-page">
            <ReportPageHeader
              report={report}
              inv={inv}
              patient={patient}
              due={due}
              labName={labName}
              branding={branding}
              printLayout={printLayout}
              letterhead={letterhead}
            />
            <div className="print-doc-test-block">
              <div className="print-doc-section">
                {r.test?.code} — {r.test?.name}
                {r.isCritical && (
                  <span className="print-doc-critical" style={{ marginLeft: 8, fontSize: '9pt' }}>
                    CRITICAL
                  </span>
                )}
              </div>
              <table className="print-doc-table">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Result</th>
                    <th>Unit</th>
                    <th>Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {(r.values ?? [])
                    .slice()
                    .sort((a, b) => (a.parameter?.sortOrder ?? 0) - (b.parameter?.sortOrder ?? 0))
                    .map((v) => (
                      <tr key={v.id} className={v.isCritical ? 'print-doc-critical' : undefined}>
                        <td>{v.parameter?.name ?? v.parameter?.code ?? '—'}</td>
                        <td>{v.valueNumeric != null ? String(v.valueNumeric) : v.valueText ?? '—'}</td>
                        <td>{v.unit ?? v.parameter?.unit ?? ''}</td>
                        <td style={{ fontSize: '8pt' }}>{v.flag ? v.flag.replace(/_/g, ' ') : ''}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <ReportPageFooter printLayout={printLayout} due={due} letterhead={letterhead} />
          </article>
        ))
      )}

      {results.length > 0 && pagination === 'CONTINUOUS' && (
        // Header once, then every test flows continuously — a new physical
        // page only starts once the current one is full.
        <article className="print-doc">
          <ReportPageHeader
            report={report}
            inv={inv}
            patient={patient}
            due={due}
            labName={labName}
            branding={branding}
            printLayout={printLayout}
            letterhead={letterhead}
          />
          {results.map((r) => (
            <div key={r.id} className="print-doc-test-block">
              <div className="print-doc-section">
                {r.test?.code} — {r.test?.name}
                {r.isCritical && (
                  <span className="print-doc-critical" style={{ marginLeft: 8, fontSize: '9pt' }}>
                    CRITICAL
                  </span>
                )}
              </div>
              <table className="print-doc-table">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Result</th>
                    <th>Unit</th>
                    <th>Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {(r.values ?? [])
                    .slice()
                    .sort((a, b) => (a.parameter?.sortOrder ?? 0) - (b.parameter?.sortOrder ?? 0))
                    .map((v) => (
                      <tr key={v.id} className={v.isCritical ? 'print-doc-critical' : undefined}>
                        <td>{v.parameter?.name ?? v.parameter?.code ?? '—'}</td>
                        <td>{v.valueNumeric != null ? String(v.valueNumeric) : v.valueText ?? '—'}</td>
                        <td>{v.unit ?? v.parameter?.unit ?? ''}</td>
                        <td style={{ fontSize: '8pt' }}>{v.flag ? v.flag.replace(/_/g, ' ') : ''}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
          <ReportPageFooter printLayout={printLayout} due={due} letterhead={letterhead} />
        </article>
      )}
    </div>
    </PrintFrame>
  );
}

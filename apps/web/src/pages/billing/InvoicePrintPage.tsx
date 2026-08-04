import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as billingApi from '../../api/billing';
import type { Invoice } from '../../types';
import { useSettings } from '../../contexts/SettingsContext';
import { Loading } from '../../components/Loading';
import '../../styles/print-document.css';

function money(n: number | string | undefined) {
  return `Rs ${Number(n ?? 0).toLocaleString('en-PK')}`;
}

export function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const { branding, printLayout } = useSettings();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    billingApi
      .getInvoice(id)
      .then(setInvoice)
      .catch(() => setError('Invoice not found'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Loading />;
  if (!invoice) {
    return (
      <div className="print-doc-root">
        <p>{error || 'Invoice not found'}</p>
        <Link to="/invoices">Back</Link>
      </div>
    );
  }

  const patient = invoice.booking?.patient;
  const due = Number(invoice.amountDue);
  const labName = printLayout.labName || branding.labName;

  return (
    <div className="print-doc-root">
      <div className="print-doc-toolbar no-print">
        <Link to={`/invoices/${invoice.id}`} className="btn-secondary text-sm">
          ← Back to invoice
        </Link>
        <button type="button" className="btn-primary text-sm" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>

      <article className="print-doc">
        <header className="print-doc-header">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {branding.logoDataUrl && (
              <img src={branding.logoDataUrl} alt="" className="print-doc-logo" />
            )}
            <div>
              <h1 className="print-doc-lab-name">{labName}</h1>
              {printLayout.labNumber && (
                <p className="print-doc-meta">Lab / Reg. No: {printLayout.labNumber}</p>
              )}
              {printLayout.address && (
                <p className="print-doc-meta">{printLayout.address}</p>
              )}
              <p className="print-doc-meta">
                {[printLayout.phone, printLayout.email].filter(Boolean).join('  ·  ')}
              </p>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '10pt' }}>
            <div style={{ fontWeight: 700 }}>{invoice.invoiceNumber}</div>
            <div>
              {invoice.createdAt
                ? new Date(invoice.createdAt).toLocaleString()
                : ''}
            </div>
            <div style={{ marginTop: 4 }}>
              <span className="print-doc-badge">{invoice.status.replace(/_/g, ' ')}</span>
            </div>
          </div>
        </header>

        <h2 className="print-doc-title">Invoice / Payment Receipt</h2>

        <div className="print-doc-grid">
          <div>
            <div className="print-doc-label">Patient</div>
            <div style={{ fontWeight: 600 }}>{patient?.fullName ?? '—'}</div>
            <div>{patient?.phone}</div>
            {patient?.cnic && <div>CNIC: {patient.cnic}</div>}
          </div>
          <div>
            <div className="print-doc-label">Referring doctor</div>
            <div>{invoice.booking?.doctor?.fullName ?? 'Self / Walk-in'}</div>
            {invoice.booking?.bookingCode && (
              <div>Booking: {invoice.booking.bookingCode}</div>
            )}
          </div>
        </div>

        {invoice.report?.trackingId && (
          <div className="print-doc-tracking">
            <div className="print-doc-label">Report tracking ID</div>
            <div className="code">{invoice.report.trackingId}</div>
          </div>
        )}

        <table className="print-doc-table">
          <thead>
            <tr>
              <th>Test / package</th>
              <th className="num">Qty</th>
              <th className="num">Unit price</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines?.map((line) => (
              <tr key={line.id}>
                <td>{line.description}</td>
                <td className="num">{line.quantity}</td>
                <td className="num">{money(line.unitPrice)}</td>
                <td className="num">{money(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="print-doc-totals">
          <div className="row">
            <span>Subtotal</span>
            <span>{money(invoice.subtotal)}</span>
          </div>
          <div className="row">
            <span>Discount</span>
            <span>{money(invoice.discountTotal)}</span>
          </div>
          <div className="row grand">
            <span>Grand total</span>
            <span>{money(invoice.grandTotal)}</span>
          </div>
          <div className="row">
            <span>Amount paid</span>
            <span>{money(invoice.amountPaid)}</span>
          </div>
          <div className="row grand" style={{ color: due > 0 ? '#b45309' : '#15803d' }}>
            <span>Balance due</span>
            <span>{money(invoice.amountDue)}</span>
          </div>
        </div>

        {invoice.payments && invoice.payments.length > 0 && (
          <>
            <div className="print-doc-section">Payment history</div>
            <table className="print-doc-table">
              <thead>
                <tr>
                  <th>Date / time</th>
                  <th>Method</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.payments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.receivedAt
                        ? new Date(p.receivedAt).toLocaleString()
                        : '—'}
                    </td>
                    <td>{p.method}</td>
                    <td className="num">{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {due > 0 && (
          <div className="print-doc-note">
            <strong>Balance outstanding {money(due)}.</strong> Please settle remaining
            amount at the laboratory when collecting the report.
          </div>
        )}

        <footer className="print-doc-footer">
          {printLayout.footerText ||
            'Computer-generated receipt. Present this for report collection.'}
        </footer>
      </article>
    </div>
  );
}

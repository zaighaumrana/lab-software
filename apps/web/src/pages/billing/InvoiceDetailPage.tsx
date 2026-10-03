import { useFinancialRefresh } from '../../lib/financialRefresh';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import * as billingApi from '../../api/billing';
import type { Invoice } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import { Loading } from '../../components/Loading';
import { PrintHeader, PrintFooter } from '../../components/PrintHeader';

function money(n: number | string | undefined) {
  return `Rs ${Number(n ?? 0).toLocaleString()}`;
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [paying, setPaying] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await billingApi.getInvoice(id);
      setInvoice(data);
      setPayAmount(String(Number(data.amountDue) > 0 ? data.amountDue : ''));
    } catch {
      setError('Invoice not found');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  useFinancialRefresh(()=>{void load();},id);

  async function handlePayment(e: FormEvent) {
    e.preventDefault();
    if (!invoice || !payAmount) return;
    setPaying(true);
    setError('');
    try {
      const result = await billingApi.recordPayment(invoice.id, {
        amount: Number(payAmount),
        method: payMethod,
      });
      setInvoice(result.invoice);
      setPayAmount(
        String(Number(result.invoice.amountDue) > 0 ? result.invoice.amountDue : ''),
      );
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Payment failed';
      setError(msg);
    } finally {
      setPaying(false);
    }
  }

  if (loading) return <Loading />;
  if (!invoice) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">{error || 'Invoice not found'}</p>
        <Link to="/invoices" className="btn-secondary">
          Back to invoices
        </Link>
      </div>
    );
  }

  const patient = invoice.booking?.patient;
  const due = Number(invoice.amountDue);

  return (
    <div className="space-y-4">
      {/* Screen-only toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <Link to="/invoices" className="text-sm text-brand-600 hover:underline">
            ← Invoices
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Invoice / Receipt</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {invoice.report?.id && (
            <Link to={`/reports/${invoice.report.id}`} className="btn-secondary">
              Open report
            </Link>
          )}
          <Link to={`/invoices/${invoice.id}/print`} className="btn-primary">
            Print receipt
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden">
          {error}
        </div>
      )}

      {/* Printable body */}
      <div className="card print:border-0 print:shadow-none print:p-0">
        <PrintHeader subtitle="Invoice / Payment Receipt" />
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4 text-sm">
          <div />
          <div className="text-right">
            <div className="font-semibold">{invoice.invoiceNumber}</div>
            <div className="text-slate-500">
              {invoice.createdAt
                ? new Date(invoice.createdAt).toLocaleString()
                : ''}
            </div>
            <div className="mt-1">
              <StatusBadge status={invoice.status} />
            </div>
          </div>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 text-sm">
          <div>
            <div className="text-xs font-semibold uppercase text-slate-500">Patient</div>
            <div className="font-medium">{patient?.fullName ?? '—'}</div>
            <div>{patient?.phone}</div>
            {patient?.cnic && <div className="text-slate-500">CNIC: {patient.cnic}</div>}
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-slate-500">Referral</div>
            <div>{invoice.booking?.doctor?.fullName ?? 'Self / Walk-in'}</div>
            {invoice.booking?.bookingCode && (
              <div className="text-slate-500">Booking: {invoice.booking.bookingCode}</div>
            )}
            {invoice.report?.trackingId && (
              <div className="mt-2 rounded-lg bg-slate-100 px-3 py-2">
                <div className="text-xs text-slate-500">Report tracking ID</div>
                <div className="text-lg font-bold tracking-wider">
                  {invoice.report.trackingId}
                </div>
              </div>
            )}
            {!invoice.report?.trackingId && (
              <div className="mt-2 text-xs text-slate-500">
                Tracking ID appears after results are released.
              </div>
            )}
          </div>
        </div>

        <table className="mb-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <th className="py-2">Test / Package</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Price</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines?.map((line) => (
              <tr key={line.id} className="border-b border-slate-100">
                <td className="py-2">{line.description}</td>
                <td className="py-2 text-right">{line.quantity}</td>
                <td className="py-2 text-right">{money(line.unitPrice)}</td>
                <td className="py-2 text-right">{money(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{money(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Discount</span>
            <span>{money(invoice.discountTotal)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
            <span>Grand total</span>
            <span>{money(invoice.grandTotal)}</span>
          </div>
          <div className="flex justify-between text-green-700">
            <span>Amount paid</span>
            <span>{money(invoice.amountPaid)}</span>
          </div>
          <div
            className={`flex justify-between text-base font-bold ${
              due > 0 ? 'text-amber-700' : 'text-green-700'
            }`}
          >
            <span>Balance due</span>
            <span>{money(invoice.amountDue)}</span>
          </div>
        </div>

        {invoice.payments && invoice.payments.length > 0 && (
          <div className="mt-6 border-t border-slate-200 pt-4">
            <div className="mb-2 text-xs font-semibold uppercase text-slate-500">
              Payment history
            </div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-slate-500">
                  <th className="py-1">When</th>
                  <th className="py-1">Method</th>
                  <th className="py-1 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.payments.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="py-1">
                      {p.receivedAt
                        ? new Date(p.receivedAt).toLocaleString()
                        : '—'}
                    </td>
                    <td className="py-1">{p.method}</td>
                    <td className="py-1 text-right">{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {due > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 print:block">
            <strong>Balance outstanding.</strong> Collect remaining amount before
            releasing the printed report (or mark as collection-only online).
          </div>
        )}

        <PrintFooter />
      </div>

      {/* Collect remaining payment — screen only */}
      {due > 0 && (
        <form
          onSubmit={handlePayment}
          className="card space-y-3 print:hidden"
        >
          <h2 className="font-semibold text-slate-800">Collect remaining payment</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Amount</label>
              <input
                className="input"
                type="number"
                min={0}
                step="1"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Method</label>
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
          </div>
          <button type="submit" className="btn-primary" disabled={paying}>
            {paying ? 'Saving…' : 'Record payment'}
          </button>
        </form>
      )}
    </div>
  );
}

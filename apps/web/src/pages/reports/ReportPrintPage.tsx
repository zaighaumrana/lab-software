import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as reportsApi from '../../api/reports';
import * as billingApi from '../../api/billing';
import type { Report } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import { Loading } from '../../components/Loading';
import { PrintHeader, PrintFooter } from '../../components/PrintHeader';

function money(n: number | string | undefined) {
  return `Rs ${Number(n ?? 0).toLocaleString()}`;
}

export function ReportPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');

  function load() {
    if (!id) return;
    setLoading(true);
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
      <div className="space-y-4">
        <p className="text-red-600">{error || 'Report not found'}</p>
        <Link to="/reports" className="btn-secondary">
          Back to reports
        </Link>
      </div>
    );
  }

  const inv = report.invoice;
  const patient = inv?.booking?.patient;
  const due = Number(inv?.amountDue ?? 0);
  const results =
    inv?.samples?.flatMap((s) => s.results ?? []).filter((r) => r.status === 'RELEASED') ??
    [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <Link to="/reports" className="text-sm text-brand-600 hover:underline">
            ← Reports
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Lab Report</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {inv?.id && (
            <Link to={`/invoices/${inv.id}`} className="btn-secondary">
              Invoice / collect payment
            </Link>
          )}
          <Link to={`/reports/${report.id}/print`} className="btn-primary">
            Open print layout
          </Link>
        </div>
      </div>

      {due > 0 && (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
          <div>
            <strong>Balance due: {money(due)}.</strong> Collect the remaining payment below,
            or on the invoice. Tracking ID can still be shared.
          </div>
          <form onSubmit={handlePayment} className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium">Amount</label>
              <input
                className="input"
                type="number"
                min={0}
                max={due}
                step="1"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Method</label>
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
          {payError && <p className="text-sm text-red-700">{payError}</p>}
        </div>
      )}

      <div className="card print:border-0 print:shadow-none print:p-0">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1">
            <PrintHeader subtitle="Laboratory Investigation Report" />
          </div>
          <div className="text-right text-sm">
            <div className="text-xs text-slate-500">Tracking ID</div>
            <div className="text-xl font-bold tracking-widest">{report.trackingId}</div>
            <div className="mt-1 text-slate-600">{report.reportNumber}</div>
            <div className="text-xs text-slate-500">
              {report.generatedAt
                ? new Date(report.generatedAt).toLocaleString()
                : report.createdAt
                  ? new Date(report.createdAt).toLocaleString()
                  : ''}
            </div>
          </div>
        </div>

        <div className="mb-6 grid gap-3 border-b border-slate-200 pb-4 text-sm sm:grid-cols-3">
          <div>
            <div className="text-xs uppercase text-slate-500">Patient</div>
            <div className="font-semibold">{patient?.fullName}</div>
            <div>{patient?.phone}</div>
            {patient?.gender && <div>{patient.gender}</div>}
            {patient?.dateOfBirth && (
              <div>DOB: {new Date(patient.dateOfBirth).toLocaleDateString()}</div>
            )}
          </div>
          <div>
            <div className="text-xs uppercase text-slate-500">Referred by</div>
            <div>{inv?.booking?.doctor?.fullName ?? '—'}</div>
            <div className="mt-2 text-xs uppercase text-slate-500">Invoice</div>
            <div>{inv?.invoiceNumber}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-slate-500">Payment</div>
            <div className="flex flex-wrap items-center gap-2">
              {inv && <StatusBadge status={inv.status} />}
            </div>
            <div className="mt-1">Paid: {money(inv?.amountPaid)}</div>
            <div className={due > 0 ? 'font-bold text-amber-700' : 'text-green-700'}>
              Due: {money(inv?.amountDue)}
            </div>
          </div>
        </div>

        {results.length === 0 && (
          <p className="text-sm text-slate-500">No released results on this report yet.</p>
        )}

        {results.map((r) => (
          <div key={r.id} className="mb-6">
            <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-1">
              <span className="font-semibold">
                {r.test?.code} — {r.test?.name}
              </span>
              {r.isCritical && (
                <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                  CRITICAL
                </span>
              )}
            </div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-slate-500">
                  <th className="py-1">Parameter</th>
                  <th className="py-1">Result</th>
                  <th className="py-1">Unit</th>
                  <th className="py-1">Flag</th>
                </tr>
              </thead>
              <tbody>
                {(r.values ?? [])
                  .slice()
                  .sort(
                    (a, b) =>
                      (a.parameter?.sortOrder ?? 0) - (b.parameter?.sortOrder ?? 0),
                  )
                  .map((v) => (
                    <tr
                      key={v.id}
                      className={`border-t border-slate-100 ${
                        v.isCritical ? 'font-semibold text-red-700' : ''
                      }`}
                    >
                      <td className="py-1.5">
                        {v.parameter?.name ?? v.parameter?.code ?? '—'}
                      </td>
                      <td className="py-1.5">
                        {v.valueNumeric != null
                          ? String(v.valueNumeric)
                          : v.valueText ?? '—'}
                      </td>
                      <td className="py-1.5">{v.unit ?? v.parameter?.unit ?? ''}</td>
                      <td className="py-1.5 text-xs">
                        {v.flag ? v.flag.replace(/_/g, ' ') : ''}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}

        <div className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
          <PrintFooter />
          <p className="mt-2">
            Critical values are highlighted. Contact the laboratory with your tracking ID.
          </p>
          {due > 0 && (
            <p className="mt-2 font-semibold text-amber-800">
              Note: Outstanding balance {money(due)} — collect before final handover if
              required by lab policy.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

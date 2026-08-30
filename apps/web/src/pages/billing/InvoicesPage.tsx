import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as billingApi from '../../api/billing';
import type { Invoice } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import { Loading } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';
import { DateRangeFilter } from '../../dashboard/DateRangeFilter';
import type { DateRangeValue } from '../../dashboard/DateRangeFilter';
import { Search, Download } from 'lucide-react';

function money(n: number | string | undefined) {
  return `Rs ${Number(n ?? 0).toLocaleString('en-PK')}`;
}

const STATUS_OPTIONS = ['', 'DRAFT', 'ISSUED', 'CLOSED', 'REFUNDED', 'VOIDED'];

export function InvoicesPage() {
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const [range, setRange] = useState<DateRangeValue>(() => {
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    if (from || to) return { preset: 'custom', from: from ?? undefined, to: to ?? undefined };
    return { preset: 'custom' };
  });
  const [items, setItems] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(
    async (query?: string) => {
      setLoading(true);
      setError('');
      try {
        const data = await billingApi.listInvoices({
          q: query ?? q ?? undefined,
          from: range.from,
          to: range.to,
          status: status || undefined,
        });
        setItems(data);
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Failed to load invoices';
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [q, range.from, range.to, status],
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, status]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    load(q.trim() || undefined);
  }

  function exportCsv() {
    const header = ['Invoice', 'Patient', 'Phone', 'Status', 'Total', 'Paid', 'Due', 'Tracking', 'Date'];
    const rows = items.map((inv) => [
      inv.invoiceNumber,
      inv.booking?.patient?.fullName ?? '',
      inv.booking?.patient?.phone ?? '',
      inv.status,
      Number(inv.grandTotal),
      Number(inv.amountPaid),
      Number(inv.amountDue),
      inv.report?.trackingId ?? '',
      inv.createdAt ? new Date(inv.createdAt).toISOString().slice(0, 10) : '',
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totals = items.reduce(
    (acc, inv) => {
      acc.total += Number(inv.grandTotal);
      acc.collected += Number(inv.amountPaid);
      acc.outstanding += Number(inv.amountDue);
      acc.discount += Number(inv.discountTotal);
      return acc;
    },
    { total: 0, collected: 0, outstanding: 0, discount: 0 },
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Transactions</h1>
        <p className="text-sm text-slate-500">Invoices, payments, and outstanding balances</p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Summary strip — reflects the currently applied filters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card py-3">
          <div className="text-xs uppercase text-slate-500">Total</div>
          <div className="mt-0.5 text-lg font-bold text-slate-900">{money(totals.total)}</div>
        </div>
        <div className="card py-3">
          <div className="text-xs uppercase text-slate-500">Collected</div>
          <div className="mt-0.5 text-lg font-bold text-green-700">{money(totals.collected)}</div>
        </div>
        <div className="card py-3">
          <div className="text-xs uppercase text-slate-500">Outstanding</div>
          <div className="mt-0.5 text-lg font-bold text-amber-700">{money(totals.outstanding)}</div>
        </div>
        <div className="card py-3">
          <div className="text-xs uppercase text-slate-500">Discounts</div>
          <div className="mt-0.5 text-lg font-bold text-slate-900">{money(totals.discount)}</div>
        </div>
      </div>

      {/* Compact horizontal filter toolbar */}
      <div className="card flex flex-wrap items-center gap-3 py-3">
        <DateRangeFilter value={range} onChange={setRange} />
        <select
          className="input w-40"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s || 'All statuses'}
            </option>
          ))}
        </select>
        <form onSubmit={handleSearch} className="flex flex-1 min-w-[220px] gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-10"
              placeholder="Invoice #, name, phone, tracking ID…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary text-sm">
            Search
          </button>
        </form>
        <button type="button" className="btn-secondary text-sm" onClick={exportCsv} disabled={items.length === 0}>
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>

      {loading && <Loading />}

      {!loading && items.length === 0 && (
        <EmptyState title="No invoices found" description="Try widening the date range or clearing filters." />
      )}

      {!loading && items.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Invoice</th>
                <th className="px-4 py-2.5">Patient</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-right">Paid</th>
                <th className="px-4 py-2.5 text-right">Due</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Tracking</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{inv.invoiceNumber}</td>
                  <td className="px-4 py-2">
                    <div>{inv.booking?.patient?.fullName ?? '—'}</div>
                    <div className="text-xs text-slate-500">{inv.booking?.patient?.phone}</div>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-2 text-right">{money(inv.grandTotal)}</td>
                  <td className="px-4 py-2 text-right">{money(inv.amountPaid)}</td>
                  <td className="px-4 py-2 text-right font-medium">
                    <span className={Number(inv.amountDue) > 0 ? 'text-amber-700' : 'text-green-700'}>
                      {money(inv.amountDue)}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{inv.report?.trackingId ?? '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <Link to={`/invoices/${inv.id}`} className="btn-primary text-xs">
                      Open / Print
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
            Showing {items.length} most recent match{items.length === 1 ? '' : 'es'} (up to 200)
          </div>
        </div>
      )}
    </div>
  );
}

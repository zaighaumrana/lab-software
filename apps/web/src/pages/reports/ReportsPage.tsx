import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as reportsApi from '../../api/reports';
import type { Report } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import { Loading } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';
import { Search } from 'lucide-react';

export function ReportsPage() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  async function load(query?: string) {
    setLoading(true);
    try {
      const data = await reportsApi.listReports(query);
      setItems(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    load(q.trim() || undefined);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">
          Search by tracking ID, report number, patient name, or phone
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-10"
            placeholder="Tracking ID, name, phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary">
          Search
        </button>
      </form>

      {loading && <Loading />}

      {!loading && items.length === 0 && (
        <EmptyState
          title="No reports yet"
          description="Reports appear after lab results are released."
        />
      )}

      {!loading && items.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Tracking ID</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Report #</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((r) => {
                const inv = r.invoice;
                const due = Number(inv?.amountDue ?? 0);
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-semibold">{r.trackingId}</td>
                    <td className="px-4 py-3">
                      <div>{inv?.booking?.patient?.fullName ?? '—'}</div>
                      <div className="text-xs text-slate-500">
                        {inv?.booking?.patient?.phone}
                      </div>
                    </td>
                    <td className="px-4 py-3">{r.reportNumber}</td>
                    <td className="px-4 py-3">
                      {inv ? <StatusBadge status={inv.status} /> : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={due > 0 ? 'font-medium text-amber-700' : 'text-green-700'}>
                        Rs {due.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {inv?.id && (
                          <Link to={`/invoices/${inv.id}`} className="btn-secondary text-xs">
                            Invoice
                          </Link>
                        )}
                        <Link to={`/reports/${r.id}/print`} className="btn-primary text-xs">
                          Print
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

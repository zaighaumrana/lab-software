import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as reportsApi from '../../api/reports';
import type { Report } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import { Loading } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';
import { useAuth } from '../../contexts/AuthContext';
import { isAdminRole } from '../../lib/permissions';
import { Search } from 'lucide-react';

/**
 * Default view differs by role: ADMIN sees everything (unchanged), a
 * non-admin role defaults to unprinted reports only — "what still needs
 * my attention today" — and toggling "Show all" or typing a search both
 * override that default, since a reprint request means finding a report
 * regardless of whether it was already printed once.
 */
export function ReportsPage() {
  const { user } = useAuth();
  const admin = isAdminRole(user?.role);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [showAll, setShowAll] = useState(admin);
  const [items, setItems] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(query?: string, statusFilter?: string, showAllFilter?: boolean) {
    setLoading(true);
    setError('');
    try {
      const data = await reportsApi.listReports(query, statusFilter, !showAllFilter);
      setItems(data);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to load reports';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(undefined, status, showAll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, showAll]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    // A search always looks across everything — printed or not — since
    // the whole point of searching is finding a specific report again,
    // reprint case included. The backend enforces this too (a q param
    // overrides unprinted server-side regardless of what's sent).
    load(q.trim() || undefined, status, true);
  }

  const STATUS_OPTIONS = ['', 'PENDING', 'PARTIAL_READY', 'COMPLETE', 'AMENDED', 'ARCHIVED'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">
          {admin || showAll
            ? 'Search by tracking ID, report number, patient name, or phone'
            : "Today's unprinted reports — search below to find any report, including already-printed ones"}
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-10"
            placeholder="Tracking ID, name, phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select className="input w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s ? s.replace(/_/g, ' ') : 'All statuses'}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-primary">
          Search
        </button>
        {!admin && (
          <label className="ml-1 flex items-center gap-1.5 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => {
                setQ('');
                setShowAll(e.target.checked);
              }}
            />
            Show all (including already printed)
          </label>
        )}
      </form>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading && <Loading />}

      {!loading && items.length === 0 && (
        <EmptyState
          title={admin || showAll ? 'No reports yet' : 'No unprinted reports right now'}
          description={
            admin || showAll
              ? 'Reports appear after lab results are released.'
              : "Everything's printed — check \"Show all\" to browse the full history."
          }
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
                <th className="px-4 py-3">Printed</th>
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
                      {/* A COMPLETE report is "ready for collection" — but
                          whether the patient can actually walk out with it
                          depends on payment too, so surface that instead of
                          the raw lifecycle status once it's finalized. */}
                      {['COMPLETE', 'AMENDED', 'ARCHIVED'].includes(r.status) ? (
                        due > 0 ? (
                          <span className="rounded px-2 py-0.5 text-[11px] font-medium bg-amber-100 text-amber-700">
                            Ready — Payment Pending
                          </span>
                        ) : (
                          <span className="rounded px-2 py-0.5 text-[11px] font-medium bg-green-100 text-green-700">
                            Ready for Collection
                          </span>
                        )
                      ) : (
                        <StatusBadge status={r.status} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.printedAt ? (
                        <span className="text-xs text-slate-500">
                          {(r.printCount ?? 1) > 1 ? `Printed ×${r.printCount}` : 'Printed'}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Not printed</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {inv?.id && (
                          <Link to={`/invoices/${inv.id}`} className="btn-secondary text-xs">
                            Invoice
                          </Link>
                        )}
                        <Link to={`/reports/${r.id}/print`} className="btn-primary text-xs">
                          {r.printedAt ? 'Reprint' : 'Print'}
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
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

import { FormEvent, useEffect, useState } from 'react';
import * as cashShiftsApi from '../../api/cash-shifts';
import type { CashShift, CurrentCashShift } from '../../api/cash-shifts';
import { Loading } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';

function fmtRs(v: string | number | null | undefined) {
  const n = Number(v ?? 0);
  return `Rs ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function VarianceTag({ variance }: { variance: string | number | null }) {
  const n = Number(variance ?? 0);
  if (n === 0) {
    return <span className="rounded px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">Exact</span>;
  }
  if (n > 0) {
    return (
      <span className="rounded px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700">
        Over by {fmtRs(n)}
      </span>
    );
  }
  return (
    <span className="rounded px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700">
      Short by {fmtRs(Math.abs(n))}
    </span>
  );
}

/**
 * A cashier's working session for reconciling physical cash against
 * what the system recorded — the shift-close/cash-reconciliation
 * feature real POS systems have. Deliberately CASH-only (see
 * cash-shifts.service.ts's sumCashReceived) — bank transfers and mobile
 * wallets never touch a physical drawer, so they're excluded from
 * expectedCash entirely. This is distinct from the Operator Dashboard's
 * "Payments Collected Today" card, which intentionally covers every
 * payment method for a fuller daily-totals picture.
 */
export function CashShiftPage() {
  const [current, setCurrent] = useState<CurrentCashShift | null>(null);
  const [history, setHistory] = useState<CashShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState<CashShift | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [cur, hist] = await Promise.all([
        cashShiftsApi.getCurrentShift(),
        cashShiftsApi.listShifts(),
      ]);
      setCurrent(cur);
      setHistory(hist);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to load cash shift data';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleOpen() {
    setError('');
    setBusy(true);
    try {
      await cashShiftsApi.openShift();
      setLastResult(null);
      await load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to open shift';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleClose(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    setError('');
    const countedNum = Number(counted);
    if (Number.isNaN(countedNum) || countedNum < 0) {
      setError('Enter the counted cash amount.');
      return;
    }
    setBusy(true);
    try {
      const closed = await cashShiftsApi.closeShift(current.id, countedNum, notes || undefined);
      setLastResult(closed);
      setCounted('');
      setNotes('');
      await load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to close shift';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading label="Loading cash shift…" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Cash Shift</h1>
        <p className="text-sm text-slate-500">
          Open a shift when you start taking cash payments, close it and count the drawer when you're done.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {lastResult && (
        <div className="card space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">Shift closed</h2>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-xs text-slate-400">Expected</div>
              <div className="font-semibold">{fmtRs(lastResult.expectedCash)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Counted</div>
              <div className="font-semibold">{fmtRs(lastResult.countedCash)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Result</div>
              <VarianceTag variance={lastResult.variance} />
            </div>
          </div>
        </div>
      )}

      {!current ? (
        <div className="card space-y-3 text-center">
          <p className="text-sm text-slate-500">No shift is currently open.</p>
          <button className="btn-primary" onClick={handleOpen} disabled={busy}>
            {busy ? 'Opening…' : 'Open Shift'}
          </button>
        </div>
      ) : (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">Shift open</h2>
              <p className="text-xs text-slate-400">
                Since {fmtTime(current.openedAt)}
                {current.openedBy ? ` — opened by ${current.openedBy.fullName}` : ''}
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400">Expected cash so far</div>
              <div className="text-lg font-semibold text-slate-800">
                {fmtRs(current.expectedSoFar)}
              </div>
            </div>
          </div>

          <form onSubmit={handleClose} className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-700">Close shift — count the drawer</p>
            <div>
              <label className="label">Counted cash</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="label">Notes (optional)</label>
              <input
                className="input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Rs 500 note torn, replaced"
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? 'Closing…' : 'Close Shift'}
            </button>
          </form>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Recent Shifts</h2>
        {history.length === 0 ? (
          <EmptyState title="No shift history yet" />
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Opened</th>
                  <th className="px-4 py-3">Closed</th>
                  <th className="px-4 py-3">By</th>
                  <th className="px-4 py-3">Expected</th>
                  <th className="px-4 py-3">Counted</th>
                  <th className="px-4 py-3">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3">{fmtTime(s.openedAt)}</td>
                    <td className="px-4 py-3">{s.closedAt ? fmtTime(s.closedAt) : '—'}</td>
                    <td className="px-4 py-3">{s.openedBy?.fullName ?? '—'}</td>
                    <td className="px-4 py-3">{s.status === 'OPEN' ? '—' : fmtRs(s.expectedCash)}</td>
                    <td className="px-4 py-3">{s.status === 'OPEN' ? '—' : fmtRs(s.countedCash)}</td>
                    <td className="px-4 py-3">
                      {s.status === 'OPEN' ? (
                        <span className="text-xs text-slate-400">Open</span>
                      ) : (
                        <VarianceTag variance={s.variance} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

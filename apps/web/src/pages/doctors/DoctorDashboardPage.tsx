import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import * as doctorsApi from '../../api/doctors';
import type { DoctorDashboard, DoctorDashboardParams } from '../../api/doctors';
import { Loading } from '../../components/Loading';

function money(n: number | undefined) {
  return `Rs ${Number(n ?? 0).toLocaleString('en-PK')}`;
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

type Preset = 'monthly' | 'weekly' | 'custom';

function presetRange(preset: Preset): { from: string; to: string } {
  const now = new Date();
  if (preset === 'weekly') {
    const from = new Date(now);
    from.setDate(now.getDate() - 7);
    return { from: toISODate(from), to: toISODate(now) };
  }
  // monthly (default)
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: toISODate(from), to: toISODate(now) };
}

export function DoctorDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const [preset, setPreset] = useState<Preset>('monthly');
  const [from, setFrom] = useState(presetRange('monthly').from);
  const [to, setTo] = useState(presetRange('monthly').to);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<DoctorDashboardParams['sortBy']>('date');
  const [sortDir, setSortDir] = useState<DoctorDashboardParams['sortDir']>('desc');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DoctorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p !== 'custom') {
      const r = presetRange(p);
      setFrom(r.from);
      setTo(r.to);
    }
    setPage(1);
  }

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    doctorsApi
      .getDoctorDashboard(id, { from, to, search, sortBy, sortDir, page, pageSize: 20 })
      .then(setData)
      .catch(() => setError('Could not load doctor dashboard'))
      .finally(() => setLoading(false));
  }, [id, from, to, search, sortBy, sortDir, page]);

  const printHref = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return `/doctors/${id}/statement/print?${params.toString()}`;
  }, [id, from, to]);

  if (loading && !data) return <Loading />;
  if (error) return <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>;
  if (!data) return null;

  const totalPages = Math.max(1, Math.ceil(data.patients.total / data.patients.pageSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/doctors" className="text-xs text-slate-500 hover:underline">
            ← Doctors
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">{data.doctor.fullName}</h1>
          <p className="text-sm text-slate-500">
            {[data.doctor.specialty, data.doctor.clinicName, data.doctor.phone]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <a href={printHref} target="_blank" rel="noreferrer" className="btn-primary">
          Print statement
        </a>
      </div>

      {/* Date filters */}
      <div className="card flex flex-wrap items-end gap-3">
        <div className="flex gap-2">
          {(['monthly', 'weekly', 'custom'] as Preset[]).map((p) => (
            <button
              key={p}
              className={preset === p ? 'btn-primary text-xs' : 'btn-secondary text-xs'}
              onClick={() => applyPreset(p)}
            >
              {p === 'monthly' ? 'This month' : p === 'weekly' ? 'Last 7 days' : 'Custom range'}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <>
            <div>
              <label className="label text-xs">From</label>
              <input
                className="input"
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div>
              <label className="label text-xs">To</label>
              <input
                className="input"
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard label="Patients Referred" value={String(data.summary.totalPatients)} />
        <SummaryCard label="Revenue Generated" value={money(data.summary.totalRevenue)} />
        <SummaryCard label="Doctor Share" value={money(data.summary.totalShare)} />
        <SummaryCard label="Already Paid" value={money(data.summary.totalPaid)} tone="green" />
        <SummaryCard label="Pending Share" value={money(data.summary.pendingShare)} tone="amber" />
      </div>

      {/* Patient list */}
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Referred Patients</h2>
          <input
            className="input w-64"
            placeholder="Search patient, invoice #, test…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2">Invoice #</th>
                <SortableHeader label="Patient" field="patientName" sortBy={sortBy} sortDir={sortDir} onSort={(f) => { setSortBy(f); setSortDir((d) => (sortBy === f && d === 'asc' ? 'desc' : 'asc')); }} />
                <SortableHeader label="Date" field="date" sortBy={sortBy} sortDir={sortDir} onSort={(f) => { setSortBy(f); setSortDir((d) => (sortBy === f && d === 'asc' ? 'desc' : 'asc')); }} />
                <th className="px-2 py-2">Tests</th>
                <SortableHeader label="Invoice Amount" field="invoiceAmount" sortBy={sortBy} sortDir={sortDir} onSort={(f) => { setSortBy(f); setSortDir((d) => (sortBy === f && d === 'asc' ? 'desc' : 'asc')); }} align="right" />
                <SortableHeader label="Share Amount" field="shareAmount" sortBy={sortBy} sortDir={sortDir} onSort={(f) => { setSortBy(f); setSortDir((d) => (sortBy === f && d === 'asc' ? 'desc' : 'asc')); }} align="right" />
                <th className="px-2 py-2">Payment Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.patients.rows.map((r) => (
                <tr key={r.shareId} className="hover:bg-slate-50">
                  <td className="px-2 py-2">
                    <Link to={`/invoices/${r.invoiceId}`} className="text-brand-600 hover:underline">
                      {r.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-2 py-2">{r.patientName}</td>
                  <td className="px-2 py-2">{new Date(r.date).toLocaleDateString()}</td>
                  <td className="px-2 py-2 text-xs text-slate-500">{r.tests.join(', ')}</td>
                  <td className="px-2 py-2 text-right">{money(r.invoiceAmount)}</td>
                  <td className="px-2 py-2 text-right font-medium">{money(r.shareAmount)}</td>
                  <td className="px-2 py-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">
                      {r.paymentStatus.replace(/_/g, ' ')}
                    </span>
                  </td>
                </tr>
              ))}
              {data.patients.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-2 py-6 text-center text-sm text-slate-400">
                    No referred patients in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Page {data.patients.page} of {totalPages} ({data.patients.total} total)
            </span>
            <div className="flex gap-2">
              <button
                className="btn-secondary text-xs"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                className="btn-secondary text-xs"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'green' | 'amber';
}) {
  return (
    <div className="card">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div
        className={`mt-1 text-xl font-bold ${
          tone === 'green' ? 'text-green-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-900'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
  align,
}: {
  label: string;
  field: NonNullable<DoctorDashboardParams['sortBy']>;
  sortBy: DoctorDashboardParams['sortBy'];
  sortDir: DoctorDashboardParams['sortDir'];
  onSort: (field: NonNullable<DoctorDashboardParams['sortBy']>) => void;
  align?: 'right';
}) {
  const active = sortBy === field;
  return (
    <th
      className={`cursor-pointer select-none px-2 py-2 hover:text-slate-800 ${align === 'right' ? 'text-right' : ''}`}
      onClick={() => onSort(field)}
    >
      {label} {active ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  );
}

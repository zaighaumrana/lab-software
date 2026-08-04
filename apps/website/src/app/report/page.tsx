'use client';

import { FormEvent, useState } from 'react';

interface LookupResult {
  trackingId: string;
  status: string;
  reportNumber: string;
  patientName: string;
  access: 'FULL';
  message?: string;
  amountPaid?: number | string;
  amountDue?: number | string;
  invoiceStatus?: string;
  generatedAt?: string;
  results?: {
    testCode?: string;
    testName?: string;
    isCritical: boolean;
    values: {
      parameter?: string;
      code?: string;
      value: number | string | null;
      unit?: string | null;
      flag?: string | null;
      isCritical: boolean;
    }[];
  }[];
}

function money(n: number | string | undefined) {
  return `Rs ${Number(n ?? 0).toLocaleString()}`;
}

export default function ReportPage() {
  const [trackingId, setTrackingId] = useState('');
  const [verification, setVerification] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LookupResult | null>(null);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setData(null);
    try {
      const params = new URLSearchParams({
        trackingId: trackingId.trim(),
        verification: verification.trim(),
      });
      const res = await fetch(`/api/public/reports/lookup?${params}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || json.error || 'Lookup failed');
      }
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  }

  const due = Number(data?.amountDue ?? 0);
  const results = data?.results ?? [];

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="no-print">
        <h1 className="text-3xl font-bold text-slate-900">Report Lookup</h1>
        <p className="mt-2 text-sm text-slate-600">
          Enter your tracking ID and the phone number (or last digits of CNIC) used at
          registration.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="no-print space-y-4 rounded-xl border border-slate-200 p-6"
      >
        <div>
          <label className="mb-1 block text-sm font-medium">Tracking ID *</label>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase"
            required
            value={trackingId}
            onChange={(e) => setTrackingId(e.target.value)}
            placeholder="e.g. AB12CD34EF"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Phone or CNIC verification *</label>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            required
            value={verification}
            onChange={(e) => setVerification(e.target.value)}
            placeholder="03001234567 or last 4 of CNIC"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? 'Looking up…' : 'View Report'}
        </button>
      </form>

      {error && (
        <div className="no-print rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm">
              <p className="font-semibold text-slate-900">{data.patientName}</p>
              <p className="text-slate-500">
                Report {data.reportNumber} · Tracking {data.trackingId}
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Print report
            </button>
          </div>

          {due > 0 && (
            <div className="no-print rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <strong>Balance due: {money(due)}.</strong>{' '}
              {data.message || 'Please settle the remaining amount at the laboratory when collecting your report.'}
            </div>
          )}

          {results.length === 0 && (
            <div className="no-print rounded-xl border border-slate-200 p-5 text-sm text-slate-600">
              Your report isn&apos;t released yet. Please check back shortly, or contact the
              laboratory with your tracking ID.
            </div>
          )}

          {/* Printable report — one page per test, header repeated on each page. */}
          <div className="report-doc-root">
            {results.map((r, i) => (
              <article key={i} className="report-doc-page">
                <header className="report-doc-header">
                  <div>
                    <div className="text-base font-bold text-slate-900">LabCare Diagnostic Laboratory</div>
                    <div className="text-xs text-slate-500">Phone: 0300-1234567</div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="text-sm font-bold tracking-widest">{data.trackingId}</div>
                    <div className="mt-1 text-slate-600">{data.reportNumber}</div>
                    <div className="text-slate-500">
                      {data.generatedAt ? new Date(data.generatedAt).toLocaleString() : ''}
                    </div>
                  </div>
                </header>

                <h2 className="report-doc-title">Laboratory Investigation Report</h2>

                <div className="mb-3 text-sm">
                  <div className="text-xs uppercase text-slate-500">Patient</div>
                  <div className="font-semibold">{data.patientName}</div>
                </div>

                <div className="mb-2 flex items-center gap-2 border-b border-slate-200 pb-1 text-sm font-semibold">
                  {r.testCode} — {r.testName}
                  {r.isCritical && (
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                      CRITICAL
                    </span>
                  )}
                </div>
                <table className="report-doc-table">
                  <thead>
                    <tr>
                      <th>Parameter</th>
                      <th>Result</th>
                      <th>Unit</th>
                      <th>Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.values.map((v, j) => (
                      <tr key={j} className={v.isCritical ? 'font-semibold text-red-700' : undefined}>
                        <td>{v.parameter}</td>
                        <td>{v.value != null ? String(v.value) : '—'}</td>
                        <td>{v.unit}</td>
                        <td>{v.flag?.replace(/_/g, ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <footer className="report-doc-footer">
                  Computer-generated report. Quote tracking ID for any enquiry.
                  {due > 0 && <div className="mt-1 font-semibold">Outstanding balance: {money(due)}</div>}
                </footer>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';

interface TestRow {
  id: string;
  code: string;
  name: string;
  category: string | null;
  basePrice: number | string;
  turnaroundHours: number | null;
  isPanel: boolean;
}

interface PackageRow {
  id: string;
  code: string;
  name: string;
  basePrice: number | string;
  description: string | null;
}

export default function RatesPage() {
  const [tests, setTests] = useState<TestRow[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/public/rates')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load rates');
        return r.json();
      })
      .then((data) => {
        setTests(data.tests ?? []);
        setPackages(data.packages ?? []);
      })
      .catch(() => setError('Could not load rates. Is the lab server running?'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Test Rates</h1>
        <p className="mt-2 text-slate-600">
          Prices in PKR. Final amount may include discounts at the counter.
        </p>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>
      )}

      {!loading && packages.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Packages</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Package</th>
                  <th className="px-4 py-3">Details</th>
                  <th className="px-4 py-3 text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {packages.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-slate-600">{p.description || p.code}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      Rs {Number(p.basePrice).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!loading && tests.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Individual Tests</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Test</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tests.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3 font-mono text-xs">{t.code}</td>
                    <td className="px-4 py-3">
                      {t.name}
                      {t.isPanel && (
                        <span className="ml-2 text-xs text-purple-600">panel</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{t.category || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      Rs {Number(t.basePrice).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

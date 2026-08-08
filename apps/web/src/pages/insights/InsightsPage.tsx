import { useEffect, useState } from 'react';
import * as analyticsApi from '../../api/analytics';
import type { TestAnalyticsOverview, BusinessInsightsOverview } from '../../api/analytics';
import { KpiCard } from '../../dashboard/widgets/KpiCard';
import { DateRangeFilter, presetToRange } from '../../dashboard/DateRangeFilter';
import type { DateRangeValue } from '../../dashboard/DateRangeFilter';
import { Loading } from '../../components/Loading';

function money(n: number | undefined) {
  return `Rs ${Number(n ?? 0).toLocaleString('en-PK')}`;
}

function RankedTable<T>({
  title,
  rows,
  columns,
  emptyLabel,
}: {
  title: string;
  rows: T[];
  columns: { label: string; render: (row: T) => React.ReactNode; align?: 'right' }[];
  emptyLabel: string;
}) {
  return (
    <div className="card">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">{emptyLabel}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              {columns.map((c) => (
                <th key={c.label} className={`py-1 ${c.align === 'right' ? 'text-right' : ''}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.label} className={`py-1.5 ${c.align === 'right' ? 'text-right' : ''}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function InsightsPage() {
  const [range, setRange] = useState<DateRangeValue>({ preset: 'month', ...presetToRange('month') });
  const [tests, setTests] = useState<TestAnalyticsOverview | null>(null);
  const [insights, setInsights] = useState<BusinessInsightsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      analyticsApi.getTestAnalyticsOverview({ from: range.from, to: range.to }),
      analyticsApi.getBusinessInsightsOverview({ from: range.from, to: range.to }),
    ])
      .then(([t, i]) => {
        setTests(t);
        setInsights(i);
      })
      .finally(() => setLoading(false));
  }, [range.from, range.to]);

  const peakHour = insights?.peakVisitHours.reduce(
    (best, h) => (h.count > best.count ? h : best),
    { hour: 0, count: 0 },
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Insights</h1>
          <p className="text-sm text-slate-500">Test analytics and business trends</p>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {loading && !tests && <Loading />}

      {/* Test Analytics */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Test Analytics
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard label="Average Test Price" value={money(tests?.averageTestPrice)} loading={loading} />
          <KpiCard label="Average Daily Tests" value={String(tests?.averageDailyTests ?? 0)} loading={loading} />
          <KpiCard label="Average Patients / Day" value={String(tests?.averagePatientsPerDay ?? 0)} loading={loading} />
          <KpiCard
            label="Repeat Patients"
            value={`${tests?.newVsRepeat.repeatPercentage ?? 0}%`}
            hint={`${tests?.newVsRepeat.repeatPatients ?? 0} of ${(tests?.newVsRepeat.repeatPatients ?? 0) + (tests?.newVsRepeat.newPatients ?? 0)} patients`}
            loading={loading}
          />
          <KpiCard
            label="New Patients"
            value={`${tests?.newVsRepeat.newPercentage ?? 0}%`}
            tone="good"
            hint={`${tests?.newVsRepeat.newPatients ?? 0} patients`}
            loading={loading}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <RankedTable
            title="Most Performed Tests"
            rows={tests?.mostPerformed ?? []}
            emptyLabel="No tests billed in this range."
            columns={[
              { label: 'Test', render: (r) => `${r.testCode} — ${r.testName}` },
              { label: 'Count', render: (r) => r.count, align: 'right' },
            ]}
          />
          <RankedTable
            title="Least Performed Tests"
            rows={tests?.leastPerformed ?? []}
            emptyLabel="No active tests found."
            columns={[
              { label: 'Test', render: (r) => `${r.testCode} — ${r.testName}` },
              { label: 'Count', render: (r) => r.count, align: 'right' },
            ]}
          />
          <RankedTable
            title="Highest Revenue Tests"
            rows={tests?.highestRevenue ?? []}
            emptyLabel="No tests billed in this range."
            columns={[
              { label: 'Test', render: (r) => `${r.testCode} — ${r.testName}` },
              { label: 'Revenue', render: (r) => money(r.revenue), align: 'right' },
            ]}
          />
        </div>
      </div>

      {/* Business Insights */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Business Insights
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Revenue Growth"
            value={
              insights?.growthRate?.revenueGrowthPercent != null
                ? `${insights.growthRate.revenueGrowthPercent > 0 ? '+' : ''}${insights.growthRate.revenueGrowthPercent}%`
                : '—'
            }
            hint="vs. the equivalent prior period"
            tone={
              insights?.growthRate?.revenueGrowthPercent != null
                ? insights.growthRate.revenueGrowthPercent >= 0
                  ? 'good'
                  : 'bad'
                : 'default'
            }
            loading={loading}
          />
          <KpiCard
            label="Patient Growth"
            value={
              insights?.growthRate?.patientGrowthPercent != null
                ? `${insights.growthRate.patientGrowthPercent > 0 ? '+' : ''}${insights.growthRate.patientGrowthPercent}%`
                : '—'
            }
            hint="vs. the equivalent prior period"
            tone={
              insights?.growthRate?.patientGrowthPercent != null
                ? insights.growthRate.patientGrowthPercent >= 0
                  ? 'good'
                  : 'bad'
                : 'default'
            }
            loading={loading}
          />
          <KpiCard
            label="Cancellation Rate"
            value={`${insights?.cancellationRate ?? 0}%`}
            tone={insights && insights.cancellationRate > 10 ? 'warning' : 'default'}
            loading={loading}
          />
          <KpiCard
            label="Peak Visit Hour"
            value={peakHour && peakHour.count > 0 ? `${peakHour.hour}:00 – ${peakHour.hour + 1}:00` : '—'}
            hint={peakHour && peakHour.count > 0 ? `${peakHour.count} visits` : undefined}
            loading={loading}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <RankedTable
            title="Highest Revenue Patients"
            rows={insights?.highestRevenuePatients ?? []}
            emptyLabel="No billed patients in this range."
            columns={[
              { label: 'Patient', render: (r) => r.patientName },
              { label: 'Invoices', render: (r) => r.invoiceCount, align: 'right' },
              { label: 'Revenue', render: (r) => money(r.totalRevenue), align: 'right' },
            ]}
          />
          <RankedTable
            title="Most Popular Test Packages"
            rows={insights?.mostPopularPackages ?? []}
            emptyLabel="No packages billed in this range."
            columns={[
              { label: 'Package', render: (r) => r.packageName },
              { label: 'Times Booked', render: (r) => r.count, align: 'right' },
            ]}
          />
        </div>

        {/* Trend data (weekly/monthly/seasonal) is fetched and available above
         * (insights.weeklyTrend / .monthlyTrend / .seasonalTrend) but not yet
         * charted here — that's the line/bar chart pass (needs recharts),
         * not part of this step. */}
      </div>
    </div>
  );
}

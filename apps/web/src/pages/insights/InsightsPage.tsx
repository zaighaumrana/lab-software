import { useEffect, useState } from 'react';
import * as analyticsApi from '../../api/analytics';
import type { TestAnalyticsOverview, BusinessInsightsOverview, OutsourcingOverview } from '../../api/analytics';
import { KpiCard } from '../../dashboard/widgets/KpiCard';
import { LineChartWidget } from '../../dashboard/widgets/LineChartWidget';
import { BarChartWidget } from '../../dashboard/widgets/BarChartWidget';
import { PieChartWidget } from '../../dashboard/widgets/PieChartWidget';
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
  const [outsourcing, setOutsourcing] = useState<OutsourcingOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      analyticsApi.getTestAnalyticsOverview({ from: range.from, to: range.to }),
      analyticsApi.getBusinessInsightsOverview({ from: range.from, to: range.to }),
      analyticsApi.getOutsourcingOverview({ from: range.from, to: range.to }),
    ])
      .then(([t, i, o]) => {
        setTests(t);
        setInsights(i);
        setOutsourcing(o);
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
        <div className="grid gap-4 lg:grid-cols-2">
          <BarChartWidget
            title="Most Performed Tests"
            data={(tests?.mostPerformed ?? []).map((r) => ({ ...r, label: `${r.testCode} — ${r.testName}` }))}
            xKey="label"
            valueKey="count"
            valueLabel="Count"
            loading={loading}
            emptyLabel="No tests billed in this range."
          />
          <PieChartWidget
            title="Test Category Distribution"
            data={tests?.categoryDistribution ?? []}
            nameKey="category"
            valueKey="revenue"
            loading={loading}
            emptyLabel="No tests billed in this range."
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

        <div className="grid gap-4 lg:grid-cols-2">
          <LineChartWidget
            title="Revenue Trend (Monthly)"
            data={insights?.monthlyTrend ?? []}
            xKey="period"
            series={[{ key: 'revenue', label: 'Revenue', color: '#0284c7' }]}
            loading={loading}
          />
          <LineChartWidget
            title="Daily Patient Count"
            data={insights?.dailyTrend ?? []}
            xKey="period"
            series={[{ key: 'patientCount', label: 'Patients', color: '#16a34a' }]}
            loading={loading}
          />
        </div>

        {/* Weekly and seasonal (quarterly) trend data is also available above
         * (insights.weeklyTrend / .seasonalTrend) via the same shape as the
         * two charts above — not rendered as separate charts here to avoid
         * redundant views of the same underlying series; wire in if a
         * dedicated weekly/quarterly view is wanted later. */}
      </div>

      {/* Outsourced Tests */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Outsourced Tests
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total Outsourced Tests" value={String(outsourcing?.totalOutsourcedTests ?? 0)} loading={loading} />
          <KpiCard label="Outsourcing Cost" value={money(outsourcing?.outsourcingCost)} loading={loading} />
          <KpiCard label="Revenue Generated" value={money(outsourcing?.revenue)} loading={loading} />
          <KpiCard
            label="Net Margin"
            value={money(outsourcing?.netMargin)}
            tone={outsourcing && outsourcing.netMargin >= 0 ? 'good' : 'bad'}
            loading={loading}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <RankedTable
            title="Top Outsourced Tests"
            rows={outsourcing?.topOutsourcedTests ?? []}
            emptyLabel="No outsourced tests in this range."
            columns={[
              { label: 'Test', render: (r) => `${r.testCode} — ${r.testName}` },
              { label: 'Count', render: (r) => r.count, align: 'right' },
            ]}
          />
          <RankedTable
            title="Top External Labs"
            rows={outsourcing?.topExternalLabs ?? []}
            emptyLabel="No outsourced tests in this range."
            columns={[
              { label: 'Lab', render: (r) => r.labName },
              { label: 'Samples', render: (r) => r.sampleCount, align: 'right' },
              { label: 'Cost', render: (r) => money(r.totalCost), align: 'right' },
            ]}
          />
          <PieChartWidget
            title="Outsourced vs In-House Tests"
            data={outsourcing?.inHouseVsOutsourced ?? []}
            nameKey="label"
            valueKey="count"
            donut
            loading={loading}
            emptyLabel="No samples in this range."
          />
        </div>
      </div>
    </div>
  );
}

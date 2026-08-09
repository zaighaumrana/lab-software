import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { UserPlus, FlaskConical, TestTube, BookOpen } from 'lucide-react';
import * as analyticsApi from '../../api/analytics';
import type { FinancialOverview, OperationalOverview, DoctorShareOverview } from '../../api/analytics';
import { KpiCard } from '../../dashboard/widgets/KpiCard';
import { TopDoctorsTable } from '../../dashboard/widgets/TopDoctorsTable';
import { PieChartWidget } from '../../dashboard/widgets/PieChartWidget';
import { StackedBarChartWidget } from '../../dashboard/widgets/StackedBarChartWidget';
import { BarChartWidget } from '../../dashboard/widgets/BarChartWidget';
import { DateRangeFilter, presetToRange } from '../../dashboard/DateRangeFilter';
import type { DateRangeValue } from '../../dashboard/DateRangeFilter';

const QUICK = [
  { to: '/patients', label: 'Find / Register Patient', icon: UserPlus, color: 'bg-blue-50 text-blue-700' },
  { to: '/visit', label: 'Start New Visit', icon: FlaskConical, color: 'bg-green-50 text-green-700' },
  { to: '/laboratory', label: 'Laboratory Queue', icon: TestTube, color: 'bg-purple-50 text-purple-700' },
  { to: '/catalog', label: 'Test Catalog', icon: BookOpen, color: 'bg-amber-50 text-amber-700' },
];

function money(n: number | undefined) {
  return `Rs ${Number(n ?? 0).toLocaleString('en-PK')}`;
}

export function DashboardPage() {
  const { user } = useAuth();
  const [range, setRange] = useState<DateRangeValue>({ preset: 'month', ...presetToRange('month') });
  const [financial, setFinancial] = useState<FinancialOverview | null>(null);
  const [operational, setOperational] = useState<OperationalOverview | null>(null);
  const [doctorShare, setDoctorShare] = useState<DoctorShareOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      analyticsApi.getFinancialOverview({ from: range.from, to: range.to }),
      analyticsApi.getOperationalOverview({ from: range.from, to: range.to }),
      analyticsApi.getDoctorShareOverview({ from: range.from, to: range.to }),
    ])
      .then(([f, o, d]) => {
        setFinancial(f);
        setOperational(o);
        setDoctorShare(d);
      })
      .finally(() => setLoading(false));
  }, [range.from, range.to]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">
          Welcome back, {user?.fullName}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="card flex items-center gap-4 transition hover:border-brand-300 hover:shadow-md"
          >
            <div className={`rounded-lg p-3 ${item.color}`}>
              <item.icon className="h-6 w-6" />
            </div>
            <span className="font-medium text-slate-800">{item.label}</span>
          </Link>
        ))}
      </div>

      {/* Operational — point-in-time queue depths, always "right now" regardless of the date filter below */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Operational — right now
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Today's Patients" value={String(operational?.todayPatients ?? 0)} loading={loading} />
          <KpiCard label="Samples Collected Today" value={String(operational?.samplesCollected ?? 0)} loading={loading} />
          <KpiCard label="Tests In Progress" value={String(operational?.testsInProgress ?? 0)} loading={loading} />
          <KpiCard
            label="Pending Verification"
            value={String(operational?.pendingVerification ?? 0)}
            tone={operational && operational.pendingVerification > 0 ? 'warning' : 'default'}
            loading={loading}
          />
          <KpiCard label="Reports Ready" value={String(operational?.reportsReady ?? 0)} tone="good" loading={loading} />
          <KpiCard
            label="Critical Awaiting Review"
            value={String(operational?.criticalAwaitingReview ?? 0)}
            tone={operational && operational.criticalAwaitingReview > 0 ? 'bad' : 'default'}
            loading={loading}
          />
          <KpiCard
            label="Avg. Turnaround Time"
            value={
              operational?.avgTurnaroundTimeHours != null
                ? `${operational.avgTurnaroundTimeHours} hrs`
                : '—'
            }
            hint="Invoice creation → report generated, for reports in the selected range"
            loading={loading}
          />
        </div>
      </div>

      {/* Financial Overview — respects the date filter */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Financial Overview
          </h2>
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard label="Invoiced Revenue" value={money(financial?.invoicedRevenue)} loading={loading} />
          <KpiCard label="Cash Received" value={money(financial?.cashReceived)} tone="good" loading={loading} />
          <KpiCard
            label="Outstanding"
            value={money(financial?.outstanding)}
            tone={financial && financial.outstanding > 0 ? 'warning' : 'default'}
            hint="Snapshot as of now, not date-filtered"
            loading={loading}
          />
          <KpiCard label="Discount Given" value={money(financial?.discountGiven)} loading={loading} />
          <KpiCard label="Refunds" value={money(financial?.refunds)} tone={financial && financial.refunds > 0 ? 'bad' : 'default'} loading={loading} />
          <KpiCard
            label="Net Revenue"
            value={money(financial?.netRevenue)}
            tone="good"
            hint="Cash received − refunds − doctor share paid"
            loading={loading}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <PieChartWidget
            title="Payment Status"
            data={financial?.paymentStatusBreakdown ?? []}
            nameKey="status"
            valueKey="count"
            donut
            loading={loading}
          />
          <StackedBarChartWidget
            title="Monthly Revenue Comparison"
            data={financial?.monthlyRevenueComparison ?? []}
            xKey="month"
            series={[
              { key: 'cashReceived', label: 'Cash Received', color: '#16a34a' },
              { key: 'outstanding', label: 'Outstanding', color: '#d97706' },
            ]}
            loading={loading}
          />
        </div>
      </div>

      {/* Doctor Share — same date filter as Financial Overview */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Doctor Share
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard label="Total Share Payable" value={money(doctorShare?.totalSharePayable)} loading={loading} />
          <KpiCard label="Total Share Paid" value={money(doctorShare?.totalSharePaid)} tone="good" loading={loading} />
          <KpiCard
            label="Pending Share"
            value={money(doctorShare?.pendingShare)}
            tone={doctorShare && doctorShare.pendingShare > 0 ? 'warning' : 'default'}
            hint="Snapshot as of now, not date-filtered"
            loading={loading}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <TopDoctorsTable rows={doctorShare?.topReferringDoctors ?? []} loading={loading} />
          <BarChartWidget
            title="Doctor Referral Contribution"
            data={doctorShare?.topReferringDoctors ?? []}
            xKey="doctorName"
            valueKey="totalShare"
            valueLabel="Share"
            color="#7c3aed"
            loading={loading}
          />
        </div>
      </div>

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Offline-first</h2>
        <p className="text-sm text-slate-500">
          All core operations run against the local server. Internet is only needed for
          website sync and SMS delivery.
        </p>
      </div>
    </div>
  );
}

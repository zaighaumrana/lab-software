import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  UserPlus,
  FlaskConical,
  TestTube,
  BookOpen,
  Users,
  TestTube2,
  FileCheck,
  AlertTriangle,
  Clock,
  Wallet,
  Receipt,
  TrendingUp,
  PiggyBank,
  Undo2,
  Stethoscope,
} from 'lucide-react';
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
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
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
      .catch(() => setError('Failed to load dashboard data. Try refreshing the page.'))
      .finally(() => setLoading(false));
  }, [range.from, range.to]);

  // Build a link into Transactions carrying the current date filter (and
  // optionally a status), so a financial card actually opens the matching
  // filtered view instead of just displaying a number.
  function txLink(status?: string) {
    const params = new URLSearchParams();
    if (range.from) params.set('from', range.from);
    if (range.to) params.set('to', range.to);
    if (status) params.set('status', status);
    return `/invoices?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Welcome back, {user?.fullName}</p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="card flex items-center gap-3 py-3.5 transition-colors hover:border-brand-300"
          >
            <div className={`rounded-md p-2.5 ${item.color}`}>
              <item.icon className="h-5 w-5" />
            </div>
            <span className="text-sm font-medium text-slate-800">{item.label}</span>
          </Link>
        ))}
      </div>

      {/* Operational — point-in-time queue depths, always "right now" regardless of the date filter below */}
      <div className="space-y-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Operational — right now
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Today's Patients"
            value={String(operational?.todayPatients ?? 0)}
            icon={Users}
            to="/patients"
            loading={loading}
          />
          <KpiCard
            label="Samples Collected Today"
            value={String(operational?.samplesCollected ?? 0)}
            icon={TestTube2}
            to="/laboratory"
            loading={loading}
          />
          <KpiCard
            label="Tests In Progress"
            value={String(operational?.testsInProgress ?? 0)}
            icon={FlaskConical}
            to="/laboratory"
            loading={loading}
          />
          <KpiCard
            label="Pending Verification"
            value={String(operational?.pendingVerification ?? 0)}
            tone={operational && operational.pendingVerification > 0 ? 'warning' : 'default'}
            icon={FileCheck}
            to="/laboratory"
            loading={loading}
          />
          <KpiCard
            label="Reports Ready"
            value={String(operational?.reportsReady ?? 0)}
            tone="good"
            icon={FileCheck}
            to="/reports"
            loading={loading}
          />
          <KpiCard
            label="Critical Awaiting Review"
            value={String(operational?.criticalAwaitingReview ?? 0)}
            tone={operational && operational.criticalAwaitingReview > 0 ? 'bad' : 'default'}
            icon={AlertTriangle}
            to="/laboratory"
            loading={loading}
          />
          <KpiCard
            label="Avg. Turnaround Time"
            value={
              operational?.avgTurnaroundTimeHours != null
                ? `${operational.avgTurnaroundTimeHours} hrs`
                : '—'
            }
            hint="Invoice creation → report generated"
            icon={Clock}
            to="/reports"
            loading={loading}
          />
        </div>
      </div>

      {/* Financial Overview — respects the date filter */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Financial Overview
          </h2>
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="Invoiced Revenue"
            value={money(financial?.invoicedRevenue)}
            icon={Receipt}
            to={txLink()}
            loading={loading}
          />
          <KpiCard
            label="Cash Received"
            value={money(financial?.cashReceived)}
            tone="good"
            icon={Wallet}
            to={txLink()}
            loading={loading}
          />
          <KpiCard
            label="Outstanding"
            value={money(financial?.outstanding)}
            tone={financial && financial.outstanding > 0 ? 'warning' : 'default'}
            hint="Snapshot as of now, not date-filtered"
            icon={AlertTriangle}
            to={txLink('ISSUED')}
            loading={loading}
          />
          <KpiCard
            label="Discount Given"
            value={money(financial?.discountGiven)}
            icon={TrendingUp}
            to={txLink()}
            loading={loading}
          />
          <KpiCard
            label="Refunds"
            value={money(financial?.refunds)}
            tone={financial && financial.refunds > 0 ? 'bad' : 'default'}
            icon={Undo2}
            to={txLink('REFUNDED')}
            loading={loading}
          />
          <KpiCard
            label="Net Revenue"
            value={money(financial?.netRevenue)}
            tone="good"
            hint="Cash received − refunds − doctor share paid"
            icon={PiggyBank}
            to={txLink()}
            loading={loading}
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
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
      <div className="space-y-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Doctor Share
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiCard
            label="Total Share Payable"
            value={money(doctorShare?.totalSharePayable)}
            icon={Stethoscope}
            to="/doctors"
            loading={loading}
          />
          <KpiCard
            label="Total Share Paid"
            value={money(doctorShare?.totalSharePaid)}
            tone="good"
            icon={Wallet}
            to="/doctors"
            loading={loading}
          />
          <KpiCard
            label="Pending Share"
            value={money(doctorShare?.pendingShare)}
            tone={doctorShare && doctorShare.pendingShare > 0 ? 'warning' : 'default'}
            hint="Snapshot as of now, not date-filtered"
            icon={AlertTriangle}
            to="/doctors"
            loading={loading}
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
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
    </div>
  );
}

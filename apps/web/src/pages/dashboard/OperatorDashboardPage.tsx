import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import {
  UserPlus,
  Users,
  TestTube2,
  FileCheck,
  AlertTriangle,
  Clock,
  Wallet,
  TestTube,
  Receipt,
  Banknote,
  Printer,
} from 'lucide-react';
import * as dashboardApi from '../../api/dashboard';
import type { OperatorDashboard } from '../../api/dashboard';
import { KpiCard } from '../../dashboard/widgets/KpiCard';
import { Loading } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';

const QUICK = [
  { to: '/visit', label: 'New Patient', icon: UserPlus, color: 'bg-blue-50 text-blue-700' },
  { to: '/patients', label: 'Patients', icon: Users, color: 'bg-slate-50 text-slate-700' },
  { to: '/laboratory', label: 'Laboratory', icon: TestTube, color: 'bg-purple-50 text-purple-700' },
  { to: '/invoices', label: 'Pending Payments', icon: Wallet, color: 'bg-amber-50 text-amber-700' },
  { to: '/reports', label: 'Reports', icon: Receipt, color: 'bg-green-50 text-green-700' },
  { to: '/cash-shift', label: 'Cash Shift', icon: Banknote, color: 'bg-teal-50 text-teal-700' },
];

function formatRs(n: number) {
  return `Rs ${n.toLocaleString()}`;
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * The LAB_OPERATOR home screen — answers "what do I need to know and do
 * today," not "how is the business doing" (that's DashboardPage.tsx,
 * ADMIN-only). Deliberately its own page rather than the Admin Dashboard
 * with widgets hidden — see docs/12_RBAC_and_Operator_Dashboard.md.
 *
 * Two distinct groups of cards, deliberately labeled apart rather than
 * mixed into one grid: "Today's Totals" (patients seen, tests
 * completed, cash collected, reports printed — cashier-POS-style daily
 * counters, each reset conceptually at midnight) vs. "Right Now" (queue
 * depth — tests in progress, results pending, reports ready, pending
 * payments, critical results — a snapshot of current backlog, not tied
 * to today specifically; a sample doesn't stop being "in progress" at
 * midnight). No charts anywhere on this page, by design.
 *
 * Every number comes from GET /dashboard/operator — real data end to
 * end (see dashboard.service.ts on the backend), nothing mocked.
 */
export function OperatorDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<OperatorDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    dashboardApi
      .getOperatorDashboard()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          Welcome{user?.fullName ? `, ${user.fullName}` : ''}
        </h1>
        <p className="text-sm text-slate-500">Here's what's happening in the lab today.</p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Today's Totals</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <KpiCard
            label="Patients Today"
            value={loading ? '' : String(data?.todayPatients ?? 0)}
            loading={loading}
            icon={UserPlus}
          />
          <KpiCard
            label="Tests Completed Today"
            value={loading ? '' : String(data?.testsCompletedToday ?? 0)}
            loading={loading}
            icon={TestTube2}
            to="/laboratory"
          />
          <KpiCard
            label="Payments Collected Today"
            value={loading ? '' : formatRs(data?.cashCollectedToday ?? 0)}
            loading={loading}
            tone="good"
            icon={Banknote}
            to="/invoices"
          />
          <KpiCard
            label="Reports Printed Today"
            value={loading ? '' : String(data?.reportsPrintedToday ?? 0)}
            loading={loading}
            icon={Printer}
            to="/reports"
          />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Right Now</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <KpiCard
            label="Tests In Progress"
            value={loading ? '' : String(data?.testsInProgress ?? 0)}
            loading={loading}
            icon={TestTube}
            to="/laboratory"
          />
          <KpiCard
            label="Results Pending"
            value={loading ? '' : String(data?.pendingVerification ?? 0)}
            loading={loading}
            tone={data && data.pendingVerification > 0 ? 'warning' : 'default'}
            icon={Clock}
            to="/laboratory"
          />
          <KpiCard
            label="Reports Ready"
            value={loading ? '' : String(data?.reportsReady ?? 0)}
            loading={loading}
            tone="good"
            icon={FileCheck}
            to="/reports"
          />
          <KpiCard
            label="Pending Payments"
            value={loading ? '' : String(data?.pendingPayments ?? 0)}
            loading={loading}
            tone={data && data.pendingPayments > 0 ? 'warning' : 'default'}
            icon={Wallet}
            to="/invoices"
          />
          {!!data?.criticalAwaitingReview && (
            <KpiCard
              label="Critical — Awaiting Review"
              value={loading ? '' : String(data.criticalAwaitingReview)}
              loading={loading}
              tone="bad"
              icon={AlertTriangle}
              to="/laboratory"
            />
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {QUICK.map((q) => (
            <Link
              key={q.to}
              to={q.to}
              className="card flex flex-col items-center gap-2 py-4 text-center transition-colors hover:border-brand-300"
            >
              <div className={`rounded-lg p-2 ${q.color}`}>
                <q.icon className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium text-slate-700">{q.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Recent Activity</h2>
        {loading ? (
          <Loading label="Loading activity…" />
        ) : !data?.recentActivity?.length ? (
          <EmptyState title="No recent activity" description="Activity will show up here as work happens today." />
        ) : (
          <div className="card divide-y divide-slate-100 p-0">
            {data.recentActivity.map((a, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div>
                  <span className="font-medium text-slate-800">{a.patientName}</span>
                  <span className="text-slate-500"> — {a.label}</span>
                </div>
                <span className="text-xs text-slate-400">{timeAgo(a.at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

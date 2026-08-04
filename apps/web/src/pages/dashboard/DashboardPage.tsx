import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { UserPlus, FlaskConical, TestTube, BookOpen } from 'lucide-react';

const QUICK = [
  { to: '/patients', label: 'Find / Register Patient', icon: UserPlus, color: 'bg-blue-50 text-blue-700' },
  { to: '/visit', label: 'Start New Visit', icon: FlaskConical, color: 'bg-green-50 text-green-700' },
  { to: '/laboratory', label: 'Laboratory Queue', icon: TestTube, color: 'bg-purple-50 text-purple-700' },
  { to: '/catalog', label: 'Test Catalog', icon: BookOpen, color: 'bg-amber-50 text-amber-700' },
];

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
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

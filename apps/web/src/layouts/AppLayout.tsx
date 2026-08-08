import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import clsx from 'clsx';
import {
  LayoutDashboard,
  UserPlus,
  FlaskConical,
  TestTube,
  BookOpen,
  Stethoscope,
  FileText,
  Receipt,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/insights', label: 'Insights', icon: BarChart3 },
  { to: '/patients', label: 'Patients', icon: UserPlus },
  { to: '/visit', label: 'New Registration', icon: FlaskConical },
  { to: '/laboratory', label: 'Laboratory', icon: TestTube },
  { to: '/invoices', label: 'Invoices', icon: Receipt },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/catalog', label: 'Catalog', icon: BookOpen },
  { to: '/doctors', label: 'Doctors', icon: Stethoscope },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 w-64 transform border-r border-slate-200 bg-white transition print:hidden md:static md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
          <span className="text-lg font-semibold text-brand-700">LMS</span>
          <button className="md:hidden" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="space-y-1 p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200 p-3">
          <div className="mb-2 px-3 text-xs text-slate-500">
            <div className="font-medium text-slate-700">{user?.fullName}</div>
            <div>{user?.role?.replace(/_/g, ' ')}</div>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 print:hidden md:hidden">
          <button onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold text-brand-700">LMS</span>
        </header>
        <main className="flex-1 overflow-auto p-4 print:overflow-visible print:p-0 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

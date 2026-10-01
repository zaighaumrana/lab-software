import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, Permission } from '../lib/permissions';
import clsx from 'clsx';
import {
  LayoutDashboard,
  UserPlus,
  TestTube,
  BookOpen,
  FileText,
  Receipt,
  Settings,
  LogOut,
  ChevronDown,
  Menu,
  X,
  Wallet,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface NavLeaf {
  to: string;
  label: string;
  end?: boolean;
  /** Omit for items every active role can see (Dashboard, Patients, Laboratory). */
  permission?: Permission;
}

interface NavItem {
  label: string;
  icon: typeof LayoutDashboard;
  to?: string;
  end?: boolean;
  children?: NavLeaf[];
  permission?: Permission;
}

/**
 * Primary nav is a small set of modules, not a flat list of every route —
 * routes that logically belong together (e.g. invoices + doctor shares are
 * both "money", lab reports + insights are both "reporting") group under
 * one item with a dropdown, so the bar stays short regardless of how many
 * pages the app grows to have.
 *
 * `permission` on an item/leaf is UX filtering only (see lib/permissions.ts)
 * — every one of these is independently enforced server-side too, so
 * hiding a nav entry here is never the only thing standing between a role
 * and that page. LAB_OPERATOR's resulting nav is intentionally small — see
 * docs/12_RBAC_and_Operator_Dashboard.md — Dashboard/Patients/Laboratory
 * have no `permission` (both active roles get them), Finance/Reports keep
 * only their operational child, Catalog and the admin-only children
 * (Doctor Shares, Insights) disappear entirely for a role that lacks the
 * permission.
 */
const NAV: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/', end: true },
  {
    label: 'Patients',
    icon: UserPlus,
    children: [
      { to: '/patients', label: 'Find / Directory' },
      { to: '/visit', label: 'New Registration' },
    ],
  },
  { label: 'Laboratory', icon: TestTube, to: '/laboratory' },
  {
    label: 'Cash Shift',
    icon: Wallet,
    to: '/cash-shift',
    permission: Permission.CASH_SHIFT_MANAGE,
  },
  {
    label: 'Reports',
    icon: FileText,
    children: [
      { to: '/reports', label: 'Lab Reports' },
      { to: '/invoices', label: 'Invoices' },
      { to: '/insights', label: 'Insights', permission: Permission.ANALYTICS_VIEW },
    ],
  },
  {
    label: 'Doctor Shares',
    icon: Receipt,
    to: '/doctors',
    permission: Permission.DOCTOR_MANAGE,
  },
  { label: 'Catalog', icon: BookOpen, to: '/catalog', permission: Permission.CATALOG_MANAGE },
];

/** Filters NAV down to what `role` can actually see — a leaf/item with no
 * `permission` is visible to any active role; a parent with children is
 * only shown if at least one child survives the filter. */
function visibleNav(role: string | undefined | null): NavItem[] {
  return NAV.map((item) => {
    if (item.children) {
      const children = item.children.filter((c) => !c.permission || hasPermission(role, c.permission));
      return { ...item, children };
    }
    return item;
  }).filter((item) => {
    if (item.children) return item.children.length > 0;
    return !item.permission || hasPermission(role, item.permission);
  });
}

function isGroupActive(item: NavItem, pathname: string): boolean {
  if (item.to) return item.end ? pathname === item.to : pathname.startsWith(item.to);
  return (item.children ?? []).some((c) => pathname.startsWith(c.to));
}

function NavDropdown({ item, active }: { item: NavItem; active: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        )}
      >
        <item.icon className="h-4 w-4" />
        {item.label}
        <ChevronDown className={clsx('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {(item.children ?? []).map((leaf) => (
            <NavLink
              key={leaf.to}
              to={leaf.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'block px-3.5 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-brand-50 font-medium text-brand-700'
                    : 'text-slate-700 hover:bg-slate-50',
                )
              }
            >
              {leaf.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = visibleNav(user?.role);
  const canSeeSettings = hasPermission(user?.role, Permission.SETTINGS_MANAGE);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Primary horizontal nav */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white print:hidden">
        <div className="flex h-14 items-center gap-2 px-4">
          <span className="mr-2 shrink-0 text-lg font-bold tracking-tight text-brand-700">LMS</span>

          {/* Desktop nav */}
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {nav.map((item) =>
              item.children ? (
                <NavDropdown key={item.label} item={item} active={isGroupActive(item, location.pathname)} />
              ) : (
                <NavLink
                  key={item.label}
                  to={item.to!}
                  end={item.end}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ),
            )}
          </nav>

          <div className="flex-1 md:hidden" />

          {/* Right side: settings, user, logout */}
          <div className="hidden items-center gap-1 md:flex">
            <NavLink
              to={canSeeSettings ? '/settings' : '/profile'}
              className={({ isActive }) =>
                clsx(
                  'rounded-md p-2 transition-colors',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
                )
              }
              title={canSeeSettings ? 'Settings' : 'My Profile'}
            >
              <Settings className="h-4 w-4" />
            </NavLink>
            <div className="mx-1 h-6 w-px bg-slate-200" />
            <div className="px-1 text-right leading-tight">
              <div className="text-xs font-medium text-slate-800">{user?.fullName}</div>
              <div className="text-[11px] text-slate-400">{user?.role?.replace(/_/g, ' ')}</div>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-red-600"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>

          {/* Mobile toggle */}
          <button className="md:hidden" onClick={() => setMobileOpen((v) => !v)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <nav className="space-y-0.5 border-t border-slate-200 p-2 md:hidden">
            {nav.flatMap((item) =>
              item.children
                ? item.children.map((leaf) => ({ to: leaf.to, label: `${item.label} · ${leaf.label}`, icon: item.icon }))
                : [{ to: item.to!, label: item.label, icon: item.icon }],
            ).map((leaf) => (
              <NavLink
                key={leaf.to}
                to={leaf.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium',
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50',
                  )
                }
              >
                <leaf.icon className="h-4 w-4" />
                {leaf.label}
              </NavLink>
            ))}
            {canSeeSettings && (
              <NavLink
                to="/settings"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <Settings className="h-4 w-4" />
                Settings
              </NavLink>
            )}
            <NavLink
              to="/profile"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <Settings className="h-4 w-4" />
              My Profile
            </NavLink>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </nav>
        )}
      </header>

      <main className="flex-1 overflow-auto p-4 print:overflow-visible print:p-0 lg:p-6">
        <div className="mx-auto w-full max-w-[1600px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

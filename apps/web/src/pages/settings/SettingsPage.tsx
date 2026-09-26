import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import * as settingsApi from '../../api/settings';
import type { StaffUser } from '../../api/settings';
import { Loading } from '../../components/Loading';
import { Navigate } from 'react-router-dom';
import { SmsSettingsTab } from './SmsSettingsTab';

type Tab = 'users' | 'branding' | 'print' | 'report-layout' | 'sms';

const ROLES = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'LAB_OPERATOR', label: 'Lab operator (front desk + lab)' },
  { value: 'RECEPTION', label: 'Reception / front desk' },
  { value: 'CASHIER', label: 'Cashier' },
  { value: 'LAB_TECH', label: 'Lab technician' },
  { value: 'SAMPLE_COLLECTOR', label: 'Sample collector' },
  { value: 'PATHOLOGIST', label: 'Pathologist' },
  { value: 'ACCOUNTANT', label: 'Accountant' },
];

export function SettingsPage() {
  const { user } = useAuth();
  const { branding, printLayout, refresh } = useSettings();
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // User form
  const [uForm, setUForm] = useState({
    username: '',
    password: '',
    fullName: '',
    role: 'RECEPTION',
    email: '',
  });

  // Branding form
  const [bForm, setBForm] = useState(branding);
  // Print form
  const [pForm, setPForm] = useState(printLayout);

  useEffect(() => {
    setBForm(branding);
    setPForm(printLayout);
  }, [branding, printLayout]);

  useEffect(() => {
    if (tab === 'users' && user?.role === 'ADMIN') {
      setLoadingUsers(true);
      settingsApi
        .listUsers()
        .then(setUsers)
        .catch(() => setError('Failed to load users'))
        .finally(() => setLoadingUsers(false));
    }
  }, [tab, user?.role]);

  if (user?.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await settingsApi.createUser(uForm);
      setMessage('User created');
      setUForm({ username: '', password: '', fullName: '', role: 'RECEPTION', email: '' });
      setUsers(await settingsApi.listUsers());
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to create user',
      );
    }
  }

  async function toggleActive(u: StaffUser) {
    setError('');
    try {
      await settingsApi.updateUser(u.id, { isActive: !u.isActive });
      setUsers(await settingsApi.listUsers());
    } catch {
      setError('Failed to update user');
    }
  }

  async function handleBranding(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await settingsApi.saveBranding(bForm);
      await refresh();
      setMessage('Branding saved — colours and name applied');
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to save branding',
      );
    }
  }

  async function handlePrint(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await settingsApi.savePrintLayout(pForm);
      await refresh();
      setMessage('Print layout saved — used on invoices and reports');
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to save print layout',
      );
    }
  }

  function onLogoFile(file: File | null) {
    if (!file) return;
    if (file.size > 500_000) {
      setError('Logo must be under 500KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setBForm((prev) => ({ ...prev, logoDataUrl: String(reader.result) }));
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Admin only — users, branding, print layout</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['users', 'Users'],
            ['branding', 'Branding'],
            ['print', 'Print layout'],
            ['report-layout', 'Report Print Layout'],
            ['sms', 'SMS / Notifications'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'btn-primary' : 'btn-secondary'}
            onClick={() => {
              setTab(id);
              setMessage('');
              setError('');
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {message && (
        <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{message}</div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {tab === 'users' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={handleCreateUser} className="card space-y-3">
            <h2 className="font-semibold">Add staff user</h2>
            <div>
              <label className="label">Full name</label>
              <input
                className="input"
                required
                value={uForm.fullName}
                onChange={(e) => setUForm({ ...uForm, fullName: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Username</label>
              <input
                className="input"
                required
                minLength={3}
                value={uForm.username}
                onChange={(e) => setUForm({ ...uForm, username: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                required
                minLength={6}
                value={uForm.password}
                onChange={(e) => setUForm({ ...uForm, password: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Role</label>
              <select
                className="input"
                value={uForm.role}
                onChange={(e) => setUForm({ ...uForm, role: e.target.value })}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Email (optional)</label>
              <input
                className="input"
                type="email"
                value={uForm.email}
                onChange={(e) => setUForm({ ...uForm, email: e.target.value })}
              />
            </div>
            <button type="submit" className="btn-primary">
              Create user
            </button>
          </form>

          <div className="card space-y-2">
            <h2 className="font-semibold">Staff accounts</h2>
            {loadingUsers && <Loading />}
            {!loadingUsers &&
              users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between border-b border-slate-100 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{u.fullName}</div>
                    <div className="text-xs text-slate-500">
                      {u.username} · {u.role.replace(/_/g, ' ')}
                      {!u.isActive && ' · inactive'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    onClick={() => toggleActive(u)}
                  >
                    {u.isActive ? 'Disable' : 'Enable'}
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {tab === 'branding' && (
        <form onSubmit={handleBranding} className="card max-w-xl space-y-4">
          <h2 className="font-semibold">Lab branding</h2>
          <div>
            <label className="label">Lab name</label>
            <input
              className="input"
              required
              value={bForm.labName}
              onChange={(e) => setBForm({ ...bForm, labName: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Primary colour</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  className="h-10 w-14 cursor-pointer rounded border"
                  value={bForm.primaryColor}
                  onChange={(e) => setBForm({ ...bForm, primaryColor: e.target.value })}
                />
                <input
                  className="input"
                  value={bForm.primaryColor}
                  onChange={(e) => setBForm({ ...bForm, primaryColor: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="label">Secondary colour</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  className="h-10 w-14 cursor-pointer rounded border"
                  value={bForm.secondaryColor}
                  onChange={(e) =>
                    setBForm({ ...bForm, secondaryColor: e.target.value })
                  }
                />
                <input
                  className="input"
                  value={bForm.secondaryColor}
                  onChange={(e) =>
                    setBForm({ ...bForm, secondaryColor: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
          <div>
            <label className="label">Logo (PNG/JPG, max 500KB)</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="text-sm"
              onChange={(e) => onLogoFile(e.target.files?.[0] ?? null)}
            />
            {bForm.logoDataUrl && (
              <div className="mt-2 flex items-center gap-3">
                <img src={bForm.logoDataUrl} alt="Logo preview" className="h-16 object-contain" />
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  onClick={() => setBForm({ ...bForm, logoDataUrl: null })}
                >
                  Remove logo
                </button>
              </div>
            )}
          </div>
          <button type="submit" className="btn-primary">
            Save branding
          </button>
        </form>
      )}

      {tab === 'print' && (
        <form onSubmit={handlePrint} className="card max-w-xl space-y-4">
          <h2 className="font-semibold">Printed invoice & report header</h2>
          <p className="text-xs text-slate-500">
            These fields appear on printed invoices and lab reports (with logo from Branding).
          </p>
          <div>
            <label className="label">Lab name on print</label>
            <input
              className="input"
              required
              value={pForm.labName}
              onChange={(e) => setPForm({ ...pForm, labName: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Lab registration / number</label>
            <input
              className="input"
              value={pForm.labNumber}
              onChange={(e) => setPForm({ ...pForm, labNumber: e.target.value })}
              placeholder="e.g. REG-12345"
            />
          </div>
          <div>
            <label className="label">Address</label>
            <textarea
              className="input"
              rows={2}
              value={pForm.address}
              onChange={(e) => setPForm({ ...pForm, address: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Phone</label>
              <input
                className="input"
                value={pForm.phone}
                onChange={(e) => setPForm({ ...pForm, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                value={pForm.email}
                onChange={(e) => setPForm({ ...pForm, email: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">Footer text</label>
            <textarea
              className="input"
              rows={2}
              value={pForm.footerText}
              onChange={(e) => setPForm({ ...pForm, footerText: e.target.value })}
            />
          </div>
          <button type="submit" className="btn-primary">
            Save print layout
          </button>
        </form>
      )}

      {tab === 'report-layout' && (
        <form onSubmit={handlePrint} className="card max-w-xl space-y-5">
          <div>
            <h2 className="font-semibold">Report Print Layout</h2>
            <p className="text-xs text-slate-500">
              Controls how lab reports (and invoices) are physically printed —
              independent of what appears on screen.
            </p>
          </div>

          <div>
            <label className="label">Printing mode</label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label
                className={`cursor-pointer rounded-lg border p-3 text-sm ${
                  pForm.printMode === 'PLAIN'
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-slate-200'
                }`}
              >
                <input
                  type="radio"
                  className="mr-2"
                  checked={pForm.printMode === 'PLAIN'}
                  onChange={() => setPForm({ ...pForm, printMode: 'PLAIN' })}
                />
                <strong>Plain paper</strong>
                <p className="mt-1 text-xs text-slate-500">
                  Prints the lab logo, name, header, and footer on every page.
                </p>
              </label>
              <label
                className={`cursor-pointer rounded-lg border p-3 text-sm ${
                  pForm.printMode === 'LETTERHEAD'
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-slate-200'
                }`}
              >
                <input
                  type="radio"
                  className="mr-2"
                  checked={pForm.printMode === 'LETTERHEAD'}
                  onChange={() => setPForm({ ...pForm, printMode: 'LETTERHEAD' })}
                />
                <strong>Letterhead paper</strong>
                <p className="mt-1 text-xs text-slate-500">
                  Skips the logo/header/footer — only patient info, tests, and
                  results print, positioned inside your pre-printed margins.
                </p>
              </label>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Top margin (mm)</label>
              <input
                className="input"
                type="number"
                min={0}
                max={80}
                value={pForm.marginTopMm}
                onChange={(e) =>
                  setPForm({ ...pForm, marginTopMm: Number(e.target.value) })
                }
              />
              <p className="mt-1 text-xs text-slate-500">
                Space left blank at the top of every printed page — set this to
                clear your letterhead's logo/header area.
              </p>
            </div>
            <div>
              <label className="label">Bottom margin (mm)</label>
              <input
                className="input"
                type="number"
                min={0}
                max={80}
                value={pForm.marginBottomMm}
                onChange={(e) =>
                  setPForm({ ...pForm, marginBottomMm: Number(e.target.value) })
                }
              />
              <p className="mt-1 text-xs text-slate-500">
                Space left blank at the bottom — clear your letterhead's footer.
              </p>
            </div>
          </div>

          <div>
            <label className="label">Report pagination</label>
            <select
              className="input"
              value={pForm.reportPagination}
              onChange={(e) =>
                setPForm({
                  ...pForm,
                  reportPagination: e.target.value as typeof pForm.reportPagination,
                })
              }
            >
              <option value="CONTINUOUS">
                Continuous — tests flow together, new page only when full
              </option>
              <option value="ONE_TEST_PER_PAGE">
                One test per page — each test always starts on its own page
              </option>
            </select>
          </div>

          <button type="submit" className="btn-primary">
            Save report print layout
          </button>
        </form>
      )}

      {tab === 'sms' && <SmsSettingsTab />}
    </div>
  );
}

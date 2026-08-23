import { FormEvent, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import * as authApi from '../../api/auth';

/**
 * Available to any logged-in role (unlike SettingsPage, which requires
 * SETTINGS_MANAGE) — this is "edit yourself," not an admin function.
 * Role is displayed but never editable here: there's no input for it,
 * and the backend endpoint this calls (PATCH /auth/me) has no field for
 * it either — see UpdateOwnProfileDto's comment for why that's the real
 * lock, not just this page choosing not to render one.
 */
export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');

    const wantsPasswordChange = !!(currentPassword || newPassword || confirmPassword);
    if (wantsPasswordChange) {
      if (!currentPassword) {
        setError('Enter your current password to set a new one.');
        return;
      }
      if (newPassword.length < 4) {
        setError('New password must be at least 4 characters.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("New password and confirmation don't match.");
        return;
      }
    }

    setSaving(true);
    try {
      await authApi.updateOwnProfile({
        fullName: fullName.trim() || undefined,
        currentPassword: wantsPasswordChange ? currentPassword : undefined,
        newPassword: wantsPasswordChange ? newPassword : undefined,
      });
      await refreshUser();
      setMessage('Profile updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to update profile';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">My Profile</h1>
        <p className="text-sm text-slate-500">Update your name or change your password.</p>
      </div>

      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="label">Full name</label>
          <input
            className="input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Role</label>
          <input
            className="input cursor-not-allowed bg-slate-50 text-slate-400"
            value={(user?.role ?? '').replace(/_/g, ' ')}
            disabled
            readOnly
          />
          <p className="mt-1 text-xs text-slate-400">
            Only an admin can change your role.
          </p>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <p className="mb-3 text-sm font-medium text-slate-700">Change password</p>
          <p className="mb-3 text-xs text-slate-400">
            Leave these blank if you don't want to change your password.
          </p>

          <div className="space-y-3">
            <div>
              <label className="label">Current password</label>
              <input
                type="password"
                className="input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="label">New password</label>
              <input
                type="password"
                className="input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="label">Confirm new password</label>
              <input
                type="password"
                className="input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}

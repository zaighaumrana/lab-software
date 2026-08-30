import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as doctorsApi from '../../api/doctors';
import type { Doctor } from '../../types';
import { Loading } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';
import { Plus } from 'lucide-react';

const emptyForm = {
  fullName: '',
  phone: '',
  email: '',
  specialty: '',
  clinicName: '',
  shareType: 'PERCENTAGE' as 'PERCENTAGE' | 'FIXED_AMOUNT' | 'PER_TEST_FIXED',
  shareValue: '',
  notes: '',
  isActive: true,
};

function shareLabel(d: Doctor) {
  if (d.shareType === 'PERCENTAGE') return `${d.shareValue}%`;
  if (d.shareType === 'PER_TEST_FIXED') return `Rs ${d.shareValue} / test`;
  return `Rs ${d.shareValue} / invoice`;
}

export function DoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    setError('');
    doctorsApi
      .listDoctors(true)
      .then(setDoctors)
      .catch(() => setError('Failed to load doctors. Try refreshing the page.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function startNew() {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setShowForm(true);
  }

  function startEdit(d: Doctor) {
    setEditingId(d.id);
    setForm({
      fullName: d.fullName,
      phone: d.phone ?? '',
      email: d.email ?? '',
      specialty: d.specialty ?? '',
      clinicName: d.clinicName ?? '',
      shareType: d.shareType as typeof emptyForm.shareType,
      shareValue: String(d.shareValue ?? ''),
      notes: d.notes ?? '',
      isActive: d.isActive,
    });
    setError('');
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        fullName: form.fullName,
        phone: form.phone || undefined,
        email: form.email || undefined,
        specialty: form.specialty || undefined,
        clinicName: form.clinicName || undefined,
        shareType: form.shareType,
        shareValue: Number(form.shareValue || 0),
        notes: form.notes || undefined,
        isActive: form.isActive,
      };
      if (editingId) {
        await doctorsApi.updateDoctor(editingId, payload);
      } else {
        await doctorsApi.createDoctor(payload);
      }
      setShowForm(false);
      load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Save failed';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Doctors</h1>
          <p className="text-sm text-slate-500">Referring doctors & share rates</p>
        </div>
        <button className="btn-primary" onClick={showForm ? () => setShowForm(false) : startNew}>
          <Plus className="h-4 w-4" />
          {showForm ? 'Cancel' : 'New Doctor'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <h2 className="font-semibold text-slate-800">
            {editingId ? 'Edit Doctor' : 'New Doctor'}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Full name *</label>
              <input
                className="input"
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Phone</label>
              <input
                className="input"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Specialty</label>
              <input
                className="input"
                value={form.specialty}
                onChange={(e) => setForm({ ...form, specialty: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Clinic / hospital</label>
              <input
                className="input"
                value={form.clinicName}
                onChange={(e) => setForm({ ...form, clinicName: e.target.value })}
              />
            </div>
            <div />
            <div>
              <label className="label">Share model *</label>
              <select
                className="input"
                value={form.shareType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    shareType: e.target.value as typeof emptyForm.shareType,
                  })
                }
              >
                <option value="PERCENTAGE">Percentage of invoice total</option>
                <option value="FIXED_AMOUNT">Fixed amount per invoice</option>
                <option value="PER_TEST_FIXED">Fixed amount per test</option>
              </select>
            </div>
            <div>
              <label className="label">
                {form.shareType === 'PERCENTAGE' ? 'Share (%)' : 'Share (Rs)'} *
              </label>
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                required
                value={form.shareValue}
                onChange={(e) => setForm({ ...form, shareValue: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <input
                className="input"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Active (eligible for new referrals & share)
            </label>
          </div>
          <p className="text-xs text-slate-500">
            Share is calculated automatically whenever an invoice is created for a
            booking referred by this doctor, using the model above.
          </p>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create doctor'}
          </button>
        </form>
      )}

      {doctors.length === 0 && !showForm && (
        <EmptyState title="No doctors yet" description="Add a referring doctor to get started." />
      )}

      {doctors.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Specialty</th>
                <th className="px-4 py-3">Share</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {doctors.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{d.fullName}</td>
                  <td className="px-4 py-3">{d.phone || '—'}</td>
                  <td className="px-4 py-3">{d.specialty || '—'}</td>
                  <td className="px-4 py-3">{shareLabel(d)}</td>
                  <td className="px-4 py-3">
                    {d.isActive ? (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                        Active
                      </span>
                    ) : (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Link to={`/doctors/${d.id}`} className="btn-secondary text-xs">
                        Dashboard
                      </Link>
                      <button className="btn-secondary text-xs" onClick={() => startEdit(d)}>
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

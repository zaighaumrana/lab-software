'use client';

import { FormEvent, useEffect, useState } from 'react';

interface TestOption {
  id: string;
  code: string;
  name: string;
  basePrice: number | string;
}

export default function BookingPage() {
  const [tests, setTests] = useState<TestOption[]>([]);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredAt, setPreferredAt] = useState('');
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ bookingCode: string; message: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/public/rates')
      .then((r) => r.json())
      .then((data) => setTests(data.tests ?? []))
      .catch(() => {});
  }, []);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/public/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          phone,
          preferredAt: preferredAt || undefined,
          notes: notes || undefined,
          testIds: selected.length ? selected : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Booking failed');
      }
      setResult({ bookingCode: data.bookingCode, message: data.message });
      setFullName('');
      setPhone('');
      setPreferredAt('');
      setNotes('');
      setSelected([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Booking failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Book a Test</h1>
        <p className="mt-2 text-sm text-slate-600">
          No payment online. You pay at the lab. Staff will confirm your booking.
        </p>
      </div>

      {result && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <p className="font-semibold text-green-800">Booking requested</p>
          <p className="mt-1 text-2xl font-bold tracking-wide text-green-900">
            {result.bookingCode}
          </p>
          <p className="mt-2 text-sm text-green-700">{result.message}</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 p-6">
        <div>
          <label className="mb-1 block text-sm font-medium">Full name *</label>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Phone * (03XXXXXXXXX)</label>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            required
            pattern="03\d{9}"
            placeholder="03001234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Preferred date/time</label>
          <input
            type="datetime-local"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={preferredAt}
            onChange={(e) => setPreferredAt(e.target.value)}
          />
        </div>
        {tests.length > 0 && (
          <div>
            <label className="mb-2 block text-sm font-medium">Tests (optional)</label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {tests.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(t.id)}
                    onChange={() => toggle(t.id)}
                  />
                  <span>
                    {t.code} — {t.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium">Notes</label>
          <textarea
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? 'Submitting…' : 'Request Booking'}
        </button>
      </form>
    </div>
  );
}

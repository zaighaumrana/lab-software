/**
 * Single-number widget — covers every "card" style metric in the Financial
 * Overview / Operational sections. Deliberately generic: it doesn't know
 * or care which metric it's displaying, only how to render a labeled
 * number with an optional tone. New KPI-style metrics reuse this
 * component as-is; they never need a bespoke card component.
 */
export function KpiCard({
  label,
  value,
  tone,
  loading,
  hint,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'good' | 'warning' | 'bad';
  loading?: boolean;
  hint?: string;
}) {
  const toneClass =
    tone === 'good'
      ? 'text-green-700'
      : tone === 'warning'
        ? 'text-amber-700'
        : tone === 'bad'
          ? 'text-red-700'
          : 'text-slate-900';

  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneClass}`}>
        {loading ? <span className="text-slate-300">…</span> : value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

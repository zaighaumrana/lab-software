import { Link } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';

/**
 * Single-number widget — covers every "card" style metric in the Financial
 * Overview / Operational sections. Deliberately generic: it doesn't know
 * or care which metric it's displaying, only how to render a labeled
 * number with an optional tone, icon, and destination. New KPI-style
 * metrics reuse this component as-is; they never need a bespoke card.
 *
 * Pass `to` to make the card a real navigation target — every dashboard
 * widget that represents an existing page/report should link to it rather
 * than sit there as a decorative number (see requirement: no dead cards).
 */
export function KpiCard({
  label,
  value,
  tone,
  loading,
  hint,
  icon: Icon,
  to,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'good' | 'warning' | 'bad';
  loading?: boolean;
  hint?: string;
  icon?: LucideIcon;
  to?: string;
}) {
  const toneClass =
    tone === 'good'
      ? 'text-green-700'
      : tone === 'warning'
        ? 'text-amber-700'
        : tone === 'bad'
          ? 'text-red-700'
          : 'text-slate-900';

  const iconToneClass =
    tone === 'good'
      ? 'bg-green-50 text-green-600'
      : tone === 'warning'
        ? 'bg-amber-50 text-amber-600'
        : tone === 'bad'
          ? 'bg-red-50 text-red-600'
          : 'bg-slate-100 text-slate-500';

  const content = (
    <>
      <div className="flex items-start justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
        {Icon && (
          <div className={`rounded-md p-1.5 ${iconToneClass}`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
      <div className={`mt-1.5 text-2xl font-bold leading-none ${toneClass}`}>
        {loading ? <span className="text-slate-300">…</span> : value}
      </div>
      {hint && <div className="mt-1.5 text-xs text-slate-400">{hint}</div>}
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="card group relative block py-3.5 transition-colors hover:border-brand-300"
      >
        {content}
        <ArrowRight className="absolute right-3 top-3.5 h-3.5 w-3.5 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>
    );
  }

  return <div className="card py-3.5">{content}</div>;
}

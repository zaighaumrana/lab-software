import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

/**
 * Generic single-series bar chart — backs Most Performed Tests and Doctor
 * Referral Contribution. Caller supplies the data + which fields are the
 * category (x-axis) and value (bar height).
 */
export function BarChartWidget({
  title,
  data,
  xKey,
  valueKey,
  valueLabel,
  color = '#0284c7',
  loading,
  emptyLabel = 'No data in this range.',
}: {
  title: string;
  data: Record<string, unknown>[];
  xKey: string;
  valueKey: string;
  valueLabel: string;
  color?: string;
  loading?: boolean;
  emptyLabel?: string;
}) {
  return (
    <div className="card">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-slate-400">{emptyLabel}</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis dataKey={xKey} type="category" width={140} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey={valueKey} name={valueLabel} fill={color} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

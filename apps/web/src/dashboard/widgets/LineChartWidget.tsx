import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export interface LineSeries<T> {
  key: Extract<keyof T, string>;
  label: string;
  color: string;
}

/**
 * Generic line-chart widget — backs Revenue Trend, Daily Patient Count, and
 * any future time-series metric. Doesn't know what it's plotting: caller
 * supplies the data array, the x-axis key, and one or more series configs.
 *
 * Generic over the caller's own row type `T` — see BarChartWidget for why.
 */
export function LineChartWidget<T extends object>({
  title,
  data,
  xKey,
  series,
  loading,
  emptyLabel = 'No data in this range.',
}: {
  title: string;
  data: T[];
  xKey: Extract<keyof T, string>;
  series: LineSeries<T>[];
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
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            {series.length > 1 && <Legend itemSorter={null} wrapperStyle={{ fontSize: 12 }} />}
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const DEFAULT_COLORS = [
  '#0284c7',
  '#16a34a',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#65a30d',
  '#db2777',
];

/**
 * Generic pie/donut chart — backs Payment Status and Test Category
 * Distribution. Set `donut` to render as a donut instead of a full pie;
 * both are the same component/data shape, just a different innerRadius.
 *
 * Generic over the caller's own row type `T` — see BarChartWidget for why.
 */
export function PieChartWidget<T extends object>({
  title,
  data,
  nameKey,
  valueKey,
  donut,
  loading,
  emptyLabel = 'No data in this range.',
}: {
  title: string;
  data: T[];
  nameKey: Extract<keyof T, string>;
  valueKey: Extract<keyof T, string>;
  donut?: boolean;
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
          <PieChart>
            <Pie
              data={data}
              dataKey={valueKey}
              nameKey={nameKey}
              innerRadius={donut ? 55 : 0}
              outerRadius={90}
              paddingAngle={donut ? 2 : 0}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={DEFAULT_COLORS[i % DEFAULT_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

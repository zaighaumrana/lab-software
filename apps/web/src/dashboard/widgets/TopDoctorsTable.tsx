import { Link } from 'react-router';
import type { TopDoctorRow } from '../../api/analytics';

function money(n: number) {
  return `Rs ${Number(n ?? 0).toLocaleString('en-PK')}`;
}

/**
 * Small reusable ranked-table widget — works for "Top Referring Doctors"
 * here, and is generic enough to reuse later for Highest Revenue Patients /
 * Most Popular Test Packages in the Business Insights section (same shape:
 * a ranked list of name + a couple of numbers).
 */
export function TopDoctorsTable({ rows, loading }: { rows: TopDoctorRow[]; loading?: boolean }) {
  return (
    <div className="card">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Top Referring Doctors</h3>
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400">No referrals in this range.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1">Doctor</th>
              <th className="py-1 text-right">Patients</th>
              <th className="py-1 text-right">Revenue</th>
              <th className="py-1 text-right">Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.doctorId}>
                <td className="py-1.5">
                  <Link to={`/doctors/${r.doctorId}`} className="text-brand-600 hover:underline">
                    {r.doctorName}
                  </Link>
                </td>
                <td className="py-1.5 text-right">{r.patientsReferred}</td>
                <td className="py-1.5 text-right">{money(r.revenueGenerated)}</td>
                <td className="py-1.5 text-right font-medium">{money(r.totalShare)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

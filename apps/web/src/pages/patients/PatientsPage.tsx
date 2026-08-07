import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import * as patientsApi from '../../api/patients';
import type { Patient } from '../../types';
import { Loading } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';
import { Search, UserPlus } from 'lucide-react';

export function PatientsPage() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  async function handleSearch(e?: FormEvent) {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    setLoading(true);
    setSearched(true);
    setError('');
    try {
      const data = await patientsApi.searchPatients(q.trim());
      setResults(data);
    } catch (err: unknown) {
      setError('Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Patients</h1>
          <p className="text-sm text-slate-500">Search by phone, CNIC, or name</p>
        </div>
        <Link to="/visit" className="btn-primary">
          <UserPlus className="h-4 w-4" />
          New Registration
        </Link>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-10"
            placeholder="Phone, CNIC, name, Lab #, or MRC #…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={loading}>
          Search
        </button>
      </form>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading && <Loading />}

      {!loading && searched && results.length === 0 && (
        <EmptyState
          title="No patients found"
          description="Try another search or register a new patient."
        />
      )}

      {!loading && results.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Lab #</th>
                <th className="px-4 py-3">MRC #</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">CNIC</th>
                <th className="px-4 py-3">Gender</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {results.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.labNumber}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.mrcNumber}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{p.fullName}</td>
                  <td className="px-4 py-3">{p.phone}</td>
                  <td className="px-4 py-3">{p.cnic || '—'}</td>
                  <td className="px-4 py-3">{p.gender || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/visit?patientId=${p.id}`}
                      className="btn-primary text-xs"
                    >
                      Start Visit
                    </Link>
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

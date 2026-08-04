import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as billingApi from '../../api/billing';
import type { Invoice } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import { Loading } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';
import { Search } from 'lucide-react';

export function InvoicesPage() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  async function load(query?: string) {
    setLoading(true);
    try {
      const data = await billingApi.listInvoices(query);
      setItems(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    load(q.trim() || undefined);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
        <p className="text-sm text-slate-500">
          Search by invoice number, patient name, phone, or tracking ID
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-10"
            placeholder="Invoice #, name, phone, tracking ID…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary">
          Search
        </button>
      </form>

      {loading && <Loading />}

      {!loading && items.length === 0 && (
        <EmptyState title="No invoices found" description="Create a visit to generate an invoice." />
      )}

      {!loading && items.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Tracking</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3">
                    <div>{inv.booking?.patient?.fullName ?? '—'}</div>
                    <div className="text-xs text-slate-500">
                      {inv.booking?.patient?.phone}
                    </div>
                  </td>
                  <td className="px-4 py-3">Rs {Number(inv.grandTotal).toLocaleString()}</td>
                  <td className="px-4 py-3">Rs {Number(inv.amountPaid).toLocaleString()}</td>
                  <td className="px-4 py-3 font-medium">
                    <span className={Number(inv.amountDue) > 0 ? 'text-amber-700' : 'text-green-700'}>
                      Rs {Number(inv.amountDue).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {inv.report?.trackingId ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/invoices/${inv.id}`} className="btn-primary text-xs">
                      Open / Print
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

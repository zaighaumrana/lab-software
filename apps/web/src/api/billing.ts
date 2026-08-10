import { api } from './client';
import type { Invoice } from '../types';

export interface InvoiceListParams {
  q?: string;
  from?: string;
  to?: string;
  status?: string;
}

export async function listInvoices(params?: string | InvoiceListParams) {
  const query = typeof params === 'string' ? { q: params } : params;
  const { data } = await api.get<Invoice[]>('/billing/invoices', { params: query });
  return data;
}

export async function createInvoice(payload: {
  bookingId: string;
  notes?: string;
  lines: {
    testId?: string;
    packageId?: string;
    quantity?: number;
    manualDiscount?: number;
    manualDiscountReason?: string;
  }[];
}) {
  const { data } = await api.post<Invoice>('/billing/invoices', payload);
  return data;
}

export async function getInvoice(id: string) {
  const { data } = await api.get<Invoice>(`/billing/invoices/${id}`);
  return data;
}

export async function recordPayment(
  invoiceId: string,
  payload: { amount: number; method: string; reference?: string; notes?: string },
) {
  const { data } = await api.post<{ payment: unknown; invoice: Invoice }>(
    `/billing/invoices/${invoiceId}/payments`,
    payload,
  );
  return data;
}

import { api, getSessionId } from './client';
import { notifyFinancialChange } from '../lib/financialRefresh';
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
  payload: { amount: number; method: string; reference?: string; notes?: string; operationKey?:string },
) {
  const signature = JSON.stringify([getSessionId(),invoiceId,payload.amount,payload.method,payload.reference ?? null,payload.notes ?? null]);
  const operationKey = payload.operationKey ?? pendingPayments.get(signature) ?? newOperationKey();
  if (!pendingPayments.has(signature) && pendingPayments.size>=100) throw new Error('Resolve pending payment requests before submitting more');
  pendingPayments.set(signature,operationKey);
  try {
    const { data } = await api.post<{ payment: unknown; invoice: Invoice }>(
      `/billing/invoices/${invoiceId}/payments`, {...payload,operationKey});
    pendingPayments.delete(signature);
    notifyFinancialChange(invoiceId);
    return data;
  } catch (error) {
    const status = (error as {response?:{status?:number}}).response?.status;
    if (status && status>=400 && status<500) pendingPayments.delete(signature);
    notifyFinancialChange(invoiceId); // Refresh even when another workstation invalidated the form.
    throw error;
  }
}

// Retain timeout/ambiguous retries in memory; this contains request identity,
// never authoritative balances or invoice/payment status.
const pendingPayments = new Map<string,string>();

function newOperationKey() {
  // getRandomValues also works for LAN HTTP origins where randomUUID is unavailable.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
}

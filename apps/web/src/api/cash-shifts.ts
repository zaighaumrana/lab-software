import { api } from './client';

export interface CashShiftUserRef {
  id: string;
  fullName: string;
}

export interface CashShift {
  id: string;
  tenantId: string;
  branchId: string | null;
  openedById: string;
  openedAt: string;
  closedById: string | null;
  closedAt: string | null;
  expectedCash: string | number | null;
  countedCash: string | number | null;
  variance: string | number | null;
  notes: string | null;
  status: 'OPEN' | 'CLOSED';
  openedBy?: CashShiftUserRef;
  closedBy?: CashShiftUserRef | null;
}

export interface CurrentCashShift extends CashShift {
  /** Live running total — not yet snapshotted, recomputed on every fetch
   * while the shift stays open. */
  expectedSoFar: number;
}

export async function getCurrentShift() {
  const { data } = await api.get<CurrentCashShift | null>('/cash-shifts/current');
  return data;
}

export async function listShifts() {
  const { data } = await api.get<CashShift[]>('/cash-shifts');
  return data;
}

export async function openShift() {
  const { data } = await api.post<CashShift>('/cash-shifts/open', {});
  return data;
}

export async function closeShift(id: string, countedCash: number, notes?: string) {
  const { data } = await api.patch<CashShift>(`/cash-shifts/${id}/close`, {
    countedCash,
    notes,
  });
  return data;
}

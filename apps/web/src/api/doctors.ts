import { api } from './client';
import type { Doctor } from '../types';

export async function listDoctors(all = false) {
  const { data } = await api.get<Doctor[]>('/doctors', {
    params: all ? { all: 'true' } : undefined,
  });
  return data;
}

export async function getDoctor(id: string) {
  const { data } = await api.get<Doctor>(`/doctors/${id}`);
  return data;
}

export interface DoctorPayload {
  fullName: string;
  phone?: string;
  email?: string;
  specialty?: string;
  clinicName?: string;
  shareType?: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'PER_TEST_FIXED';
  shareValue?: number;
  notes?: string;
  isActive?: boolean;
}

export async function createDoctor(payload: DoctorPayload) {
  const { data } = await api.post<Doctor>('/doctors', payload);
  return data;
}

export async function updateDoctor(id: string, payload: Partial<DoctorPayload>) {
  const { data } = await api.patch<Doctor>(`/doctors/${id}`, payload);
  return data;
}

export interface DoctorDashboardRow {
  shareId: string;
  invoiceId: string;
  invoiceNumber: string;
  patientName: string;
  date: string;
  tests: string[];
  invoiceAmount: number;
  shareAmount: number;
  paymentStatus: string;
  shareStatus: string;
}

export interface DoctorDashboard {
  doctor: {
    id: string;
    fullName: string;
    phone?: string | null;
    email?: string | null;
    specialty?: string | null;
    clinicName?: string | null;
    shareType: string;
    shareValue: number | string;
  };
  range: { from: string | null; to: string | null };
  summary: {
    totalPatients: number;
    totalRevenue: number;
    totalShare: number;
    totalPaid: number;
    pendingShare: number;
  };
  patients: {
    rows: DoctorDashboardRow[];
    total: number;
    page: number;
    pageSize: number;
  };
}

export interface DoctorDashboardParams {
  from?: string;
  to?: string;
  search?: string;
  sortBy?: 'date' | 'patientName' | 'invoiceAmount' | 'shareAmount';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export async function getDoctorDashboard(id: string, params: DoctorDashboardParams = {}) {
  const { data } = await api.get<DoctorDashboard>(`/doctors/${id}/dashboard`, { params });
  return data;
}

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
  commissionType?: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'PER_TEST_FIXED';
  commissionValue?: number;
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

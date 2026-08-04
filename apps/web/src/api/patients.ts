import { api } from './client';
import type { Patient } from '../types';

export async function searchPatients(q: string) {
  const { data } = await api.get<Patient[]>('/patients/search', { params: { q } });
  return data;
}

export async function getPatient(id: string) {
  const { data } = await api.get<Patient>(`/patients/${id}`);
  return data;
}

export async function createPatient(payload: {
  fullName: string;
  phone: string;
  phoneAlt?: string;
  cnic?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  email?: string;
  bloodGroup?: string;
  notes?: string;
  smsConsent?: boolean;
}) {
  const { data } = await api.post<Patient>('/patients', payload);
  return data;
}

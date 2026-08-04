import { api } from './client';
import type { Sample, Result } from '../types';

export async function listPendingSamples() {
  const { data } = await api.get<Sample[]>('/laboratory/samples/pending');
  return data;
}

export async function getSample(id: string) {
  const { data } = await api.get<Sample>(`/laboratory/samples/${id}`);
  return data;
}

export async function collectSample(payload: {
  invoiceId: string;
  sampleType?: string;
  notes?: string;
}) {
  const { data } = await api.post<Sample>('/laboratory/samples', payload);
  return data;
}

export async function receiveSample(id: string) {
  const { data } = await api.patch<Sample>(`/laboratory/samples/${id}/receive`);
  return data;
}

export async function acceptSample(id: string) {
  const { data } = await api.patch<Sample>(`/laboratory/samples/${id}/accept`, {});
  return data;
}

export async function rejectSample(id: string, rejectionReason: string) {
  const { data } = await api.patch<Sample>(`/laboratory/samples/${id}/reject`, {
    rejectionReason,
  });
  return data;
}

export async function enterResult(payload: {
  sampleId: string;
  invoiceLineId: string;
  testId: string;
  values: {
    testParameterId: string;
    valueNumeric?: number;
    valueText?: string;
    unit?: string;
  }[];
  notes?: string;
  releaseImmediately?: boolean;
}) {
  const { data } = await api.post<Result>('/laboratory/results', payload);
  return data;
}

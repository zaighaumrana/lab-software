import { api } from './client';
import type { Report } from '../types';

export async function listReports(q?: string) {
  const { data } = await api.get<Report[]>('/reports', {
    params: q ? { q } : undefined,
  });
  return data;
}

export async function getReport(id: string) {
  const { data } = await api.get<Report>(`/reports/${id}`);
  return data;
}

export async function getReportByTracking(trackingId: string) {
  const { data } = await api.get<Report>(`/reports/tracking/${trackingId}`);
  return data;
}

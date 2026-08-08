import { api } from './client';

export interface DateRangeParams {
  from?: string; // ISO date (yyyy-mm-dd)
  to?: string;
}

export interface FinancialOverview {
  invoicedRevenue: number;
  cashReceived: number;
  outstanding: number;
  discountGiven: number;
  refunds: number;
  netRevenue: number;
}

export interface OperationalOverview {
  todayPatients: number;
  samplesCollected: number;
  testsInProgress: number;
  pendingVerification: number;
  reportsReady: number;
  criticalAwaitingReview: number;
  avgTurnaroundTimeHours: number | null;
}

export async function getFinancialOverview(params: DateRangeParams = {}) {
  const { data } = await api.get<FinancialOverview>('/analytics/dashboard/financial-overview', {
    params,
  });
  return data;
}

export async function getOperationalOverview(params: DateRangeParams = {}) {
  const { data } = await api.get<OperationalOverview>('/analytics/dashboard/operational', {
    params,
  });
  return data;
}

export interface TopDoctorRow {
  doctorId: string;
  doctorName: string;
  patientsReferred: number;
  revenueGenerated: number;
  totalShare: number;
}

export interface ShareTrendPoint {
  date: string;
  totalShare: number;
}

export interface DoctorShareOverview {
  totalSharePayable: number;
  totalSharePaid: number;
  pendingShare: number;
  topReferringDoctors: TopDoctorRow[];
  shareTrend: ShareTrendPoint[];
}

export async function getDoctorShareOverview(params: DateRangeParams = {}) {
  const { data } = await api.get<DoctorShareOverview>('/analytics/dashboard/doctor-share', {
    params,
  });
  return data;
}

export async function getWidget(widgetId: string, params: DateRangeParams = {}) {
  const { data } = await api.get(`/analytics/widgets/${widgetId}`, { params });
  return data as { widgetId: string; range: DateRangeParams; value: unknown };
}

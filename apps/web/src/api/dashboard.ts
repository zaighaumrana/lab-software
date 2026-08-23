import { api } from './client';

export interface OperatorActivityItem {
  patientName: string;
  label: string;
  at: string;
}

export interface OperatorDashboard {
  todayPatients: number;
  samplesCollected: number;
  testsInProgress: number;
  pendingVerification: number;
  reportsReady: number;
  criticalAwaitingReview: number;
  avgTurnaroundTimeHours: number | null;
  testsCompletedToday: number;
  reportsPrintedToday: number;
  cashCollectedToday: number;
  pendingPayments: number;
  recentActivity: OperatorActivityItem[];
}

export async function getOperatorDashboard() {
  const { data } = await api.get<OperatorDashboard>('/dashboard/operator');
  return data;
}

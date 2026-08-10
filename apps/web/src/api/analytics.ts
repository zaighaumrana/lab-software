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
  paymentStatusBreakdown: { status: string; count: number; amount: number }[];
  monthlyRevenueComparison: { month: string; cashReceived: number; outstanding: number }[];
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

export interface TestVolumeRow {
  testId: string;
  testName: string;
  testCode: string;
  count: number;
}

export interface TestRevenueRow {
  testId: string;
  testName: string;
  testCode: string;
  revenue: number;
}

export interface NewVsRepeatResult {
  repeatPatients: number;
  newPatients: number;
  repeatPercentage: number;
  newPercentage: number;
}

export interface TestAnalyticsOverview {
  mostPerformed: TestVolumeRow[];
  leastPerformed: TestVolumeRow[];
  highestRevenue: TestRevenueRow[];
  averageTestPrice: number;
  averageDailyTests: number;
  averagePatientsPerDay: number;
  newVsRepeat: NewVsRepeatResult;
  categoryDistribution: { category: string; count: number; revenue: number }[];
}

export async function getTestAnalyticsOverview(params: DateRangeParams = {}) {
  const { data } = await api.get<TestAnalyticsOverview>('/analytics/dashboard/test-analytics', {
    params,
  });
  return data;
}

export interface PatientRevenueRow {
  patientId: string;
  patientName: string;
  invoiceCount: number;
  totalRevenue: number;
}

export interface PackagePopularityRow {
  packageId: string;
  packageName: string;
  count: number;
}

export interface HourlyVisitRow {
  hour: number;
  count: number;
}

export interface TrendPoint {
  period: string;
  patientCount: number;
  revenue: number;
}

export interface GrowthRateResult {
  currentRevenue: number;
  previousRevenue: number;
  revenueGrowthPercent: number | null;
  currentPatients: number;
  previousPatients: number;
  patientGrowthPercent: number | null;
}

export interface BusinessInsightsOverview {
  highestRevenuePatients: PatientRevenueRow[];
  mostPopularPackages: PackagePopularityRow[];
  peakVisitHours: HourlyVisitRow[];
  dailyTrend: TrendPoint[];
  weeklyTrend: TrendPoint[];
  monthlyTrend: TrendPoint[];
  seasonalTrend: TrendPoint[];
  growthRate: GrowthRateResult | null;
  repeatPatientRate: number;
  cancellationRate: number;
}

export async function getBusinessInsightsOverview(params: DateRangeParams = {}) {
  const { data } = await api.get<BusinessInsightsOverview>(
    '/analytics/dashboard/business-insights',
    { params },
  );
  return data;
}

export interface OutsourcedTestRow {
  testId: string;
  testName: string;
  testCode: string;
  count: number;
}

export interface ExternalLabRow {
  labName: string;
  sampleCount: number;
  totalCost: number;
}

export interface InHouseVsOutsourcedRow {
  label: 'In-House' | 'Outsourced';
  count: number;
}

export interface OutsourcingOverview {
  totalOutsourcedTests: number;
  outsourcingCost: number;
  revenue: number;
  netMargin: number;
  topOutsourcedTests: OutsourcedTestRow[];
  topExternalLabs: ExternalLabRow[];
  inHouseVsOutsourced: InHouseVsOutsourcedRow[];
}

export async function getOutsourcingOverview(params: DateRangeParams = {}) {
  const { data } = await api.get<OutsourcingOverview>('/analytics/dashboard/outsourcing', {
    params,
  });
  return data;
}

export async function getWidget(widgetId: string, params: DateRangeParams = {}) {
  const { data } = await api.get(`/analytics/widgets/${widgetId}`, { params });
  return data as { widgetId: string; range: DateRangeParams; value: unknown };
}
